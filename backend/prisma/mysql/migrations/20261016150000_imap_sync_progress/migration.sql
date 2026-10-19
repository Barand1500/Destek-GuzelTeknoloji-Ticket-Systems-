CREATE TABLE `ImapSyncState` (
  `id` VARCHAR(64) NOT NULL,
  `mailbox` VARCHAR(191) NOT NULL,
  `uidValidity` VARCHAR(32) NOT NULL,
  `lastUid` INTEGER NOT NULL DEFAULT 0,
  `leaseToken` VARCHAR(36) NULL,
  `leaseUntil` DATETIME(3) NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ImapSyncRetry` (
  `syncId` VARCHAR(64) NOT NULL,
  `uid` INTEGER NOT NULL,
  `attempts` INTEGER NOT NULL DEFAULT 1,
  `nextAttemptAt` DATETIME(3) NOT NULL,
  `lastError` TEXT NOT NULL,
  PRIMARY KEY (`syncId`, `uid`),
  INDEX `ImapSyncRetry_syncId_nextAttemptAt_idx` (`syncId`, `nextAttemptAt`),
  CONSTRAINT `ImapSyncRetry_syncId_fkey` FOREIGN KEY (`syncId`) REFERENCES `ImapSyncState` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
