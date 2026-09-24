-- Keep the MySQL schema aligned with the customer contact fields used by the API.
-- This follows the initial MySQL import; it intentionally does not rely on the
-- removed legacy PostgreSQL migration history.
ALTER TABLE `User`
  ADD COLUMN `extraPhones` VARCHAR(191) NULL,
  ADD COLUMN `extraEmails` VARCHAR(191) NULL,
  ADD COLUMN `deletedAt` DATETIME(3) NULL;
