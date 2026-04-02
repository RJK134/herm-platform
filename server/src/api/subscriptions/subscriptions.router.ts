import express, { Router } from 'express';
import { optionalJWT } from '../../middleware/auth';
import { createCheckout, stripeWebhook, getStatus, cancelSub, getInvoices } from './subscriptions.controller';

const router = Router();

// Stripe webhook needs raw body — must be registered BEFORE express.json() parsing
router.post('/webhook', express.raw({ type: 'application/json' }), stripeWebhook);

router.use(optionalJWT);
router.post('/checkout', createCheckout);
router.get('/status', getStatus);
router.post('/cancel', cancelSub);
router.get('/invoices', getInvoices);

export default router;
