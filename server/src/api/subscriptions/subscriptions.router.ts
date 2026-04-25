import express, { Router } from 'express';
import { authenticateJWT } from '../../middleware/auth';
import { createCheckout, stripeWebhook, getStatus, cancelSub, getInvoices } from './subscriptions.controller';

const router = Router();

// Stripe webhook needs raw body — must be registered BEFORE express.json() parsing.
// Webhook authenticity is enforced by Stripe signature verification in
// stripeService.handleWebhook, not by JWT. Keep it before the auth gate below.
router.post('/webhook', express.raw({ type: 'application/json' }), stripeWebhook);

// All other subscription endpoints are tenant-scoped billing surfaces and
// must require a real JWT. Previously this router used `optionalJWT`, which
// allowed anonymous callers to invoke `/checkout` (creating orphan Stripe
// sessions with no institutionId) and to probe `/status` / `/invoices` for
// the response shape. See HERM_COMPLIANCE.md "Authenticated (any tier)".
router.use(authenticateJWT);
router.post('/checkout', createCheckout);
router.get('/status', getStatus);
router.post('/cancel', cancelSub);
router.get('/invoices', getInvoices);

export default router;
