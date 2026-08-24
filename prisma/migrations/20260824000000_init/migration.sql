CREATE TABLE "User" (
  "id" TEXT NOT NULL, "email" TEXT NOT NULL, "name" TEXT, "image" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE TABLE "Budget" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "currency" TEXT NOT NULL DEFAULT 'EUR', "startsOn" DATE, "endsOn" DATE, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT NOT NULL, CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "BudgetLine" (
  "id" TEXT NOT NULL, "budgetId" TEXT NOT NULL, "category" TEXT NOT NULL, "description" TEXT, "plannedCents" INTEGER NOT NULL, "kitsasAccount" INTEGER, "kind" TEXT NOT NULL DEFAULT 'EXPENSE', "sortOrder" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BudgetLine_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BudgetLine_budgetId_category_key" ON "BudgetLine"("budgetId", "category");
CREATE TABLE "Expense" (
  "id" TEXT NOT NULL, "budgetId" TEXT NOT NULL, "source" TEXT NOT NULL DEFAULT 'KITSAS', "externalId" TEXT, "occurredOn" DATE NOT NULL, "description" TEXT NOT NULL, "category" TEXT, "amountCents" INTEGER NOT NULL, "kind" TEXT NOT NULL DEFAULT 'EXPENSE', "rawPayload" JSONB, "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Expense_budgetId_source_externalId_key" ON "Expense"("budgetId", "source", "externalId");
CREATE INDEX "Expense_budgetId_occurredOn_idx" ON "Expense"("budgetId", "occurredOn");
CREATE TABLE "SyncRun" (
  "id" TEXT NOT NULL, "budgetId" TEXT NOT NULL, "source" TEXT NOT NULL, "status" TEXT NOT NULL, "imported" INTEGER NOT NULL DEFAULT 0, "detail" TEXT, "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3),
  CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
