-- A customer contact can share a company email address or phone number with another person.
ALTER TABLE `User`
  DROP INDEX `User_email_key`,
  DROP INDEX `User_phone_key`,
  ADD COLUMN `loginEmail` VARCHAR(191) NULL;

-- Every existing account remains able to sign in with its current email address.
UPDATE `User`
SET `loginEmail` = `email`
WHERE `email` IS NOT NULL;

CREATE UNIQUE INDEX `User_loginEmail_key` ON `User`(`loginEmail`);
CREATE INDEX `User_email_idx` ON `User`(`email`);
CREATE INDEX `User_phone_idx` ON `User`(`phone`);
