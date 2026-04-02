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
      include: { items: { include: { capability: { include: { family: true } } } } },
    });
  }

  async listBaskets() {
    return prisma.capabilityBasket.findMany({
      include: {
        items: {
          include: { capability: { include: { family: true } } },
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
          include: { capability: { include: { family: true } } },
        },
      },
    });
    if (!basket) throw new NotFoundError(`Basket not found: ${id}`);
    return basket;
  }

  async addItem(basketId: string, data: AddItemInput) {
    const basket = await prisma.capabilityBasket.findUnique({ where: { id: basketId } });
    if (!basket) throw new NotFoundError(`Basket not found: ${basketId}`);

    const capability = await prisma.hermCapability.findUnique({
      where: { code: data.capabilityCode },
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

    const results = await Promise.all(
      systems.map(async (system) => {
        const capabilityIds = basket.items.map(item => item.capabilityId);
        const scores = await prisma.score.findMany({
          where: {
            systemId: system.id,
            capabilityId: { in: capabilityIds },
            version: 1,
          },
        });

        const scoreMap: Record<string, number> = {};
        for (const s of scores) {
          scoreMap[s.capabilityId] = s.value;
        }

        let weightedScore = 0;
        let weightedMax = 0;

        for (const item of basket.items) {
          const score = scoreMap[item.capabilityId] ?? 0;
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
      })
    );

    results.sort((a, b) => b.percentage - a.percentage);
    results.forEach((r, i) => { r.rank = i + 1; });

    return results;
  }
}
