-- Fresh MySQL installations never had these legacy address columns.
-- Only remove columns that actually exist (MySQL has no DROP COLUMN IF EXISTS).
SET @address_columns = (
  SELECT GROUP_CONCAT(CONCAT('DROP COLUMN `', COLUMN_NAME, '`') SEPARATOR ', ')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'User'
    AND COLUMN_NAME IN ('addressCity', 'addressDistrict', 'addressLine')
);
SET @address_sql = IF(@address_columns IS NULL, 'SELECT 1',
  CONCAT('ALTER TABLE `User` ', @address_columns));
PREPARE address_statement FROM @address_sql;
EXECUTE address_statement;
DEALLOCATE PREPARE address_statement;
