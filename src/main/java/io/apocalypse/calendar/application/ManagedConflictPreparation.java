package io.apocalypse.calendar.application;

import io.apocalypse.calendar.domain.ConflictResolution;
import io.apocalypse.calendar.domain.OverrideRevisionSnapshot;

import java.util.List;

record ManagedConflictPreparation(OverrideRevisionSnapshot draft, List<Resolution> resolutions) {

  record Resolution(Long conflictId, ConflictResolution resolution) {}
}
