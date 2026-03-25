-- Fix radiologist_study_rates.study_id FK: was incorrectly pointing to study_master
-- (patient study records) instead of study_definitions (study type catalogue).
ALTER TABLE radiologist_study_rates
  DROP CONSTRAINT IF EXISTS radiologist_study_rates_study_id_fkey;

ALTER TABLE radiologist_study_rates
  ADD CONSTRAINT radiologist_study_rates_study_id_fkey
  FOREIGN KEY (study_id) REFERENCES study_definitions(id);
