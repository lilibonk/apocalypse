package io.apocalypse.system;

import io.apocalypse.common.csv.SafeCsvSupport;
import io.apocalypse.common.event.AuthorizationChangedEvent;
import io.apocalypse.common.event.LoginSucceededEvent;
import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.framework.security.AuthService;
import io.apocalypse.framework.security.OnlineUserRegistry;
import io.apocalypse.framework.storage.LocalFileStorageAdapter;
import io.apocalypse.framework.storage.StorageProperties;
import io.apocalypse.system.authorization.mapper.AuthorizationAuditMapper;
import io.apocalypse.system.authorization.service.AuthorizationReadService;
import io.apocalypse.system.authorization.service.DataScopeService;
import io.apocalypse.system.dept.service.DeptService;
import io.apocalypse.system.file.controller.SystemFileController;
import io.apocalypse.system.file.dto.response.UploadedFileResp;
import io.apocalypse.system.file.service.SystemFileService;
import io.apocalypse.system.listener.AuthorizationAuditListener;
import io.apocalypse.system.listener.LogPersistListener;
import io.apocalypse.system.log.mapper.SysLoginLogMapper;
import io.apocalypse.system.log.mapper.SysOperLogMapper;
import io.apocalypse.system.menu.service.MenuService;
import io.apocalypse.system.online.controller.OnlineUserController;
import io.apocalypse.system.realtime.controller.RealtimeStreamController;
import io.apocalypse.system.realtime.service.RealtimePulseHub;
import io.apocalypse.system.role.service.RoleService;
import io.apocalypse.system.user.controller.UserController;
import io.apocalypse.system.user.dto.request.UserBatchDeleteReq;
import io.apocalypse.system.user.dto.request.UserCreateReq;
import io.apocalypse.system.user.dto.response.CsvImportResultResp;
import io.apocalypse.system.user.dto.response.UserResp;
import io.apocalypse.system.user.mapper.SysUserMapper;
import io.apocalypse.system.user.service.UserConvert;
import io.apocalypse.system.user.service.UserService;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** FE-W5 / FE-W6 / FE-W7 后端配套端点（通用上传、CSV 模板与导入、批量删除、用户名预检、实时脉冲 SSE）契约测试。 */
class FrontendHardeningEndpointsTest {

  @AfterEach
  void clearSecurityContext() {
    SecurityContextHolder.clearContext();
  }

  private static void authenticateAsUser(long userId, String username) {
    Jwt jwt =
        Jwt.withTokenValue("test-access-token")
            .header("alg", "HS256")
            .subject(username)
            .claim("uid", userId)
            .claim("type", "access")
            .claim("jti", "jti-1")
            .issuedAt(Instant.parse("2026-11-09T00:00:00Z"))
            .expiresAt(Instant.parse("2026-11-09T01:00:00Z"))
            .build();
    SecurityContextHolder.getContext()
        .setAuthentication(new JwtAuthenticationToken(jwt, List.of()));
  }

  @Test
  void systemFileControllerUploadsAndStoresFileViaPort(@TempDir Path tempDir) {
    StorageProperties props = new StorageProperties();
    props.setLocalRoot(tempDir);
    @SuppressWarnings("unchecked")
    ObjectProvider<Clock> clockProvider = mock(ObjectProvider.class);
    when(clockProvider.getIfAvailable(any()))
        .thenReturn(Clock.fixed(Instant.parse("2026-11-09T12:00:00Z"), ZoneOffset.UTC));

    LocalFileStorageAdapter adapter = new LocalFileStorageAdapter(props, clockProvider);
    SystemFileService service = new SystemFileService(adapter);
    SystemFileController controller = new SystemFileController(service);

    MockMultipartFile file =
        new MockMultipartFile(
            "file", "avatar.png", "image/png", "png-binary".getBytes(StandardCharsets.UTF_8));

    // 未登录拒绝
    assertThatThrownBy(() -> controller.upload(file, "general"))
        .isInstanceOf(BizException.class)
        .extracting(ex -> ((BizException) ex).getCode())
        .isEqualTo(ErrorCode.UNAUTHORIZED.getCode());

    authenticateAsUser(1L, "admin");
    UploadedFileResp uploaded = controller.upload(file, "general");
    assertThat(uploaded.key()).startsWith("general/");
    assertThat(uploaded.originalFilename()).isEqualTo("avatar.png");
    assertThat(uploaded.contentType()).isEqualTo("image/png");
    assertThat(uploaded.size()).isEqualTo(10L);
    assertThat(adapter.read(uploaded.key()))
        .isEqualTo("png-binary".getBytes(StandardCharsets.UTF_8));
  }

