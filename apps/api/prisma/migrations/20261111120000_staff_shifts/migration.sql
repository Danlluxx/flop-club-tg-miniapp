-- CreateTable
CREATE TABLE "StaffShift" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "workDate" TEXT NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "breakHours" DOUBLE PRECISION,
    "manualHours" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'Отработана',
    "comment" TEXT,
    "exportedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollWorkbook" (
    "key" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollWorkbook_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "StaffShift_tournamentId_idx" ON "StaffShift"("tournamentId");

-- CreateIndex
CREATE INDEX "StaffShift_exportedAt_idx" ON "StaffShift"("exportedAt");

-- AddForeignKey
ALTER TABLE "StaffShift" ADD CONSTRAINT "StaffShift_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
