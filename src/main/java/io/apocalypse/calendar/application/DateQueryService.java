package io.apocalypse.calendar.application;

import io.apocalypse.calendar.api.CalendarErrorCode;
import io.apocalypse.calendar.domain.BaselineContentHasher;
import io.apocalypse.calendar.domain.BaselineCorrectionSnapshot;
import io.apocalypse.calendar.domain.BaselineReleaseRepository;
import io.apocalypse.calendar.domain.BaselineReleaseSnapshot;
import io.apocalypse.calendar.domain.CalendarContext;
import io.apocalypse.calendar.domain.CalendarKind;
import io.apocalypse.calendar.domain.DateKnowledgeProvider;
import io.apocalypse.calendar.domain.DateProviderDescriptor;
import io.apocalypse.calendar.domain.DayClassification;
import io.apocalypse.calendar.domain.DayField;
import io.apocalypse.calendar.domain.DayFieldResolver;
import io.apocalypse.calendar.domain.DayFieldSource;
import io.apocalypse.calendar.domain.DayFieldValue;
import io.apocalypse.calendar.domain.DayOverrideOperation;
import io.apocalypse.calendar.domain.DayPolicyValue;
import io.apocalypse.calendar.domain.FieldValueState;
import io.apocalypse.calendar.domain.HolidayPolicyKnowledge;
import io.apocalypse.calendar.domain.HolidayPolicyProvider;
import io.apocalypse.calendar.domain.LunarDateValue;
import io.apocalypse.calendar.domain.OverrideAction;
import io.apocalypse.calendar.domain.OverrideLayer;
import io.apocalypse.calendar.domain.OverrideRevisionRepository;
import io.apocalypse.calendar.domain.OverrideRevisionSnapshot;
import io.apocalypse.calendar.domain.OverrideScope;
import io.apocalypse.calendar.domain.RawDateKnowledge;
import io.apocalypse.calendar.domain.ResolvedDayField;
import io.apocalypse.calendar.domain.SourceLayer;
import io.apocalypse.calendar.interfaces.dto.response.BaselineRefResp;
import io.apocalypse.calendar.interfaces.dto.response.DayFieldValueResp;
import io.apocalypse.calendar.interfaces.dto.response.DayPolicyResp;
import io.apocalypse.calendar.interfaces.dto.response.DaySnapshotResp;
import io.apocalypse.calendar.interfaces.dto.response.EffectiveDayResp;
import io.apocalypse.calendar.interfaces.dto.response.FieldResolutionResp;
import io.apocalypse.calendar.interfaces.dto.response.LunarDateResp;
import io.apocalypse.calendar.interfaces.dto.response.ResolutionSourceResp;
import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;

import java.time.DateTimeException;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.LongStream;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import lombok.RequiredArgsConstructor;

/** 生成系统基线并按日历层级叠加已发布托管/个人覆盖。 */
@Service
@RequiredArgsConstructor
public class DateQueryService {

  static final int MAX_RANGE_DAYS = 366;

  private final CalendarCapabilityGuard capabilityGuard;

  private final CalendarAccessService calendarAccessService;

  private final BaselineReleaseRepository baselineReleaseRepository;

  private final DateKnowledgeProvider dateKnowledgeProvider;

  private final HolidayPolicyProvider holidayPolicyProvider;

  private final OverrideRevisionRepository overrideRevisionRepository;

  @Transactional(readOnly = true)
  public List<EffectiveDayResp> list(
      Long calendarId,
      LocalDate from,
      LocalDate to,
      String requestedZoneId,
      Long userId,
      boolean includePersonal) {
    capabilityGuard.requireEnabled();
    requireRange(from, to);
    CalendarContext calendar = calendarAccessService.requireVisible(calendarId, userId);
    String zoneId = resolveZoneId(requestedZoneId, calendar.zoneId());
    BaselineState baselineState = requireBaseline(calendar.regionCode());
    List<CalendarContext> hierarchy = calendarAccessService.hierarchy(calendar);
    CalendarContext systemCalendar = hierarchy.getFirst();
    List<OverrideLayer> layers =
        withSystemCorrections(
            baselineState,
            systemCalendar,
            loadLayers(hierarchy, userId, includePersonal, null, null, from, to));
    long days = ChronoUnit.DAYS.between(from, to);
    return LongStream.rangeClosed(0, days)
        .mapToObj(
            offset ->
                resolve(
                    from.plusDays(offset), calendar, systemCalendar, zoneId, baselineState, layers))
        .toList();
  }

