package io.apocalypse.framework.events;

import io.apocalypse.common.event.LoginFailedEvent;
import io.apocalypse.common.event.LoginSucceededEvent;
import io.apocalypse.common.event.OperLoggedEvent;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.modulith.events.EventPublication.Status;
import org.springframework.modulith.events.core.EventPublicationRepository;
import org.springframework.modulith.events.core.EventSerializer;
import org.springframework.modulith.events.core.PublicationTargetIdentifier;
import org.springframework.modulith.events.core.TargetEventPublication;
import org.springframework.util.Assert;

import lombok.Getter;
import lombok.extern.slf4j.Slf4j;

/**
 * 正常路径完整委托上游；只有审计调度进入的词法作用域改变失败选择与领取。
 *
 * <p>Modulith 2.1 的 predicate 位于 SQL LIMIT 之后，不能用其排除耗尽事件。这里先在 SQL 筛选次数和退避再
 * LIMIT，避免永久失败占住队头。作用域不会传入异步消费者。
 */
@Slf4j
public class AuditRecoveryRepository implements EventPublicationRepository {

  private static final Map<String, Class<?>> AUDIT_TYPES =
      Map.of(
          LoginSucceededEvent.class.getName(), LoginSucceededEvent.class,
          LoginFailedEvent.class.getName(), LoginFailedEvent.class,
          OperLoggedEvent.class.getName(), OperLoggedEvent.class);

  private static final String AUDIT = "event_type IN (:auditTypes) AND completion_date IS NULL";

  private static final String ELIGIBLE =
      AUDIT
          + """
       AND (status = 'FAILED' OR status IS NULL)
       AND COALESCE(completion_attempts, 1) < :maxAttempts
       AND COALESCE(last_resubmission_date, publication_date)
           + LEAST(:maxBackoff, :initialBackoff * POWER(2,
               GREATEST(COALESCE(completion_attempts, 1) - 1, 0)))
             * INTERVAL '1 millisecond' <= :now
      """;

  private final EventPublicationRepository delegate;

  private final NamedParameterJdbcTemplate jdbc;

  private final EventSerializer serializer;

  private final AuditRecoveryProperties properties;

  private final ThreadLocal<RecoveryRun> recovery = new ThreadLocal<>();

  public AuditRecoveryRepository(
      EventPublicationRepository delegate,
      JdbcTemplate jdbc,
      EventSerializer serializer,
      AuditRecoveryProperties properties) {
    this.delegate = delegate;
    this.jdbc = new NamedParameterJdbcTemplate(jdbc);
    this.serializer = serializer;
    this.properties = properties;
  }

  int recover(Instant now, Runnable action) {
    Assert.state(recovery.get() == null, "审计恢复作用域不能嵌套");
    RecoveryRun run = new RecoveryRun(now);
    recovery.set(run);
    try {
      action.run();
      return run.claimed;
    } finally {
      recovery.remove();
    }
  }

  void expireStale(Instant now) {
    jdbc.update(
        """
        UPDATE event_publication SET status = 'FAILED'
        WHERE id IN (
          SELECT id FROM event_publication WHERE
        """
            + AUDIT
            + """
           AND status IN ('PUBLISHED', 'PROCESSING', 'RESUBMITTED')
           AND COALESCE(last_resubmission_date, publication_date) < :staleBefore
           ORDER BY COALESCE(last_resubmission_date, publication_date), id
           LIMIT :batchSize
        ) AND completion_date IS NULL
          AND status IN ('PUBLISHED', 'PROCESSING', 'RESUBMITTED')
          AND COALESCE(last_resubmission_date, publication_date) < :staleBefore
        """,
        parameters(now)
            .addValue("staleBefore", Timestamp.from(now.minus(properties.staleAfter()))));
  }

