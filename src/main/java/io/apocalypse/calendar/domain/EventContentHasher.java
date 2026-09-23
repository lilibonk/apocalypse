package io.apocalypse.calendar.domain;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.Objects;

public final class EventContentHasher {

  private EventContentHasher() {}

  public static String hash(EventContent content) {
    return new CanonicalContentHash("calendar-event-content:v2")
        .add(content.title())
        .add(content.description())
        .add(content.location())
        .add(content.timeKind())
        .add(content.startDate())
        .add(content.endDateExclusive())
        .add(persistedTime(content.startAtUtc()))
        .add(persistedTime(content.endAtUtc()))
        .add(content.zoneId())
        .finish();
  }

  private static LocalDateTime persistedTime(LocalDateTime value) {
    if (value == null) {
      return null;
    }
    // PostgreSQL timestamps and the JDBC writer round to microseconds, including second rollover.
    return value
        .truncatedTo(ChronoUnit.MICROS)
        .plusNanos(value.getNano() % 1_000 >= 500 ? 1_000 : 0);
  }

  /** Compatibility for a no-op retry of an old projection payload; never use for new writes. */
  public static boolean matchesLegacyHash(EventContent content, String expectedHash) {
    String canonical =
        String.join(
            "|",
            content.title(),
            Objects.toString(content.description(), ""),
            Objects.toString(content.location(), ""),
            content.timeKind().name(),
            Objects.toString(content.startDate(), ""),
            Objects.toString(content.endDateExclusive(), ""),
            Objects.toString(content.startAtUtc(), ""),
            Objects.toString(content.endAtUtc(), ""),
            Objects.toString(content.zoneId(), ""));
    try {
      return HexFormat.of()
          .formatHex(
              MessageDigest.getInstance("SHA-256")
                  .digest(canonical.getBytes(StandardCharsets.UTF_8)))
          .equals(expectedHash);
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("JDK 缺少 SHA-256", e);
    }
  }
}
