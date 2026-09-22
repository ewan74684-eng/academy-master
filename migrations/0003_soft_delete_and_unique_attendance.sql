-- Soft delete for players/employees + one attendance record per player per day.
-- Additive & non-destructive: no rows are changed or removed.
-- Run this BEFORE deploying the code that uses these columns.
-- The currently deployed code keeps working after this runs (it ignores the new columns).

-- ─── STEP 0 (read-only checks — run first, change nothing) ────────────────────
-- Must return NO rows, otherwise Step 2 will fail (it fails safely; nothing changes):
--   SELECT player_id, DATE(session_date) AS day, COUNT(*) AS n
--   FROM sessions GROUP BY player_id, DATE(session_date) HAVING n > 1;
-- Must return nothing, otherwise these were already applied:
--   SHOW COLUMNS FROM players LIKE 'deleted_at';
--   SHOW COLUMNS FROM trainers LIKE 'deleted_at';
--   SHOW COLUMNS FROM sessions LIKE 'session_day';

-- ─── STEP 1: soft delete columns (empty for every existing row) ──────────────
ALTER TABLE `players`  ADD COLUMN `deleted_at` DATETIME NULL;
ALTER TABLE `trainers` ADD COLUMN `deleted_at` DATETIME NULL;

-- ─── STEP 2: one attendance record per player per day ────────────────────────
-- session_day is computed by MySQL from session_date; the app never writes it.
ALTER TABLE `sessions`
  ADD COLUMN `session_day` DATE GENERATED ALWAYS AS (DATE(`session_date`)) STORED,
  ADD UNIQUE INDEX `unq_player_day` (`player_id`, `session_day`);

-- ─── ROLLBACK (only if needed; run AFTER reverting the code) ─────────────────
--   ALTER TABLE `sessions` DROP INDEX `unq_player_day`, DROP COLUMN `session_day`;
--   ALTER TABLE `trainers` DROP COLUMN `deleted_at`;
--   ALTER TABLE `players`  DROP COLUMN `deleted_at`;
-- Note: dropping deleted_at makes soft-deleted players/employees visible again.
