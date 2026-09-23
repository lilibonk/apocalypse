package io.apocalypse;

import io.apocalypse.calendar.api.CalendarProjectionApi;
import io.apocalypse.calendar.api.CancelProjectedEventCommand;
import io.apocalypse.calendar.api.CancelProjectionBatchCommand;
import io.apocalypse.calendar.api.ProjectedEventCommand;
import io.apocalypse.calendar.api.ProjectedEventContent;
import io.apocalypse.calendar.api.ProjectionBatchCommand;
import io.apocalypse.calendar.api.ProjectionBatchResult;
import io.apocalypse.calendar.api.ProjectionResultStatus;
import io.apocalypse.calendar.api.ProjectionTimeKind;
import io.apocalypse.common.exception.BizException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.stream.IntStream;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** A Campus caller stub using only the approved facade; no Campus module or internal DB writes. */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "apocalypse.capabilities.calendar.enabled=true")
class CalendarProjectionConcurrencyIT extends AbstractIntegrationTest {
  @Autowired private CalendarProjectionApi api;

  @Test
  void legacyTimedRetryMatchesTheMicrosecondPrecisionActuallyStored() throws Exception {
    String target = target("legacy-nanos");
    Instant start = Instant.parse("2026-09-22T23:59:59.999999500Z");
    ProjectedEventContent content =
        new ProjectedEventContent(
            "Nanosecond event",
            null,
            null,
            ProjectionTimeKind.TIMED,
            null,
            null,
            start,
            start.plusSeconds(3600),
            "UTC");
    ProjectedEventCommand command = new ProjectedEventCommand("lesson", "legacy-nanos", 1, content);
    var created = api.upsert(batch(target, List.of(command))).items().getFirst();
    jdbcTemplate.update(
        "UPDATE cal_projection_source SET payload_hash = ? WHERE event_id = ?",
        legacyHash(content),
        created.eventId());
    assertThat(api.upsert(batch(target, List.of(command))).items().getFirst().status())
        .isEqualTo(ProjectionResultStatus.UNCHANGED);
  }

