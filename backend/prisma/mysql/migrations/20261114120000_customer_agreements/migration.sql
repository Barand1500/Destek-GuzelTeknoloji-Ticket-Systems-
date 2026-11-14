ALTER TABLE `User` ADD COLUMN `parentCustomerId` VARCHAR(191) NULL;
CREATE INDEX `User_parentCustomerId_idx` ON `User`(`parentCustomerId`);
ALTER TABLE `User` ADD CONSTRAINT `User_parentCustomerId_fkey` FOREIGN KEY (`parentCustomerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE `Agreement` (
 `id` VARCHAR(191) NOT NULL,
 `customerId` VARCHAR(191) NOT NULL,
 `name` VARCHAR(150) NOT NULL,
 `type` VARCHAR(20) NOT NULL,
 `startsOn` DATE NOT NULL,
 `endsOn` DATE NOT NULL,
 `fee` DECIMAL(12,2) NOT NULL,
 `credits` INTEGER NOT NULL,
 `usedCredits` INTEGER NOT NULL DEFAULT 0,
 `cancelledAt` DATETIME(3) NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY (`id`), INDEX `Agreement_customerId_endsOn_idx` (`customerId`, `endsOn`),
 CONSTRAINT `Agreement_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `CreditCharge` (
 `id` VARCHAR(191) NOT NULL,
 `conversationId` VARCHAR(191) NOT NULL,
 `agreementId` VARCHAR(191) NULL,
 `credits` INTEGER NOT NULL,
 `actorId` VARCHAR(191) NOT NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY (`id`), UNIQUE INDEX `CreditCharge_conversationId_key` (`conversationId`),
 INDEX `CreditCharge_agreementId_createdAt_idx` (`agreementId`, `createdAt`),
 CONSTRAINT `CreditCharge_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT `CreditCharge_agreementId_fkey` FOREIGN KEY (`agreementId`) REFERENCES `Agreement`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
