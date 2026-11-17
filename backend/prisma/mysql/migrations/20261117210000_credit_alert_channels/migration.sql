ALTER TABLE CreditSalesSettings ADD COLUMN alertChannels JSON NULL, ADD COLUMN whatsappCreditTemplateName VARCHAR(120) NOT NULL DEFAULT '', ADD COLUMN whatsappCreditTemplateLanguage VARCHAR(20) NOT NULL DEFAULT 'tr';
ALTER TABLE CreditAlertReceipt ADD COLUMN channel VARCHAR(16) NOT NULL DEFAULT 'IN_APP';
