-- Add the Gym, Jiu-Jitsu and Judo activities (for players and for employees).
-- Additive & non-destructive: it only extends the allowed value lists, so every
-- existing player, subscription and employee keeps its activity. CrossFit and all
-- other activities are unchanged. Run this BEFORE deploying the code that offers them.
-- (Same result: `node scripts/apply-categories.mjs`.)

-- ─── STEP 0 (read-only checks — run first, change nothing) ────────────────────
-- Every value these return must appear in the lists below (true unless the
-- database was edited by hand):
--   SELECT DISTINCT activity FROM subscriptions;
--   SELECT DISTINCT activity FROM trainers;

ALTER TABLE `subscriptions`
  MODIFY COLUMN `activity` ENUM(
    'karate','kickboxing','football','swimming','zumba','aerobics','crossfit',
    'gymnastics','quran_memorization','kindergarten',
    'muay_thai','special_needs','aqua_aerobics','basketball','volleyball',
    'gym','jiu_jitsu','judo'
  ) NOT NULL;

ALTER TABLE `trainers`
  MODIFY COLUMN `activity` ENUM(
    'karate','kickboxing','football','swimming','zumba','aerobics','crossfit',
    'gymnastics','quran_memorization','kindergarten',
    'muay_thai','special_needs','aqua_aerobics','basketball','volleyball',
    'gym','jiu_jitsu','judo',
    'cleaning','reception'
  ) NOT NULL;

-- ─── ROLLBACK (only if needed; run AFTER reverting the code) ─────────────────
-- Only possible while no subscription or employee uses gym / jiu_jitsu / judo:
-- re-run the ALTERs above without those three values.
