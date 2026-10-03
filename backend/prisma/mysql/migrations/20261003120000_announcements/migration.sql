CREATE TABLE `Announcement` (
  `id` VARCHAR(191) NOT NULL, `authorId` VARCHAR(191) NOT NULL, `authorName` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL, `body` TEXT NOT NULL, `priority` VARCHAR(191) NOT NULL,
  `departmentId` VARCHAR(191) NULL, `departmentName` VARCHAR(191) NULL, `eventAt` DATETIME(3) NULL,
  `pinned` BOOLEAN NOT NULL DEFAULT false, `files` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`), INDEX `Announcement_createdAt_idx` (`createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `AnnouncementDelivery` (
  `id` VARCHAR(191) NOT NULL, `announcementId` VARCHAR(191) NOT NULL, `userId` VARCHAR(191) NOT NULL,
  `recipientName` VARCHAR(191) NOT NULL, `address` VARCHAR(191) NULL, `channel` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING', `error` TEXT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `AnnouncementDelivery_announcementId_userId_channel_key` (`announcementId`, `userId`, `channel`),
  INDEX `AnnouncementDelivery_status_idx` (`status`), INDEX `AnnouncementDelivery_userId_announcementId_idx` (`userId`, `announcementId`),
  CONSTRAINT `AnnouncementDelivery_announcementId_fkey` FOREIGN KEY (`announcementId`) REFERENCES `Announcement` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