  @Transactional(readOnly = true)
  public EffectiveDayResp detail(
      Long calendarId,
      LocalDate date,
      String requestedZoneId,
      Long userId,
      boolean includePersonal) {
    if (date == null) {
      throw new BizException(ErrorCode.PARAM_INVALID.getCode(), "日期不能为空");
    }
    return list(calendarId, date, date, requestedZoneId, userId, includePersonal).getFirst();
  }

  /** 个人目标作用域写入前的下层值；包含托管层和更不具体的个人层，排除目标个人层。 */
  @Transactional(readOnly = true)
  public Map<DayField, ResolvedDayField> personalUnderlay(
      Long calendarId, LocalDate date, Long userId) {
    capabilityGuard.requireEnabled();
    if (date == null) {
      throw new BizException(ErrorCode.PARAM_INVALID.getCode(), "日期不能为空");
    }
    CalendarContext calendar = calendarAccessService.requireVisible(calendarId, userId);
    BaselineState baselineState = requireBaseline(calendar.regionCode());
    List<CalendarContext> hierarchy = calendarAccessService.hierarchy(calendar);
    List<OverrideLayer> layers =
        withSystemCorrections(
            baselineState,
            hierarchy.getFirst(),
            loadLayers(hierarchy, userId, true, null, calendar.id(), date, date));
    return resolveFields(date, hierarchy.getFirst(), baselineState, layers);
  }

  /** 托管目标草稿写入前的下层值；只包含系统与祖先托管发布层。 */
  @Transactional(readOnly = true)
  public Map<DayField, ResolvedDayField> managedUnderlay(
      Long calendarId, LocalDate date, Long userId) {
    capabilityGuard.requireEnabled();
    if (date == null) {
      throw new BizException(ErrorCode.PARAM_INVALID.getCode(), "日期不能为空");
    }
    CalendarContext calendar = calendarAccessService.requireVisible(calendarId, userId);
    if (calendar.kind() != CalendarKind.MANAGED) {
      throw new BizException(ErrorCode.FORBIDDEN);
    }
    BaselineState baselineState = requireBaseline(calendar.regionCode());
    List<CalendarContext> hierarchy = calendarAccessService.hierarchy(calendar);
    List<OverrideLayer> layers =
        withSystemCorrections(
            baselineState,
            hierarchy.getFirst(),
            loadLayers(hierarchy, userId, false, calendar.id(), null, date, date));
    return resolveFields(date, hierarchy.getFirst(), baselineState, layers);
  }

  private EffectiveDayResp resolve(
      LocalDate date,
      CalendarContext targetCalendar,
      CalendarContext systemCalendar,
      String zoneId,
      BaselineState baselineState,
      List<OverrideLayer> layers) {
    RawDateKnowledge raw = dateKnowledgeProvider.resolve(date);
    HolidayPolicyKnowledge holiday = holiday(date, baselineState.importedYears());
    Map<DayField, DayFieldValue> baselineFields = baselineFields(raw, holiday);
    Map<DayField, ResolvedDayField> resolved =
        resolveFields(date, systemCalendar, baselineState.release(), layers, baselineFields);
    DaySnapshotResp baseline = toSnapshot(baselineFields);
    DaySnapshotResp effective =
        toSnapshot(
            resolved.entrySet().stream()
                .collect(
                    () -> new EnumMap<>(DayField.class),
                    (values, entry) -> values.put(entry.getKey(), entry.getValue().value()),
                    Map::putAll));
    List<FieldResolutionResp> resolutions =
        List.of(DayField.values()).stream().map(field -> toResponse(resolved.get(field))).toList();

    BaselineRefResp baselineRef =
        new BaselineRefResp(
            baselineState.release().regionCode(),
            baselineState.release().releaseKey(),
            baselineState.release().providerKey(),
            baselineState.release().providerVersion(),
            baselineState.release().supportedFrom(),
            baselineState.release().supportedTo(),
            baselineState.publishedYears());
    return new EffectiveDayResp(
        date,
        date.getDayOfWeek(),
        targetCalendar.id(),
        targetCalendar.calendarKey(),
        zoneId,
        baselineRef,
        baseline,
        effective,
        resolutions);
  }

