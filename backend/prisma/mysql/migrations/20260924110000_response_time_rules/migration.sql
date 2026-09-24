ALTER TABLE `IntegrationSettings`
  ADD COLUMN `responseFastMinutes` INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN `responseNormalMinutes` INTEGER NOT NULL DEFAULT 60;
