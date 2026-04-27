import { Router } from 'express';
import { authenticateJWT } from '../../middleware/auth';
import { createCheckout, stripeWebhook, getStatus, cancelSub, getInvoices } from './subscriptions.controller';

const router = Router();

// Stripe webhook stays public (signature is the auth, not JWT). The raw-body
// parser is registered at the app level — `app.use('/api/subscriptions/webhook',
// express.raw(...))` runs BEFORE the global `express.json()` so this handler
// receives an unparsed Buffer that Stripe.webhooks.constructEvent can verify.
router.post('/webhook', stripeWebhook);

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
