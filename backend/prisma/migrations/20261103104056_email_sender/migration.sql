-- Each email now records which sender sends it, so one campaign can use several senders.
-- Existing emails were all sent by their campaign's single sender, so copy that across before
-- making the column required.

-- AlterTable: add as nullable first, so existing rows are allowed while we fill them.
ALTER TABLE "Email" ADD COLUMN "senderId" TEXT;

UPDATE "Email" AS e
SET "senderId" = c."senderId"
FROM "Campaign" AS c
WHERE c."id" = e."campaignId";

ALTER TABLE "Email" ALTER COLUMN "senderId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Email_senderId_status_originalScheduledAt_idx" ON "Email"("senderId", "status", "originalScheduledAt");

-- AddForeignKey
ALTER TABLE "Email" ADD CONSTRAINT "Email_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Sender"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
