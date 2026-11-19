package io.apocalypse.system.infrastructure.audit;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDateTime;
import javax.sql.DataSource;

import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

/** 每轮使用同一 PostgreSQL 会话持锁，每条 DELETE 独立提交。 */
@Component
@RequiredArgsConstructor
public class AuditRetention {

  private static final int BATCH_LIMIT = 5_000;

  private static final int MAX_BATCHES_PER_TABLE = 20;

  private final DataSource dataSource;

  public void cleanup(long lockKey, LocalDateTime cutoff, LogTable... tables) {
    try (Connection connection = dataSource.getConnection()) {
      connection.setAutoCommit(true);
      if (!sessionLock(connection, "SELECT pg_try_advisory_lock(?)", lockKey)) {
        return;
      }
      try {
        for (LogTable table : tables) {
          deleteBatches(connection, table, cutoff);
        }
      } finally {
        if (!sessionLock(connection, "SELECT pg_advisory_unlock(?)", lockKey)) {
          SQLException failure = new SQLException("审计清理会话锁已丢失");
          abort(connection, failure);
          throw failure;
        }
      }
    } catch (SQLException failure) {
      throw new DataAccessResourceFailureException("审计日志清理失败", failure);
    }
  }

  private static void deleteBatches(Connection connection, LogTable table, LocalDateTime cutoff)
      throws SQLException {
    try (PreparedStatement statement = connection.prepareStatement(table.deleteBatch)) {
      statement.setObject(1, cutoff);
      statement.setInt(2, BATCH_LIMIT);
      for (int i = 0; i < MAX_BATCHES_PER_TABLE; i++) {
        if (statement.executeUpdate() < BATCH_LIMIT) {
          break;
        }
      }
    }
  }

  private static boolean sessionLock(Connection connection, String sql, long lockKey)
      throws SQLException {
    try (PreparedStatement statement = connection.prepareStatement(sql)) {
      statement.setQueryTimeout(15);
      statement.setLong(1, lockKey);
      try (ResultSet result = statement.executeQuery()) {
        if (!result.next()) {
          throw new SQLException("审计清理会话锁未返回结果");
        }
        return result.getBoolean(1);
      }
    } catch (SQLException failure) {
      // 获锁或解锁结果未知时，关掉物理会话以免连接池复用仍持锁的连接。
      abort(connection, failure);
      throw failure;
    }
  }

  private static void abort(Connection connection, SQLException failure) {
    try {
      connection.abort(Runnable::run);
    } catch (SQLException abortFailure) {
      failure.addSuppressed(abortFailure);
    }
  }

  public enum LogTable {
    LOGIN("sys_login_log", "login_time"),
    OPERATION("sys_oper_log", "oper_time"),
    AUTHORIZATION("sys_authorization_audit", "occurred_at");

    private final String deleteBatch;

    LogTable(String table, String timestamp) {
      deleteBatch =
          """
          DELETE FROM %1$s WHERE id IN (
            SELECT id FROM %1$s WHERE %2$s < ? ORDER BY %2$s ASC LIMIT ?
          )
          """
              .formatted(table, timestamp);
    }
  }
}
