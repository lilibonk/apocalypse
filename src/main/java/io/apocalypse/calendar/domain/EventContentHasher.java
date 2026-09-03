package io.apocalypse.calendar.domain;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Objects;

public final class EventContentHasher {

  private EventContentHasher() {}

  public static String hash(EventContent content) {
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
      byte[] digest =
          MessageDigest.getInstance("SHA-256").digest(canonical.getBytes(StandardCharsets.UTF_8));
      return HexFormat.of().formatHex(digest);
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("JDK 缺少 SHA-256", e);
    }
  }
}
