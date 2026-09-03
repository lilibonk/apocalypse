package io.apocalypse.calendar.domain;

import java.time.LocalDate;

/** Calendar 领域的日期算法端口；第三方类型只允许在 infrastructure adapter 内出现。 */
public interface DateKnowledgeProvider {

  DateProviderDescriptor descriptor();

  RawDateKnowledge resolve(LocalDate date);
}
