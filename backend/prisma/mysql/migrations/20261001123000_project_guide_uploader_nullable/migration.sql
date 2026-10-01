ALTER TABLE `ProjectGuideFile`
  DROP FOREIGN KEY `ProjectGuideFile_uploaderId_fkey`;

ALTER TABLE `ProjectGuideFile`
  MODIFY `uploaderId` VARCHAR(191) NULL;

ALTER TABLE `ProjectGuideFile`
  ADD CONSTRAINT `ProjectGuideFile_uploaderId_fkey`
  FOREIGN KEY (`uploaderId`) REFERENCES `User`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
