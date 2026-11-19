CREATE TABLE `CreditRefundRequest` (
 `orderId` VARCHAR(191) NOT NULL,
 `reason` VARCHAR(500) NOT NULL,
 `status` VARCHAR(16) NOT NULL DEFAULT 'OPEN',
 `reviewNote` VARCHAR(500) NULL,
 `reviewedById` VARCHAR(191) NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `updatedAt` DATETIME(3) NOT NULL,
 PRIMARY KEY (`orderId`),
 INDEX `CreditRefundRequest_status_createdAt_idx` (`status`, `createdAt`),
 CONSTRAINT `CreditRefundRequest_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `CreditOrder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
