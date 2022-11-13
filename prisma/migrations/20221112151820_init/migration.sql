-- CreateTable
CREATE TABLE "Popupka" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "chatId" BIGINT NOT NULL,

    CONSTRAINT "Popupka_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Popupka_name_key" ON "Popupka"("name");
