CREATE TABLE `ConversationAssignee` (
  `conversationId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`conversationId`, `userId`),
  INDEX `ConversationAssignee_userId_conversationId_idx` (`userId`, `conversationId`),
  CONSTRAINT `ConversationAssignee_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ConversationAssignee_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
INSERT INTO `ConversationAssignee` (`conversationId`, `userId`)
SELECT `id`, `assignedAgentId` FROM `Conversation` WHERE `assignedAgentId` IS NOT NULL;
