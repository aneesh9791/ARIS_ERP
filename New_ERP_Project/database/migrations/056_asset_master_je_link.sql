-- ============================================================
-- Migration 056: Link asset_master to its capitalisation JE
-- Posted when a fixed-asset GRN item is capitalised from
-- the Asset Management screen (DR Fixed Asset GL / CR AP).
-- ============================================================

ALTER TABLE asset_master
  ADD COLUMN IF NOT EXISTS journal_entry_id INTEGER REFERENCES journal_entries(id);
