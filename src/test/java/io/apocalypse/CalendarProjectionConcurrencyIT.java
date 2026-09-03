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

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
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
        Map.of("publishMode", "DIRECT_PUBLISH", "expectedVersion", 0),
        token);
    return key;
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
