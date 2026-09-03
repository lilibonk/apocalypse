package io.apocalypse.calendar.domain;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;

public final class BaselineContentHasher {

  private BaselineContentHasher() {}

  public static String hash(
      BaselineReleaseSnapshot release, List<BaselineCorrectionSnapshot> corrections) {
    String base =
        sha256(
            String.join(
                "|",
                release.providerKey(),
                release.providerVersion(),
                release.providerArtifactSha256(),
                release.holidayBundleVersion(),
                release.holidayBundleSha256()));
    if (corrections.isEmpty()) {
      return base;
    }
    StringBuilder canonical = new StringBuilder(base).append('\n');
    corrections.stream()
        .sorted(
            Comparator.comparing(BaselineCorrectionSnapshot::date)
                .thenComparing(value -> value.field().name()))
        .forEach(
            value ->
                canonical
                    .append(value.date())
                    .append('|')
                    .append(value.field())
                    .append('|')
                    .append(value.action())
                    .append('|')
                    .append(value.value() == null ? "" : value.value().canonicalForm())
                    .append('\n'));
    return sha256(canonical.toString());
  }

  private static String sha256(String value) {
    try {
      return HexFormat.of()
          .formatHex(
              MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("JDK 缺少 SHA-256", e);
    }
  }
}
