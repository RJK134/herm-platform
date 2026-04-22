import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // 'unsafe-inline' and 'unsafe-eval' removed — XSS protection requires strict CSP.
      // The Vite React frontend injects styles via CSS-in-JS at build time, so no inline
      // scripts are needed at runtime from the API layer. If admin UI adds inline styles
      // later, use a nonce instead of re-enabling 'unsafe-inline'.
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'ws:', 'wss:'],
      fontSrc: ["'self'", 'data:', 'https:'],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many authentication attempts. Please try again in 15 minutes.' } },
  standardHeaders: true,
  legacyHeaders: false,
});

export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded. Please slow down.' } },
  standardHeaders: true,
  legacyHeaders: false,
});

export const exportRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Export rate limit exceeded.' } },
  standardHeaders: true,
  legacyHeaders: false,
});

export const vendorPortalRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Vendor portal rate limit exceeded. Please slow down.' } },
  standardHeaders: true,
  legacyHeaders: false,
});
