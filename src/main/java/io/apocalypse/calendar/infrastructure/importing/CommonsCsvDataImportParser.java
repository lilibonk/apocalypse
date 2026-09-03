package io.apocalypse.calendar.infrastructure.importing;

import io.apocalypse.calendar.domain.DataImportParseRequest;
import io.apocalypse.calendar.domain.DataImportParseResult;
import io.apocalypse.calendar.domain.DataImportParser;
import io.apocalypse.calendar.domain.DataImportRow;
import io.apocalypse.calendar.domain.DataImportTarget;
import io.apocalypse.calendar.domain.DataImportValidation;
import io.apocalypse.calendar.domain.DataImportValidationIssue;
import io.apocalypse.calendar.domain.DayClassification;
import io.apocalypse.calendar.domain.OverrideAction;

import java.io.IOException;
import java.io.StringReader;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.text.Normalizer;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Set;

import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.apache.commons.csv.DuplicateHeaderMode;
import org.springframework.stereotype.Component;

@Component
public class CommonsCsvDataImportParser implements DataImportParser {

  public static final String VALIDATOR_VERSION = "commons-csv-1.14.1/template-v1";

  public static final List<String> HEADERS =
      List.of("date", "action", "classification", "name", "source_document_no", "note");

  private static final int MAX_ROWS = 366;

  @Override
  public DataImportParseResult parse(DataImportParseRequest request) {
    String text;
    try {
      text = decodeUtf8(request.bytes());
    } catch (CharacterCodingException e) {
      return invalid("CSV_ENCODING", "文件必须使用严格 UTF-8 编码");
    }
    if (text.indexOf('\0') >= 0) {
      return invalid("CSV_BINARY_CONTENT", "CSV 不允许包含二进制空字符");
    }
    if (!text.isEmpty() && text.charAt(0) == '\ufeff') {
      text = text.substring(1);
    }

    CSVFormat format =
        CSVFormat.RFC4180
            .builder()
            .setHeader()
            .setSkipHeaderRecord(true)
            .setIgnoreEmptyLines(true)
            .setDuplicateHeaderMode(DuplicateHeaderMode.DISALLOW)
            .setAllowMissingColumnNames(false)
            .setMaxRows(MAX_ROWS + 1L)
            .get();
    List<DataImportValidationIssue> issues = new ArrayList<>();
    List<DataImportRow> rows = new ArrayList<>();
    Set<LocalDate> dates = new HashSet<>();
    try (CSVParser parser = CSVParser.parse(new StringReader(text), format)) {
      if (!parser.getHeaderNames().equals(HEADERS)) {
        return invalid("CSV_HEADER", "CSV header 必须与官方模板完全一致");
      }
      for (CSVRecord record : parser) {
        long rowNumber = record.getRecordNumber() + 1;
        if (rows.size() >= MAX_ROWS) {
          issues.add(issue(rowNumber, "", "CSV_ROW_LIMIT", "CSV 数据行不能超过 366 行"));
          break;
        }
        if (!record.isConsistent() || record.size() != HEADERS.size()) {
          issues.add(issue(rowNumber, "", "CSV_COLUMN_COUNT", "CSV 数据列数量与模板不一致"));
          continue;
        }
        DataImportRow row = parseRow(record, rowNumber, request, issues);
        if (row != null && !dates.add(row.date())) {
          issues.add(issue(rowNumber, "date", "CSV_DUPLICATE_DATE", "同一日期只能出现一次"));
        }
        if (row != null && !hasRowIssue(rowNumber, issues)) {
          rows.add(row);
        }
      }
    } catch (IllegalArgumentException | IOException e) {
      return invalid("CSV_SYNTAX", "CSV 引号、换行或 header 格式无效");
    }
    if (rows.isEmpty() && issues.isEmpty()) {
      issues.add(issue(0, "", "CSV_EMPTY", "CSV 至少需要一行有效数据"));
    }
    if (!issues.isEmpty()) {
      return new DataImportParseResult(
          List.of(), new DataImportValidation(false, rows.size(), VALIDATOR_VERSION, issues), null);
    }
    List<DataImportRow> normalized =
        rows.stream().sorted(Comparator.comparing(DataImportRow::date)).toList();
    return new DataImportParseResult(
        normalized,
        new DataImportValidation(true, normalized.size(), VALIDATOR_VERSION, List.of()),
        sha256(canonical(normalized)));
  }

  private static DataImportRow parseRow(
      CSVRecord record,
      long rowNumber,
      DataImportParseRequest request,
      List<DataImportValidationIssue> issues) {
    LocalDate date = parseDate(record.get("date"), rowNumber, issues);
    OverrideAction action = parseAction(record.get("action"), rowNumber, issues);
    DayClassification classification =
        parseClassification(record.get("classification"), rowNumber, issues);
    String name = normalize(record.get("name"));
    String sourceDocumentNo = normalize(record.get("source_document_no"));
    String note = normalize(record.get("note"));
    if (date != null && date.getYear() != request.dataYear()) {
      issues.add(issue(rowNumber, "date", "CSV_YEAR", "日期必须位于导入年份内"));
    }
    if (name != null && name.length() > 64) {
      issues.add(issue(rowNumber, "name", "CSV_NAME_LENGTH", "name 最长 64 个字符"));
    }
    if (note != null && note.length() > 500) {
      issues.add(issue(rowNumber, "note", "CSV_NOTE_LENGTH", "note 最长 500 个字符"));
    }
    if (request.target() == DataImportTarget.SYSTEM_BASELINE) {
      validateSystemRow(
          rowNumber,
          action,
          classification,
          sourceDocumentNo,
          request.expectedDocumentNo(),
          issues);
    } else {
      validateManagedRow(rowNumber, action, classification, name, issues);
    }
    if (date == null || action == null) {
      return null;
    }
    return new DataImportRow(date, action, classification, name, sourceDocumentNo, note);
  }

