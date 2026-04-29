import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { InstitutionsService } from './institutions.service';
import { audit } from '../../lib/audit';

const service = new InstitutionsService();

const updateInstitutionSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  logoUrl: z.string().url().optional().or(z.literal('')),
  domain: z.string().optional(),
});

const updateRoleSchema = z.object({
  role: z.enum([
    'INSTITUTION_ADMIN',
    'PROCUREMENT_LEAD',
    'EVALUATOR',
    'VENDOR_ADMIN',
    'VENDOR_CONTRIBUTOR',
    'VIEWER',
  ]),
});

export const getMyInstitution = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = await service.getMyInstitution(req.user!.institutionId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const updateMyInstitution = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = updateInstitutionSchema.parse(req.body);
    const institution = await service.updateInstitution(req.user!.institutionId, data);
    res.json({ success: true, data: institution });
  } catch (err) {
    next(err);
  }
};

export const listUsers = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const users = await service.listUsers(req.user!.institutionId);
    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
};

export const updateUserRole = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { role } = updateRoleSchema.parse(req.body);
    const targetUserId = req.params['userId'] as string;
    const user = await service.updateUserRole(
      req.user!.institutionId,
      targetUserId,
      role,
      req.user!.userId
    );
    await audit(req, {
      action: 'institutions.role.change',
      entityType: 'User',
      entityId: targetUserId,
      userId: req.user!.userId,
      changes: { newRole: role, institutionId: req.user!.institutionId },
    });
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};
