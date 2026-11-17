ALTER TABLE CreditSalesSettings ADD COLUMN alertsEnabled BOOLEAN NOT NULL DEFAULT true,
 ADD COLUMN lowCreditPercent INTEGER NOT NULL DEFAULT 20, ADD COLUMN expiryNoticeDays INTEGER NOT NULL DEFAULT 7;
CREATE TABLE CreditOrder (
 id VARCHAR(191) NOT NULL, number INTEGER NOT NULL AUTO_INCREMENT,
 customerId VARCHAR(191) NOT NULL, requestedById VARCHAR(191) NOT NULL,
 requestKey VARCHAR(36) NOT NULL, inputHash VARCHAR(64) NOT NULL,
 kind VARCHAR(16) NOT NULL, name VARCHAR(100) NOT NULL, credits INTEGER NOT NULL,
 total DECIMAL(12,2) NOT NULL, currency VARCHAR(3) NOT NULL, unitPrice DECIMAL(10,2) NULL,
 validityDays INTEGER NULL, periodMonths INTEGER NULL, status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
 cancelledAt DATETIME(3) NULL, createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updatedAt DATETIME(3) NOT NULL,
 PRIMARY KEY(id), UNIQUE INDEX CreditOrder_number_key(number), UNIQUE INDEX CreditOrder_customerId_requestKey_key(customerId,requestKey),
 INDEX CreditOrder_customerId_createdAt_id_idx(customerId,createdAt,id), INDEX CreditOrder_status_createdAt_id_idx(status,createdAt,id),
 CONSTRAINT CreditOrder_customerId_fkey FOREIGN KEY(customerId) REFERENCES User(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT CreditOrder_requestedById_fkey FOREIGN KEY(requestedById) REFERENCES User(id) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE CreditAlertReceipt (
 id VARCHAR(64) NOT NULL, agreementId VARCHAR(191) NOT NULL, customerId VARCHAR(191) NOT NULL, kind VARCHAR(16) NOT NULL,
 createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY(id),
 INDEX CreditAlertReceipt_agreementId_idx(agreementId), INDEX CreditAlertReceipt_customerId_idx(customerId),
 CONSTRAINT CreditAlertReceipt_agreementId_fkey FOREIGN KEY(agreementId) REFERENCES Agreement(id) ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT CreditAlertReceipt_customerId_fkey FOREIGN KEY(customerId) REFERENCES User(id) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
