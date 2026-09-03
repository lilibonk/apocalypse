package io.apocalypse.calendar.application;

import io.apocalypse.calendar.api.CalendarErrorCode;
import io.apocalypse.calendar.domain.ImportFileEvidence;
import io.apocalypse.common.exception.BizException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Set;

final class DataImportFilePolicy {

  static final int MAX_DATA_BYTES = 2 * 1024 * 1024;

  static final int MAX_EVIDENCE_BYTES = 20 * 1024 * 1024;

  private static final Set<String> EVIDENCE_EXTENSIONS = Set.of("pdf", "png", "jpg", "jpeg", "csv");

  private DataImportFilePolicy() {}

  static ImportFileEvidence data(ImportUploadFile file) {
    requirePresent(file, MAX_DATA_BYTES);
    String name = safeFileName(file.fileName(), "calendar-import.csv");
    if (!extension(name).equals("csv") || isArchiveOrOffice(file.bytes())) {
      throw invalidFormat();
    }
    return new ImportFileEvidence(
        name,
        safeContentType(file.contentType()),
        file.bytes().length,
        sha256(file.bytes()),
        file.bytes());
  }

  static ImportFileEvidence evidence(ImportUploadFile file) {
    if (file == null) {
      return null;
    }
    requirePresent(file, MAX_EVIDENCE_BYTES);
    String name = safeFileName(file.fileName(), "calendar-evidence.bin");
    String extension = extension(name);
    if (!EVIDENCE_EXTENSIONS.contains(extension)
        || isArchiveOrOffice(file.bytes())
        || !matchesEvidence(extension, file.bytes())) {
      throw invalidFormat();
    }
    return new ImportFileEvidence(
        name,
        safeContentType(file.contentType()),
        file.bytes().length,
        sha256(file.bytes()),
        file.bytes());
  }

  static String sha256(byte[] bytes) {
    try {
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("JDK 缺少 SHA-256", e);
    }
  }

  static String sha256(String value) {
    return sha256(value.getBytes(StandardCharsets.UTF_8));
  }

  private static void requirePresent(ImportUploadFile file, int maxBytes) {
    if (file == null
        || file.bytes() == null
        || file.bytes().length < 1
        || file.bytes().length > maxBytes) {
      throw invalidFormat();
    }
  }

  private static boolean matchesEvidence(String extension, byte[] bytes) {
    return switch (extension) {
      case "pdf" -> startsWith(bytes, new byte[] {'%', 'P', 'D', 'F', '-'});
      case "png" ->
          startsWith(bytes, new byte[] {(byte) 0x89, 'P', 'N', 'G', (byte) 0x0d, (byte) 0x0a});
      case "jpg", "jpeg" -> startsWith(bytes, new byte[] {(byte) 0xff, (byte) 0xd8, (byte) 0xff});
      case "csv" -> !containsNull(bytes);
      default -> false;
    };
  }

  private static boolean isArchiveOrOffice(byte[] bytes) {
    return startsWith(bytes, new byte[] {'P', 'K', 3, 4})
        || startsWith(
            bytes,
            new byte[] {
              (byte) 0xd0, (byte) 0xcf, (byte) 0x11, (byte) 0xe0,
              (byte) 0xa1, (byte) 0xb1, (byte) 0x1a, (byte) 0xe1
            });
  }

  private static boolean startsWith(byte[] value, byte[] prefix) {
    if (value.length < prefix.length) {
      return false;
    }
    for (int index = 0; index < prefix.length; index++) {
      if (value[index] != prefix[index]) {
        return false;
      }
    }
    return true;
  }

  private static boolean containsNull(byte[] bytes) {
    for (byte value : bytes) {
      if (value == 0) {
        return true;
      }
    }
    return false;
  }

  private static String safeFileName(String value, String fallback) {
    String candidate = value == null ? "" : value.replace('\\', '/');
    int separator = candidate.lastIndexOf('/');
    candidate = separator >= 0 ? candidate.substring(separator + 1) : candidate;
    candidate = candidate.replaceAll("[\\p{Cntrl}]", "_").strip();
    if (candidate.isEmpty() || candidate.equals(".") || candidate.equals("..")) {
      candidate = fallback;
    }
    return candidate.length() <= 255 ? candidate : candidate.substring(candidate.length() - 255);
  }

  private static String safeContentType(String value) {
    if (value == null
        || value.isBlank()
        || value.length() > 128
        || value.indexOf('\n') >= 0
        || value.indexOf('\r') >= 0) {
      return "application/octet-stream";
    }
    return value;
  }

  private static String extension(String name) {
    int dot = name.lastIndexOf('.');
    return dot < 0 ? "" : name.substring(dot + 1).toLowerCase(Locale.ROOT);
  }

  private static BizException invalidFormat() {
    CalendarErrorCode error = CalendarErrorCode.CALENDAR_IMPORT_FORMAT_INVALID;
    return new BizException(error.getCode(), error.getMessage());
  }
}
