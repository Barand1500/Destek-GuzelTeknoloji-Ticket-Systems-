ALTER TABLE `IntegrationSettings`
  ADD COLUMN `responseFastColor` VARCHAR(7) NOT NULL DEFAULT '#16715d',
  ADD COLUMN `responseNormalColor` VARCHAR(7) NOT NULL DEFAULT '#a86606',
  ADD COLUMN `responseLateColor` VARCHAR(7) NOT NULL DEFAULT '#c2413c';
