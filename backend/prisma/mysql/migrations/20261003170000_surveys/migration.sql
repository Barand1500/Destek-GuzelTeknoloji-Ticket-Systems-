CREATE TABLE `Survey` (
  `id` VARCHAR(191) NOT NULL,
  `authorId` VARCHAR(191) NOT NULL,
  `authorName` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `description` TEXT NOT NULL,
  `anonymous` BOOLEAN NOT NULL DEFAULT false,
  `endsAt` DATETIME(3) NOT NULL,
  `questions` JSON NOT NULL,
  `channels` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `Survey_createdAt_idx`(`createdAt`),
  INDEX `Survey_endsAt_idx`(`endsAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SurveyRecipient` (
  `id` VARCHAR(191) NOT NULL,
  `surveyId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `recipientName` VARCHAR(191) NOT NULL,
  `deliveryStatus` JSON NOT NULL,
  INDEX `SurveyRecipient_userId_idx`(`userId`),
  UNIQUE INDEX `SurveyRecipient_surveyId_userId_key`(`surveyId`, `userId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `SurveyRecipient_surveyId_fkey` FOREIGN KEY (`surveyId`) REFERENCES `Survey`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SurveyResponse` (
  `id` VARCHAR(191) NOT NULL,
  `surveyId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `respondentName` VARCHAR(191) NULL,
  `answers` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `SurveyResponse_surveyId_createdAt_idx`(`surveyId`, `createdAt`),
  UNIQUE INDEX `SurveyResponse_surveyId_userId_key`(`surveyId`, `userId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `SurveyResponse_surveyId_fkey` FOREIGN KEY (`surveyId`) REFERENCES `Survey`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
