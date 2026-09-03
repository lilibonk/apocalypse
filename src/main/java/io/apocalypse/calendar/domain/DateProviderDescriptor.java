package io.apocalypse.calendar.domain;

import java.time.LocalDate;

/** 可复现的日期算法 provider 坐标与产品承诺范围。 */
public record DateProviderDescriptor(
    String providerKey,
    String providerVersion,
    String artifactSha256,
    LocalDate supportedFrom,
    LocalDate supportedTo) {}
