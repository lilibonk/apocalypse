package io.apocalypse.calendar.infrastructure.date;

import io.apocalypse.calendar.domain.DayClassification;
import io.apocalypse.calendar.domain.DayPolicyValue;
import io.apocalypse.calendar.domain.HolidayPolicyKnowledge;
import io.apocalypse.calendar.domain.HolidayPolicyProvider;

import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import tools.jackson.databind.ObjectMapper;

/** 随制品只读节假日 bundle；来源 URL 仅作为 JSON 证据文本，本类没有任何网络能力。 */
@Component
public class ClasspathHolidayPolicyProvider implements HolidayPolicyProvider {

  public static final String RESOURCE_PATH = "calendar/baseline/cn-holidays-2025-2026-r1.json";

  public static final String EXPECTED_SHA256 =
      "cd44f16910dd3766450bc869e8263fe747590016443c0cb4fd0fbaa5c72d1963";

  private final BundleSnapshot snapshot;

  public ClasspathHolidayPolicyProvider(ObjectMapper objectMapper) {
    snapshot = load(objectMapper);
  }

  @Override
  public String bundleVersion() {
    return snapshot.bundleVersion();
  }

  @Override
  public String bundleSha256() {
    return snapshot.sha256();
  }

  @Override
  public List<Integer> publishedYears() {
    return snapshot.publishedYears();
  }

  @Override
  public HolidayPolicyKnowledge resolve(LocalDate date) {
    if (!snapshot.publishedYearSet().contains(date.getYear())) {
      return new HolidayPolicyKnowledge(false, null);
    }
    DayPolicyValue explicit = snapshot.days().get(date);
    if (explicit != null) {
      return new HolidayPolicyKnowledge(true, explicit);
    }
    boolean weekend =
        date.getDayOfWeek() == DayOfWeek.SATURDAY || date.getDayOfWeek() == DayOfWeek.SUNDAY;
    return new HolidayPolicyKnowledge(
        true,
        new DayPolicyValue(
            weekend ? DayClassification.WEEKEND_REST : DayClassification.NORMAL_WORKDAY, null));
  }

  private static BundleSnapshot load(ObjectMapper objectMapper) {
    try {
      byte[] bytes = new ClassPathResource(RESOURCE_PATH).getContentAsByteArray();
      String sha256 = sha256(bytes);
      if (!EXPECTED_SHA256.equals(sha256)) {
        throw new IllegalStateException("Calendar 节假日资源 SHA-256 不匹配");
      }
      BundleFile bundle = objectMapper.readValue(bytes, BundleFile.class);
      validateBundle(bundle);
      Map<LocalDate, DayPolicyValue> days = new HashMap<>();
      for (BundleDay day : bundle.days()) {
        LocalDate date = LocalDate.parse(day.date());
        DayPolicyValue previous =
            days.put(
                date,
                new DayPolicyValue(DayClassification.valueOf(day.classification()), day.name()));
        if (previous != null) {
          throw new IllegalStateException("Calendar 节假日资源包含重复日期: " + date);
        }
      }
      return new BundleSnapshot(
          bundle.bundleVersion(),
          sha256,
          List.copyOf(bundle.publishedYears()),
          Set.copyOf(bundle.publishedYears()),
          Map.copyOf(days));
    } catch (IOException e) {
      throw new IllegalStateException("Calendar 节假日资源无法读取", e);
    }
  }

  private static void validateBundle(BundleFile bundle) {
    if (bundle.schemaVersion() != 1
        || !"CN".equals(bundle.regionCode())
        || !"CN-HOLIDAY-2025-2026-R1".equals(bundle.bundleVersion())
        || !bundle.publishedYears().equals(List.of(2025, 2026))) {
      throw new IllegalStateException("Calendar 节假日资源元数据无效");
    }
    Set<String> documentNumbers = new HashSet<>();
    bundle.sources().forEach(source -> documentNumbers.add(source.documentNo()));
    for (BundleDay day : bundle.days()) {
      LocalDate date = LocalDate.parse(day.date());
      if (!bundle.publishedYears().contains(date.getYear())
          || !documentNumbers.contains(day.sourceDocumentNo())) {
        throw new IllegalStateException("Calendar 节假日资源日期或来源无效: " + day.date());
      }
      DayClassification classification = DayClassification.valueOf(day.classification());
      if (classification != DayClassification.OFFICIAL_REST
          && classification != DayClassification.ADJUSTED_WORKDAY) {
        throw new IllegalStateException("Calendar 节假日资源日别无效: " + day.date());
      }
    }
  }

  private static String sha256(byte[] bytes) {
    try {
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("JDK 缺少 SHA-256", e);
    }
  }

  private record BundleFile(
      int schemaVersion,
      String regionCode,
      String bundleVersion,
      List<Integer> publishedYears,
      List<BundleSource> sources,
      List<BundleDay> days) {}

  private record BundleSource(
      String documentNo, String documentTitle, String issuer, String publishedOn, String url) {}

  private record BundleDay(
      String date,
      String classification,
      String name,
      String holidayCode,
      String sourceDocumentNo) {}

  private record BundleSnapshot(
      String bundleVersion,
      String sha256,
      List<Integer> publishedYears,
      Set<Integer> publishedYearSet,
      Map<LocalDate, DayPolicyValue> days) {}
}
