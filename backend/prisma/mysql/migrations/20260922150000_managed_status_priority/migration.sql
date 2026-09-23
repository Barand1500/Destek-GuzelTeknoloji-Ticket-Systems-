CREATE TABLE `StatusOption` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `color` VARCHAR(191) NOT NULL DEFAULT '#398571',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE INDEX `StatusOption_code_key` (`code`),
    INDEX `StatusOption_isActive_sortOrder_idx` (`isActive`, `sortOrder`),
    INDEX `StatusOption_name_idx` (`name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PriorityOption` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `color` VARCHAR(191) NOT NULL DEFAULT '#64748b',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE INDEX `PriorityOption_code_key` (`code`),
    INDEX `PriorityOption_isActive_sortOrder_idx` (`isActive`, `sortOrder`),
    INDEX `PriorityOption_name_idx` (`name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Conversation`
    MODIFY `status` VARCHAR(191) NOT NULL DEFAULT 'OPEN',
    MODIFY `priority` VARCHAR(191) NOT NULL DEFAULT 'NORMAL';

INSERT INTO `StatusOption` (`id`, `code`, `name`, `sortOrder`, `updatedAt`) VALUES
(UUID(), 'OPEN', 'Açık', 10, CURRENT_TIMESTAMP(3)),
(UUID(), 'PENDING', 'Beklemede', 20, CURRENT_TIMESTAMP(3)),
(UUID(), 'IN_PROGRESS', 'İşlemde', 30, CURRENT_TIMESTAMP(3)),
(UUID(), 'RESOLVED', 'Çözüldü', 40, CURRENT_TIMESTAMP(3)),
(UUID(), 'CLOSED', 'Kapalı', 50, CURRENT_TIMESTAMP(3));

INSERT INTO `PriorityOption` (`id`, `code`, `name`, `sortOrder`, `updatedAt`) VALUES
(UUID(), 'LOW', 'Düşük', 10, CURRENT_TIMESTAMP(3)),
(UUID(), 'NORMAL', 'Normal', 20, CURRENT_TIMESTAMP(3)),
(UUID(), 'HIGH', 'Yüksek', 30, CURRENT_TIMESTAMP(3)),
(UUID(), 'URGENT', 'Acil', 40, CURRENT_TIMESTAMP(3));
