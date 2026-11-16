ALTER TABLE `User` ADD COLUMN `passwordConfigured` BOOLEAN NOT NULL DEFAULT false;
-- Preserve existing explicit login credentials. Password login also marks legacy fallback accounts.
UPDATE `User` SET `passwordConfigured` = true WHERE `loginEmail` IS NOT NULL OR `role` <> 'CUSTOMER';
