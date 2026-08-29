package io.apocalypse.framework.log;

import io.apocalypse.common.event.OperLoggedEvent;
import io.apocalypse.framework.security.SecurityUtils;

import jakarta.servlet.http.HttpServletRequest;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.stereotype.Component;
import org.springframework.validation.BindingResult;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.web.multipart.MultipartFile;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;
import tools.jackson.databind.node.StringNode;

/**
 * 操作日志切面：采集标题/动作/方法/操作人/IP/参数（脱敏）/结果/异常/耗时，发布 {@link OperLoggedEvent} （Modulith 事务提交后由 system
 * 域异步落库，不拖慢请求）。
 *
 * <p>脱敏规则（AGENTS.md 红线 10）：参数 JSON 中 key 含 password|secret|token|authorization（大小写不敏感）的值 一律替换为
 * {@code ***}；序列化失败的参数记 {@code [unserializable]}；参数与结果整体截断 1000 字符。
 */
@Slf4j
@Aspect
@Component
@RequiredArgsConstructor
public class OperLogAspect {

  /** 单字段采集上限（字符）。 */
  private static final int MAX_LENGTH = 1000;

  /** 敏感 key 正则（大小写不敏感）。 */
  private static final Pattern SENSITIVE_KEY =
      Pattern.compile(".*(password|secret|token|authorization).*", Pattern.CASE_INSENSITIVE);

  /** 脱敏占位符。 */
  private static final String MASKED = "***";

  private final OperLogEventPublisher operLogEventPublisher;

  private final ObjectMapper objectMapper;

  @Around("@annotation(operLog)")
  public Object around(ProceedingJoinPoint joinPoint, OperLog operLog) throws Throwable {
    long start = System.currentTimeMillis();
    Object result = null;
    Throwable error = null;
    try {
      result = joinPoint.proceed();
      return result;
    } catch (Throwable e) {
      error = e;
      throw e;
    } finally {
      publishEvent(joinPoint, operLog, result, error, System.currentTimeMillis() - start);
    }
  }

  /** 采集并发布事件；采集自身失败不得影响业务（吞异常打 warn）。 */
  private void publishEvent(
      ProceedingJoinPoint joinPoint, OperLog operLog, Object result, Throwable error, long costMs) {
    try {
      MethodSignature signature = (MethodSignature) joinPoint.getSignature();
      String method = signature.getDeclaringTypeName() + "." + signature.getName();
      operLogEventPublisher.publish(
          new OperLoggedEvent(
              operLog.title(),
              operLog.businessType(),
              method,
              SecurityUtils.currentUsername().orElse("anonymous"),
              currentIp(),
              serializeArgs(signature, joinPoint.getArgs()),
              serializeResult(result),
              error == null ? 1 : 0,
              error == null ? null : truncate(error.getMessage()),
              costMs));
    } catch (Exception e) {
      log.warn("操作日志采集失败，已忽略: {}", e.getMessage());
    }
  }

  /** 参数序列化为 JSON 并脱敏；无法参与序列化的参数类型直接跳过。 */
  private String serializeArgs(MethodSignature signature, Object[] args) {
    if (args == null || args.length == 0) {
      return null;
    }
    try {
      String[] names = signature.getParameterNames();
      ObjectNode node = objectMapper.createObjectNode();
      for (int i = 0; i < args.length; i++) {
        if (isSkippable(args[i])) {
          continue;
        }
        String name = names != null && i < names.length ? names[i] : "arg" + i;
        node.set(name, objectMapper.valueToTree(args[i]));
      }
      maskSensitive(node);
      return truncate(objectMapper.writeValueAsString(node));
    } catch (Exception e) {
      return "[unserializable]";
    }
  }

  private String serializeResult(Object result) {
    if (result == null) {
      return null;
    }
    try {
      JsonNode node = objectMapper.valueToTree(result);
      maskSensitive(node);
      return truncate(objectMapper.writeValueAsString(node));
    } catch (Exception e) {
      return "[unserializable]";
    }
  }

  /** 递归脱敏：对象字段 key 命中敏感正则的值替换为 {@code ***}。 */
  private static void maskSensitive(JsonNode node) {
    if (node instanceof ObjectNode objectNode) {
      List<String> fieldNames = new ArrayList<>();
      objectNode.properties().forEach(entry -> fieldNames.add(entry.getKey()));
      for (String fieldName : fieldNames) {
        JsonNode child = objectNode.get(fieldName);
        if (SENSITIVE_KEY.matcher(fieldName).matches()) {
          objectNode.set(fieldName, StringNode.valueOf(MASKED));
        } else {
          maskSensitive(child);
        }
      }
    } else if (node != null && node.isArray()) {
      node.forEach(OperLogAspect::maskSensitive);
    }
  }

  /** Servlet/绑定/文件类参数不参与序列化（无业务含义且易序列化失败）。 */
  private static boolean isSkippable(Object arg) {
    return arg instanceof HttpServletRequest
        || arg instanceof BindingResult
        || arg instanceof MultipartFile;
  }

  /** 当前请求 IP；非 web 上下文（如定时任务、事件消费）返回 null。 */
  private static String currentIp() {
    if (RequestContextHolder.getRequestAttributes()
        instanceof ServletRequestAttributes attributes) {
      return attributes.getRequest().getRemoteAddr();
    }
    return null;
  }

  private static String truncate(String value) {
    if (value == null || value.length() <= MAX_LENGTH) {
      return value;
    }
    return value.substring(0, MAX_LENGTH);
  }
}
