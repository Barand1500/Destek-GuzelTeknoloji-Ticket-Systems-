CREATE TABLE `Website` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `url` VARCHAR(500) NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Website_url_key`(`url`),
  INDEX `Website_isActive_idx`(`isActive`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Conversation` ADD COLUMN `websiteId` VARCHAR(191) NULL;
CREATE INDEX `Conversation_websiteId_idx` ON `Conversation`(`websiteId`);
ALTER TABLE `Conversation` ADD CONSTRAINT `Conversation_websiteId_fkey` FOREIGN KEY (`websiteId`) REFERENCES `Website`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
