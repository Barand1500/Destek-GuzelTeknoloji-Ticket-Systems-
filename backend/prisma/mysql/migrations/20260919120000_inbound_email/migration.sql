CREATE TABLE `IncomingEmail` (
  `id` VARCHAR(191) NOT NULL,
  `mailbox` VARCHAR(191) NOT NULL DEFAULT 'INBOX',
  `uid` INTEGER NOT NULL,
  `messageId` VARCHAR(191) NULL,
  `conversationId` VARCHAR(191) NOT NULL,
  `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `IncomingEmail_mailbox_uid_key`(`mailbox`, `uid`),
  UNIQUE INDEX `IncomingEmail_messageId_key`(`messageId`),
  INDEX `IncomingEmail_conversationId_idx`(`conversationId`),
  CONSTRAINT `IncomingEmail_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;