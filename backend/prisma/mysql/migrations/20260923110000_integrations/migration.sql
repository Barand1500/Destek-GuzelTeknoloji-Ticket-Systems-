ALTER TABLE `Conversation` MODIFY `channel` ENUM('TICKET', 'EMAIL', 'SMS', 'WHATSAPP', 'LIVE_CHAT') NOT NULL DEFAULT 'TICKET';

CREATE TABLE `IntegrationSettings` (
  `id` VARCHAR(191) NOT NULL DEFAULT 'default',
  `smtpEnabled` BOOLEAN NOT NULL DEFAULT false, `smtpHost` VARCHAR(191) NOT NULL DEFAULT '', `smtpPort` INTEGER NOT NULL DEFAULT 587, `smtpSecure` BOOLEAN NOT NULL DEFAULT false, `smtpUser` VARCHAR(191) NOT NULL DEFAULT '', `smtpPassword` VARCHAR(191) NOT NULL DEFAULT '', `smtpFromAddress` VARCHAR(191) NOT NULL DEFAULT '', `smtpFromName` VARCHAR(191) NOT NULL DEFAULT '',
  `imapEnabled` BOOLEAN NOT NULL DEFAULT false, `imapHost` VARCHAR(191) NOT NULL DEFAULT '', `imapPort` INTEGER NOT NULL DEFAULT 993, `imapSecure` BOOLEAN NOT NULL DEFAULT true, `imapUser` VARCHAR(191) NOT NULL DEFAULT '', `imapPassword` VARCHAR(191) NOT NULL DEFAULT '', `imapMailbox` VARCHAR(191) NOT NULL DEFAULT 'INBOX', `imapPollIntervalSeconds` INTEGER NOT NULL DEFAULT 60, `imapDepartmentId` VARCHAR(191) NULL,
  `smsEnabled` BOOLEAN NOT NULL DEFAULT false, `smsApiUser` VARCHAR(191) NOT NULL DEFAULT '', `smsApiPassword` VARCHAR(191) NOT NULL DEFAULT '', `smsSender` VARCHAR(191) NOT NULL DEFAULT '', `smsVirtualNumber` VARCHAR(191) NOT NULL DEFAULT '', `smsWebhookSecret` VARCHAR(191) NOT NULL DEFAULT '', `smsDepartmentId` VARCHAR(191) NULL,
  `whatsappEnabled` BOOLEAN NOT NULL DEFAULT false, `whatsappAppId` VARCHAR(191) NOT NULL DEFAULT '', `whatsappAppSecret` VARCHAR(191) NOT NULL DEFAULT '', `whatsappPhoneNumberId` VARCHAR(191) NOT NULL DEFAULT '', `whatsappAccessToken` VARCHAR(191) NOT NULL DEFAULT '', `whatsappVerifyToken` VARCHAR(191) NOT NULL DEFAULT '', `whatsappDepartmentId` VARCHAR(191) NULL,
  `lastTestChannel` VARCHAR(191) NULL, `lastTestSuccess` BOOLEAN NULL, `lastTestMessage` VARCHAR(191) NULL, `lastTestedAt` DATETIME(3) NULL, `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ExternalMessage` (
  `id` VARCHAR(191) NOT NULL, `provider` VARCHAR(191) NOT NULL, `externalId` VARCHAR(191) NOT NULL, `channel` ENUM('TICKET', 'EMAIL', 'SMS', 'WHATSAPP', 'LIVE_CHAT') NOT NULL, `conversationId` VARCHAR(191) NOT NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`), UNIQUE INDEX `ExternalMessage_provider_externalId_key`(`provider`, `externalId`), INDEX `ExternalMessage_conversationId_idx`(`conversationId`),
  CONSTRAINT `ExternalMessage_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
