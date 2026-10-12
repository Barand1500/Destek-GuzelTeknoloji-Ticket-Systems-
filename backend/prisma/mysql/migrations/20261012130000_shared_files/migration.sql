CREATE TABLE `SharedFile` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(180) NOT NULL,
  `type` VARCHAR(10) NOT NULL,
  `parent` VARCHAR(191) NULL,
  `size` INTEGER NULL,
  `mimeType` VARCHAR(191) NULL,
  `storageKey` VARCHAR(191) NULL,
  `icon` VARCHAR(30) NULL,
  `color` VARCHAR(30) NULL,
  `uploaderId` VARCHAR(191) NOT NULL,
  `uploadedBy` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `SharedFile_storageKey_key` (`storageKey`),
  INDEX `SharedFile_parent_idx` (`parent`),
  PRIMARY KEY (`id`),
  CONSTRAINT `SharedFile_parent_fkey` FOREIGN KEY (`parent`) REFERENCES `SharedFile` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
