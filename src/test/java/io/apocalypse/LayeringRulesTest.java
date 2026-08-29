package io.apocalypse;

import org.springframework.transaction.annotation.Transactional;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noMethods;

/** 分层规则测试（AGENTS.md 红线 3/5 的执法者）。只分析主代码，不依赖容器，可独立运行。 */
@AnalyzeClasses(
    packages = "io.apocalypse",
    importOptions = {
      ImportOption.DoNotIncludeTests.class,
      // R5 针对模块根包，package-info.class 是根包唯一合法存在，需排除（不影响其他规则的分析范围）
      ImportOption.DoNotIncludePackageInfos.class
    })
class LayeringRulesTest {

  /**
   * R1：MyBatis-Plus 类型只允许出现在 common（PageResult/BaseEntity 豁免）、framework.mybatis、mapper 与
   * infrastructure 包。entity 包仅豁免 {@code @TableName} 等持久化映射注解（与 common BaseEntity 的 MP 注解同性质）；
   * 红线针对的是 QueryWrapper/Page 等查询 API 外泄，不在此列。
   */
  @ArchTest
  static final ArchRule R1_MYBATIS_PLUS_TYPES_CONFINED =
      noClasses()
          .that()
          .resideOutsideOfPackages(
              "io.apocalypse.common..",
              "io.apocalypse.framework.mybatis..",
              "..mapper..",
              "..infrastructure..",
              "..entity..")
          .should()
          .dependOnClassesThat()
          .resideInAnyPackage("com.baomidou..");

  /** R2：Controller 层不得直连 Mapper / infrastructure。 */
  @ArchTest
  static final ArchRule R2_CONTROLLER_NO_MAPPER_OR_INFRASTRUCTURE =
      noClasses()
          .that()
          .resideInAnyPackage("..controller..", "..interfaces..")
          .should()
          .dependOnClassesThat()
          .resideInAnyPackage("..mapper..", "..infrastructure..");

  /** R3a：@Transactional 不得标注在 controller/interfaces 包的类上。 */
  @ArchTest
  static final ArchRule R3A_NO_TRANSACTIONAL_ON_CONTROLLER_CLASSES =
      noClasses()
          .that()
          .resideInAnyPackage("..controller..", "..interfaces..")
          .should()
          .beAnnotatedWith(Transactional.class);

  /** R3b：@Transactional 不得标注在 controller/interfaces 包类的方法上。 */
  @ArchTest
  static final ArchRule R3B_NO_TRANSACTIONAL_ON_CONTROLLER_METHODS =
      noMethods()
          .that()
          .areDeclaredInClassesThat()
          .resideInAnyPackage("..controller..", "..interfaces..")
          .should()
          .beAnnotatedWith(Transactional.class);

  /** R4：order.domain 保持纯领域——禁依赖 Spring 与 MyBatis-Plus。 */
  @ArchTest
  static final ArchRule R4_ORDER_DOMAIN_IS_PURE =
      noClasses()
          .that()
          .resideInAPackage("io.apocalypse.order.domain..")
          .should()
          .dependOnClassesThat()
          .resideInAnyPackage("com.baomidou..", "org.springframework..");

  /** R5：模块根包只允许 package-info.java，禁止顶层类。新增模块时把根包名加进列表。 */
  @ArchTest
  static final ArchRule R5_NO_CLASSES_IN_MODULE_ROOT =
      noClasses()
          .should()
          .resideInAnyPackage(
              "io.apocalypse.common",
              "io.apocalypse.framework",
              "io.apocalypse.system",
              "io.apocalypse.order");

  /** R6：dto 包本体禁止直接放类，请求/响应必须落 dto.request / dto.response 子包。 */
  @ArchTest
  static final ArchRule R6_DTO_REQUEST_RESPONSE_SPLIT =
      noClasses().should().resideInAPackage("..dto");

  /** R7：@RestController 只能落在 controller/interfaces 包；framework 的 AuthController 属技术装配，豁免。 */
  @ArchTest
  static final ArchRule R7_CONTROLLER_LOCATION =
      classes()
          .that()
          .areAnnotatedWith(org.springframework.web.bind.annotation.RestController.class)
          .and()
          .resideOutsideOfPackage("io.apocalypse.framework..")
          .should()
          .resideInAnyPackage("..controller..", "..interfaces..");
}
