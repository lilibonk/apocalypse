package io.apocalypse.common.csv;

import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 通用安全 CSV 导入/导出基础设施（RFC 4180 + UTF-8 BOM + 公式注入防护）。
 *
 * <ul>
 *   <li>导出默认带 UTF-8 BOM（{@code EF BB BF}），确保 Excel 直接双击打开不乱码；
 *   <li>对以 {@code =}、{@code +}、{@code -}、{@code @}、{@code \t}、{@code \r} 开头的单元格自动前置单引号 {@code '}，
 *       阻断电子表格公式注入（CSV Injection）；
 *   <li>导入支持剥离 UTF-8 BOM、完整处理双引号转义与跨行单元格，并强制最大行数上限防内存耗尽。
 * </ul>
 */
public final class SafeCsvSupport {

  private static final byte[] UTF8_BOM = new byte[] {(byte) 0xEF, (byte) 0xBB, (byte) 0xBF};

  private SafeCsvSupport() {}

  /**
   * 将表头与数据行编码为带 UTF-8 BOM 的安全 CSV 字节数组。
   *
   * @param headers 表头列名
   * @param rows 数据行（每行元素对应各列，{@code null} 自动转为空串）
   * @return 带 UTF-8 BOM 的 CSV 字节流
   */
  public static byte[] writeUtf8BomCsv(List<String> headers, List<List<String>> rows) {
    StringBuilder sb = new StringBuilder();
    appendRow(sb, headers);
    if (rows != null) {
      for (List<String> row : rows) {
        appendRow(sb, row);
      }
    }
    byte[] body = sb.toString().getBytes(StandardCharsets.UTF_8);
    byte[] result = new byte[UTF8_BOM.length + body.length];
    System.arraycopy(UTF8_BOM, 0, result, 0, UTF8_BOM.length);
    System.arraycopy(body, 0, result, UTF8_BOM.length, body.length);
    return result;
  }

  /** 对单个单元格执行公式注入净化（不改变正常文本）。 */
  public static String sanitizeCell(String raw) {
    if (raw == null || raw.isEmpty()) {
      return "";
    }
    char first = raw.charAt(0);
    if (first == '='
        || first == '+'
        || first == '-'
        || first == '@'
        || first == '\t'
        || first == '\r') {
      return "'" + raw;
    }
    return raw;
  }

  /**
   * 解析 UTF-8（可选带 BOM）CSV 字节流为按表头映射的有序行列表。
   *
   * @param bytes CSV 字节数组
   * @param maxRows 允许的最大数据行数（不含表头）
   * @return 每行列名到单元格字符串的映射列表
   */
  public static List<Map<String, String>> parseCsv(byte[] bytes, int maxRows) {
    if (bytes == null || bytes.length == 0) {
      return List.of();
    }
    if (maxRows <= 0) {
      throw new IllegalArgumentException("maxRows 必须大于 0");
    }
    int offset = hasUtf8Bom(bytes) ? UTF8_BOM.length : 0;
    String text = new String(bytes, offset, bytes.length - offset, StandardCharsets.UTF_8);
    List<List<String>> records = parseRecords(text, maxRows + 1);
    if (records.isEmpty()) {
      return List.of();
    }
    List<String> headers = records.getFirst();
    List<Map<String, String>> result = new ArrayList<>(Math.max(0, records.size() - 1));
    for (int i = 1; i < records.size(); i++) {
      List<String> row = records.get(i);
      if (isBlankRow(row)) {
        continue;
      }
      Map<String, String> map = new LinkedHashMap<>();
      for (int col = 0; col < headers.size(); col++) {
        String key = headers.get(col).trim();
        if (!key.isEmpty()) {
          String value = col < row.size() ? row.get(col) : "";
          map.put(key, value);
        }
      }
      result.add(map);
    }
    return result;
  }

  private static boolean hasUtf8Bom(byte[] bytes) {
    return bytes.length >= 3
        && bytes[0] == UTF8_BOM[0]
        && bytes[1] == UTF8_BOM[1]
        && bytes[2] == UTF8_BOM[2];
  }

  private static boolean isBlankRow(List<String> row) {
    return row.isEmpty() || row.stream().allMatch(cell -> cell == null || cell.isBlank());
  }

  private static void appendRow(StringBuilder sb, List<String> cells) {
    if (cells != null) {
      for (int i = 0; i < cells.size(); i++) {
        if (i > 0) {
          sb.append(',');
        }
        sb.append(escapeCsvField(sanitizeCell(cells.get(i))));
      }
    }
    sb.append("\r\n");
  }

  private static String escapeCsvField(String sanitized) {
    boolean needsQuotes =
        sanitized.indexOf(',') >= 0
            || sanitized.indexOf('"') >= 0
            || sanitized.indexOf('\r') >= 0
            || sanitized.indexOf('\n') >= 0;
    if (!needsQuotes) {
      return sanitized;
    }
    return "\"" + sanitized.replace("\"", "\"\"") + "\"";
  }

  private static List<List<String>> parseRecords(String text, int maxTotalRecords) {
    List<List<String>> records = new ArrayList<>();
    List<String> currentRecord = new ArrayList<>();
    StringBuilder currentField = new StringBuilder();
    boolean inQuotes = false;

    int len = text.length();
    for (int i = 0; i < len; i++) {
      char ch = text.charAt(i);
      if (inQuotes) {
        if (ch == '"') {
          if (i + 1 < len && text.charAt(i + 1) == '"') {
            currentField.append('"');
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          currentField.append(ch);
        }
      } else {
        if (ch == '"') {
          inQuotes = true;
        } else if (ch == ',') {
          currentRecord.add(currentField.toString());
          currentField.setLength(0);
        } else if (ch == '\r' || ch == '\n') {
          if (ch == '\r' && i + 1 < len && text.charAt(i + 1) == '\n') {
            i++;
          }
          currentRecord.add(currentField.toString());
          currentField.setLength(0);
          records.add(currentRecord);
          if (records.size() > maxTotalRecords) {
            throw new BizException(
                ErrorCode.PARAM_INVALID.getCode(),
                "CSV 导入行数超过上限（最多 " + (maxTotalRecords - 1) + " 行）");
          }
          currentRecord = new ArrayList<>();
        } else {
          currentField.append(ch);
        }
      }
    }
    if (inQuotes) {
      throw new BizException(ErrorCode.PARAM_INVALID.getCode(), "CSV 格式非法：存在未闭合的双引号");
    }
    if (currentField.length() > 0 || !currentRecord.isEmpty()) {
      currentRecord.add(currentField.toString());
      records.add(currentRecord);
      if (records.size() > maxTotalRecords) {
        throw new BizException(
            ErrorCode.PARAM_INVALID.getCode(), "CSV 导入行数超过上限（最多 " + (maxTotalRecords - 1) + " 行）");
      }
    }
    return records;
  }
}
