CREATE TABLE `AkbankRecurringInstruction` (
  `id` VARCHAR(191) NOT NULL,
  `subscriptionId` VARCHAR(191) NOT NULL,
  `checkoutSessionId` VARCHAR(191) NOT NULL,
  `state` VARCHAR(24) NOT NULL DEFAULT 'REGISTERING',
  `contextCiphertext` TEXT NOT NULL,
  `failureCode` VARCHAR(80) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `nextCheckAt` DATETIME(3) NULL,
  UNIQUE INDEX `AkbankRecurringInstruction_checkoutSessionId_key` (`checkoutSessionId`),
  INDEX `AkbankRecurringInstruction_state_nextCheckAt_idx` (`state`, `nextCheckAt`),
  INDEX `AkbankRecurringInstruction_subscriptionId_createdAt_idx` (`subscriptionId`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `AkbankRecurringInstruction_subscriptionId_fkey` FOREIGN KEY (`subscriptionId`) REFERENCES `CreditSubscription` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
