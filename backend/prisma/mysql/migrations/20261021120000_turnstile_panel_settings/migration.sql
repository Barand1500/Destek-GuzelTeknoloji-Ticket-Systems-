CREATE TABLE `TurnstileSettings` (
  `id` VARCHAR(191) NOT NULL DEFAULT 'default',
  `enabled` BOOLEAN NOT NULL DEFAULT false,
  `siteKey` VARCHAR(256) NOT NULL DEFAULT '',
  `secretCiphertext` TEXT NOT NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
