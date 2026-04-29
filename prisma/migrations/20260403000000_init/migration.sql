-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('FREE', 'PROFESSIONAL', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'INSTITUTION_ADMIN', 'PROCUREMENT_LEAD', 'EVALUATOR', 'VENDOR_ADMIN', 'VENDOR_CONTRIBUTOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('BUSINESS_CASE', 'RFP_ITT', 'SHORTLIST_REPORT', 'REQUIREMENTS_SPEC', 'EXECUTIVE_SUMMARY');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'REVIEW', 'FINAL', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "StageStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'AWAITING_APPROVAL', 'APPROVED', 'COMPLETED', 'SKIPPED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "VendorTier" AS ENUM ('BASIC', 'ENHANCED', 'PREMIUM');

-- CreateTable
CREATE TABLE "Institution" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'free',
    "logoUrl" TEXT,
    "domain" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Institution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "tier" "SubscriptionTier" NOT NULL DEFAULT 'FREE',
    "status" TEXT NOT NULL DEFAULT 'active',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL DEFAULT '',
    "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "institutionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HermFamily" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "HermFamily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HermCapability" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "familyId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "HermCapability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorSystem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "regions" TEXT[],
    "cloudNative" BOOLEAN NOT NULL DEFAULT false,
    "website" TEXT,
    "logoUrl" TEXT,
    "isOwnSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorSystem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Score" (
    "id" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "capabilityId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "evidence" TEXT,
    "source" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "scoredBy" TEXT,
    "scoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Score_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapabilityBasket" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "institutionId" TEXT,
    "createdById" TEXT NOT NULL,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CapabilityBasket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BasketItem" (
    "id" TEXT NOT NULL,
    "basketId" TEXT NOT NULL,
    "capabilityId" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'must',
    "weight" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,

    CONSTRAINT "BasketItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcurementProject" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "institutionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "basketId" TEXT,
    "jurisdiction" TEXT NOT NULL DEFAULT 'UK',
    "estimatedValue" DECIMAL(14,2),
    "procurementRoute" TEXT DEFAULT 'open',
    "startDate" TIMESTAMP(3),
    "targetAwardDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcurementProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "changes" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorVersion" (
    "id" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "versionName" TEXT NOT NULL,
    "releaseDate" TIMESTAMP(3),
    "endOfLife" TIMESTAMP(3),
    "changelog" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VersionScore" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "capabilityId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "changeFromPrev" INTEGER,
    "evidence" TEXT,

    CONSTRAINT "VersionScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorProfile" (
    "id" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "foundedYear" INTEGER,
    "headquarters" TEXT,
    "employees" TEXT,
    "marketShare" TEXT,
    "gartnerPosition" TEXT,
    "deploymentModel" TEXT[],
    "techStack" TEXT,
    "apiStandards" TEXT[],
    "integrationProtocols" TEXT[],
    "certifications" TEXT[],
    "pricingModel" TEXT,
    "typicalCostRange" TEXT,
    "implementationTime" TEXT,
    "keyStrengths" TEXT[],
    "knownLimitations" TEXT[],
    "recentNews" TEXT,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchItem" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "publisher" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "tags" TEXT[],
    "summary" TEXT,
    "url" TEXT,
    "relevantSystems" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoringMethodology" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoringMethodology_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "context" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TcoEstimate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "institutionSize" TEXT NOT NULL,
    "studentFte" INTEGER NOT NULL,
    "staffFte" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "horizonYears" INTEGER NOT NULL DEFAULT 5,
    "systemId" TEXT,
    "licenceCostYear1" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "licenceCostGrowth" DOUBLE PRECISION NOT NULL DEFAULT 0.03,
    "implementationCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "internalStaffCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "trainingCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "infrastructureCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "integrationCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "supportCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "customDevCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalTco" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "annualRunRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "perStudentCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "institutionId" TEXT,
    "createdById" TEXT NOT NULL DEFAULT 'anonymous',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TcoEstimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcurementWorkflow" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "currentStage" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcurementWorkflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowStage" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "stageNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "outputs" JSONB,

    CONSTRAINT "WorkflowStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShortlistEntry" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'longlist',
    "score" DOUBLE PRECISION,
    "notes" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShortlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationAssessment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currentSystems" JSONB NOT NULL,
    "targetSystemId" TEXT,
    "complexityScore" INTEGER NOT NULL DEFAULT 0,
    "riskLevel" TEXT NOT NULL DEFAULT 'medium',
    "findings" JSONB,
    "createdById" TEXT NOT NULL DEFAULT 'anonymous',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArchitectureAssessment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "institutionId" TEXT,
    "currentSystems" JSONB NOT NULL,
    "integrationLinks" JSONB NOT NULL,
    "architecturePattern" TEXT NOT NULL DEFAULT 'point-to-point',
    "targetSystemId" TEXT,
    "dataRisk" INTEGER NOT NULL DEFAULT 0,
    "cutoverRisk" INTEGER NOT NULL DEFAULT 0,
    "integrationRisk" INTEGER NOT NULL DEFAULT 0,
    "changeRisk" INTEGER NOT NULL DEFAULT 0,
    "overallRisk" INTEGER NOT NULL DEFAULT 0,
    "readinessScore" INTEGER NOT NULL DEFAULT 0,
    "recommendations" JSONB,
    "notes" TEXT,
    "createdById" TEXT NOT NULL DEFAULT 'anonymous',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArchitectureAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValueAnalysis" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "institutionId" TEXT,
    "systemId" TEXT,
    "studentFte" INTEGER NOT NULL DEFAULT 10000,
    "staffFte" INTEGER NOT NULL DEFAULT 500,
    "institutionType" TEXT NOT NULL DEFAULT 'pre-92',
    "currentSystemCostAnnual" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentMaintenanceCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentSupportCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "adminEfficiencyPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "adminStaffAffected" INTEGER NOT NULL DEFAULT 0,
    "avgAdminSalaryGbp" DOUBLE PRECISION NOT NULL DEFAULT 35000,
    "registryEfficiencyPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "registryStaffAffected" INTEGER NOT NULL DEFAULT 0,
    "avgRegistrySalaryGbp" DOUBLE PRECISION NOT NULL DEFAULT 42000,
    "errorReductionPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "errorCostCurrentAnnual" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "complianceSavingAnnual" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "studentExperienceValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherBenefitsAnnual" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "implementationCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "annualLicenceCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "annualSupportCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "annualInternalStaffCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAnnualBenefits" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAnnualCosts" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netAnnualBenefit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "roi3Year" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "roi5Year" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "npv5Year" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paybackMonths" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT NOT NULL DEFAULT 'anonymous',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ValueAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedDocument" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "institutionId" TEXT,
    "projectId" TEXT,
    "basketId" TEXT,
    "tcoEstimateId" TEXT,
    "valueAnalysisId" TEXT,
    "sections" JSONB NOT NULL,
    "metadata" JSONB,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL DEFAULT 'anonymous',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeneratedDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcurementJurisdiction" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legislation" TEXT NOT NULL,
    "thresholds" JSONB NOT NULL,
    "minimumTimelines" JSONB NOT NULL,
    "mandatoryStages" JSONB NOT NULL,
    "noticeRequirements" JSONB NOT NULL,
    "standstillPeriod" INTEGER,
    "rules" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcurementJurisdiction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcurementStage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "stageCode" TEXT NOT NULL,
    "stageName" TEXT NOT NULL,
    "stageOrder" INTEGER NOT NULL,
    "status" "StageStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "startDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "completedDate" TIMESTAMP(3),
    "assignedTo" TEXT,
    "complianceChecks" JSONB,
    "notes" TEXT,

    CONSTRAINT "ProcurementStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageTask" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assignedTo" TEXT,
    "dueDate" TIMESTAMP(3),
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "isMandatory" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "completedBy" TEXT,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "StageTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageApproval" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "approverRole" TEXT NOT NULL,
    "approverName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "comments" TEXT,

    CONSTRAINT "StageApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageDocument" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "generatedFromTemplate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StageDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcurementEvaluation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "evaluatorId" TEXT,
    "evaluatorName" TEXT,
    "hermScore" DECIMAL(5,2),
    "technicalScore" DECIMAL(5,2),
    "commercialScore" DECIMAL(5,2),
    "implementationScore" DECIMAL(5,2),
    "referenceScore" DECIMAL(5,2),
    "overallScore" DECIMAL(5,2),
    "weightingProfile" JSONB,
    "recommendation" TEXT,
    "notes" TEXT,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "ProcurementEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceCheck" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "checkCode" TEXT NOT NULL,
    "checkName" TEXT NOT NULL,
    "jurisdictionId" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL,
    "isPassed" BOOLEAN,
    "evidence" TEXT,
    "checkedAt" TIMESTAMP(3),
    "checkedBy" TEXT,

    CONSTRAINT "ComplianceCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorAccount" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "systemId" TEXT,
    "tier" "VendorTier" NOT NULL DEFAULT 'BASIC',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "websiteUrl" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "logoUrl" TEXT,
    "description" TEXT,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'contributor',
    "vendorAccountId" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "lastLogin" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorSubmission" (
    "id" TEXT NOT NULL,
    "vendorAccountId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedBy" TEXT,
    "reviewNotes" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "VendorSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorAnalytic" (
    "id" TEXT NOT NULL,
    "vendorAccountId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "period" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorAnalytic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationProject" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "institutionId" TEXT NOT NULL,
    "leadUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planning',
    "basketId" TEXT,
    "deadline" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvaluationProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationSystem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,

    CONSTRAINT "EvaluationSystem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationMember" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'evaluator',
    "assignedDomains" TEXT[],

    CONSTRAINT "EvaluationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationDomainAssignment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "assignedToId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "score" JSONB,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "EvaluationDomainAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationDomainScore" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "capabilityId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "notes" TEXT,
    "scoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluationDomainScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "status" TEXT NOT NULL,
    "stripePaymentId" TEXT,
    "invoiceUrl" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "permissions" TEXT[],
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Institution_slug_key" ON "Institution"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_institutionId_key" ON "Subscription"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_institutionId_idx" ON "User"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "HermFamily_code_key" ON "HermFamily"("code");

-- CreateIndex
CREATE UNIQUE INDEX "HermCapability_code_key" ON "HermCapability"("code");

-- CreateIndex
CREATE INDEX "HermCapability_familyId_idx" ON "HermCapability"("familyId");

-- CreateIndex
CREATE INDEX "Score_systemId_idx" ON "Score"("systemId");

-- CreateIndex
CREATE INDEX "Score_capabilityId_idx" ON "Score"("capabilityId");

-- CreateIndex
CREATE UNIQUE INDEX "Score_systemId_capabilityId_version_key" ON "Score"("systemId", "capabilityId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "BasketItem_basketId_capabilityId_key" ON "BasketItem"("basketId", "capabilityId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "VendorVersion_systemId_idx" ON "VendorVersion"("systemId");

-- CreateIndex
CREATE INDEX "VersionScore_versionId_idx" ON "VersionScore"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "VersionScore_versionId_capabilityId_key" ON "VersionScore"("versionId", "capabilityId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorProfile_systemId_key" ON "VendorProfile"("systemId");

-- CreateIndex
CREATE UNIQUE INDEX "ScoringMethodology_category_key" ON "ScoringMethodology"("category");

-- CreateIndex
CREATE INDEX "ChatMessage_sessionId_idx" ON "ChatMessage"("sessionId");

-- CreateIndex
CREATE INDEX "TcoEstimate_systemId_idx" ON "TcoEstimate"("systemId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcurementWorkflow_projectId_key" ON "ProcurementWorkflow"("projectId");

-- CreateIndex
CREATE INDEX "WorkflowStage_workflowId_idx" ON "WorkflowStage"("workflowId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowStage_workflowId_stageNumber_key" ON "WorkflowStage"("workflowId", "stageNumber");

-- CreateIndex
CREATE INDEX "ShortlistEntry_projectId_idx" ON "ShortlistEntry"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ShortlistEntry_projectId_systemId_key" ON "ShortlistEntry"("projectId", "systemId");

-- CreateIndex
CREATE INDEX "ValueAnalysis_systemId_idx" ON "ValueAnalysis"("systemId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcurementJurisdiction_code_key" ON "ProcurementJurisdiction"("code");

-- CreateIndex
CREATE INDEX "ProcurementStage_projectId_idx" ON "ProcurementStage"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcurementStage_projectId_stageCode_key" ON "ProcurementStage"("projectId", "stageCode");

-- CreateIndex
CREATE INDEX "StageTask_stageId_idx" ON "StageTask"("stageId");

-- CreateIndex
CREATE INDEX "StageApproval_stageId_idx" ON "StageApproval"("stageId");

-- CreateIndex
CREATE INDEX "StageDocument_stageId_idx" ON "StageDocument"("stageId");

-- CreateIndex
CREATE INDEX "ProcurementEvaluation_projectId_idx" ON "ProcurementEvaluation"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcurementEvaluation_projectId_systemId_evaluatorId_key" ON "ProcurementEvaluation"("projectId", "systemId", "evaluatorId");

-- CreateIndex
CREATE INDEX "ComplianceCheck_projectId_idx" ON "ComplianceCheck"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorAccount_contactEmail_key" ON "VendorAccount"("contactEmail");

-- CreateIndex
CREATE UNIQUE INDEX "VendorAccount_systemId_key" ON "VendorAccount"("systemId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorUser_email_key" ON "VendorUser"("email");

-- CreateIndex
CREATE INDEX "VendorUser_vendorAccountId_idx" ON "VendorUser"("vendorAccountId");

-- CreateIndex
CREATE INDEX "VendorSubmission_vendorAccountId_idx" ON "VendorSubmission"("vendorAccountId");

-- CreateIndex
CREATE INDEX "VendorAnalytic_vendorAccountId_metric_period_idx" ON "VendorAnalytic"("vendorAccountId", "metric", "period");

-- CreateIndex
CREATE INDEX "EvaluationProject_institutionId_idx" ON "EvaluationProject"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationSystem_projectId_systemId_key" ON "EvaluationSystem"("projectId", "systemId");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationMember_projectId_userId_key" ON "EvaluationMember"("projectId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationDomainAssignment_projectId_familyId_key" ON "EvaluationDomainAssignment"("projectId", "familyId");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationDomainScore_assignmentId_systemId_capabilityId_key" ON "EvaluationDomainScore"("assignmentId", "systemId", "capabilityId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripePaymentId_key" ON "Payment"("stripePaymentId");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_institutionId_idx" ON "ApiKey"("institutionId");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HermCapability" ADD CONSTRAINT "HermCapability_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "HermFamily"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Score" ADD CONSTRAINT "Score_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "VendorSystem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Score" ADD CONSTRAINT "Score_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "HermCapability"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapabilityBasket" ADD CONSTRAINT "CapabilityBasket_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BasketItem" ADD CONSTRAINT "BasketItem_basketId_fkey" FOREIGN KEY ("basketId") REFERENCES "CapabilityBasket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BasketItem" ADD CONSTRAINT "BasketItem_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "HermCapability"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementProject" ADD CONSTRAINT "ProcurementProject_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorVersion" ADD CONSTRAINT "VendorVersion_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "VendorSystem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VersionScore" ADD CONSTRAINT "VersionScore_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "VendorVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VersionScore" ADD CONSTRAINT "VersionScore_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "HermCapability"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorProfile" ADD CONSTRAINT "VendorProfile_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "VendorSystem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TcoEstimate" ADD CONSTRAINT "TcoEstimate_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "VendorSystem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementWorkflow" ADD CONSTRAINT "ProcurementWorkflow_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ProcurementProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStage" ADD CONSTRAINT "WorkflowStage_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "ProcurementWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortlistEntry" ADD CONSTRAINT "ShortlistEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ProcurementProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortlistEntry" ADD CONSTRAINT "ShortlistEntry_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "VendorSystem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationAssessment" ADD CONSTRAINT "IntegrationAssessment_targetSystemId_fkey" FOREIGN KEY ("targetSystemId") REFERENCES "VendorSystem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchitectureAssessment" ADD CONSTRAINT "ArchitectureAssessment_targetSystemId_fkey" FOREIGN KEY ("targetSystemId") REFERENCES "VendorSystem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValueAnalysis" ADD CONSTRAINT "ValueAnalysis_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "VendorSystem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementStage" ADD CONSTRAINT "ProcurementStage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ProcurementProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageTask" ADD CONSTRAINT "StageTask_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "ProcurementStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageApproval" ADD CONSTRAINT "StageApproval_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "ProcurementStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageDocument" ADD CONSTRAINT "StageDocument_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "ProcurementStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementEvaluation" ADD CONSTRAINT "ProcurementEvaluation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ProcurementProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementEvaluation" ADD CONSTRAINT "ProcurementEvaluation_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "VendorSystem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceCheck" ADD CONSTRAINT "ComplianceCheck_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ProcurementProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorAccount" ADD CONSTRAINT "VendorAccount_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "VendorSystem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorUser" ADD CONSTRAINT "VendorUser_vendorAccountId_fkey" FOREIGN KEY ("vendorAccountId") REFERENCES "VendorAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorSubmission" ADD CONSTRAINT "VendorSubmission_vendorAccountId_fkey" FOREIGN KEY ("vendorAccountId") REFERENCES "VendorAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorAnalytic" ADD CONSTRAINT "VendorAnalytic_vendorAccountId_fkey" FOREIGN KEY ("vendorAccountId") REFERENCES "VendorAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationProject" ADD CONSTRAINT "EvaluationProject_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationSystem" ADD CONSTRAINT "EvaluationSystem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "EvaluationProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationSystem" ADD CONSTRAINT "EvaluationSystem_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "VendorSystem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationMember" ADD CONSTRAINT "EvaluationMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "EvaluationProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationMember" ADD CONSTRAINT "EvaluationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationDomainAssignment" ADD CONSTRAINT "EvaluationDomainAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "EvaluationProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationDomainAssignment" ADD CONSTRAINT "EvaluationDomainAssignment_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "HermFamily"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationDomainAssignment" ADD CONSTRAINT "EvaluationDomainAssignment_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationDomainScore" ADD CONSTRAINT "EvaluationDomainScore_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "EvaluationDomainAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
