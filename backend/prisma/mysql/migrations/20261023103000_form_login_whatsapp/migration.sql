ALTER TABLE `FormLoginChallenge`
  ADD COLUMN `deliveryChannel` VARCHAR(16) NOT NULL DEFAULT 'EMAIL',
  ADD COLUMN `phone` VARCHAR(20) NULL;

ALTER TABLE `IntegrationSettings`
  ADD COLUMN `whatsappAuthTemplateName` VARCHAR(60) NOT NULL DEFAULT '',
  ADD COLUMN `whatsappAuthTemplateLanguage` VARCHAR(20) NOT NULL DEFAULT 'en';