  private List<OverrideLayer> loadLayers(
      List<CalendarContext> hierarchy,
      Long userId,
      boolean includePersonal,
      Long excludedManagedCalendarId,
      Long excludedPersonalCalendarId,
      LocalDate from,
      LocalDate to) {
    List<OverrideLayer> layers = new ArrayList<>();
    hierarchy.stream()
        .filter(calendar -> calendar.kind() == CalendarKind.MANAGED)
        .filter(calendar -> !calendar.id().equals(excludedManagedCalendarId))
        .forEach(
            calendar ->
                overrideRevisionRepository
                    .findPublishedForRange(calendar.id(), OverrideScope.MANAGED, null, from, to)
                    .map(revision -> toLayer(calendar, revision, SourceLayer.MANAGED_OVERRIDE))
                    .ifPresent(layers::add));
    if (includePersonal) {
      hierarchy.stream()
          .filter(calendar -> !calendar.id().equals(excludedPersonalCalendarId))
          .forEach(
              calendar ->
                  overrideRevisionRepository
                      .findPublishedForRange(
                          calendar.id(), OverrideScope.PERSONAL, userId, from, to)
                      .map(revision -> toLayer(calendar, revision, SourceLayer.PERSONAL_OVERRIDE))
                      .ifPresent(layers::add));
    }
    return List.copyOf(layers);
  }

  private Map<DayField, ResolvedDayField> resolveFields(
      LocalDate date,
      CalendarContext systemCalendar,
      BaselineState baselineState,
      List<OverrideLayer> layers) {
    RawDateKnowledge raw = dateKnowledgeProvider.resolve(date);
    HolidayPolicyKnowledge holiday = holiday(date, baselineState.importedYears());
    return resolveFields(
        date, systemCalendar, baselineState.release(), layers, baselineFields(raw, holiday));
  }

  private static Map<DayField, ResolvedDayField> resolveFields(
      LocalDate date,
      CalendarContext systemCalendar,
      BaselineReleaseSnapshot release,
      List<OverrideLayer> layers,
      Map<DayField, DayFieldValue> baselineFields) {
    DayFieldSource source =
        new DayFieldSource(
            SourceLayer.SYSTEM_DATASET,
            systemCalendar.id(),
            systemCalendar.calendarKey(),
            release.releaseKey(),
            OverrideAction.BASE);
    return DayFieldResolver.resolve(date, baselineFields, source, layers);
  }

  private static OverrideLayer toLayer(
      CalendarContext calendar, OverrideRevisionSnapshot revision, SourceLayer sourceLayer) {
    return new OverrideLayer(
        sourceLayer,
        calendar.id(),
        calendar.calendarKey(),
        calendar.calendarKey() + "@" + revision.revisionNo(),
        revision.operations());
  }

  private BaselineState requireBaseline(String regionCode) {
    BaselineReleaseSnapshot release =
        baselineReleaseRepository.findPublished(regionCode).orElseThrow(this::baselineUnavailable);
    List<BaselineCorrectionSnapshot> corrections =
        baselineReleaseRepository.findCorrections(release.id());
    DateProviderDescriptor descriptor = dateKnowledgeProvider.descriptor();
    if (!Objects.equals(release.providerKey(), descriptor.providerKey())
        || !Objects.equals(release.providerVersion(), descriptor.providerVersion())
        || !Objects.equals(release.providerArtifactSha256(), descriptor.artifactSha256())
        || !Objects.equals(release.holidayBundleVersion(), holidayPolicyProvider.bundleVersion())
        || !Objects.equals(release.holidayBundleSha256(), holidayPolicyProvider.bundleSha256())
        || !Objects.equals(release.supportedFrom(), descriptor.supportedFrom())
        || !Objects.equals(release.supportedTo(), descriptor.supportedTo())
        || !Objects.equals(
            release.contentHash(), BaselineContentHasher.hash(release, corrections))) {
      throw baselineUnavailable();
    }
    Set<Integer> importedYears =
        corrections.stream()
            .filter(value -> value.field() == DayField.DAY_POLICY)
            .filter(value -> value.sourceImportId() != null)
            .map(value -> value.date().getYear())
            .collect(java.util.stream.Collectors.toUnmodifiableSet());
    TreeSet<Integer> publishedYears = new TreeSet<>(holidayPolicyProvider.publishedYears());
    publishedYears.addAll(importedYears);
    return new BaselineState(release, corrections, importedYears, List.copyOf(publishedYears));
  }

