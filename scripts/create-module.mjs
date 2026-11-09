#!/usr/bin/env node
/**
 * 业务模块一键脚手架生成器（符合 Apocalypse Modulith / ArchUnit / DynaLayer / Flyway V100.x 规范）。
 *
 * 用法：
 *   node scripts/create-module.mjs <moduleKey> [--title <中文名>] [--dry-run]
 *
 * 示例：
 *   node scripts/create-module.mjs billing --title 账单管理 --dry-run
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  console.log(
    "Usage: node scripts/create-module.mjs <moduleKey> [--title <中文名>] [--dry-run]",
  );
  process.exit(0);
}

const dryRun = args.includes("--dry-run");
const titleIdx = args.indexOf("--title");
const title =
  titleIdx >= 0 && args[titleIdx + 1] ? args[titleIdx + 1] : null;
const moduleKey = args.find((arg, idx) => !arg.startsWith("-") && idx !== titleIdx + 1);

if (!moduleKey || !/^[a-z][a-z0-9]{1,23}$/.test(moduleKey)) {
  console.error(
    "Error: <moduleKey> 必须是以小写字母开头的 2-24 位小写字母或数字（如 billing、inventory）。",
  );
  process.exit(1);
}

const reserved = new Set(["common", "framework", "system", "calendar"]);
if (reserved.has(moduleKey)) {
  console.error(`Error: 模块键 "${moduleKey}" 为平台保留模块。`);
  process.exit(1);
}

const pascal = moduleKey.charAt(0).toUpperCase() + moduleKey.slice(1);
const displayTitle = title ?? `${pascal} 管理`;

// 计算下一个可用的 V100_<n> 业务迁移版本号
const migrationDir = path.join(root, "src/main/resources/db/migration");
const existingMigrations = fs.existsSync(migrationDir)
  ? fs.readdirSync(migrationDir)
  : [];
let nextSubVersion = 1;
for (const name of existingMigrations) {
  const match = /^V100_(\d+)__/.exec(name);
  if (match) {
    nextSubVersion = Math.max(nextSubVersion, Number(match[1]) + 1);
  }
}

const baseJavaDir = `src/main/java/io/apocalypse/${moduleKey}`;
const baseWebDir = `apocalypse-web/src/views/${moduleKey}`;
const migrationFile = `src/main/resources/db/migration/V100_${nextSubVersion}__${moduleKey}_init.sql`;

const files = [
  {
    rel: `${baseJavaDir}/package-info.java`,
    content: `@org.springframework.modulith.ApplicationModule(displayName = "${displayTitle}")
package io.apocalypse.${moduleKey};
`,
  },
  {
    rel: `${baseJavaDir}/api/package-info.java`,
    content: `@org.springframework.modulith.NamedInterface("api")
package io.apocalypse.${moduleKey}.api;
`,
  },
  {
    rel: `${baseJavaDir}/api/${pascal}Facade.java`,
    content: `package io.apocalypse.${moduleKey}.api;

import io.apocalypse.${moduleKey}.application.${pascal}Service;
import io.apocalypse.framework.capability.CapabilityRegistry;

import org.springframework.beans.factory.ObjectProvider;

/** ${displayTitle}对外稳定门面（常驻注册，先检查模块能力开关再延迟获取运行态服务）。 */
public class ${pascal}Facade {

  public static final String KEY = "${moduleKey}";

  private final CapabilityRegistry capabilities;

  private final ObjectProvider<${pascal}Service> serviceProvider;

  public ${pascal}Facade(
      CapabilityRegistry capabilities, ObjectProvider<${pascal}Service> serviceProvider) {
    this.capabilities = capabilities;
    this.serviceProvider = serviceProvider;
  }

  public boolean isAvailable() {
    return capabilities.isEnabled(KEY) && serviceProvider.getIfAvailable() != null;
  }
}
`,
  },
  {
    rel: `${baseJavaDir}/infrastructure/config/${pascal}ModuleConfiguration.java`,
    content: `package io.apocalypse.${moduleKey}.infrastructure.config;

import io.apocalypse.${moduleKey}.api.${pascal}Facade;
import io.apocalypse.${moduleKey}.dto.response.${pascal}ItemResp;
import io.apocalypse.framework.capability.CapabilityDefinition;
import io.apocalypse.framework.module.ModuleConfiguration;
import io.apocalypse.framework.redis.RedisCacheTypeRegistration;
import io.apocalypse.framework.security.PermissionActionDefinition;
import io.apocalypse.framework.security.PermissionActionRegistry.Action;

import java.util.List;
import java.util.Map;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;

/** ${displayTitle}模块装配入口（唯一允许被根扫描发现的 {@code @ModuleConfiguration}）。 */
@ModuleConfiguration
@Import({${pascal}Facade.class, ${pascal}RuntimeConfiguration.class})
public class ${pascal}ModuleConfiguration {

  @Bean
  CapabilityDefinition ${moduleKey}CapabilityDefinition() {
    return new CapabilityDefinition(${pascal}Facade.KEY);
  }

