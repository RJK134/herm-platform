-- CreateTable
CREATE TABLE "ConflictOfInterestDeclaration" (
    "id" TEXT NOT NULL,
    "evaluationProjectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "declaredText" TEXT NOT NULL,
    "declaredHash" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConflictOfInterestDeclaration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConflictOfInterestDeclaration_evaluationProjectId_userId_key"
    ON "ConflictOfInterestDeclaration"("evaluationProjectId", "userId");

-- CreateIndex
CREATE INDEX "ConflictOfInterestDeclaration_evaluationProjectId_idx"
    ON "ConflictOfInterestDeclaration"("evaluationProjectId");

-- CreateIndex
CREATE INDEX "ConflictOfInterestDeclaration_userId_idx"
    ON "ConflictOfInterestDeclaration"("userId");

-- AddForeignKey
ALTER TABLE "ConflictOfInterestDeclaration"
    ADD CONSTRAINT "ConflictOfInterestDeclaration_evaluationProjectId_fkey"
    FOREIGN KEY ("evaluationProjectId") REFERENCES "EvaluationProject"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConflictOfInterestDeclaration"
    ADD CONSTRAINT "ConflictOfInterestDeclaration_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
