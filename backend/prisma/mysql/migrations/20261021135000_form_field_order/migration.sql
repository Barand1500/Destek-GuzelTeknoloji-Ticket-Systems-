ALTER TABLE `FormSettings`
  ADD COLUMN `fieldOrder` JSON NULL;

UPDATE `FormSettings`
SET `fieldOrder` = JSON_ARRAY('company', 'name', 'phone', 'email', 'subject', 'message', 'files')
WHERE `fieldOrder` IS NULL;
