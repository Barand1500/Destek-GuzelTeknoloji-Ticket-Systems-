CREATE TABLE `ProjectGuideFile` (
  `id` VARCHAR(191) NOT NULL,
  `websiteId` VARCHAR(191) NOT NULL,
  `uploaderId` VARCHAR(191) NOT NULL,
  `originalName` VARCHAR(191) NOT NULL,
  `mimeType` VARCHAR(191) NOT NULL,
  `size` INTEGER NOT NULL,
  `storageKey` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `ProjectGuideFile_storageKey_key`(`storageKey`),
  INDEX `ProjectGuideFile_websiteId_createdAt_idx`(`websiteId`, `createdAt`),
  INDEX `ProjectGuideFile_uploaderId_idx`(`uploaderId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ProjectGuideFile`
  ADD CONSTRAINT `ProjectGuideFile_websiteId_fkey`
  FOREIGN KEY (`websiteId`) REFERENCES `Website`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ProjectGuideFile`
  ADD CONSTRAINT `ProjectGuideFile_uploaderId_fkey`
  FOREIGN KEY (`uploaderId`) REFERENCES `User`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
