CREATE TABLE `ConversationParticipant` (
  `conversationId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `ConversationParticipant_userId_createdAt_idx`(`userId`, `createdAt`),
  PRIMARY KEY (`conversationId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ConversationMessageMention` (
  `messageId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,

  INDEX `ConversationMessageMention_userId_idx`(`userId`),
  PRIMARY KEY (`messageId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ConversationParticipant`
  ADD CONSTRAINT `ConversationParticipant_conversationId_fkey`
  FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ConversationParticipant`
  ADD CONSTRAINT `ConversationParticipant_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ConversationMessageMention`
  ADD CONSTRAINT `ConversationMessageMention_messageId_fkey`
  FOREIGN KEY (`messageId`) REFERENCES `ConversationMessage`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ConversationMessageMention`
  ADD CONSTRAINT `ConversationMessageMention_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
