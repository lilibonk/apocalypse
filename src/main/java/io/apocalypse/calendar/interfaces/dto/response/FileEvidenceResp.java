package io.apocalypse.calendar.interfaces.dto.response;

public record FileEvidenceResp(String fileName, String contentType, long size, String sha256) {}
