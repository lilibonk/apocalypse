package io.apocalypse;

import io.apocalypse.system.user.mapper.SysUserMapper;

import org.apache.ibatis.session.SqlSessionFactory;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;

import static org.assertj.core.api.Assertions.assertThat;

/** 相同宿主入口启用时完整装配，不丢包私有组件或 Mapper。 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "apocalypse.capabilities.calendar.enabled=true")
class CalendarAssemblyEnabledIT extends AbstractIntegrationTest {

  @Autowired private ApplicationContext context;

  @Autowired private SqlSessionFactory sqlSessionFactory;

  @Test
  void runtimeComponentsAndModuleMappersAreAllPresent() {
    CalendarAssemblyDisabledIT.assertComponents(context, true);
    assertThat(
            sqlSessionFactory.getConfiguration().getMapperRegistry().getMappers().stream()
                .filter(type -> type.getName().startsWith("io.apocalypse.calendar."))
                .toList())
        .hasSize(12);
    assertThat(context.getBean(SysUserMapper.class)).isNotNull();
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    assertThat(getForData("/calendar/days/2026-02-17?calendarId=1", token).get("date").asText())
        .isEqualTo("2026-02-17");
  }
}