  @Bean
  PermissionActionDefinition ${moduleKey}PermissionActions() {
    return new PermissionActionDefinition(
        List.of(
            Action.business("${moduleKey}:item:list", ${pascal}Facade.KEY, false),
            Action.business("${moduleKey}:item:add", ${pascal}Facade.KEY, false),
            Action.business("${moduleKey}:item:edit", ${pascal}Facade.KEY, false),
            Action.business("${moduleKey}:item:remove", ${pascal}Facade.KEY, false)));
  }

  @Bean
  RedisCacheTypeRegistration ${moduleKey}CacheTypes() {
    return new RedisCacheTypeRegistration(
        Map.of("${moduleKey}.itemResp", ${pascal}ItemResp.class));
  }
}
`,
  },
  {
    rel: `${baseJavaDir}/infrastructure/config/${pascal}RuntimeConfiguration.java`,
    content: `package io.apocalypse.${moduleKey}.infrastructure.config;

import io.apocalypse.${moduleKey}.api.${pascal}Facade;
import io.apocalypse.${moduleKey}.infrastructure.persistence.${pascal}Mapper;
import io.apocalypse.framework.capability.ConditionalOnCapability;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.context.TypeExcludeFilter;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.FilterType;

/** ${displayTitle}运行期装配（仅当 {@code apocalypse.capabilities.${moduleKey}.enabled=true} 时激活）。 */
@Configuration(proxyBeanMethods = false)
@ConditionalOnCapability(${pascal}Facade.KEY)
@ComponentScan(
    basePackages = "io.apocalypse.${moduleKey}",
    excludeFilters = {
      @ComponentScan.Filter(type = FilterType.ANNOTATION, classes = Configuration.class),
      @ComponentScan.Filter(type = FilterType.CUSTOM, classes = TypeExcludeFilter.class)
    })
@MapperScan(basePackageClasses = ${pascal}Mapper.class)
public class ${pascal}RuntimeConfiguration {}
`,
  },
  {
    rel: `${baseJavaDir}/infrastructure/persistence/${pascal}Mapper.java`,
    content: `package io.apocalypse.${moduleKey}.infrastructure.persistence;

import org.apache.ibatis.annotations.Mapper;

/** ${displayTitle}持久化 Mapper。 */
@Mapper
public interface ${pascal}Mapper {}
`,
  },
  {
    rel: `${baseJavaDir}/application/${pascal}Service.java`,
    content: `package io.apocalypse.${moduleKey}.application;

import io.apocalypse.${moduleKey}.dto.response.${pascal}ItemResp;
import io.apocalypse.common.response.PageResult;

import java.util.List;

import org.springframework.stereotype.Service;

/** ${displayTitle}应用服务。 */
@Service
public class ${pascal}Service {

  public PageResult<${pascal}ItemResp> page(int page, int size, String keyword) {
    return new PageResult<>(List.of(), 0L, page, size);
  }
}
`,
  },
  {
    rel: `${baseJavaDir}/dto/request/${pascal}SaveReq.java`,
    content: `package io.apocalypse.${moduleKey}.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** ${displayTitle}新增/编辑请求。 */
public record ${pascal}SaveReq(
    @NotBlank(message = "名称不能为空") @Size(max = 64, message = "名称最长 64 字符") String name,
    @Size(max = 255, message = "备注最长 255 字符") String remark) {}
`,
  },
  {
    rel: `${baseJavaDir}/dto/response/${pascal}ItemResp.java`,
    content: `package io.apocalypse.${moduleKey}.dto.response;

import java.time.LocalDateTime;

/** ${displayTitle}条目响应。 */
public record ${pascal}ItemResp(
    Long id, String name, Integer status, String remark, LocalDateTime createTime) {}
`,
  },
  {
    rel: `${baseJavaDir}/interfaces/${pascal}Controller.java`,
    content: `package io.apocalypse.${moduleKey}.interfaces;

import io.apocalypse.${moduleKey}.application.${pascal}Service;
import io.apocalypse.${moduleKey}.dto.response.${pascal}ItemResp;
import io.apocalypse.common.response.PageResult;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;

/** ${displayTitle} REST 接口。 */
@Validated
@RestController
@RequestMapping("/${moduleKey}/items")
@RequiredArgsConstructor
public class ${pascal}Controller {

  private final ${pascal}Service service;

  @GetMapping("/page")
  @PreAuthorize("hasAuthority('${moduleKey}:item:list')")
  public PageResult<${pascal}ItemResp> page(
      @RequestParam(defaultValue = "1") @Min(1) int page,
      @RequestParam(defaultValue = "10") @Min(1) @Max(200) int size,
      @RequestParam(required = false) String keyword) {
    return service.page(page, size, keyword);
  }
}
`,
  },
  {
    rel: migrationFile,
    content: `-- ============================================================================
