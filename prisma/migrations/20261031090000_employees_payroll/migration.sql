-- Employees, daily attendance, penalties, departures, blacklist and payroll (owner, 31 Oct 2026).
-- Only NEW tables and types: no existing table, column or row is changed.

-- CreateEnum
CREATE TYPE "WorkerStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'EXCUSED');

-- CreateEnum
CREATE TYPE "ExcuseState" AS ENUM ('WAITING', 'APPROVED', 'REJECTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ApprovalState" AS ENUM ('WAITING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DepartureKind" AS ENUM ('FIRED', 'QUIT');

-- CreateEnum
CREATE TYPE "PenaltyState" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayrollState" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'FINALIZED');

-- CreateTable
CREATE TABLE "Worker" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phoneKey" TEXT NOT NULL,
    "shift" "Shift" NOT NULL,
    "salary" DECIMAL(14,2) NOT NULL,
    "startDate" DATE NOT NULL,
    "status" "WorkerStatus" NOT NULL DEFAULT 'ACTIVE',
    "endDate" DATE,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Worker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerSalaryChange" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "oldSalary" DECIMAL(14,2) NOT NULL,
    "newSalary" DECIMAL(14,2) NOT NULL,
    "reason" TEXT,
    "changedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerSalaryChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerShiftChange" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "fromShift" "Shift" NOT NULL,
    "toShift" "Shift" NOT NULL,
    "reason" TEXT,
    "changedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerShiftChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftLeader" (
    "shift" "Shift" NOT NULL,
    "userId" TEXT,
    "updatedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftLeader_pkey" PRIMARY KEY ("shift")
);

-- CreateTable
CREATE TABLE "AttendanceReport" (
    "id" TEXT NOT NULL,
    "shift" "Shift" NOT NULL,
    "day" DATE NOT NULL,
    "submittedById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "correctedAt" TIMESTAMP(3),

    CONSTRAINT "AttendanceReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "excuseReason" TEXT,
    "excuseState" "ExcuseState",
    "excuseById" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtraDeduction" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "state" "ApprovalState" NOT NULL DEFAULT 'WAITING',
    "requestedById" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,

    CONSTRAINT "ExtraDeduction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Penalty" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "shift" "Shift" NOT NULL,
    "day" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "state" "PenaltyState" NOT NULL DEFAULT 'ACTIVE',
    "issuedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,

    CONSTRAINT "Penalty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerDeparture" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "kind" "DepartureKind" NOT NULL,
    "lastDay" DATE NOT NULL,
    "explanation" TEXT NOT NULL,
    "shift" "Shift" NOT NULL,
    "recordedById" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "state" "ApprovalState" NOT NULL DEFAULT 'WAITING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,

    CONSTRAINT "WorkerDeparture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlacklistEntry" (
    "id" TEXT NOT NULL,
    "workerId" TEXT,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phoneKey" TEXT NOT NULL,
    "shift" "Shift",
    "reason" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "addedById" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "removalState" "ApprovalState",
    "removalReason" TEXT,
    "removalRequestedById" TEXT,
    "removalRequestedAt" TIMESTAMP(3),
    "removalDecidedById" TEXT,
    "removalDecidedAt" TIMESTAMP(3),

    CONSTRAINT "BlacklistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "state" "PayrollState" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectNote" TEXT,
    "finalizedById" TEXT,
    "finalizedAt" TIMESTAMP(3),

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollLine" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "workerNumber" TEXT NOT NULL,
    "workerName" TEXT NOT NULL,
    "shift" "Shift" NOT NULL,
    "salary" DECIMAL(14,2) NOT NULL,
    "dailyRate" DECIMAL(18,6) NOT NULL,
    "eligibleDays" INTEGER NOT NULL,
    "daysWorked" INTEGER NOT NULL,
    "absentDays" INTEGER NOT NULL,
    "excusedDays" INTEGER NOT NULL,
    "extraDays" INTEGER NOT NULL,
    "deductionDays" INTEGER NOT NULL,
    "notSubmittedDays" INTEGER NOT NULL,
    "earned" DECIMAL(14,2) NOT NULL,
    "absenceDeduction" DECIMAL(14,2) NOT NULL,
    "penaltyCount" INTEGER NOT NULL,
    "penaltyTotal" DECIMAL(14,2) NOT NULL,
    "totalDeductions" DECIMAL(14,2) NOT NULL,
    "finalSalary" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "PayrollLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollCorrection" (
    "id" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "byId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Worker_number_key" ON "Worker"("number");

-- CreateIndex
CREATE INDEX "Worker_shift_status_idx" ON "Worker"("shift", "status");

-- CreateIndex
CREATE INDEX "Worker_phoneKey_idx" ON "Worker"("phoneKey");

-- CreateIndex
CREATE INDEX "Worker_fullName_idx" ON "Worker"("fullName");

-- CreateIndex
CREATE INDEX "WorkerSalaryChange_workerId_createdAt_idx" ON "WorkerSalaryChange"("workerId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkerShiftChange_workerId_idx" ON "WorkerShiftChange"("workerId");

-- CreateIndex
CREATE INDEX "AttendanceReport_day_idx" ON "AttendanceReport"("day");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceReport_shift_day_key" ON "AttendanceReport"("shift", "day");

-- CreateIndex
CREATE INDEX "AttendanceRecord_workerId_day_idx" ON "AttendanceRecord"("workerId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_reportId_workerId_key" ON "AttendanceRecord"("reportId", "workerId");

-- CreateIndex
CREATE UNIQUE INDEX "ExtraDeduction_recordId_key" ON "ExtraDeduction"("recordId");

-- CreateIndex
CREATE INDEX "ExtraDeduction_workerId_idx" ON "ExtraDeduction"("workerId");

-- CreateIndex
CREATE INDEX "Penalty_workerId_day_idx" ON "Penalty"("workerId", "day");

-- CreateIndex
CREATE INDEX "Penalty_shift_day_idx" ON "Penalty"("shift", "day");

-- CreateIndex
CREATE INDEX "WorkerDeparture_workerId_idx" ON "WorkerDeparture"("workerId");

-- CreateIndex
CREATE INDEX "BlacklistEntry_phoneKey_idx" ON "BlacklistEntry"("phoneKey");

-- CreateIndex
CREATE INDEX "BlacklistEntry_active_idx" ON "BlacklistEntry"("active");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_year_month_key" ON "PayrollRun"("year", "month");

-- CreateIndex
CREATE INDEX "PayrollLine_runId_shift_idx" ON "PayrollLine"("runId", "shift");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollLine_runId_workerId_key" ON "PayrollLine"("runId", "workerId");

-- AddForeignKey
ALTER TABLE "WorkerSalaryChange" ADD CONSTRAINT "WorkerSalaryChange_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerShiftChange" ADD CONSTRAINT "WorkerShiftChange_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "AttendanceReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtraDeduction" ADD CONSTRAINT "ExtraDeduction_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "AttendanceRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtraDeduction" ADD CONSTRAINT "ExtraDeduction_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Penalty" ADD CONSTRAINT "Penalty_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerDeparture" ADD CONSTRAINT "WorkerDeparture_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlacklistEntry" ADD CONSTRAINT "BlacklistEntry_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLine" ADD CONSTRAINT "PayrollLine_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayrollRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLine" ADD CONSTRAINT "PayrollLine_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollCorrection" ADD CONSTRAINT "PayrollCorrection_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "PayrollLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