  Snapshot snapshot(Instant now) {
    return jdbc.queryForObject(
        """
        SELECT COUNT(*) AS pending,
          COUNT(*) FILTER (WHERE status IN ('PUBLISHED', 'PROCESSING', 'RESUBMITTED')) AS in_flight,
          COUNT(*) FILTER (WHERE COALESCE(completion_attempts, 1) >= :maxAttempts
            AND (status = 'FAILED' OR status IS NULL)) AS exhausted,
          COALESCE(EXTRACT(EPOCH FROM (:now - MIN(publication_date))), 0) AS oldest_seconds
        FROM event_publication WHERE
        """
            + AUDIT,
        parameters(now),
        (rs, row) ->
            new Snapshot(
                rs.getLong("pending"),
                rs.getLong("in_flight"),
                rs.getLong("exhausted"),
                Math.max(0, rs.getLong("oldest_seconds"))));
  }

  @Override
  public List<TargetEventPublication> findFailedPublications(FailedCriteria criteria) {
    RecoveryRun run = recovery.get();
    if (run == null) {
      return delegate.findFailedPublications(criteria);
    }
    long limit =
        criteria.getMaxItemsToRead() == -1
            ? properties.batchSize()
            : Math.min(properties.batchSize(), criteria.getMaxItemsToRead());
    MapSqlParameterSource parameters =
        parameters(run.now)
            .addValue("limit", limit)
            .addValue(
                "publishedBefore",
                Timestamp.from(
                    criteria.getPublicationDateReference() == null
                        ? run.now
                        : criteria.getPublicationDateReference()));
    List<StoredPublication> stored =
        jdbc.query(
            """
        SELECT id, event_type, serialized_event, listener_id, publication_date,
          COALESCE(completion_attempts, 1) AS completion_attempts, last_resubmission_date
        FROM event_publication WHERE
        """
                + ELIGIBLE
                + """
         AND publication_date <= :publishedBefore
         ORDER BY publication_date, id LIMIT :limit
        """,
            parameters,
            (rs, row) ->
                new StoredPublication(
                    rs.getObject("id", UUID.class),
                    rs.getString("event_type"),
                    rs.getString("serialized_event"),
                    rs.getString("listener_id"),
                    rs.getTimestamp("publication_date").toInstant(),
                    rs.getInt("completion_attempts"),
                    rs.getTimestamp("last_resubmission_date")));
    List<TargetEventPublication> result = new ArrayList<>();
    for (StoredPublication publication : stored) {
      try {
        Object event =
            serializer.deserialize(
                publication.serializedEvent(), AUDIT_TYPES.get(publication.eventType()));
        Assert.notNull(event, "审计事件反序列化结果不能为空");
        result.add(new AuditPublication(publication, event));
      } catch (RuntimeException failure) {
        // 无法解码的证据原样保留，人工修复前不再尝试；禁止把 payload 或异常消息写入日志。
        jdbc.update(
            """
            UPDATE event_publication SET status = 'FAILED', completion_attempts = :maxAttempts,
              last_resubmission_date = :now WHERE id = :id AND
            """
                + ELIGIBLE,
            parameters(run.now).addValue("id", publication.id()));
        log.warn(
            "审计事件无法解码，已停止自动恢复: publication={}, errorType={}",
            publication.id(),
            failure.getClass().getSimpleName());
      }
    }
    return result;
  }

  @Override
  public boolean markResubmitted(UUID identifier, Instant resubmissionDate) {
    RecoveryRun run = recovery.get();
    if (run == null) {
      return delegate.markResubmitted(identifier, resubmissionDate);
    }
    int updated =
        jdbc.update(
            """
        UPDATE event_publication SET status = 'RESUBMITTED',
          completion_attempts = COALESCE(completion_attempts, 1) + 1,
          last_resubmission_date = :now WHERE id = :id AND
        """
                + ELIGIBLE,
            parameters(run.now).addValue("id", identifier));
    run.claimed += updated;
    return updated == 1;
  }

  @Override
  public int countByStatus(Status status) {
    RecoveryRun run = recovery.get();
    if (run == null) {
      return delegate.countByStatus(status);
    }
    Integer count =
        jdbc.queryForObject(
            "SELECT COUNT(*) FROM event_publication WHERE " + AUDIT + " AND status = :status",
            parameters(run.now).addValue("status", status.name()),
            Integer.class);
    return count == null ? 0 : count;
  }

