-- AlterTable
ALTER TABLE `CreditOrder` ADD COLUMN `grantedAgreementId` VARCHAR(191) NULL,
    ADD COLUMN `paidAt` DATETIME(3) NULL,
    ADD COLUMN `periodEndsOn` DATE NULL,
    ADD COLUMN `periodNumber` INTEGER NULL,
    ADD COLUMN `periodStartsOn` DATE NULL,
    ADD COLUMN `subscriptionId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `CreditSubscription` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `sourceAgreementId` VARCHAR(191) NULL,
    `name` VARCHAR(150) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `currency` VARCHAR(3) NOT NULL,
    `credits` INTEGER NOT NULL,
    `periodMonths` INTEGER NULL,
    `periodDays` INTEGER NULL,
    `status` VARCHAR(24) NOT NULL DEFAULT 'AWAITING_PAYMENT',
    `autoRenew` BOOLEAN NOT NULL DEFAULT true,
    `consentedAt` DATETIME(3) NOT NULL,
    `consentVersion` VARCHAR(32) NOT NULL DEFAULT 'renewal-v1',
    `anchorOn` DATE NULL,
    `currentStartsOn` DATE NULL,
    `currentEndsOn` DATE NULL,
    `nextPaymentOn` DATE NULL,
    `paidPeriods` INTEGER NOT NULL DEFAULT 0,
    `stoppedAt` DATETIME(3) NULL,
    `provider` VARCHAR(32) NULL,
    `paymentMethodRef` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CreditSubscription_sourceAgreementId_key`(`sourceAgreementId`),
    INDEX `CreditSubscription_customerId_createdAt_id_idx`(`customerId`, `createdAt`, `id`),
    INDEX `CreditSubscription_autoRenew_status_nextPaymentOn_idx`(`autoRenew`, `status`, `nextPaymentOn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CreditPaymentAttempt` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `attemptNumber` INTEGER NOT NULL,
    `provider` VARCHAR(32) NOT NULL,
    `providerPaymentId` VARCHAR(255) NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `failureCode` VARCHAR(80) NULL,
    `nextRetryAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,

    INDEX `CreditPaymentAttempt_status_nextRetryAt_idx`(`status`, `nextRetryAt`),
    UNIQUE INDEX `CreditPaymentAttempt_orderId_attemptNumber_key`(`orderId`, `attemptNumber`),
    UNIQUE INDEX `CreditPaymentAttempt_provider_providerPaymentId_key`(`provider`, `providerPaymentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `CreditOrder_grantedAgreementId_key` ON `CreditOrder`(`grantedAgreementId`);

-- CreateIndex
CREATE UNIQUE INDEX `CreditOrder_subscriptionId_periodNumber_key` ON `CreditOrder`(`subscriptionId`, `periodNumber`);

-- AddForeignKey
ALTER TABLE `CreditOrder` ADD CONSTRAINT `CreditOrder_subscriptionId_fkey` FOREIGN KEY (`subscriptionId`) REFERENCES `CreditSubscription`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CreditOrder` ADD CONSTRAINT `CreditOrder_grantedAgreementId_fkey` FOREIGN KEY (`grantedAgreementId`) REFERENCES `Agreement`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CreditSubscription` ADD CONSTRAINT `CreditSubscription_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CreditSubscription` ADD CONSTRAINT `CreditSubscription_sourceAgreementId_fkey` FOREIGN KEY (`sourceAgreementId`) REFERENCES `Agreement`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CreditPaymentAttempt` ADD CONSTRAINT `CreditPaymentAttempt_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `CreditOrder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