  private HolidayPolicyKnowledge holiday(LocalDate date, Set<Integer> importedYears) {
    if (!importedYears.contains(date.getYear())) {
      return holidayPolicyProvider.resolve(date);
    }
    boolean weekend =
        date.getDayOfWeek() == DayOfWeek.SATURDAY || date.getDayOfWeek() == DayOfWeek.SUNDAY;
    return new HolidayPolicyKnowledge(
        true,
        new DayPolicyValue(
            weekend ? DayClassification.WEEKEND_REST : DayClassification.NORMAL_WORKDAY, null));
  }

  private static List<OverrideLayer> withSystemCorrections(
      BaselineState baselineState,
      CalendarContext systemCalendar,
      List<OverrideLayer> businessLayers) {
    if (baselineState.corrections().isEmpty()) {
      return businessLayers;
    }
    List<DayOverrideOperation> operations =
        baselineState.corrections().stream()
            .flatMap(value -> correctionOperations(value).stream())
            .toList();
    List<OverrideLayer> result = new ArrayList<>();
    result.add(
        new OverrideLayer(
            SourceLayer.SYSTEM_CORRECTION,
            systemCalendar.id(),
            systemCalendar.calendarKey(),
            baselineState.release().releaseKey(),
            operations));
    result.addAll(businessLayers);
    return List.copyOf(result);
  }

  private static List<DayOverrideOperation> correctionOperations(
      BaselineCorrectionSnapshot correction) {
    DayOverrideOperation stored = correctionOperation(correction);
    if (correction.field() != DayField.DAY_POLICY
        || correction.action() != OverrideAction.SET
        || correction.value() == null) {
      return List.of(stored);
    }
    String name = correction.value().dayPolicy().name();
    DayOverrideOperation label =
        new DayOverrideOperation(
            null,
            correction.date(),
            DayField.DISPLAY_LABEL,
            StringUtils.hasText(name) ? OverrideAction.SET : OverrideAction.CLEAR,
            StringUtils.hasText(name) ? DayFieldValue.text(DayField.DISPLAY_LABEL, name) : null,
            null,
            null,
            null,
            io.apocalypse.calendar.domain.ConflictState.NONE,
            null,
            null);
    return List.of(stored, label);
  }

  private static DayOverrideOperation correctionOperation(BaselineCorrectionSnapshot correction) {
    return new DayOverrideOperation(
        null,
        correction.date(),
        correction.field(),
        correction.action(),
        correction.value(),
        null,
        null,
        null,
        io.apocalypse.calendar.domain.ConflictState.NONE,
        null,
        null);
  }

  private static String resolveZoneId(String requested, String fallback) {
    String candidate = StringUtils.hasText(requested) ? requested : fallback;
    try {
      return ZoneId.of(candidate).getId();
    } catch (DateTimeException | NullPointerException e) {
      CalendarErrorCode error = CalendarErrorCode.CALENDAR_TIME_ZONE_INVALID;
      throw new BizException(error.getCode(), error.getMessage());
    }
  }

  private static void requireRange(LocalDate from, LocalDate to) {
    if (from == null || to == null || from.isAfter(to)) {
      throw new BizException(ErrorCode.PARAM_INVALID.getCode(), "日期范围无效");
    }
    if (ChronoUnit.DAYS.between(from, to) + 1 > MAX_RANGE_DAYS) {
      CalendarErrorCode error = CalendarErrorCode.CALENDAR_BATCH_LIMIT_EXCEEDED;
      throw new BizException(error.getCode(), error.getMessage());
    }
  }

  private static LunarDateResp toResponse(LunarDateValue value) {
    return value == null
        ? null
        : new LunarDateResp(
            value.year(), value.month(), value.day(), value.leapMonth(), value.displayText());
  }

