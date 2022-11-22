-- DropForeignKey
ALTER TABLE "Check" DROP CONSTRAINT "Check_popupkaId_fkey";

-- AddForeignKey
ALTER TABLE "Check" ADD CONSTRAINT "Check_popupkaId_fkey" FOREIGN KEY ("popupkaId") REFERENCES "Popupka"("id") ON DELETE CASCADE ON UPDATE CASCADE;
