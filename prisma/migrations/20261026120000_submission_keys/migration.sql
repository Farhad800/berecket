-- Additive only: a new table for one-time submission numbers. No existing table, column or row is changed.
-- CreateTable
CREATE TABLE "SubmissionKey" (
    "key" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmissionKey_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "SubmissionKey_createdAt_idx" ON "SubmissionKey"("createdAt");