  private static void validateSystemRow(
      long rowNumber,
      OverrideAction action,
      DayClassification classification,
      String sourceDocumentNo,
      String expectedDocumentNo,
      List<DataImportValidationIssue> issues) {
    if (action != null && action != OverrideAction.SET) {
      issues.add(issue(rowNumber, "action", "CSV_SYSTEM_ACTION", "系统基线只接受 SET"));
    }
    if (classification != DayClassification.OFFICIAL_REST
        && classification != DayClassification.ADJUSTED_WORKDAY) {
      issues.add(
          issue(
              rowNumber,
              "classification",
              "CSV_SYSTEM_CLASSIFICATION",
              "系统基线只接受 OFFICIAL_REST 或 ADJUSTED_WORKDAY"));
    }
    if (sourceDocumentNo == null || !sourceDocumentNo.equals(expectedDocumentNo)) {
      issues.add(
          issue(rowNumber, "source_document_no", "CSV_SOURCE_DOCUMENT", "系统基线每行文号必须与导入元数据一致"));
    }
  }

  private static void validateManagedRow(
      long rowNumber,
      OverrideAction action,
      DayClassification classification,
      String name,
      List<DataImportValidationIssue> issues) {
    if (action == OverrideAction.SET) {
      if (classification != DayClassification.CUSTOM_REST
          && classification != DayClassification.CUSTOM_WORKDAY) {
        issues.add(
            issue(
                rowNumber,
                "classification",
                "CSV_MANAGED_CLASSIFICATION",
                "托管覆盖 SET 只接受 CUSTOM_REST 或 CUSTOM_WORKDAY"));
      }
    } else if (action == OverrideAction.CLEAR || action == OverrideAction.INHERIT) {
      if (classification != null) {
        issues.add(
            issue(
                rowNumber,
                "classification",
                "CSV_MANAGED_EMPTY_VALUE",
                "CLEAR/INHERIT 不允许携带 classification"));
      }
      if (name != null) {
        issues.add(issue(rowNumber, "name", "CSV_MANAGED_EMPTY_VALUE", "CLEAR/INHERIT 不允许携带 name"));
      }
    }
  }

  private static LocalDate parseDate(
      String raw, long rowNumber, List<DataImportValidationIssue> issues) {
    try {
      return LocalDate.parse(raw.strip());
    } catch (DateTimeException e) {
      issues.add(issue(rowNumber, "date", "CSV_DATE", "date 必须是 ISO-8601 日期"));
      return null;
    }
  }

  private static OverrideAction parseAction(
      String raw, long rowNumber, List<DataImportValidationIssue> issues) {
    try {
      OverrideAction value = OverrideAction.valueOf(raw.strip());
      if (value == OverrideAction.BASE) {
        throw new IllegalArgumentException();
      }
      return value;
    } catch (IllegalArgumentException e) {
      issues.add(issue(rowNumber, "action", "CSV_ACTION", "action 枚举无效"));
      return null;
    }
  }

  private static DayClassification parseClassification(
      String raw, long rowNumber, List<DataImportValidationIssue> issues) {
    String value = normalize(raw);
    if (value == null) {
      return null;
    }
    try {
      return DayClassification.valueOf(value);
    } catch (IllegalArgumentException e) {
      issues.add(issue(rowNumber, "classification", "CSV_CLASSIFICATION", "classification 枚举无效"));
      return null;
    }
  }

  private static String decodeUtf8(byte[] bytes) throws CharacterCodingException {
    return StandardCharsets.UTF_8
        .newDecoder()
        .onMalformedInput(CodingErrorAction.REPORT)
        .onUnmappableCharacter(CodingErrorAction.REPORT)
        .decode(ByteBuffer.wrap(bytes))
        .toString();
  }

  private static String normalize(String value) {
    String normalized = Normalizer.normalize(value, Normalizer.Form.NFC).strip();
    return normalized.isEmpty() ? null : normalized;
  }

  private static boolean hasRowIssue(long rowNumber, List<DataImportValidationIssue> issues) {
    return issues.stream().anyMatch(issue -> issue.rowNumber() == rowNumber);
  }

  private static DataImportParseResult invalid(String code, String message) {
    DataImportValidationIssue issue = issue(0, "", code, message);
    return new DataImportParseResult(
        List.of(), new DataImportValidation(false, 0, VALIDATOR_VERSION, List.of(issue)), null);
  }

  private static DataImportValidationIssue issue(
      long rowNumber, String column, String code, String message) {
    return new DataImportValidationIssue(rowNumber, column, code, message);
  }

  private static String canonical(List<DataImportRow> rows) {
    StringBuilder value = new StringBuilder("calendar-import-v1\n");
    rows.forEach(
        row ->
            append(value, row.date().toString())
                .append('|')
                .append(row.action().name())
                .append('|')
                .append(row.classification() == null ? "" : row.classification().name())
                .append('|')
                .append(lengthValue(row.name()))
                .append('|')
                .append(lengthValue(row.sourceDocumentNo()))
                .append('|')
                .append(lengthValue(row.note()))
                .append('\n'));
    return value.toString();
  }

  private static StringBuilder append(StringBuilder target, String value) {
    return target.append(value);
  }

  private static String lengthValue(String value) {
    String safe = value == null ? "" : value;
    return safe.length() + ":" + safe;
  }

  private static String sha256(String value) {
    try {
      return HexFormat.of()
          .formatHex(
              MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("JDK 缺少 SHA-256", e);
    }
  }
}
