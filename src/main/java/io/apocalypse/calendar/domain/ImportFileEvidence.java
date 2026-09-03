package io.apocalypse.calendar.domain;

public record ImportFileEvidence(
    String fileName, String contentType, long size, String sha256, byte[] bytes) {

  public ImportFileEvidence {
    bytes = bytes == null ? null : bytes.clone();
  }

  @Override
  public byte[] bytes() {
    return bytes == null ? null : bytes.clone();
  }
}
