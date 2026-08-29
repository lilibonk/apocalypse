package io.apocalypse;

import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModules;
import org.springframework.modulith.docs.Documenter;

/**
 * 模块边界测试（AGENTS.md 红线 1/2 的执法者）：Modulith 校验跨模块访问只走对方 api 包 facade/视图或 common.event
 * 共享事件契约；并生成模块文档（target/spring-modulith-docs）。不依赖容器，可独立运行。
 */
class ModuleBoundaryTest {

  private final ApplicationModules modules = ApplicationModules.of(ApocalypseApplication.class);

  @Test
  void verifiesModuleBoundaries() {
    modules.verify();
  }

  @Test
  void writesModuleDocumentation() {
    new Documenter(modules).writeDocumentation();
  }
}
