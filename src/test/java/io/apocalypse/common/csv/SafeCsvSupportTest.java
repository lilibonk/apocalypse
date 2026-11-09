package io.apocalypse.common.csv;

import io.apocalypse.common.exception.BizException;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** {@link SafeCsvSupport} 单元测试（UTF-8 BOM、公式注入防御、RFC 4180 解析与行数上限）。 */
class SafeCsvSupportTest {

  @Test
  void writesUtf8BomAndNeutralizesFormulaInjectionPrefixes() {
    byte[] bytes =
        SafeCsvSupport.writeUtf8BomCsv(
            List.of("username", "nickname", "note"),
            List.of(
                List.of("alice", "=1+1", "normal, with \"quotes\""),
                List.of("bob", "+SUM(A1:A2)", "@mention"),
                List.of("carol", "-cmd", "\tleading-tab")));

    assertThat(bytes[0]).isEqualTo((byte) 0xEF);
    assertThat(bytes[1]).isEqualTo((byte) 0xBB);
    assertThat(bytes[2]).isEqualTo((byte) 0xBF);

    String text = new String(bytes, 3, bytes.length - 3, StandardCharsets.UTF_8);
    assertThat(text)
        .contains("alice,'=1+1,\"normal, with \"\"quotes\"\"\"")
        .contains("bob,'+SUM(A1:A2),'@mention")
        .contains("carol,'-cmd,'\tleading-tab");

    List<Map<String, String>> parsed = SafeCsvSupport.parseCsv(bytes, 10);
    assertThat(parsed).hasSize(3);
    assertThat(parsed.get(0))
        .containsEntry("username", "alice")
        .containsEntry("nickname", "'=1+1")
        .containsEntry("note", "normal, with \"quotes\"");
  }

  @Test
  void rejectsCsvExceedingMaxRowLimitOrUnclosedQuotes() {
    byte[] csv =
        SafeCsvSupport.writeUtf8BomCsv(
            List.of("id", "name"),
            List.of(List.of("1", "a"), List.of("2", "b"), List.of("3", "c")));

    assertThatThrownBy(() -> SafeCsvSupport.parseCsv(csv, 2))
        .isInstanceOf(BizException.class)
        .hasMessageContaining("CSV 导入行数超过上限");

    byte[] broken = "id,name\r\n1,\"unclosed".getBytes(StandardCharsets.UTF_8);
    assertThatThrownBy(() -> SafeCsvSupport.parseCsv(broken, 10))
        .isInstanceOf(BizException.class)
        .hasMessageContaining("未闭合的双引号");
  }
}