  @Test
  void userControllerProvidesUsernameCheckTemplateImportAndBatchDelete() {
    DataScopeService dataScopeService = mock(DataScopeService.class);
    AuthorizationReadService authorizationReadService = mock(AuthorizationReadService.class);
    SysUserMapper sysUserMapper = mock(SysUserMapper.class);
    RoleService roleService = mock(RoleService.class);
    DeptService deptService = mock(DeptService.class);
    MenuService menuService = mock(MenuService.class);
    UserConvert userConvert = mock(UserConvert.class);
    PasswordEncoder passwordEncoder = mock(PasswordEncoder.class);
    io.apocalypse.framework.security.TokenVersionStore tokenVersionStore =
        mock(io.apocalypse.framework.security.TokenVersionStore.class);
    OnlineUserRegistry onlineUserRegistry = mock(OnlineUserRegistry.class);
    AuthService authService = mock(AuthService.class);
    @SuppressWarnings("unchecked")
    ObjectProvider<UserService> selfProvider = mock(ObjectProvider.class);

    UserService userService =
        new UserService(
            dataScopeService,
            authorizationReadService,
            sysUserMapper,
            roleService,
            deptService,
            menuService,
            userConvert,
            passwordEncoder,
            tokenVersionStore,
            onlineUserRegistry,
            authService,
            selfProvider);

    UserService proxy = mock(UserService.class);
    when(selfProvider.getObject()).thenReturn(proxy);

    UserController controller = new UserController(userService);

    // 1. 用户名唯一性预检
    when(sysUserMapper.existsByUsername("admin")).thenReturn(true);
    when(sysUserMapper.existsByUsername("fresh_user")).thenReturn(false);
    assertThat(controller.checkUsernameAvailable("admin")).isFalse();
    assertThat(controller.checkUsernameAvailable("fresh_user")).isTrue();

    // 2. 导入模板下载
    ResponseEntity<byte[]> templateResp = controller.downloadImportTemplate();
    assertThat(templateResp.getBody()).isNotNull();
    List<Map<String, String>> templateRows = SafeCsvSupport.parseCsv(templateResp.getBody(), 10);
    assertThat(templateRows).hasSize(1);
    assertThat(templateRows.getFirst()).containsEntry("username", "demo_user");

    // 3. CSV 批量导入（1 条成功 + 1 条重名失败 + 1 条缺密码失败）
    doAnswer(
            invocation -> {
              UserCreateReq req = invocation.getArgument(0);
              if ("existing_user".equals(req.username())) {
                throw new BizException(ErrorCode.BIZ_ERROR.getCode(), "用户名已存在");
              }
              return new UserResp(
                  100L, req.username(), req.nickname(), 1, req.deptId(), null, LocalDateTime.now());
            })
        .when(proxy)
        .create(any(UserCreateReq.class));

    byte[] importBytes =
        SafeCsvSupport.writeUtf8BomCsv(
            List.of("username", "nickname", "password", "deptId"),
            List.of(
                List.of("alice", "Alice", "Strong@123", "10"),
                List.of("existing_user", "Bob", "Strong@123", ""),
                List.of("charlie", "Charlie", "", "")));
    MockMultipartFile csvFile = new MockMultipartFile("file", "users.csv", "text/csv", importBytes);

    CsvImportResultResp result = controller.importCsv(csvFile);
    assertThat(result.totalRows()).isEqualTo(3);
    assertThat(result.successCount()).isEqualTo(1);
    assertThat(result.failureCount()).isEqualTo(2);
    assertThat(result.errors()).hasSize(2);
    assertThat(result.errors().get(0)).contains("existing_user").contains("用户名已存在");
    assertThat(result.errors().get(1)).contains("charlie").contains("密码不能为空");

    // 4. 批量删除
    doNothing().when(proxy).delete(any());
    controller.deleteBatch(new UserBatchDeleteReq(List.of(101L, 102L)));
    verify(proxy).delete(101L);
    verify(proxy).delete(102L);

    // 5. 分页排序参数透传（sortField=createTime & sortOrder=asc|desc）
    io.apocalypse.system.authorization.dto.response.DataScopeResp allScope =
        new io.apocalypse.system.authorization.dto.response.DataScopeResp(true, List.of());
    when(dataScopeService.resolve("system:user:list")).thenReturn(allScope);
    when(sysUserMapper.pageByKeyword(1, 10, null, allScope, null, false, "createTime", "asc"))
        .thenReturn(new io.apocalypse.common.response.PageResult<>(List.of(), 0L, 1, 10));
    controller.page(1, 10, null, null, false, "createTime", "asc");
    verify(sysUserMapper).pageByKeyword(1, 10, null, allScope, null, false, "createTime", "asc");
  }

  @Test
  void realtimePulseHubSubscribesAndBroadcastsFromSystemListeners() {
    @SuppressWarnings("unchecked")
    ObjectProvider<Clock> clockProvider = mock(ObjectProvider.class);
    when(clockProvider.getIfAvailable(any()))
        .thenReturn(Clock.fixed(Instant.parse("2026-11-09T12:00:00Z"), ZoneOffset.UTC));

    RealtimePulseHub hub = new RealtimePulseHub(clockProvider);
    RealtimeStreamController streamController = new RealtimeStreamController(hub);

    authenticateAsUser(1L, "admin");
    SseEmitter emitter = streamController.stream();
    assertThat(emitter).isNotNull();
    assertThat(hub.activeSubscriptionCount()).isEqualTo(1);

    SysLoginLogMapper loginMapper = mock(SysLoginLogMapper.class);
    SysOperLogMapper operMapper = mock(SysOperLogMapper.class);
    LogPersistListener logListener = new LogPersistListener(loginMapper, operMapper, hub);
    logListener.onLoginSucceeded(
        new LoginSucceededEvent(
            UUID.randomUUID(), LocalDateTime.now(), "admin", "127.0.0.1", "ua"));

    AuthorizationAuditMapper auditMapper = mock(AuthorizationAuditMapper.class);
    AuthorizationAuditListener auditListener = new AuthorizationAuditListener(auditMapper, hub);
    auditListener.onAuthorizationChanged(
        new AuthorizationChangedEvent(
            UUID.randomUUID(),
            LocalDateTime.now(),
            1L,
            "ROLE",
            2L,
            1L,
            2L,
            "{}",
            "{}",
            "hash",
            "req-1"));

    OnlineUserRegistry onlineRegistry = mock(OnlineUserRegistry.class);
    AuthService authService = mock(AuthService.class);
    OnlineUserController onlineController =
        new OnlineUserController(onlineRegistry, authService, hub);
    onlineController.kick("jti-target");
    verify(authService).kickUser("jti-target");

    emitter.complete();
  }
}
