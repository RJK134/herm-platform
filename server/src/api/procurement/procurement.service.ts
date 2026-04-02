import { PrismaClient } from '@prisma/client';
import type {
  CreateProjectInput,
  UpdateProjectInput,
  UpdateStageInput,
  AddShortlistEntryInput,
  UpdateShortlistEntryInput,
} from './procurement.schema';

const prisma = new PrismaClient();

const WORKFLOW_STAGES = [
  { stageNumber: 1, title: 'Requirements Definition', status: 'active' },
  { stageNumber: 2, title: 'Market Engagement', status: 'pending' },
  { stageNumber: 3, title: 'Long List', status: 'pending' },
  { stageNumber: 4, title: 'Short List', status: 'pending' },
  { stageNumber: 5, title: 'ITT / RFP Issuance', status: 'pending' },
  { stageNumber: 6, title: 'Evaluation & Scoring', status: 'pending' },
  { stageNumber: 7, title: 'Preferred Supplier', status: 'pending' },
  { stageNumber: 8, title: 'Contract Award', status: 'pending' },
] as const;

// Default institution for demo use (created on-demand)
const DEFAULT_INSTITUTION_ID = 'default';

async function ensureDefaultInstitution(): Promise<string> {
  const existing = await prisma.institution.findFirst({
    where: { slug: 'default' },
  });
  if (existing) return existing.id;

  const created = await prisma.institution.create({
    data: {
      name: 'Default Institution',
      slug: 'default',
      country: 'UK',
      tier: 'free',
    },
  });
  return created.id;
}

export class ProcurementService {
  async createProject(data: CreateProjectInput) {
    const institutionId = data.institutionId ?? (await ensureDefaultInstitution());

    return prisma.$transaction(async (tx) => {
      const project = await tx.procurementProject.create({
        data: {
          name: data.name,
          institutionId,
          jurisdiction: data.jurisdiction ?? 'UK',
          basketId: data.basketId ?? null,
          status: 'active',
        },
      });

      await tx.procurementWorkflow.create({
        data: {
          projectId: project.id,
          currentStage: 1,
          stages: {
            create: WORKFLOW_STAGES.map((s) => ({
              stageNumber: s.stageNumber,
              title: s.title,
              status: s.status,
            })),
          },
        },
      });

      return project;
    });
  }

  async listProjects() {
    return prisma.procurementProject.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        workflow: { select: { currentStage: true } },
        _count: { select: { shortlist: true } },
      },
    });
  }

  async getProject(id: string) {
    return prisma.procurementProject.findUnique({
      where: { id },
      include: {
        workflow: {
          include: {
            stages: { orderBy: { stageNumber: 'asc' } },
          },
        },
        shortlist: {
          include: {
            system: { select: { id: true, name: true, vendor: true, category: true } },
          },
          orderBy: { addedAt: 'asc' },
        },
      },
    });
  }

  async updateProject(id: string, data: UpdateProjectInput) {
    return prisma.procurementProject.update({
      where: { id },
      data,
    });
  }

  async deleteProject(id: string) {
    return prisma.procurementProject.delete({ where: { id } });
  }

  async getWorkflow(projectId: string) {
    return prisma.procurementWorkflow.findUnique({
      where: { projectId },
      include: { stages: { orderBy: { stageNumber: 'asc' } } },
    });
  }

  async updateStage(projectId: string, stageNum: number, data: UpdateStageInput) {
    const workflow = await prisma.procurementWorkflow.findUnique({
      where: { projectId },
    });
    if (!workflow) throw new Error('Workflow not found');

    const updateData: {
      status?: string;
      notes?: string;
      outputs?: import('@prisma/client').Prisma.InputJsonValue;
      completedAt?: Date;
    } = {};
    if (data.status !== undefined) updateData.status = data.status;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.outputs !== undefined) {
      updateData.outputs = data.outputs as import('@prisma/client').Prisma.InputJsonValue;
    }
    if (data.status === 'complete') updateData.completedAt = new Date();

    return prisma.workflowStage.update({
      where: {
        workflowId_stageNumber: {
          workflowId: workflow.id,
          stageNumber: stageNum,
        },
      },
      data: updateData,
    });
  }

  async advanceWorkflow(projectId: string) {
    const workflow = await prisma.procurementWorkflow.findUnique({
      where: { projectId },
      include: { stages: true },
    });
    if (!workflow) throw new Error('Workflow not found');

    const currentStage = workflow.currentStage;
    if (currentStage >= 8) {
      throw new Error('Workflow is already at the final stage');
    }

    const nextStage = currentStage + 1;

    return prisma.$transaction(async (tx) => {
      // Mark current stage as complete
      await tx.workflowStage.update({
        where: {
          workflowId_stageNumber: {
            workflowId: workflow.id,
            stageNumber: currentStage,
          },
        },
        data: { status: 'complete', completedAt: new Date() },
      });

      // Activate next stage
      await tx.workflowStage.update({
        where: {
          workflowId_stageNumber: {
            workflowId: workflow.id,
            stageNumber: nextStage,
          },
        },
        data: { status: 'active' },
      });

      // Update workflow current stage
      return tx.procurementWorkflow.update({
        where: { id: workflow.id },
        data: { currentStage: nextStage },
        include: { stages: { orderBy: { stageNumber: 'asc' } } },
      });
    });
  }

  async addShortlistEntry(projectId: string, data: AddShortlistEntryInput) {
    return prisma.shortlistEntry.create({
      data: {
        projectId,
        systemId: data.systemId,
        status: data.status ?? 'longlist',
        notes: data.notes ?? null,
        score: data.score ?? null,
      },
      include: {
        system: { select: { id: true, name: true, vendor: true, category: true } },
      },
    });
  }

  async getShortlist(projectId: string) {
    return prisma.shortlistEntry.findMany({
      where: { projectId },
      include: {
        system: { select: { id: true, name: true, vendor: true, category: true } },
      },
      orderBy: { addedAt: 'asc' },
    });
  }

  async updateShortlistEntry(entryId: string, data: UpdateShortlistEntryInput) {
    return prisma.shortlistEntry.update({
      where: { id: entryId },
      data,
      include: {
        system: { select: { id: true, name: true, vendor: true, category: true } },
      },
    });
  }

  async removeShortlistEntry(entryId: string) {
    return prisma.shortlistEntry.delete({ where: { id: entryId } });
  }
}
