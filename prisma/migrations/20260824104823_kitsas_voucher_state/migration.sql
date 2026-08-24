-- CreateTable
CREATE TABLE "KitsasVoucherState" (
    "budgetId" TEXT NOT NULL,
    "voucherId" INTEGER NOT NULL,
    "signature" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KitsasVoucherState_pkey" PRIMARY KEY ("budgetId","voucherId")
);

-- AddForeignKey
ALTER TABLE "KitsasVoucherState" ADD CONSTRAINT "KitsasVoucherState_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
