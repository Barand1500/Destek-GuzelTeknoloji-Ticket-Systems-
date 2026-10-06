-- Customer email is contact information, not a sign-in identity.
-- Clear values copied here by the original email-uniqueness migration so
-- customer contacts cannot block staff login email addresses.
UPDATE `User`
SET `loginEmail` = NULL
WHERE `role` = 'CUSTOMER';
