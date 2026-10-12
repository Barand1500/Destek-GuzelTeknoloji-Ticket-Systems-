CREATE TABLE `SkillDefinition` (
  `id` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(10) NOT NULL,
  `name` VARCHAR(80) NOT NULL,
  `normalizedKey` VARCHAR(80) NOT NULL,
  `categoryId` VARCHAR(191) NULL,
  `rank` INTEGER NOT NULL DEFAULT 1,
  UNIQUE INDEX `SkillDefinition_kind_normalizedKey_key` (`kind`, `normalizedKey`),
  INDEX `SkillDefinition_categoryId_idx` (`categoryId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `SkillDefinition_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `SkillDefinition` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
