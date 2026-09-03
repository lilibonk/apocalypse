package io.apocalypse.calendar.infrastructure.persistence;

import io.apocalypse.common.entity.BaseEntity;

import java.time.LocalDate;
import java.time.LocalDateTime;

import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@TableName("cal_data_import")
public class DataImportDo extends BaseEntity {

  private String importKey;

  private Long uploaderUserId;

  private String targetType;

  private Long targetCalendarId;

  private String regionCode;

  private Integer dataYear;

  private String sourceClaim;

  private String assuranceLevel;

  private String documentNo;

  private String documentTitle;

  private String issuer;

  private LocalDate documentPublishedOn;

  private String sourceUri;

  private String dataFileName;

  private String dataContentType;

  private Long dataFileSize;

  private String dataFileSha256;

  private byte[] dataFileBytes;

  private String evidenceFileName;

  private String evidenceContentType;

  private Long evidenceFileSize;

  private String evidenceFileSha256;

  private byte[] evidenceFileBytes;

  private Object normalizedPayload;

  private String normalizedPayloadHash;

  private Object validationReport;

  private Object diffReport;

  private String state;

  private LocalDateTime reviewedAt;

  private String reviewedBy;

  private String reviewNote;

  private LocalDateTime publishedAt;

  private String publishedBy;

  private Long publishedReleaseId;

  private Long publishedRevisionId;
}
