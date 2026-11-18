CREATE TABLE `PaymentGatewaySettings` (
 `id` VARCHAR(191) NOT NULL DEFAULT 'default',
 `enabled` BOOLEAN NOT NULL DEFAULT false,
 `recurringEnabled` BOOLEAN NOT NULL DEFAULT false,
 `mode` VARCHAR(16) NOT NULL DEFAULT 'sandbox',
 `credentialsCiphertext` TEXT NOT NULL,
 `fingerprint` VARCHAR(64) NOT NULL,
 `publicUrl` VARCHAR(500) NOT NULL,
 `testedAt` DATETIME(3) NULL,
 `lastError` VARCHAR(160) NULL,
 `updatedAt` DATETIME(3) NOT NULL,
 PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `PaymentCheckoutSession` (
 `id` VARCHAR(191) NOT NULL,
 `attemptId` VARCHAR(191) NOT NULL,
 `orderId` VARCHAR(191) NOT NULL,
 `customerId` VARCHAR(191) NOT NULL,
 `token` VARCHAR(255) NULL,
 `paymentUrl` TEXT NULL,
 `state` VARCHAR(24) NOT NULL DEFAULT 'INITIALIZING',
 `contextCiphertext` TEXT NOT NULL,
 `expiresAt` DATETIME(3) NOT NULL,
 `claimedAt` DATETIME(3) NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `updatedAt` DATETIME(3) NOT NULL,
 PRIMARY KEY (`id`),
 UNIQUE INDEX `PaymentCheckoutSession_attemptId_key` (`attemptId`),
 UNIQUE INDEX `PaymentCheckoutSession_token_key` (`token`),
 INDEX `PaymentCheckoutSession_state_updatedAt_idx` (`state`, `updatedAt`),
 INDEX `PaymentCheckoutSession_orderId_idx` (`orderId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `PaymentStoredMethod` (
 `id` VARCHAR(191) NOT NULL,
 `customerId` VARCHAR(191) NOT NULL,
 `contextCiphertext` TEXT NOT NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
