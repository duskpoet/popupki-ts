-- AlterTable
ALTER TABLE "Popupka" ALTER COLUMN "chatId" SET DATA TYPE TEXT;

-- CreateIndex
CREATE INDEX "Popupka_chatId_idx" ON "Popupka"("chatId");
