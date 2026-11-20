-- Retire new renewals while preserving payment, credit and refund history.
ALTER TABLE `CreditSubscription` ALTER COLUMN `autoRenew` SET DEFAULT false;
UPDATE `PaymentGatewaySettings` SET `recurringEnabled` = false WHERE `recurringEnabled` = true;
UPDATE `CreditSalesPlan` SET `renewalRequested` = false WHERE `renewalRequested` = true;
UPDATE `Agreement` SET `renewalRequested` = false WHERE `renewalRequested` = true;
UPDATE `CreditSubscription`
SET `autoRenew` = false, `nextPaymentOn` = NULL, `status` = 'STOPPED', `stoppedAt` = COALESCE(`stoppedAt`, CURRENT_TIMESTAMP(3))
WHERE `autoRenew` = true OR `nextPaymentOn` IS NOT NULL;
-- A bank-held instruction must be cancelled and verified at the bank.
-- Keep the instruction and encrypted context until cancellation/reconciliation finishes.
UPDATE `AkbankRecurringInstruction`
SET `state` = 'STOP_REQUESTED', `nextCheckAt` = CURRENT_TIMESTAMP(3)
WHERE `state` NOT IN ('STOPPED', 'FAILED', 'COMPLETED');
