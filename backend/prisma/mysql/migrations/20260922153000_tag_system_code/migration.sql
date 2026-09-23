ALTER TABLE `Tag` ADD COLUMN `code` VARCHAR(191) NULL;

UPDATE `Tag`
SET `code` = UPPER(REPLACE(REPLACE(`name`, ' ', '_'), '-', '_'))
WHERE `code` IS NULL;

ALTER TABLE `Tag` MODIFY `code` VARCHAR(191) NOT NULL;
CREATE UNIQUE INDEX `Tag_code_key` ON `Tag`(`code`);
