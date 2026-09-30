package io.apocalypse.framework.events;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Duration;
import javax.sql.DataSource;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.modulith.events.FailedEventPublications;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

class AuditEventRecoveryTest {

  @ParameterizedTest
  @ValueSource(strings = {"acquire", "release"})
  void failedAdvisoryOperationAbortsConnectionBeforeReturningItToPool(String operation)
      throws Exception {
    DataSource dataSource = mock(DataSource.class);
    Connection connection = mock(Connection.class);
    PreparedStatement lock = mock(PreparedStatement.class);
    PreparedStatement unlock = mock(PreparedStatement.class);
    ResultSet result = mock(ResultSet.class);
    when(dataSource.getConnection()).thenReturn(connection);
    when(connection.prepareStatement("SELECT pg_try_advisory_lock(?, ?)")).thenReturn(lock);
    when(connection.prepareStatement("SELECT pg_advisory_unlock(?, ?)")).thenReturn(unlock);
    when(lock.executeQuery()).thenReturn(result);
    when(result.next()).thenReturn(true);
    when(result.getBoolean(1)).thenReturn(true);
    when((operation.equals("acquire") ? lock : unlock).executeQuery())
        .thenThrow(new SQLException("synthetic advisory failure"));
    AuditRecoveryRepository repository = mock(AuditRecoveryRepository.class);
    when(repository.snapshot(any())).thenReturn(new AuditRecoveryRepository.Snapshot(0, 0, 0, 0));
    AuditRecoveryProperties properties =
        new AuditRecoveryProperties(
            50, 100, 5, Duration.ofMinutes(1), Duration.ofMinutes(15), Duration.ofMinutes(10));
    AuditEventRecovery recovery =
        new AuditEventRecovery(
            repository,
            mock(FailedEventPublications.class),
            dataSource,
            properties,
            new SimpleMeterRegistry(),
            Clock.systemUTC());

    assertThatThrownBy(recovery::recoverOnce)
        .isInstanceOf(DataAccessResourceFailureException.class);
    verify(connection).abort(any());
    verify(connection).close();
  }
}