-- V100_${nextSubVersion}__${moduleKey}_init.sql —— ${displayTitle}业务模块初始化迁移（V100.x 业务版本区间）
-- 注意：请在落库前核对 menu_id 与 permission_id 未被其他业务模块占用。
-- ============================================================================

-- 1. 业务动作权限目录登记（与 ${pascal}ModuleConfiguration 声明保持一致）
-- INSERT INTO sys_permission (id, code, name, module_key, status, lifecycle, system_scope) VALUES
--   (100${nextSubVersion}01, '${moduleKey}:item:list',   '${displayTitle}查询', '${moduleKey}', 1, 'ACTIVE', FALSE),
--   (100${nextSubVersion}02, '${moduleKey}:item:add',    '${displayTitle}新增', '${moduleKey}', 1, 'ACTIVE', FALSE),
--   (100${nextSubVersion}03, '${moduleKey}:item:edit',   '${displayTitle}修改', '${moduleKey}', 1, 'ACTIVE', FALSE),
--   (100${nextSubVersion}04, '${moduleKey}:item:remove', '${displayTitle}删除', '${moduleKey}', 1, 'ACTIVE', FALSE);

-- 2. 导航菜单登记（module_key 绑定 ${moduleKey}）
-- INSERT INTO sys_menu (id, parent_id, menu_name, menu_type, path, component, perms, icon, module_key, sort, status) VALUES
--   (100${nextSubVersion}00, 0, '${displayTitle}', 'M', '/${moduleKey}', '${moduleKey}/index', NULL, 'Boxes', '${moduleKey}', 50, 1);
`,
  },
  {
    rel: `${baseWebDir}/${moduleKey}.api.ts`,
    content: `import { request } from '@/lib/api/client'
import type { PageResult, SnowflakeId } from '@/lib/api/types'
import type { ScopedRequest } from '@/lib/query/module-scope'

export interface ${pascal}Item {
  id: SnowflakeId
  name: string
  status: number
  remark: string | null
  createTime: string
}

export function fetch${pascal}Page(
  params: { page: number; size: number; keyword?: string },
  transport: ScopedRequest,
): Promise<PageResult<${pascal}Item>> {
  return request<PageResult<${pascal}Item>>('/${moduleKey}/items/page', {
    query: params,
    ...transport,
  })
}
`,
  },
  {
    rel: `${baseWebDir}/${moduleKey}.queries.ts`,
    content: `import { createModuleScope } from '@/lib/query/module-scope'
import { fetch${pascal}Page } from './${moduleKey}.api'

export const ${moduleKey}Scope = createModuleScope('${moduleKey}')

export const ${moduleKey}PageQuery = ${moduleKey}Scope.query(
  'items-page',
  ['${moduleKey}:item:list'],
  (params: { page: number; size: number; keyword?: string }, transport) =>
    fetch${pascal}Page(params, transport),
)
`,
  },
  {
    rel: `${baseWebDir}/i18n/index.ts`,
    content: `import { defineModuleLocale } from '@/i18n/module-loader'

export default defineModuleLocale('${moduleKey}', {
  zh: {
    title: '${displayTitle}',
    description: '${displayTitle}模块工作台',
  },
  en: {
    title: '${pascal}',
    description: '${pascal} module workspace',
  },
})
`,
  },
  {
    rel: `${baseWebDir}/index.tsx`,
    content: `import { useTranslation } from 'react-i18next'

import { PageHeader } from '@/components/layout/PageHeader'
import { ModuleAccess } from '@/lib/query/ModuleAccess'
import { ${moduleKey}Scope } from './${moduleKey}.queries'

export const queryScope = ${moduleKey}Scope

export default function ${pascal}Page() {
  const { t } = useTranslation('${moduleKey}')
  return (
    <ModuleAccess scope={queryScope}>
      <div className="w-full min-w-0 space-y-6 p-4 sm:p-6">
        <PageHeader title={t('title')} description={t('description')} />
      </div>
    </ModuleAccess>
  )
}
`,
  },
];

for (const item of files) {
  const fullPath = path.join(root, item.rel);
  if (fs.existsSync(fullPath)) {
    console.error(`Error: 目标文件已存在，拒绝覆盖: ${item.rel}`);
    process.exit(1);
  }
}

for (const item of files) {
  if (dryRun) {
    console.log(`[dry-run] create ${item.rel}`);
  } else {
    const fullPath = path.join(root, item.rel);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, item.content, "utf8");
    console.log(`created ${item.rel}`);
  }
}

console.log(
  dryRun
    ? `\nDry-run 完成：共预览 ${files.length} 个文件（模块 "${moduleKey}"）。`
    : `\n模块 "${moduleKey}" 生成完成！请检查：\n  1. ${migrationFile} 中的种子 ID\n  2. 在 LayeringRulesTest.R5_NO_CLASSES_IN_MODULE_ROOT 中加入 "io.apocalypse.${moduleKey}"\n  3. 运行 ./mvnw spotless:apply && ./mvnw verify`,
);
