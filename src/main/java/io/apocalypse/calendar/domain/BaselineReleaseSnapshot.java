package io.apocalypse.calendar.domain;

import java.time.LocalDate;

public record BaselineReleaseSnapshot(
    Long id,
    String regionCode,
    String releaseKey,
    String providerKey,
    String providerVersion,
    String providerArtifactSha256,
    String holidayBundleVersion,
    String holidayBundleSha256,
    LocalDate supportedFrom,
    LocalDate supportedTo,
    String contentHash) {}
