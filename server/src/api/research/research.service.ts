import prisma from '../../utils/prisma';
import { NotFoundError } from '../../utils/errors';

interface ListParams {
  publisher?: string;
  category?: string;
  year?: number;
  tags?: string;
  limit?: number;
  offset?: number;
}

interface ResearchItemInput {
  title: string;
  publisher: string;
  year: number;
  category: string;
  tags?: string[];
  summary?: string;
  url?: string;
  relevantSystems?: string[];
}

export class ResearchService {
  async list(params: ListParams) {
    const where: Record<string, unknown> = {};

    if (params.publisher) {
      where['publisher'] = { contains: params.publisher, mode: 'insensitive' };
    }
    if (params.category) {
      where['category'] = { equals: params.category };
    }
    if (params.year) {
      where['year'] = Number(params.year);
    }
    if (params.tags) {
      const tagList = params.tags.split(',').map((t) => t.trim()).filter(Boolean);
      where['tags'] = { hasSome: tagList };
    }

    return prisma.researchItem.findMany({
      where,
      orderBy: [{ year: 'desc' }, { title: 'asc' }],
      take: Math.min(params.limit ?? 200, 200),
      skip: params.offset ?? 0,
    });
  }

  async getById(id: string) {
    const item = await prisma.researchItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundError(`Research item not found: ${id}`);
    return item;
  }

  async create(data: ResearchItemInput) {
    return prisma.researchItem.create({
      data: {
        title: data.title,
        publisher: data.publisher,
        year: data.year,
        category: data.category,
        tags: data.tags ?? [],
        summary: data.summary ?? null,
        url: data.url ?? null,
        relevantSystems: data.relevantSystems ?? [],
      },
    });
  }

  async update(id: string, data: Partial<ResearchItemInput>) {
    const existing = await prisma.researchItem.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError(`Research item not found: ${id}`);

    return prisma.researchItem.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.publisher !== undefined && { publisher: data.publisher }),
        ...(data.year !== undefined && { year: data.year }),
        ...(data.category !== undefined && { category: data.category }),
        ...(data.tags !== undefined && { tags: data.tags }),
        ...(data.summary !== undefined && { summary: data.summary }),
        ...(data.url !== undefined && { url: data.url }),
        ...(data.relevantSystems !== undefined && { relevantSystems: data.relevantSystems }),
      },
    });
  }

  async remove(id: string) {
    const existing = await prisma.researchItem.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError(`Research item not found: ${id}`);
    await prisma.researchItem.delete({ where: { id } });
    return { deleted: true };
  }
}