  private static FieldResolutionResp toResponse(ResolvedDayField value) {
    DayFieldSource source = value.source();
    return new FieldResolutionResp(
        value.value().field(),
        value.value().state(),
        new ResolutionSourceResp(
            source.layer(),
            source.sourceCalendarId(),
            source.sourceCalendarKey(),
            source.sourceVersion(),
            source.action()),
        toResponse(value.underlay()),
        value.underlayHash(),
        value.conflictState(),
        value.conflictId());
  }

  private static DayFieldValueResp toResponse(DayFieldValue value) {
    if (value == null) {
      return null;
    }
    return new DayFieldValueResp(
        value.field(),
        toResponse(value.lunarDate()),
        value.zodiac(),
        value.solarTerm(),
        value.dayPolicy() == null
            ? null
            : new DayPolicyResp(value.dayPolicy().classification(), value.dayPolicy().name()),
        value.text(),
        value.state());
  }

  private static Map<DayField, DayFieldValue> baselineFields(
      RawDateKnowledge raw, HolidayPolicyKnowledge holiday) {
    EnumMap<DayField, DayFieldValue> values = new EnumMap<>(DayField.class);
    values.put(
        DayField.LUNAR_DATE,
        raw.supported()
            ? DayFieldValue.lunar(raw.lunarDate())
            : DayFieldValue.empty(DayField.LUNAR_DATE, FieldValueState.UNSUPPORTED));
    values.put(
        DayField.ZODIAC,
        raw.supported()
            ? DayFieldValue.zodiac(raw.zodiac())
            : DayFieldValue.empty(DayField.ZODIAC, FieldValueState.UNSUPPORTED));
    values.put(
        DayField.SOLAR_TERM,
        !raw.supported()
            ? DayFieldValue.empty(DayField.SOLAR_TERM, FieldValueState.UNSUPPORTED)
            : raw.solarTerm() == null
                ? DayFieldValue.empty(DayField.SOLAR_TERM, FieldValueState.CLEARED)
                : DayFieldValue.solarTerm(raw.solarTerm()));
    values.put(
        DayField.DAY_POLICY,
        holiday.published()
            ? DayFieldValue.dayPolicy(holiday.policy())
            : DayFieldValue.empty(DayField.DAY_POLICY, FieldValueState.UNPUBLISHED));
    values.put(
        DayField.DISPLAY_LABEL,
        holiday.policy() != null && StringUtils.hasText(holiday.policy().name())
            ? DayFieldValue.text(DayField.DISPLAY_LABEL, holiday.policy().name())
            : DayFieldValue.empty(DayField.DISPLAY_LABEL, FieldValueState.CLEARED));
    values.put(
        DayField.DISPLAY_NOTE, DayFieldValue.empty(DayField.DISPLAY_NOTE, FieldValueState.CLEARED));
    return Map.copyOf(values);
  }

  private static DaySnapshotResp toSnapshot(Map<DayField, DayFieldValue> values) {
    DayFieldValue lunar = values.get(DayField.LUNAR_DATE);
    DayFieldValue zodiac = values.get(DayField.ZODIAC);
    DayFieldValue solarTerm = values.get(DayField.SOLAR_TERM);
    DayFieldValue dayPolicy = values.get(DayField.DAY_POLICY);
    DayFieldValue label = values.get(DayField.DISPLAY_LABEL);
    DayFieldValue note = values.get(DayField.DISPLAY_NOTE);
    return new DaySnapshotResp(
        toResponse(lunar.lunarDate()),
        zodiac.zodiac(),
        solarTerm.solarTerm(),
        dayPolicy.dayPolicy() == null
            ? null
            : new DayPolicyResp(
                dayPolicy.dayPolicy().classification(), dayPolicy.dayPolicy().name()),
        label.text(),
        note.text());
  }

  private BizException baselineUnavailable() {
    CalendarErrorCode error = CalendarErrorCode.CALENDAR_BASELINE_UNAVAILABLE;
    return new BizException(error.getCode(), error.getMessage());
  }

  private record BaselineState(
      BaselineReleaseSnapshot release,
      List<BaselineCorrectionSnapshot> corrections,
      Set<Integer> importedYears,
      List<Integer> publishedYears) {}
}
