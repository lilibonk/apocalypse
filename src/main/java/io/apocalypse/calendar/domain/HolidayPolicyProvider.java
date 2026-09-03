package io.apocalypse.calendar.domain;

import java.time.LocalDate;
import java.util.List;

public interface HolidayPolicyProvider {

  String bundleVersion();

  String bundleSha256();

  List<Integer> publishedYears();

  HolidayPolicyKnowledge resolve(LocalDate date);
}
