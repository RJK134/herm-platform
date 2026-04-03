-- DropForeignKey
ALTER TABLE "EvaluationDomainAssignment" DROP CONSTRAINT "EvaluationDomainAssignment_assignedToId_fkey";

-- DropForeignKey
ALTER TABLE "EvaluationMember" DROP CONSTRAINT "EvaluationMember_userId_fkey";

-- DropForeignKey
ALTER TABLE "EvaluationProject" DROP CONSTRAINT "EvaluationProject_institutionId_fkey";

-- DropForeignKey
ALTER TABLE "EvaluationSystem" DROP CONSTRAINT "EvaluationSystem_systemId_fkey";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_subscriptionId_fkey";

-- DropForeignKey
ALTER TABLE "ProcurementProject" DROP CONSTRAINT "ProcurementProject_institutionId_fkey";

-- DropForeignKey
ALTER TABLE "Score" DROP CONSTRAINT "Score_systemId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_institutionId_fkey";

-- DropForeignKey
ALTER TABLE "VendorAnalytic" DROP CONSTRAINT "VendorAnalytic_vendorAccountId_fkey";

-- DropForeignKey
ALTER TABLE "VendorProfile" DROP CONSTRAINT "VendorProfile_systemId_fkey";

-- DropForeignKey
ALTER TABLE "VendorSubmission" DROP CONSTRAINT "VendorSubmission_vendorAccountId_fkey";

-- DropForeignKey
ALTER TABLE "VendorUser" DROP CONSTRAINT "VendorUser_vendorAccountId_fkey";

-- DropForeignKey
ALTER TABLE "VendorVersion" DROP CONSTRAINT "VendorVersion_systemId_fkey";

-- DropForeignKey
ALTER TABLE "VersionScore" DROP CONSTRAINT "VersionScore_versionId_fkey";

-- CreateIndex
CREATE INDEX "ArchitectureAssessment_institutionId_idx" ON "ArchitectureAssessment"("institutionId");

-- CreateIndex
CREATE INDEX "ArchitectureAssessment_createdById_idx" ON "ArchitectureAssessment"("createdById");

-- CreateIndex
CREATE INDEX "CapabilityBasket_institutionId_idx" ON "CapabilityBasket"("institutionId");

-- CreateIndex
CREATE INDEX "GeneratedDocument_institutionId_idx" ON "GeneratedDocument"("institutionId");

-- CreateIndex
CREATE INDEX "GeneratedDocument_projectId_idx" ON "GeneratedDocument"("projectId");

-- CreateIndex
CREATE INDEX "GeneratedDocument_createdById_idx" ON "GeneratedDocument"("createdById");

-- CreateIndex
CREATE INDEX "IntegrationAssessment_targetSystemId_idx" ON "IntegrationAssessment"("targetSystemId");

-- CreateIndex
CREATE INDEX "IntegrationAssessment_createdById_idx" ON "IntegrationAssessment"("createdById");

-- CreateIndex
CREATE INDEX "Payment_subscriptionId_idx" ON "Payment"("subscriptionId");

-- CreateIndex
CREATE INDEX "ProcurementProject_institutionId_idx" ON "ProcurementProject"("institutionId");

-- CreateIndex
CREATE INDEX "TcoEstimate_institutionId_idx" ON "TcoEstimate"("institutionId");

-- CreateIndex
CREATE INDEX "ValueAnalysis_institutionId_idx" ON "ValueAnalysis"("institutionId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Score" ADD CONSTRAINT "Score_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "VendorSystem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementProject" ADD CONSTRAINT "ProcurementProject_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorVersion" ADD CONSTRAINT "VendorVersion_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "VendorSystem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VersionScore" ADD CONSTRAINT "VersionScore_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "VendorVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorProfile" ADD CONSTRAINT "VendorProfile_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "VendorSystem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorUser" ADD CONSTRAINT "VendorUser_vendorAccountId_fkey" FOREIGN KEY ("vendorAccountId") REFERENCES "VendorAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorSubmission" ADD CONSTRAINT "VendorSubmission_vendorAccountId_fkey" FOREIGN KEY ("vendorAccountId") REFERENCES "VendorAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorAnalytic" ADD CONSTRAINT "VendorAnalytic_vendorAccountId_fkey" FOREIGN KEY ("vendorAccountId") REFERENCES "VendorAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationProject" ADD CONSTRAINT "EvaluationProject_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationSystem" ADD CONSTRAINT "EvaluationSystem_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "VendorSystem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationMember" ADD CONSTRAINT "EvaluationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationDomainAssignment" ADD CONSTRAINT "EvaluationDomainAssignment_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

