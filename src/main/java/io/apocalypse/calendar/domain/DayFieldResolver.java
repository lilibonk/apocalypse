package io.apocalypse.calendar.domain;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.util.EnumMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;

/** 按调用方提供的低到高层顺序逐字段解析；INHERIT 不改变当前结果。 */
public final class DayFieldResolver {

  private DayFieldResolver() {}

  public static Map<DayField, ResolvedDayField> resolve(
      LocalDate date,
      Map<DayField, DayFieldValue> baseline,
      DayFieldSource baselineSource,
      List<OverrideLayer> layers) {
    EnumMap<DayField, ResolvedDayField> resolved = new EnumMap<>(DayField.class);
    for (DayField field : DayField.values()) {
      DayFieldValue value = baseline.get(field);
      if (value == null || value.field() != field) {
        throw new IllegalArgumentException("系统基线缺少字段: " + field);
      }
      resolved.put(
          field, new ResolvedDayField(value, baselineSource, null, null, ConflictState.NONE, null));
    }

    for (OverrideLayer layer : layers) {
      if (layer.sourceLayer() != SourceLayer.MANAGED_OVERRIDE
          && layer.sourceLayer() != SourceLayer.PERSONAL_OVERRIDE
          && layer.sourceLayer() != SourceLayer.SYSTEM_CORRECTION) {
        throw new IllegalArgumentException("非法覆盖来源层: " + layer.sourceLayer());
      }
      layer.operations().stream()
          .filter(operation -> date.equals(operation.date()))
          .forEach(operation -> apply(resolved, layer, operation));
    }
    return Map.copyOf(resolved);
  }

  public static String hash(DayFieldValue value) {
    try {
      byte[] digest =
          MessageDigest.getInstance("SHA-256")
              .digest(value.canonicalForm().getBytes(StandardCharsets.UTF_8));
      return HexFormat.of().formatHex(digest);
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("JDK 缺少 SHA-256", e);
    }
  }

  private static void apply(
      EnumMap<DayField, ResolvedDayField> resolved,
      OverrideLayer layer,
      DayOverrideOperation operation) {
    if (operation.action() == OverrideAction.BASE) {
      throw new IllegalArgumentException("覆盖层不允许 BASE 动作");
    }
    if (operation.action() == OverrideAction.INHERIT) {
      return;
    }
    ResolvedDayField current = resolved.get(operation.field());
    DayFieldValue effective =
        operation.action() == OverrideAction.CLEAR
            ? DayFieldValue.empty(operation.field(), FieldValueState.CLEARED)
            : requireSetValue(operation);
    String currentUnderlayHash = hash(current.value());
    boolean changedUnderlay =
        operation.savedUnderlayHash() != null
            && !operation.savedUnderlayHash().equals(currentUnderlayHash);
    boolean keptCurrentUnderlay =
        changedUnderlay
            && operation.persistedConflictState() == ConflictState.KEPT
            && currentUnderlayHash.equals(operation.persistedConflictUnderlayHash());
    ConflictState conflictState =
        !changedUnderlay
            ? ConflictState.NONE
            : keptCurrentUnderlay ? ConflictState.KEPT : ConflictState.NEEDS_REVIEW;
    DayFieldSource source =
        new DayFieldSource(
            layer.sourceLayer(),
            layer.calendarId(),
            layer.calendarKey(),
            layer.sourceVersion(),
            operation.action());
    resolved.put(
        operation.field(),
        new ResolvedDayField(
            effective,
            source,
            current.value(),
            currentUnderlayHash,
            conflictState,
            changedUnderlay ? operation.conflictId() : null));
  }

  private static DayFieldValue requireSetValue(DayOverrideOperation operation) {
    if (operation.action() != OverrideAction.SET
        || operation.value() == null
        || operation.value().field() != operation.field()
        || operation.value().state() != FieldValueState.VALUE) {
      throw new IllegalArgumentException("SET 必须携带匹配的 VALUE");
    }
    return operation.value();
  }
}
