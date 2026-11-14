ALTER TABLE `Session` ADD COLUMN `customerEmailVerifiedAt` DATETIME(3) NULL;
CREATE TABLE `CustomerLoginChallenge` (
 `id` VARCHAR(191) NOT NULL,
 `userId` VARCHAR(191) NOT NULL,
 `email` VARCHAR(254) NOT NULL,
 `codeHash` VARCHAR(64) NOT NULL,
 `attempts` INTEGER NOT NULL DEFAULT 0,
 `requests` INTEGER NOT NULL DEFAULT 1,
 `requestWindowAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `expiresAt` DATETIME(3) NOT NULL,
 `consumedAt` DATETIME(3) NULL,
 PRIMARY KEY (`id`), UNIQUE INDEX `CustomerLoginChallenge_userId_key` (`userId`),
 CONSTRAINT `CustomerLoginChallenge_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
