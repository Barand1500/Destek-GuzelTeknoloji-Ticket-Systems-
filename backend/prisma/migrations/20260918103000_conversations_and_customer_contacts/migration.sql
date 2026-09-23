-- Preserve existing support history while adopting the unified conversation names.
ALTER TYPE "TicketStatus" RENAME TO "ConversationStatus";
ALTER TYPE "TicketPriority" RENAME TO "ConversationPriority";
ALTER TABLE "Ticket" RENAME TO "Conversation";
ALTER TABLE "TicketMessage" RENAME TO "ConversationMessage";
ALTER TABLE "TicketAttachment" RENAME TO "ConversationAttachment";
ALTER TABLE "TicketTag" RENAME TO "ConversationTag";
ALTER TABLE "ConversationMessage" RENAME COLUMN "ticketId" TO "conversationId";
ALTER TABLE "ConversationTag" RENAME COLUMN "ticketId" TO "conversationId";
ALTER TABLE "Notification" RENAME COLUMN "ticketId" TO "conversationId";
CREATE TYPE "ConversationChannel" AS ENUM ('TICKET', 'EMAIL', 'LIVE_CHAT');
CREATE TYPE "MessageType" AS ENUM ('CUSTOMER_MESSAGE', 'AGENT_REPLY', 'INTERNAL_NOTE', 'SYSTEM');
ALTER TABLE "Conversation" ADD COLUMN "channel" "ConversationChannel" NOT NULL DEFAULT 'TICKET';
ALTER TABLE "ConversationMessage" ADD COLUMN "type" "MessageType";
UPDATE "ConversationMessage" AS message
SET "type" = CASE
  WHEN message."isInternalNote" THEN 'INTERNAL_NOTE'::"MessageType"
  WHEN message."authorId" = conversation."customerId" THEN 'CUSTOMER_MESSAGE'::"MessageType"
  ELSE 'AGENT_REPLY'::"MessageType"
END
FROM "Conversation" AS conversation
WHERE conversation."id" = message."conversationId";
ALTER TABLE "ConversationMessage" ALTER COLUMN "type" SET NOT NULL;
ALTER TABLE "ConversationMessage" ALTER COLUMN "type" SET DEFAULT 'CUSTOMER_MESSAGE';
ALTER TABLE "ConversationMessage" DROP COLUMN "isInternalNote";
ALTER TABLE "User" ADD COLUMN "phone" TEXT, ADD COLUMN "company" TEXT;
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
CREATE INDEX "Conversation_channel_status_idx" ON "Conversation"("channel", "status");
