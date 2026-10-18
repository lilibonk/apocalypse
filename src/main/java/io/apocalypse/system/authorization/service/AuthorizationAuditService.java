package io.apocalypse.system.authorization.service;

import io.apocalypse.common.event.AuthorizationChangedEvent;
import io.apocalypse.framework.security.SecurityUtils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.UUID;

import org.slf4j.MDC;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;
import tools.jackson.databind.ObjectMapper;

/** 事件的 JSON 为完整结构化配置；序列化/发布失败让原授权事务回滚。 */
@Service
@RequiredArgsConstructor
public class AuthorizationAuditService {
  private final ObjectMapper objectMapper;

  private final ApplicationEventPublisher events;

  @Transactional(propagation = Propagation.MANDATORY)
  public void record(
      String subjectType,
      Long subjectId,
      long beforeRevision,
      long afterRevision,
      Object before,
      Object after) {
    String beforeJson = objectMapper.writeValueAsString(before);
    String afterJson = objectMapper.writeValueAsString(after);
    events.publishEvent(
        new AuthorizationChangedEvent(
            UUID.randomUUID(),
            LocalDateTime.now(),
            SecurityUtils.currentUserId().orElse(null),
            subjectType,
            subjectId,
            beforeRevision,
            afterRevision,
            beforeJson,
            afterJson,
            hash(beforeJson + "\n" + afterJson),
            MDC.get("traceId")));
  }

  private static String hash(String value) {
    try {
      return HexFormat.of()
          .formatHex(
              MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException exception) {
      throw new IllegalStateException("SHA-256 不可用", exception);
    }
  }
}
