/*
  Expense held one side of each voucher entry, picked at sync time from the
  budget line's kind, which is why reclassifying a line between meno and tulo
  used to invalidate it. KitsasEntry stores both sides instead and is not scoped
  to a budget, so the kind becomes a read-time interpretation.

  The dropped rows are a cache of Kitsas and are re-derivable: the voucher
  signatures and sync runs are cleared below so the app refetches on its own
  rather than sitting on an empty table under a confident "last fetched" line.
  Nothing in Kitsas is touched.
*/
-- DropForeignKey
ALTER TABLE "Expense" DROP CONSTRAINT "Expense_budgetId_fkey";

-- DropTable
DROP TABLE "Expense";

-- CreateTable
CREATE TABLE "KitsasEntry" (
    "voucherId" INTEGER NOT NULL,
    "entryId" INTEGER NOT NULL,
    "occurredOn" DATE NOT NULL,
    "account" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "debetCents" INTEGER NOT NULL DEFAULT 0,
    "kreditCents" INTEGER NOT NULL DEFAULT 0,
    "rawPayload" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KitsasEntry_pkey" PRIMARY KEY ("voucherId","entryId")
);

-- CreateIndex
CREATE INDEX "KitsasEntry_account_occurredOn_idx" ON "KitsasEntry"("account", "occurredOn");

-- CreateIndex
CREATE INDEX "KitsasEntry_occurredOn_idx" ON "KitsasEntry"("occurredOn");

-- Force a full refetch: without this an incremental sync would skip every
-- voucher whose signature is unchanged, and the dashboard would trust a
-- completed run that populated a table which no longer exists.
DELETE FROM "KitsasVoucherState";
DELETE FROM "SyncRun";
