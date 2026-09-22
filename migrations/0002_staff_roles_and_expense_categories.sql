-- Add cleaning/reception staff roles to trainers and new expense categories.
-- Additive & non-destructive: it only extends the allowed value lists, so all
-- existing rows are preserved. Safe to run once against the database.

-- Trainers: added staff roles cleaning, reception (not added to subscriptions).
ALTER TABLE `trainers`
  MODIFY COLUMN `activity` ENUM(
    'karate','kickboxing','football','swimming','zumba','aerobics','crossfit',
    'gymnastics','quran_memorization','kindergarten',
    'muay_thai','special_needs','aqua_aerobics','basketball','volleyball',
    'cleaning','reception'
  ) NOT NULL;

-- Expense categories: added internet, cleaning_supplies, pool_sanitization.
ALTER TABLE `expenses`
  MODIFY COLUMN `category` ENUM(
    'rent','utilities','maintenance','equipment','salary','marketing',
    'transportation','other',
    'water','electricity','license_fees','residency_fees','sewage',
    'internet','cleaning_supplies','pool_sanitization'
  ) NOT NULL;
