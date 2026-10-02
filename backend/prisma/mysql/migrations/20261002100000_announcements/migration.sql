CREATE TABLE `Announcement` (
  `id` VARCHAR(191) NOT NULL,
  `authorId` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `body` TEXT NOT NULL,
  `audience` VARCHAR(191) NOT NULL,
  `priority` VARCHAR(191) NOT NULL DEFAULT 'NORMAL',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `eventAt` DATETIME(3) NULL,
  INDEX `Announcement_createdAt_idx`(`createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AnnouncementDelivery` (
  `id` VARCHAR(191) NOT NULL,
  `announcementId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `channels` TEXT NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'SENT',
  `error` TEXT NULL,
  `deliveredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `AnnouncementDelivery_announcementId_userId_key`(`announcementId`, `userId`),
  INDEX `AnnouncementDelivery_userId_deliveredAt_idx`(`userId`, `deliveredAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AnnouncementAttachment` (
  `id` VARCHAR(191) NOT NULL,
  `announcementId` VARCHAR(191) NOT NULL,
  `originalName` VARCHAR(191) NOT NULL,
  `mimeType` VARCHAR(191) NOT NULL,
  `size` INTEGER NOT NULL,
  `storageKey` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `AnnouncementAttachment_storageKey_key`(`storageKey`),
  INDEX `AnnouncementAttachment_announcementId_idx`(`announcementId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AnnouncementTemplate` (
  `id` VARCHAR(191) NOT NULL,
  `authorId` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `body` TEXT NOT NULL,
  `priority` VARCHAR(191) NOT NULL DEFAULT 'NORMAL',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `AnnouncementTemplate_updatedAt_idx`(`updatedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Announcement` ADD CONSTRAINT `Announcement_authorId_fkey`
  FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `AnnouncementDelivery` ADD CONSTRAINT `AnnouncementDelivery_announcementId_fkey`
  FOREIGN KEY (`announcementId`) REFERENCES `Announcement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `AnnouncementDelivery` ADD CONSTRAINT `AnnouncementDelivery_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `AnnouncementAttachment` ADD CONSTRAINT `AnnouncementAttachment_announcementId_fkey`
  FOREIGN KEY (`announcementId`) REFERENCES `Announcement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `AnnouncementTemplate` ADD CONSTRAINT `AnnouncementTemplate_authorId_fkey`
  FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
