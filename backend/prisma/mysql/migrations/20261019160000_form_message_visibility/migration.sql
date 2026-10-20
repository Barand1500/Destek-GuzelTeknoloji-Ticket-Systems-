ALTER TABLE `ConversationMessage` ADD COLUMN `visibleInForm` BOOLEAN NOT NULL DEFAULT false;

-- Earlier Form replies included a tracking link in their durable email job.
-- EMAIL-only replies did not. Recover that per-message selection, rather than
-- using the conversation's current channels to expose its entire history.
UPDATE `ConversationMessage` AS m
SET m.`visibleInForm` = true
WHERE m.`type` = 'AGENT_REPLY'
  AND EXISTS (
    SELECT 1 FROM `OutboundMessage` AS o
    WHERE o.`conversationId` = m.`conversationId`
      AND JSON_UNQUOTE(JSON_EXTRACT(o.`payload`, '$.context.messageId')) = m.`id`
      AND o.`channel` = 'EMAIL'
      AND JSON_UNQUOTE(JSON_EXTRACT(o.`payload`, '$.text')) LIKE '%/form/talep#%'
  );
