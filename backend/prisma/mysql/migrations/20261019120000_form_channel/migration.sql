ALTER TABLE `Conversation` MODIFY `channel` ENUM('TICKET','EMAIL','SMS','WHATSAPP','LIVE_CHAT','FORM') NOT NULL DEFAULT 'TICKET';
ALTER TABLE `ExternalMessage` MODIFY `channel` ENUM('TICKET','EMAIL','SMS','WHATSAPP','LIVE_CHAT','FORM') NOT NULL;
CREATE TABLE `FormSettings` (
  `id` VARCHAR(191) NOT NULL DEFAULT 'default', `enabled` BOOLEAN NOT NULL DEFAULT false,
  `departmentId` VARCHAR(191) NULL, `title` VARCHAR(100) NOT NULL DEFAULT 'Destek Talebi',
  `updatedAt` DATETIME(3) NOT NULL, PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `FormRequest` (
  `conversationId` VARCHAR(191) NOT NULL, `email` VARCHAR(254) NOT NULL, `name` VARCHAR(100) NOT NULL,
  `phone` VARCHAR(30) NULL, `company` VARCHAR(150) NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`conversationId`), INDEX `FormRequest_email_createdAt_idx` (`email`, `createdAt`),
  CONSTRAINT `FormRequest_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `FormAccess` (
  `tokenHash` VARCHAR(64) NOT NULL, `conversationId` VARCHAR(191) NOT NULL, `email` VARCHAR(254) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`tokenHash`), INDEX `FormAccess_conversationId_expiresAt_idx` (`conversationId`, `expiresAt`),
  CONSTRAINT `FormAccess_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
