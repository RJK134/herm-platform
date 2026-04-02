import prisma from '../../utils/prisma';
import { NotFoundError } from '../../utils/errors';

export class ScoringService {
  async getMethodology() {
    const record = await prisma.scoringMethodology.findUnique({
      where: { category: 'scoring_model' },
    });
    if (!record) throw new NotFoundError('Scoring methodology not found');
    return record.content;
  }

  async getFaq() {
    const record = await prisma.scoringMethodology.findUnique({
      where: { category: 'faq' },
    });
    if (!record) throw new NotFoundError('FAQ not found');
    return record.content;
  }

  async getEvidenceTypes() {
    const record = await prisma.scoringMethodology.findUnique({
      where: { category: 'evidence_types' },
    });
    if (!record) throw new NotFoundError('Evidence types not found');
    return record.content;
  }

  async getReviewProcess() {
    const record = await prisma.scoringMethodology.findUnique({
      where: { category: 'review_process' },
    });
    if (!record) throw new NotFoundError('Review process not found');
    return record.content;
  }

  async getAll() {
    const records = await prisma.scoringMethodology.findMany({
      orderBy: { category: 'asc' },
    });
    return records;
  }
}
