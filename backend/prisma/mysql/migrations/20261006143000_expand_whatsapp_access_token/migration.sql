-- Meta access tokens can exceed the previous VARCHAR(191) limit.
ALTER TABLE `IntegrationSettings`
  MODIFY COLUMN `whatsappAccessToken` TEXT NOT NULL DEFAULT ('');