  private MapSqlParameterSource parameters(Instant now) {
    return new MapSqlParameterSource("auditTypes", AUDIT_TYPES.keySet())
        .addValue("now", Timestamp.from(now))
        .addValue("batchSize", properties.batchSize())
        .addValue("maxAttempts", properties.maxAttempts())
        .addValue("initialBackoff", properties.initialBackoff().toMillis())
        .addValue("maxBackoff", properties.maxBackoff().toMillis());
  }

  @Override
  public TargetEventPublication create(TargetEventPublication publication) {
    return delegate.create(publication);
  }

  @Override
  public void markProcessing(UUID identifier) {
    delegate.markProcessing(identifier);
  }

  @Override
  public void markCompleted(TargetEventPublication publication, Instant completionDate) {
    delegate.markCompleted(publication, completionDate);
  }

  @Override
  public void markCompleted(
      Object event, PublicationTargetIdentifier identifier, Instant completionDate) {
    delegate.markCompleted(event, identifier, completionDate);
  }

  @Override
  public void markCompleted(UUID identifier, Instant completionDate) {
    delegate.markCompleted(identifier, completionDate);
  }

  @Override
  public void markFailed(UUID identifier) {
    delegate.markFailed(identifier);
  }

  @Override
  public List<TargetEventPublication> findIncompletePublications() {
    return delegate.findIncompletePublications();
  }

  @Override
  public List<TargetEventPublication> findIncompletePublicationsPublishedBefore(Instant instant) {
    return delegate.findIncompletePublicationsPublishedBefore(instant);
  }

  @Override
  public Optional<TargetEventPublication> findIncompletePublicationsByEventAndTargetIdentifier(
      Object event, PublicationTargetIdentifier targetIdentifier) {
    return delegate.findIncompletePublicationsByEventAndTargetIdentifier(event, targetIdentifier);
  }

  @Override
  public List<TargetEventPublication> findCompletedPublications() {
    return delegate.findCompletedPublications();
  }

  @Override
  public void deletePublications(List<UUID> identifiers) {
    delegate.deletePublications(identifiers);
  }

  @Override
  public void deleteCompletedPublications() {
    delegate.deleteCompletedPublications();
  }

  @Override
  public void deleteCompletedPublicationsBefore(Instant instant) {
    delegate.deleteCompletedPublicationsBefore(instant);
  }

  @Override
  public List<TargetEventPublication> findByStatus(Status status) {
    return delegate.findByStatus(status);
  }

  record Snapshot(long pending, long inFlight, long exhausted, long oldestSeconds) {}

  private static final class RecoveryRun {
    private final Instant now;

    private int claimed;

    private RecoveryRun(Instant now) {
      this.now = now;
    }
  }

  private record StoredPublication(
      UUID id,
      String eventType,
      String serializedEvent,
      String listenerId,
      Instant publicationDate,
      int completionAttempts,
      @Nullable Timestamp lastResubmission) {}

  @Getter
  private static final class AuditPublication implements TargetEventPublication {
    private final UUID identifier;

    private final Object event;

    private final PublicationTargetIdentifier targetIdentifier;

    private final Instant publicationDate;

    private final int completionAttempts;

    private final @Nullable Instant lastResubmissionDate;

    private @Nullable Instant completed;

    private AuditPublication(StoredPublication stored, Object event) {
      this.identifier = stored.id();
      this.event = event;
      this.targetIdentifier = PublicationTargetIdentifier.of(stored.listenerId());
      this.publicationDate = stored.publicationDate();
      this.completionAttempts = stored.completionAttempts();
      this.lastResubmissionDate =
          stored.lastResubmission() == null ? null : stored.lastResubmission().toInstant();
    }

    @Override
    public Optional<Instant> getCompletionDate() {
      return Optional.ofNullable(completed);
    }

    @Override
    public void markCompleted(Instant instant) {
      completed = instant;
    }

    @Override
    public Status getStatus() {
      return completed == null ? Status.FAILED : Status.COMPLETED;
    }
  }
}
