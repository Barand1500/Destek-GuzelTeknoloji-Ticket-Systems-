CREATE TABLE `ResponseTimeSettings` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'default',
    `responseFastFromMinutes` INTEGER NOT NULL DEFAULT 0,
    `responseFastToMinutes` INTEGER NOT NULL DEFAULT 15,
    `responseNormalFromMinutes` INTEGER NOT NULL DEFAULT 16,
    `responseNormalToMinutes` INTEGER NOT NULL DEFAULT 60,
    `responseLateFromMinutes` INTEGER NOT NULL DEFAULT 61,
    `responseLateToMinutes` INTEGER NOT NULL DEFAULT 10080,
    `responseFastColor` VARCHAR(7) NOT NULL DEFAULT '#16715d',
    `responseNormalColor` VARCHAR(7) NOT NULL DEFAULT '#a86606',
    `responseLateColor` VARCHAR(7) NOT NULL DEFAULT '#c2413c',
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `ResponseTimeSettings` (`id`, `responseFastFromMinutes`, `responseFastToMinutes`, `responseNormalFromMinutes`, `responseNormalToMinutes`, `responseLateFromMinutes`, `responseLateToMinutes`, `responseFastColor`, `responseNormalColor`, `responseLateColor`, `updatedAt`)
SELECT 'default', `responseFastFromMinutes`, `responseFastToMinutes`, `responseNormalFromMinutes`, `responseNormalToMinutes`, `responseLateFromMinutes`, `responseLateToMinutes`, `responseFastColor`, `responseNormalColor`, `responseLateColor`, CURRENT_TIMESTAMP(3)
FROM `IntegrationSettings` WHERE `id` = 'default';
