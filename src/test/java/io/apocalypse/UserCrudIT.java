package io.apocalypse;

import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.exception.ConcurrencyGuard;
import io.apocalypse.system.user.entity.SysUserEntity;
import io.apocalypse.system.user.mapper.SysUserMapper;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.http.HttpMethod;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import tools.jackson.databind.JsonNode;

/** 用户 CRUD + 两级缓存生命周期集成测试。 */
class UserCrudIT extends AbstractIntegrationTest {

  @Autowired private CacheManager cacheManager;

  @Autowired private SysUserMapper sysUserMapper;

  @Test
  void userCrudAndCacheLifecycle() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);

    // 创建：响应中装箱 Long 主键应序列化为 String（JacksonConfig 生效验证）
    JsonNode created =
        postForData(
            "/system/users",
            Map.of("username", "ituser", "password", "ituser123", "nickname", "集成测试用户"),
            token);
    assertThat(created.get("id").isTextual()).as("id 应为 String 类型").isTrue();
    long userId = Long.parseLong(created.get("id").asText());

    // 详情：触发 user 缓存写入
    JsonNode detail = getForData("/system/users/" + userId, token);
    assertThat(detail.get("username").asText()).isEqualTo("ituser");
    assertThat(detail.get("id").isTextual()).isTrue();
    Cache userCache = cacheManager.getCache("user");
    assertThat(userCache).isNotNull();
    assertThat(userCache.get(userId)).as("get 后 user 缓存应包含该 key").isNotNull();

    // 更新：缓存应被 evict
    JsonNode updated = putForData("/system/users/" + userId, Map.of("nickname", "集成测试用户2"), token);
    assertThat(updated.get("nickname").asText()).isEqualTo("集成测试用户2");
    assertThat(userCache.get(userId)).as("update 后缓存应被 evict").isNull();

    // 分页：按关键字能查到
    JsonNode page = getForData("/system/users/page?page=1&size=10&keyword=ituser", token);
    assertThat(page.get("total").asLong()).isGreaterThanOrEqualTo(1);
    assertThat(page.at("/list/0/username").asText()).isEqualTo("ituser");

    // 逻辑删除：删除后再查应报 40400
    deleteForData("/system/users/" + userId, token);
    JsonNode afterDelete = exchangeRaw("/system/users/" + userId, HttpMethod.GET, null, token);
    assertThat(afterDelete.get("code").asInt()).isEqualTo(40400);
  }

  @Test
  void sameUsernameCanBeDeletedAndRecreatedRepeatedly() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    String username = "repeat_delete_user";

    for (int round = 0; round < 3; round++) {
      JsonNode created =
          postForData(
              "/system/users",
              Map.of("username", username, "password", "Repeat12345", "nickname", "重复重建"),
              token);
      deleteForData("/system/users/" + created.get("id").asText(), token);
    }

    Integer tombstones =
        jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM sys_user WHERE username = ? AND deleted = 1",
            Integer.class,
            username);
    assertThat(tombstones).isEqualTo(3);
  }

  @Test
  void pageSizeAboveGlobalLimitReturnsParameterError() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);

    JsonNode body = exchangeRaw("/system/users/page?page=1&size=201", HttpMethod.GET, null, token);

    assertThat(body.get("code").asInt()).isEqualTo(40000);
  }

  @Test
  void staleOptimisticLockUpdateReturnsConflictInsteadOfFalseSuccess() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    JsonNode created =
        postForData(
            "/system/users",
            Map.of(
                "username", "optimistic_lock_user",
                "password", "Optimistic12345",
                "nickname", "乐观锁测试"),
            token);
    long userId = created.get("id").asLong();

    SysUserEntity winner = sysUserMapper.selectById(userId);
    SysUserEntity stale = sysUserMapper.selectById(userId);
    winner.setNickname("先提交的更新");
    stale.setNickname("过期的更新");

    assertThat(sysUserMapper.updateById(winner)).isEqualTo(1);
    int staleAffectedRows = sysUserMapper.updateById(stale);
    assertThat(staleAffectedRows).isZero();
    assertThatThrownBy(() -> ConcurrencyGuard.requireSingleRow(staleAffectedRows))
        .isInstanceOfSatisfying(
            BizException.class, exception -> assertThat(exception.getCode()).isEqualTo(40900));

    deleteForData("/system/users/" + userId, token);
  }

  @Test
  void selfServiceProfilePasswordAndSessionManagement() {
    String adminToken = loginAndGetToken("admin", ADMIN_PASSWORD);
    JsonNode created =
        postForData(
            "/system/users",
            Map.of(
                "username", "self_service_user",
                "password", "SelfPass123",
                "nickname", "初始昵称"),
            adminToken);
    long userId = created.get("id").asLong();

    try {
      String tokenA = loginAndGetToken("self_service_user", "SelfPass123");
      String tokenB = loginAndGetToken("self_service_user", "SelfPass123");

      // 1. 更新个人基础资料
      JsonNode updatedProfile =
          putForData("/system/users/me/profile", Map.of("nickname", "自助修改昵称"), tokenA);
      assertThat(updatedProfile.get("nickname").asText()).isEqualTo("自助修改昵称");

      // 2. 查看个人在线会话列表（应看到 2 个会话，且当前会话 current=true）
      JsonNode sessions = getForData("/system/users/me/sessions", tokenA);
      assertThat(sessions.size()).isEqualTo(2);
      String otherJti = null;
      int currentCount = 0;
      for (JsonNode session : sessions) {
        assertThat(session.get("jti").asText()).isNotBlank();
        if (session.get("current").asBoolean()) {
          currentCount++;
        } else {
          otherJti = session.get("jti").asText();
        }
      }
      assertThat(currentCount).isEqualTo(1);
      assertThat(otherJti).isNotBlank();

      // 3. 越权防护：禁止踢除其他用户的会话
      JsonNode adminSessions = getForData("/system/users/me/sessions", adminToken);
      String adminJti = adminSessions.get(0).get("jti").asText();
      JsonNode crossKick =
          exchangeRaw("/system/users/me/sessions/" + adminJti, HttpMethod.DELETE, null, tokenA);
      assertThat(crossKick.get("code").asInt()).isEqualTo(40400);

      // 4. 踢除自己的另一个会话 tokenB，tokenA 保持有效
      deleteForData("/system/users/me/sessions/" + otherJti, tokenA);
      JsonNode tokenBAfterKick =
          exchangeRaw("/system/users/me/sessions", HttpMethod.GET, null, tokenB);
      assertThat(tokenBAfterKick.get("code").asInt()).isEqualTo(40100);
      assertThat(getForData("/system/users/me/sessions", tokenA).size()).isEqualTo(1);

      // 5. 自助修改密码：旧密码错误返回 10000（BIZ_ERROR）
      JsonNode wrongOldPwd =
          exchangeRaw(
              "/system/users/me/password",
              HttpMethod.PUT,
              Map.of("oldPassword", "WrongPass123", "newPassword", "NewSelfPass123"),
              tokenA);
      assertThat(wrongOldPwd.get("code").asInt()).isEqualTo(10000);

      // 6. 自助修改密码成功：自动递增 cv 使旧令牌全部失效，新密码可正常登录
      JsonNode changePwd =
          exchangeRaw(
              "/system/users/me/password",
              HttpMethod.PUT,
              Map.of("oldPassword", "SelfPass123", "newPassword", "NewSelfPass123"),
              tokenA);
      assertThat(changePwd.get("code").asInt()).isZero();
      JsonNode tokenAAfterPwdChange =
          exchangeRaw("/system/users/me/sessions", HttpMethod.GET, null, tokenA);
      assertThat(tokenAAfterPwdChange.get("code").asInt()).isEqualTo(40100);

      String tokenC = loginAndGetToken("self_service_user", "NewSelfPass123");
      assertThat(getForData("/system/users/me/sessions", tokenC).size()).isEqualTo(1);

      // 7. 注销本人全部设备会话
      deleteForData("/system/users/me/sessions", tokenC);
      JsonNode tokenCAfterRevokeAll =
          exchangeRaw("/system/users/me/sessions", HttpMethod.GET, null, tokenC);
      assertThat(tokenCAfterRevokeAll.get("code").asInt()).isEqualTo(40100);
    } finally {
      deleteForData("/system/users/" + userId, adminToken);
    }
  }

  @Test
  void exportUsersCsvIncludesUtf8BomAndNeutralizesFormulaInjection() {
    String adminToken = loginAndGetToken("admin", ADMIN_PASSWORD);
    JsonNode created =
        postForData(
            "/system/users",
            Map.of(
                "username", "csv_formula_user",
                "password", "CsvPass123",
                "nickname", "=CMD|'/C calc'!A0"),
            adminToken);
    long userId = created.get("id").asLong();

    try {
      org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
      headers.setBearerAuth(adminToken);
      var response =
          restTemplate.exchange(
              "/system/users/export?keyword=csv_formula_user",
              HttpMethod.GET,
              new org.springframework.http.HttpEntity<>(headers),
              byte[].class);
      assertThat(response.getStatusCode().value()).isEqualTo(200);
      byte[] body = response.getBody();
      assertThat(body).isNotNull();
      assertThat(body[0]).isEqualTo((byte) 0xEF);
      assertThat(body[1]).isEqualTo((byte) 0xBB);
      assertThat(body[2]).isEqualTo((byte) 0xBF);
      String csvText =
          new String(body, 3, body.length - 3, java.nio.charset.StandardCharsets.UTF_8);
      assertThat(csvText)
          .contains("用户ID,用户名,昵称,部门,状态,创建时间")
          .contains("csv_formula_user,'=CMD|'/C calc'!A0");
    } finally {
      deleteForData("/system/users/" + userId, adminToken);
    }
  }
}
