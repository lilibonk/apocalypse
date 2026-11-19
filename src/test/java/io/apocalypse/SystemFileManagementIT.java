package io.apocalypse;

import io.apocalypse.framework.storage.StorageProperties;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;

import static org.assertj.core.api.Assertions.assertThat;

import tools.jackson.databind.JsonNode;

/** 通用文件子域全链路集成测试：权限门禁、真实魔数校验、配额上限、数据范围与 ownership、安全附件下载、物理回收与 client 令牌隔离。 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "apocalypse.storage.local-root=${java.io.tmpdir}/apocalypse-file-it-${random.uuid}",
      "apocalypse.storage.user-quota-bytes=180",
      "apocalypse.storage.total-quota-bytes=240"
    })
class SystemFileManagementIT extends AbstractIntegrationTest {

  private static final byte[] PNG_HEADER =
      new byte[] {(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A};

  @Autowired private StorageProperties storageProperties;

  @Test
  void enforcesAuthorizationMagicBytesQuotasDataScopeAndClientTokenRejection() throws Exception {
    // 1. client_credentials 令牌禁止访问通用文件端点与本人 /me/sessions 端点
    JsonNode clientResp =
        exchangeRaw(
            "/auth/token",
            HttpMethod.POST,
            Map.of("clientId", "management-test-client", "clientSecret", "management-test-secret"),
            null);
    assertThat(clientResp.path("code").asInt()).isZero();
    String clientToken = clientResp.at("/data/accessToken").asText();

    assertThat(
            exchangeRaw("/system/users/me/sessions", HttpMethod.GET, null, clientToken)
                .path("code")
                .asInt())
        .isIn(40100, 40300);
    assertThat(
            exchangeMultipart(
                    "/system/files/upload", "bad.png", "image/png", validPng(32), clientToken)
                .path("code")
                .asInt())
        .isIn(40100, 40300);

    // 2. 创建零权限用户、仅上传用户（部门 11）、部门管理员（部门 11，含 list+remove）与部门 12 上传用户
    String adminToken = loginAndGetToken("admin", ADMIN_PASSWORD);
    long dept11RoleUploadId =
        createRoleWithPerms(adminToken, "file-upload-11", "DEPT", List.of("system:file:upload"));
    adminToken = loginAndGetToken("admin", ADMIN_PASSWORD);
    long dept11RoleMgrId =
        createRoleWithPerms(
            adminToken, "file-mgr-11", "DEPT", List.of("system:file:list", "system:file:remove"));
    adminToken = loginAndGetToken("admin", ADMIN_PASSWORD);

    long noPermUserId = createUser(adminToken, "file_noperm", 11L, List.of());
    long dept11UploaderId = createUser(adminToken, "file_up11", 11L, List.of(dept11RoleUploadId));
    createUser(adminToken, "file_mgr11", 11L, List.of(dept11RoleMgrId));
    long dept12UploaderId = createUser(adminToken, "file_up12", 12L, List.of(dept11RoleUploadId));

    String noPermToken = loginAndGetToken("file_noperm", "StrongFile@2026");
    String up11Token = loginAndGetToken("file_up11", "StrongFile@2026");
    String mgr11Token = loginAndGetToken("file_mgr11", "StrongFile@2026");
    String up12Token = loginAndGetToken("file_up12", "StrongFile@2026");

    // 3. 零权限用户被禁止上传/列表/配额
    assertThat(
            exchangeMultipart(
                    "/system/files/upload", "a.png", "image/png", validPng(32), noPermToken)
                .path("code")
                .asInt())
        .isEqualTo(40300);
    assertThat(
            exchangeRaw("/system/files/page?page=1&size=10", HttpMethod.GET, null, noPermToken)
                .path("code")
                .asInt())
        .isEqualTo(40300);

    // 4. 魔数伪造与活跃标记伪装被拒绝（40000）
    assertThat(
            exchangeMultipart(
                    "/system/files/upload",
                    "spoof.png",
                    "image/png",
                    "not-really-png".getBytes(StandardCharsets.UTF_8),
                    up11Token)
                .path("code")
                .asInt())
        .isEqualTo(40000);
    assertThat(
            exchangeMultipart(
                    "/system/files/upload",
                    "xss.txt",
                    "text/plain",
                    "<script>alert(1)</script>".getBytes(StandardCharsets.UTF_8),
                    up11Token)
                .path("code")
                .asInt())
        .isEqualTo(40000);

    // 5. 合法上传：部门 11 上传者上传 100 字节 PNG -> 本人可下载、部门 11 管理员可见，但跨部门 12 文件对 11 管理员不可见
    JsonNode up11Resp =
        exchangeMultipart(
            "/system/files/upload", "ok11.png", "image/png", validPng(100), up11Token);
    assertThat(up11Resp.path("code").asInt()).isZero();
    Long file11Id = Long.parseLong(up11Resp.at("/data/id").asText());
    String file11Key = up11Resp.at("/data/key").asText();
    Path physical11 = storageProperties.getLocalRoot().resolve(file11Key).normalize();
    assertThat(Files.isRegularFile(physical11)).isTrue();

    // 配额超限：单人配额 180 字节，再传 100 字节应返回 40900
    assertThat(
            exchangeMultipart(
                    "/system/files/upload", "over.png", "image/png", validPng(100), up11Token)
                .path("code")
                .asInt())
        .isEqualTo(40900);

    // 部门 12 上传 90 字节（总已用 190 <= 240）；admin 再传 60 字节超全局配额 240（40900）
    JsonNode up12Resp =
        exchangeMultipart("/system/files/upload", "ok12.png", "image/png", validPng(90), up12Token);
    assertThat(up12Resp.path("code").asInt()).isZero();
    Long file12Id = Long.parseLong(up12Resp.at("/data/id").asText());

    assertThat(
            exchangeMultipart(
                    "/system/files/upload",
                    "global-full.png",
                    "image/png",
                    validPng(60),
                    adminToken)
                .path("code")
                .asInt())
        .isEqualTo(40900);

    // 本人虽无 list 权限仍可下载自己的文件，并带安全附件头
    ResponseEntity<byte[]> ownDownload = download(file11Id, up11Token);
    assertThat(ownDownload.getStatusCode().value()).isEqualTo(200);
    assertThat(ownDownload.getHeaders().getContentType())
        .isEqualTo(MediaType.APPLICATION_OCTET_STREAM);
    assertThat(ownDownload.getHeaders().getFirst("Content-Disposition")).contains("attachment");
    assertThat(ownDownload.getHeaders().getFirst("X-Content-Type-Options")).isEqualTo("nosniff");
    assertThat(ownDownload.getHeaders().getFirst("Content-Security-Policy"))
        .isEqualTo("default-src 'none'; sandbox");
    assertThat(ownDownload.getBody()).hasSize(100);

    // 部门 11 上传者尝试下载他人（部门 12）文件 -> 40400 防枚举
    assertThat(
            exchangeRaw("/system/files/" + file12Id + "/download", HttpMethod.GET, null, up11Token)
                .path("code")
                .asInt())
        .isEqualTo(40400);

    // 部门 11 管理员分页列表只能看见部门 11 文件，不能见/删部门 12 文件，也不能删受保护全局 ALL 管理员文件
    JsonNode mgr11Page = getForData("/system/files/page?page=1&size=20", mgr11Token);
    assertThat(mgr11Page.path("list")).hasSize(1);
    assertThat(Long.parseLong(mgr11Page.at("/list/0/id").asText())).isEqualTo(file11Id);
    assertThat(
            exchangeRaw("/system/files/" + file12Id + "/download", HttpMethod.GET, null, mgr11Token)
                .path("code")
                .asInt())
        .isEqualTo(40400);
    assertThat(
            exchangeRaw("/system/files/" + file12Id, HttpMethod.DELETE, null, mgr11Token)
                .path("code")
                .asInt())
        .isEqualTo(40400);

    // 管理员清空并上传一条归属自己的文件（放在部门 11 内验证 protectedIdentity）
    jdbcTemplate.update("UPDATE sys_user SET dept_id = 11 WHERE id = 1");
    try {
      deleteForData("/system/files/" + file11Id, mgr11Token);
      assertThat(Files.exists(physical11)).isFalse();
      // 删除后配额立即释放，up11 可再次上传 100 字节
      JsonNode up11Again =
          exchangeMultipart(
              "/system/files/upload", "again11.png", "image/png", validPng(100), up11Token);
      assertThat(up11Again.path("code").asInt()).isZero();
      Long again11Id = Long.parseLong(up11Again.at("/data/id").asText());

      // 让 admin 在 dept 11 下上传 40 字节；部门 11 管理员即使同属 dept 11 也不得删除 ALL 管理员文件
      JsonNode adminUpload =
          exchangeMultipart(
              "/system/files/upload", "admin.png", "image/png", validPng(40), adminToken);
      assertThat(adminUpload.path("code").asInt()).isZero();
      Long adminFileId = Long.parseLong(adminUpload.at("/data/id").asText());
      assertThat(
              exchangeRaw("/system/files/" + adminFileId, HttpMethod.DELETE, null, mgr11Token)
                  .path("code")
                  .asInt())
          .isEqualTo(40400);

      // admin 批量删除清理剩余测试文件（验证跨用户回收）
      assertThat(noPermUserId).isPositive();
      assertThat(dept11UploaderId).isPositive();
      assertThat(dept12UploaderId).isPositive();
      JsonNode batchDelete =
          exchangeRaw(
              "/system/files/batch",
              HttpMethod.DELETE,
              Map.of("ids", List.of(again11Id, file12Id, adminFileId)),
              adminToken);
      assertThat(batchDelete.path("code").asInt()).isZero();
      assertThat(getForData("/system/files/quota", adminToken).path("activeFileCount").asLong())
          .isZero();
    } finally {
      jdbcTemplate.update("UPDATE sys_user SET dept_id = 1 WHERE id = 1");
    }
  }

  private long createUser(String adminToken, String username, Long deptId, List<Long> roleIds) {
    JsonNode created =
        postForData(
            "/system/users",
            Map.of(
                "username",
                username,
                "password",
                "StrongFile@2026",
                "nickname",
                username,
                "deptId",
                deptId,
                "status",
                1),
            adminToken);
    long userId = Long.parseLong(created.path("id").asText());
    if (!roleIds.isEmpty()) {
      putForData("/system/users/" + userId + "/roles", roleIds, adminToken);
    }
    return userId;
  }

  private long createRoleWithPerms(
      String adminToken, String roleKey, String dataScope, List<String> permCodes) {
    long roleId =
        Long.parseLong(
            postForData(
                    "/system/roles",
                    Map.of(
                        "roleName", roleKey,
                        "roleKey", roleKey,
                        "sort", 50,
                        "status", 1,
                        "dataScope", dataScope),
                    adminToken)
                .asText());
    JsonNode baseline = getForData("/system/roles/" + roleId + "/permissions", adminToken);
    List<Map<String, Object>> upserts =
        permCodes.stream()
            .map(
                code -> {
                  Long permId =
                      jdbcTemplate.queryForObject(
                          "SELECT id FROM sys_permission WHERE code = ?", Long.class, code);
                  return Map.<String, Object>of(
                      "permissionId", permId, "enabled", true, "scopeOverride", "INHERIT_ROLE");
                })
            .toList();
    putForData(
        "/system/roles/" + roleId + "/permissions",
        Map.of(
            "expectedRevision",
            baseline.path("revision").asText(),
            "expectedCatalogRevision",
            baseline.path("catalogRevision").asText(),
            "upsert",
            upserts,
            "remove",
            List.of()),
        adminToken);
    return roleId;
  }

  private JsonNode exchangeMultipart(
      String path, String filename, String contentType, byte[] bytes, String token)
      throws Exception {
    HttpHeaders partHeaders = new HttpHeaders();
    partHeaders.setContentType(MediaType.parseMediaType(contentType));
    HttpEntity<ByteArrayResource> filePart =
        new HttpEntity<>(
            new ByteArrayResource(bytes) {
              @Override
              public String getFilename() {
                return filename;
              }
            },
            partHeaders);
    MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
    body.add("file", filePart);
    body.add("category", "general");

    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.MULTIPART_FORM_DATA);
    headers.setBearerAuth(token);
    ResponseEntity<String> response =
        restTemplate.exchange(path, HttpMethod.POST, new HttpEntity<>(body, headers), String.class);
    return objectMapper.readTree(response.getBody());
  }

  private ResponseEntity<byte[]> download(Long id, String token) {
    HttpHeaders headers = new HttpHeaders();
    headers.setBearerAuth(token);
    headers.setAccept(List.of(MediaType.APPLICATION_OCTET_STREAM, MediaType.APPLICATION_JSON));
    return restTemplate.exchange(
        "/system/files/" + id + "/download",
        HttpMethod.GET,
        new HttpEntity<>(headers),
        byte[].class);
  }

  private static byte[] validPng(int totalBytes) {
    byte[] result = new byte[Math.max(totalBytes, PNG_HEADER.length)];
    System.arraycopy(PNG_HEADER, 0, result, 0, PNG_HEADER.length);
    return result;
  }
}
