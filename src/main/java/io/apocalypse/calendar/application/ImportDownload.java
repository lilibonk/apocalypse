package io.apocalypse.calendar.application;

public record ImportDownload(String fileName, String contentType, byte[] bytes) {

  public ImportDownload {
    bytes = bytes.clone();
  }

  @Override
  public byte[] bytes() {
    return bytes.clone();
  }
}