  @Test
  void discardedLegacyDraftRetryUsesRetainedContentAndRejectsAHashCollision() throws Exception {
    String target = target("legacy-discard", "DRAFT_ONLY");
    ProjectedEventContent reviewed =
        new ProjectedEventContent(
            "Meeting",
            "Agenda|Room 101",
            "HQ",
            ProjectionTimeKind.ALL_DAY,
            LocalDate.of(2026, 10, 1),
            LocalDate.of(2026, 10, 2),
            null,
            null,
            null);
    ProjectedEventCommand command =
        new ProjectedEventCommand("lesson", "legacy-discard", 1, reviewed);
    var created = api.upsert(batch(target, List.of(command))).items().getFirst();
    jdbcTemplate.update(
        "UPDATE cal_projection_source SET payload_hash = ? WHERE event_id = ?",
        legacyHash(reviewed),
        created.eventId());
    Long calendarId =
        jdbcTemplate.queryForObject(
            "SELECT calendar_id FROM cal_event WHERE id = ?", Long.class, created.eventId());
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    deleteForData(
        "/calendar/calendars/" + calendarId + "/managed-events/" + created.eventId() + "/draft",
        token);
    assertThat(api.upsert(batch(target, List.of(command))).items().getFirst().status())
        .isEqualTo(ProjectionResultStatus.UNCHANGED);
    ProjectedEventContent substituted =
        new ProjectedEventContent(
            "Meeting|Agenda",
            "Room 101",
            "HQ",
            ProjectionTimeKind.ALL_DAY,
            reviewed.startDate(),
            reviewed.endDateExclusive(),
            null,
            null,
            null);
    assertThat(legacyHash(substituted)).isEqualTo(legacyHash(reviewed));
    assertThatThrownBy(
            () ->
                api.upsert(
                    batch(
                        target,
                        List.of(
                            new ProjectedEventCommand(
                                "lesson", "legacy-discard", 1, substituted)))))
        .isInstanceOf(BizException.class);
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT deleted FROM cal_event_revision WHERE event_id = ?",
                Integer.class,
                created.eventId()))
        .isEqualTo(1);
  }

  @Test
  void unchangedLegacyProjectionRetryChecksRetainedContentWithoutMutatingIt() throws Exception {
    String target = target("legacy-retry");
    ProjectedEventCommand command = lesson("legacy", 1, 2);
    var created = api.upsert(batch(target, List.of(command))).items().getFirst();
    String legacyHash =
        HexFormat.of()
            .formatHex(
                MessageDigest.getInstance("SHA-256")
                    .digest(
                        "Lesson legacy|||ALL_DAY|2026-09-02|2026-09-03|||"
                            .getBytes(StandardCharsets.UTF_8)));
    jdbcTemplate.update(
        "UPDATE cal_projection_source SET payload_hash = ? WHERE event_id = ?",
        legacyHash,
        created.eventId());
    assertThat(api.upsert(batch(target, List.of(command))).items().getFirst().status())
        .isEqualTo(ProjectionResultStatus.UNCHANGED);
    jdbcTemplate.update(
        "UPDATE cal_event_revision SET title = 'Different retained content' WHERE event_id = ?",
        created.eventId());
    ProjectedEventCommand newItem = lesson("legacy-retry-atomic", 1, 3);
    assertThatThrownBy(() -> api.upsert(batch(target, List.of(newItem, command))))
        .isInstanceOf(BizException.class);
    assertThat(api.upsert(batch(target, List.of(newItem))).items().getFirst().status())
        .isEqualTo(ProjectionResultStatus.CREATED);
  }

  @Test
  void reversedConcurrentBatchesCreateOnceAndPreserveCallerResultOrder() throws Exception {
    String target = target("concurrent");
    var events = IntStream.range(0, 24).mapToObj(i -> lesson("concurrent-" + i, 1, 2)).toList();
    var results =
        concurrently(
            () -> api.upsert(batch(target, events)),
            () -> api.upsert(batch(target, events.reversed())));
    assertThat(results.getFirst().items())
        .extracting(item -> item.sourceKey())
        .containsExactlyElementsOf(events.stream().map(ProjectedEventCommand::sourceKey).toList());
    assertThat(results.getLast().items())
        .extracting(item -> item.sourceKey())
        .containsExactlyElementsOf(
            events.reversed().stream().map(ProjectedEventCommand::sourceKey).toList());
    assertThat(
            results.stream()
                .flatMap(r -> r.items().stream())
                .filter(i -> i.status() == ProjectionResultStatus.CREATED)
                .count())
        .isEqualTo(24);
    assertThat(
            results.stream()
                .flatMap(r -> r.items().stream())
                .filter(i -> i.status() == ProjectionResultStatus.UNCHANGED)
                .count())
        .isEqualTo(24);
  }

  @Test
  void campusReorderRetryAndCancelKeepOneEventAndRejectResurrection() throws Exception {
    String target = target("reorder");
    var created = api.upsert(batch(target, List.of(lesson("reorder-1", 1, 2)))).items().getFirst();
    var races =
        concurrently(
            () -> api.upsert(batch(target, List.of(lesson("reorder-1", 2, 3)))),
            () -> api.upsert(batch(target, List.of(lesson("reorder-1", 3, 4)))));
    assertThat(races.stream().flatMap(r -> r.items().stream()))
        .allSatisfy(item -> assertThat(item.eventId()).isEqualTo(created.eventId()));
    assertThat(
            api.upsert(batch(target, List.of(lesson("reorder-1", 2, 3))))
                .items()
                .getFirst()
                .status())
        .isEqualTo(ProjectionResultStatus.STALE);
    assertThat(
            api.upsert(batch(target, List.of(lesson("reorder-1", 3, 4))))
                .items()
                .getFirst()
                .status())
        .isEqualTo(ProjectionResultStatus.UNCHANGED);
    var cancel =
        new CancelProjectionBatchCommand(
            "campus-concurrency",
            target,
            List.of(new CancelProjectedEventCommand("lesson", "reorder-1", 4)));
    assertThat(api.cancel(cancel).items().getFirst().status())
        .isEqualTo(ProjectionResultStatus.CANCELLED);
    assertThat(api.cancel(cancel).items().getFirst().status())
        .isEqualTo(ProjectionResultStatus.UNCHANGED);
    assertThatThrownBy(() -> api.upsert(batch(target, List.of(lesson("reorder-1", 5, 5)))))
        .isInstanceOf(BizException.class);
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT count(*) FROM cal_event WHERE id = ?", Long.class, created.eventId()))
        .isEqualTo(1L);
  }

  @Test
  void oneConflictingItemLeavesNoPartialBatchWrites() {
    String target = target("atomic");
    api.upsert(batch(target, List.of(lesson("atomic-existing", 1, 2))));
    assertThatThrownBy(
            () ->
                api.upsert(
                    batch(
                        target,
                        List.of(lesson("atomic-new", 1, 2), lesson("atomic-existing", 1, 3)))))
        .isInstanceOf(BizException.class);
    assertThat(
            api.upsert(batch(target, List.of(lesson("atomic-new", 1, 2))))
                .items()
                .getFirst()
                .status())
        .isEqualTo(ProjectionResultStatus.CREATED);
  }

  private String target(String suffix) {
    return target(suffix, "DIRECT_PUBLISH");
  }

  private String target(String suffix, String publishMode) {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    String key = "it-campus-" + suffix;
    String id =
        postForData(
                "/calendar/calendars",
                Map.of(
                    "calendarKey",
                    key,
                    "name",
                    key,
                    "parentId",
                    "1",
                    "regionCode",
                    "CN",
                    "zoneId",
                    "Asia/Shanghai"),
                token)
            .get("id")
            .asText();
    putForData(
        "/calendar/calendars/" + id + "/projection-grants/campus-concurrency",
        Map.of("publishMode", publishMode, "expectedVersion", 0),
        token);
    return key;
  }

  private static String legacyHash(ProjectedEventContent content) throws Exception {
    String canonical =
        String.join(
            "|",
            content.title(),
            Objects.toString(content.description(), ""),
            Objects.toString(content.location(), ""),
            content.timeKind().name(),
            Objects.toString(content.startDate(), ""),
            Objects.toString(content.endDateExclusive(), ""),
            content.startInstant() == null
                ? ""
                : LocalDateTime.ofInstant(content.startInstant(), ZoneOffset.UTC).toString(),
            content.endInstant() == null
                ? ""
                : LocalDateTime.ofInstant(content.endInstant(), ZoneOffset.UTC).toString(),
            Objects.toString(content.zoneId(), ""));
    return HexFormat.of()
        .formatHex(
            MessageDigest.getInstance("SHA-256")
                .digest(canonical.getBytes(StandardCharsets.UTF_8)));
  }

  private static ProjectionBatchCommand batch(String target, List<ProjectedEventCommand> events) {
    return new ProjectionBatchCommand("campus-concurrency", target, events);
  }

  private static ProjectedEventCommand lesson(String key, long version, int day) {
    LocalDate date = LocalDate.of(2026, 9, day);
    return new ProjectedEventCommand(
        "lesson",
        key,
        version,
        new ProjectedEventContent(
            "Lesson " + key,
            null,
            null,
            ProjectionTimeKind.ALL_DAY,
            date,
            date.plusDays(1),
            null,
            null,
            null));
  }

  private static List<ProjectionBatchResult> concurrently(
      Callable<ProjectionBatchResult> first, Callable<ProjectionBatchResult> second)
      throws Exception {
    CountDownLatch start = new CountDownLatch(1);
    try (var executor = Executors.newFixedThreadPool(2)) {
      var a =
          executor.submit(
              () -> {
                start.await();
                return first.call();
              });
      var b =
          executor.submit(
              () -> {
                start.await();
                return second.call();
              });
      start.countDown();
      return List.of(a.get(20, TimeUnit.SECONDS), b.get(20, TimeUnit.SECONDS));
    }
  }
}
