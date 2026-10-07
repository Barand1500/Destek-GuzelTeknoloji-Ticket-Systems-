-- TEXT defaults must be expressions on MySQL 8.0.13+.
ALTER TABLE `Survey`
  MODIFY COLUMN `description` TEXT NOT NULL DEFAULT ('');
