package io.apocalypse.calendar.domain;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;

public final class OverrideContentHasher {

  private OverrideContentHasher() {}

  public static String hash(List<DayOverrideOperation> operations) {
    String canonical =
        operations.stream()
            .sorted(
                Comparator.comparing(DayOverrideOperation::date)
                    .thenComparing(operation -> operation.field().name()))
            .map(OverrideContentHasher::canonical)
            .reduce((left, right) -> left + "\n" + right)
            .orElse("");
    try {
      byte[] digest =
          MessageDigest.getInstance("SHA-256").digest(canonical.getBytes(StandardCharsets.UTF_8));
      return HexFormat.of().formatHex(digest);
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("JDK 缺少 SHA-256", e);
    }
  }

  private static String canonical(DayOverrideOperation operation) {
    return String.join(
        "|",
        operation.date().toString(),
        operation.field().name(),
        operation.action().name(),
        operation.value() == null ? "" : operation.value().canonicalForm(),
        operation.savedUnderlay().canonicalForm(),
        operation.savedUnderlayHash(),
        operation.savedUnderlaySource().layer().name(),
        Objects.toString(operation.savedUnderlaySource().sourceCalendarKey(), ""),
        Objects.toString(operation.savedUnderlaySource().sourceVersion(), ""));
  }
}
