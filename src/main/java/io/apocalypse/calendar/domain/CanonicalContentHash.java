package io.apocalypse.calendar.domain;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/** Length-prefixed UTF-16 fields preserve boundaries, nulls, and every Java string code unit. */
final class CanonicalContentHash {

  private final MessageDigest digest;

  CanonicalContentHash(String format) {
    try {
      digest = MessageDigest.getInstance("SHA-256");
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("JDK 缺少 SHA-256", e);
    }
    add(format);
  }

  CanonicalContentHash add(Object value) {
    String text = value == null ? null : value.toString();
    int length = text == null ? -1 : text.length();
    digest.update((byte) (length >>> 24));
    digest.update((byte) (length >>> 16));
    digest.update((byte) (length >>> 8));
    digest.update((byte) length);
    if (text != null) {
      for (int i = 0; i < text.length(); i++) {
        char codeUnit = text.charAt(i);
        digest.update((byte) (codeUnit >>> 8));
        digest.update((byte) codeUnit);
      }
    }
    return this;
  }

  String finish() {
    return HexFormat.of().formatHex(digest.digest());
  }
}
