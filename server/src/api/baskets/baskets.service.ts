import prisma from '../../utils/prisma';
import { NotFoundError, ValidationError } from '../../utils/errors';
import type { z } from 'zod';
import type { createBasketSchema, addItemSchema } from './baskets.schema';

type CreateBasketInput = z.infer<typeof createBasketSchema>;
type AddItemInput = z.infer<typeof addItemSchema>;

export class BasketsService {
  async createBasket(data: CreateBasketInput) {
    return prisma.capabilityBasket.create({
      data: {
        name: data.name,
        description: data.description,
        isTemplate: data.isTemplate ?? false,
        createdById: 'anonymous',
      },
      include: { items: { include: { capability: { include: { domain: true } } } } },
    });
  }

  async listBaskets() {
    return prisma.capabilityBasket.findMany({
      include: {
        items: {
          include: { capability: { include: { domain: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getBasketById(id: string) {
    const basket = await prisma.capabilityBasket.findUnique({
      where: { id },
      include: {
        items: {
          include: { capability: { include: { domain: true } } },
        },
      },
    });
    if (!basket) throw new NotFoundError(`Basket not found: ${id}`);
    return basket;
  }

  async addItem(basketId: string, data: AddItemInput) {
    const basket = await prisma.capabilityBasket.findUnique({ where: { id: basketId } });
    if (!basket) throw new NotFoundError(`Basket not found: ${basketId}`);

    // Lookup capability by code — scoped to basket's framework if set, else any framework
    const capability = await prisma.capability.findFirst({
      where: {
        code: data.capabilityCode,
        ...(basket.frameworkId ? { frameworkId: basket.frameworkId } : {}),
      },
    });
    if (!capability) throw new ValidationError(`Capability not found: ${data.capabilityCode}`);

    // Check if already in basket
    const existing = await prisma.basketItem.findUnique({
      where: { basketId_capabilityId: { basketId, capabilityId: capability.id } },
    });
    if (existing) throw new ValidationError('Capability already in basket');

    await prisma.basketItem.create({
      data: {
        basketId,
        capabilityId: capability.id,
        priority: data.priority,
        weight: data.weight,
        notes: data.notes,
      },
    });

    return this.getBasketById(basketId);
  }

  async removeItem(basketId: string, itemId: string) {
    const item = await prisma.basketItem.findFirst({
      where: { id: itemId, basketId },
    });
    if (!item) throw new NotFoundError(`Item not found: ${itemId}`);
    await prisma.basketItem.delete({ where: { id: itemId } });
  }

  async evaluateBasket(id: string) {
    const basket = await this.getBasketById(id);
    if (basket.items.length === 0) return [];

    const systems = await prisma.vendorSystem.findMany();
    const capabilityIds = basket.items.map(item => item.capabilityId);

    // Batch-load all relevant scores in a single query (avoids N+1).
    // Scope to the basket's framework — now that the same capability code
    // can exist in multiple frameworks, an unscoped findMany could return
    // scores belonging to a different framework and give a misleading
    // evaluation. If the basket has no framework pin (legacy baskets), fall
    // back to the capabilityId filter only.
    const allScores = await prisma.capabilityScore.findMany({
      where: {
        capabilityId: { in: capabilityIds },
        version: 1,
        ...(basket.frameworkId ? { frameworkId: basket.frameworkId } : {}),
      },
    });

    // Build map: systemId -> capabilityId -> value  (O(1) lookups below)
    const scoreIndex = new Map<string, Map<string, number>>();
    for (const s of allScores) {
      if (!scoreIndex.has(s.systemId)) scoreIndex.set(s.systemId, new Map());
      scoreIndex.get(s.systemId)!.set(s.capabilityId, s.value);
    }

    const results = systems.map((system) => {
      const systemScores = scoreIndex.get(system.id) ?? new Map<string, number>();

      let weightedScore = 0;
      let weightedMax = 0;

      for (const item of basket.items) {
        const score = systemScores.get(item.capabilityId) ?? 0;
        // Priority multiplier: must=3, should=2, could=1, wont=0
        const priorityMult = item.priority === 'must' ? 3 : item.priority === 'should' ? 2 : item.priority === 'could' ? 1 : 0;
        const effectiveWeight = item.weight * priorityMult;
        weightedScore += (score / 100) * effectiveWeight;
        weightedMax += effectiveWeight;
      }

      const percentage = weightedMax > 0 ? (weightedScore / weightedMax) * 100 : 0;

      return {
        system,
        score: weightedScore,
        maxScore: weightedMax,
        percentage,
        rank: 0,
      };
    });

    results.sort((a, b) => b.percentage - a.percentage);
    results.forEach((r, i) => { r.rank = i + 1; });

    return results;
  }
}
