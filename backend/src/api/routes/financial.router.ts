import { Router } from 'express';
import { FinancialController } from '../controllers/financial.controller';

const router = Router();

router.get('/conversion-preview', FinancialController.getConversionPreview);
router.get('/conversion-fees-preview', FinancialController.getConversionFeesPreview);

router.get('/activity-feed/:session_id', FinancialController.getActivityFeed);
router.get('/insights/:session_id', FinancialController.getInsights);
router.get('/smart-contacts/:session_id', FinancialController.getSmartContacts);
router.get('/replay/:session_id', FinancialController.getReplayCandidate);
router.get('/savings/:session_id', FinancialController.getSavings);

router.post('/invoices', FinancialController.createInvoice);
router.get('/invoices/:session_id', FinancialController.listInvoices);

router.post('/global-profile', FinancialController.getOrCreateGlobalProfile);
router.get('/global-profile/:session_id', FinancialController.getOrCreateGlobalProfile);
router.post('/u/:username/pay', FinancialController.createPublicGlobalProfilePayment);
router.get('/u/:username', FinancialController.getPublicGlobalProfile);
router.get('/transactions/:session_id', FinancialController.getTransactions);
router.get('/wallet-profile/:public_key', FinancialController.getWalletProfile);

export default router;
