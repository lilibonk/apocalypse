package io.apocalypse;

import io.apocalypse.system.user.service.UserService;

import org.junit.jupiter.api.Test;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noMethods;
import static org.assertj.core.api.Assertions.assertThat;

/** 分层规则测试（AGENTS.md 红线 3/5 的执法者）。只分析主代码，不依赖容器，可独立运行。 */
@AnalyzeClasses(
    packages = "io.apocalypse",
    importOptions = {
      ImportOption.DoNotIncludeTests.class,
      // R5 针对模块根包，package-info.class 是根包唯一合法存在，需排除（不影响其他规则的分析范围）
      ImportOption.DoNotIncludePackageInfos.class
    })
class LayeringRulesTest {

  /** 登录签发必须在可重复读快照中一次性装配身份、权限与撤销版本，防止并发授权变更造成撕裂 JWT。 */
  @Test
  void loginQueryMustUseRepeatableReadSnapshot() throws NoSuchMethodException {
    Transactional transactional =
        UserService.class
            .getMethod("findLoginUserByUsername", String.class)
            .getAnnotation(Transactional.class);

    assertThat(transactional).isNotNull();
    assertThat(transactional.readOnly()).isTrue();
    assertThat(transactional.isolation()).isEqualTo(Isolation.REPEATABLE_READ);
  }

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

  /** R4：复杂业务模块 domain 保持纯领域——禁依赖 Spring、MyBatis-Plus 与基础设施第三方库。 */
  @ArchTest
  static final ArchRule R4_COMPLEX_MODULE_DOMAINS_ARE_PURE =
      noClasses()
          .that()
          .resideInAnyPackage("io.apocalypse.calendar.domain..")
          .should()
          .dependOnClassesThat()
          .resideInAnyPackage(
              "com.baomidou..", "org.springframework..", "com.nlf..", "org.apache.commons.csv..");

  /** R5：模块根包只允许 package-info.java，禁止顶层类。新增模块时把根包名加进列表。 */
  @ArchTest
  static final ArchRule R5_NO_CLASSES_IN_MODULE_ROOT =
      noClasses()
          .should()
          .resideInAnyPackage(
              "io.apocalypse.common",
              "io.apocalypse.framework",
              "io.apocalypse.system",
              "io.apocalypse.calendar");

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

  /** R8a：用户 Service 不得穿透角色/部门/菜单持久化层。 */
  @ArchTest
  static final ArchRule R8A_USER_SERVICE_NO_FOREIGN_PERSISTENCE =
      noClasses()
          .that()
          .resideInAPackage("io.apocalypse.system.user.service..")
          .should()
          .dependOnClassesThat()
          .resideInAnyPackage(
              "io.apocalypse.system.role.mapper..",
              "io.apocalypse.system.role.entity..",
              "io.apocalypse.system.dept.mapper..",
              "io.apocalypse.system.dept.entity..",
              "io.apocalypse.system.menu.mapper..",
              "io.apocalypse.system.menu.entity..");

  /** R8b：角色 Service 不得穿透用户/菜单持久化层。 */
  @ArchTest
  static final ArchRule R8B_ROLE_SERVICE_NO_FOREIGN_PERSISTENCE =
      noClasses()
          .that()
          .resideInAPackage("io.apocalypse.system.role.service..")
          .should()
          .dependOnClassesThat()
          .resideInAnyPackage(
              "io.apocalypse.system.user.mapper..",
              "io.apocalypse.system.user.entity..",
              "io.apocalypse.system.menu.mapper..",
              "io.apocalypse.system.menu.entity..");

  /** R8c：部门 Service 不得穿透用户持久化层。 */
  @ArchTest
  static final ArchRule R8C_DEPT_SERVICE_NO_FOREIGN_PERSISTENCE =
      noClasses()
          .that()
          .resideInAPackage("io.apocalypse.system.dept.service..")
          .should()
          .dependOnClassesThat()
          .resideInAnyPackage(
              "io.apocalypse.system.user.mapper..", "io.apocalypse.system.user.entity..");

  /** R9：dto.request / dto.response 中的数据契约必须是 record。 */
  @ArchTest
  static final ArchRule R9_DTOS_ARE_RECORDS =
      classes()
          .that()
          .resideInAnyPackage("..dto.request..", "..dto.response..")
          .should(
              new ArchCondition<>("be records") {
                @Override
                public void check(JavaClass item, ConditionEvents events) {
                  events.add(
                      new SimpleConditionEvent(
                          item, item.reflect().isRecord(), item.getName() + " 必须声明为 record"));
                }
              });

  /** R10a：lunar-java 只能由 Calendar 日期 adapter 调用，禁止算法类型向上泄漏。 */
  @ArchTest
  static final ArchRule R10A_LUNAR_DEPENDENCY_ISOLATED =
      noClasses()
          .that()
          .resideOutsideOfPackage("io.apocalypse.calendar.infrastructure.date..")
          .should()
          .dependOnClassesThat()
          .resideInAnyPackage("com.nlf..");

  /** R10b：Commons CSV 只能由离线导入 adapter 调用。 */
  @ArchTest
  static final ArchRule R10B_CSV_DEPENDENCY_ISOLATED =
      noClasses()
          .that()
          .resideOutsideOfPackage("io.apocalypse.calendar.infrastructure.importing..")
          .should()
          .dependOnClassesThat()
          .resideInAnyPackage("org.apache.commons.csv..");

  /** R10c：日期与导入 adapter 不得主动联网；来源 URI 只是审计文本。 */
  @ArchTest
  static final ArchRule R10C_CALENDAR_ADAPTERS_DO_NOT_USE_NETWORK_CLIENTS =
      noClasses()
          .that()
          .resideInAnyPackage(
              "io.apocalypse.calendar.infrastructure.date..",
              "io.apocalypse.calendar.infrastructure.importing..")
          .should()
          .dependOnClassesThat()
          .resideInAnyPackage(
              "java.net.http..",
              "org.springframework.web.client..",
              "org.springframework.web.reactive.function.client..");
}
