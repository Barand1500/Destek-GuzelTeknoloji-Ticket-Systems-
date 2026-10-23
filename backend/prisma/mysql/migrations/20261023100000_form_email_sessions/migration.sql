CREATE TABLE `FormEmailSession` (
  `tokenHash` VARCHAR(64) NOT NULL,
  `email` VARCHAR(254) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`tokenHash`),
  INDEX `FormEmailSession_email_expiresAt_idx` (`email`, `expiresAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
