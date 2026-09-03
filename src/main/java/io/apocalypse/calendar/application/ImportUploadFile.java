package io.apocalypse.calendar.application;

public record ImportUploadFile(String fileName, String contentType, byte[] bytes) {

  public ImportUploadFile {
    bytes = bytes == null ? null : bytes.clone();
  }

  @Override
  public byte[] bytes() {
    return bytes == null ? null : bytes.clone();
  }
}
