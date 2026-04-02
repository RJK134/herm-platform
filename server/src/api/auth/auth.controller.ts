import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
import { registerSchema, loginSchema, updateProfileSchema } from './auth.schema';

const service = new AuthService();

export const register = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = registerSchema.parse(req.body);
    const result = await service.register(data);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = loginSchema.parse(req.body);
    const result = await service.login(data);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

export const me = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = await service.getMe(req.user!.userId);
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

export const updateProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { name } = updateProfileSchema.parse(req.body);
    if (!name) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'name is required' },
      });
      return;
    }
    const user = await service.updateProfile(req.user!.userId, name);
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

export const logout = (_req: Request, res: Response): void => {
  // Token invalidation is client-side only
  res.json({ success: true, data: { message: 'Logged out successfully' } });
};
