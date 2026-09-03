package io.apocalypse.calendar.domain;

public interface DataImportParser {

  DataImportParseResult parse(DataImportParseRequest request);
}
