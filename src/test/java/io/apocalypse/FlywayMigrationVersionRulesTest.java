package io.apocalypse;

import java.io.IOException;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Flyway 迁移版本区间门禁：
 *
 * <ul>
 *   <li>平台级迁移固定在 {@code V1.x}（{@code V1__init.sql} 或 {@code V1_<n>__<desc>.sql}），禁止占用 2..99；
 *   <li>下游业务模块迁移固定在 {@code V100.x+}（{@code V<major>=100_<n>__<module>_<desc>.sql}），杜绝上游升级与业务二开冲突。
 * </ul>
 */
class FlywayMigrationVersionRulesTest {

  private static final Pattern MIGRATION_FILE =
      Pattern.compile("^V([0-9]+(?:_[0-9]+)*)__([a-z0-9_]+)\\.sql$");

  @Test
  void shippedMigrationsFollowPlatformV1AndBusinessV100VersionRanges() throws IOException {
    Resource[] resources =
        new PathMatchingResourcePatternResolver().getResources("classpath*:db/migration/*.sql");
    assertThat(resources).isNotEmpty();

    Set<MigrationVersion> versions = new HashSet<>();
    List<String> filenames = Arrays.stream(resources).map(Resource::getFilename).sorted().toList();
    assertThat(filenames).contains("V1__init.sql");

    for (String filename : filenames) {
      MigrationVersion version = validateMigrationFilename(filename);
      assertThat(versions.add(version)).as("Flyway 迁移版本号不得重复: %s", filename).isTrue();
    }
  }

  @Test
  void validatorAcceptsPlatformV1PatchAndBusinessV100ModuleMigrationsAndRejectsViolations() {
    assertThat(validateMigrationFilename("V1__init.sql"))
        .isEqualTo(MigrationVersion.fromVersion("1"));
    assertThat(validateMigrationFilename("V1_1__platform_security_index.sql"))
        .isEqualTo(MigrationVersion.fromVersion("1.1"));
    assertThat(validateMigrationFilename("V100_1__crm_customer_table.sql"))
        .isEqualTo(MigrationVersion.fromVersion("100.1"));

    assertThatThrownBy(() -> validateMigrationFilename("V2__legacy_linear.sql"))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("平台级迁移必须使用 V1.x");
    assertThatThrownBy(() -> validateMigrationFilename("V99_1__reserved_range.sql"))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("平台级迁移必须使用 V1.x");
    assertThatThrownBy(() -> validateMigrationFilename("V100__missing_subversion.sql"))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("业务模块迁移必须使用 V<100+>_<n>__<module>_<desc>.sql");
  }

  static MigrationVersion validateMigrationFilename(String filename) {
    Matcher matcher = MIGRATION_FILE.matcher(filename == null ? "" : filename);
    if (!matcher.matches()) {
      throw new IllegalArgumentException("非法的 Flyway 迁移脚本命名: " + filename);
    }
    String rawVersion = matcher.group(1);
    String description = matcher.group(2);
    String[] parts = rawVersion.split("_");
    int major = Integer.parseInt(parts[0]);
    if (major == 1) {
      if (parts.length == 1 && !"init".equals(description)) {
        throw new IllegalArgumentException(
            "V1 根版本号仅保留给 V1__init.sql，平台后续补丁请使用 V1_<n>__*.sql: " + filename);
      }
      return MigrationVersion.fromVersion(rawVersion.replace('_', '.'));
    }
    if (major < 100) {
      throw new IllegalArgumentException(
          "平台级迁移必须使用 V1.x（[1, 2)），业务模块迁移必须使用 V100.x+（>= 100）: " + filename);
    }
    if (parts.length < 2 || !description.contains("_")) {
      throw new IllegalArgumentException(
          "业务模块迁移必须使用 V<100+>_<n>__<module>_<desc>.sql: " + filename);
    }
    return MigrationVersion.fromVersion(rawVersion.replace('_', '.'));
  }
}
