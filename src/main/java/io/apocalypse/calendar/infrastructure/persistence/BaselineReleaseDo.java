package io.apocalypse.calendar.infrastructure.persistence;

import io.apocalypse.common.entity.BaseEntity;

import java.time.LocalDate;
import java.time.LocalDateTime;

import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@TableName("cal_baseline_release")
public class BaselineReleaseDo extends BaseEntity {

  private String regionCode;

  private String releaseKey;

  private String providerKey;

  private String providerVersion;

  private String providerArtifactSha256;

  private String holidayBundleVersion;

  private String holidayBundleSha256;

  private LocalDate supportedFrom;

  private LocalDate supportedTo;

  private String sourceManifestUri;

  private Long sourceImportId;

  private String contentHash;

  private String state;

  private LocalDateTime publishedAt;

  private String publishedBy;
}
