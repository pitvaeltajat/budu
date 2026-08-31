-- CreateTable
CREATE TABLE "KitsasUnmappedAccount" (
    "budgetId" TEXT NOT NULL,
    "account" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "entries" INTEGER NOT NULL DEFAULT 0,
    "debetCents" INTEGER NOT NULL DEFAULT 0,
    "kreditCents" INTEGER NOT NULL DEFAULT 0,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KitsasUnmappedAccount_pkey" PRIMARY KEY ("budgetId","account")
);

-- AddForeignKey
ALTER TABLE "KitsasUnmappedAccount" ADD CONSTRAINT "KitsasUnmappedAccount_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
