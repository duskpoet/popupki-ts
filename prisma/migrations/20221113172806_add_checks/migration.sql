-- CreateTable
CREATE TABLE "Check" (
    "id" SERIAL NOT NULL,
    "popupkaId" INTEGER NOT NULL,

    CONSTRAINT "Check_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Check_popupkaId_key" ON "Check"("popupkaId");

-- CreateIndex
CREATE INDEX "Check_popupkaId_idx" ON "Check"("popupkaId");

-- AddForeignKey
ALTER TABLE "Check" ADD CONSTRAINT "Check_popupkaId_fkey" FOREIGN KEY ("popupkaId") REFERENCES "Popupka"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
