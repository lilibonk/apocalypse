-- Revision counters include discarded drafts; the active-row partial indexes cannot serve them.
CREATE INDEX idx_cal_event_revision_event_history ON cal_event_revision (event_id);
