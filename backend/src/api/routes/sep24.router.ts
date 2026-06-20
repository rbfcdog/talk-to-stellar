import { Router } from 'express';
import { Sep24Controller } from '../controllers/sep24.controller';

const router = Router();

// ── Known anchors ────────────────────────────────────────────────────
router.get('/anchors', Sep24Controller.listAnchors);
router.get('/anchors/:domain/toml', Sep24Controller.fetchToml);
router.get('/anchors/:domain/info', Sep24Controller.getAnchorInfo);

// ── SEP-10 auth ──────────────────────────────────────────────────────
router.post('/auth', Sep24Controller.authenticate);

// ── SEP-24 interactive ───────────────────────────────────────────────
router.post('/deposit', Sep24Controller.startDeposit);
router.post('/withdraw', Sep24Controller.startWithdrawal);

// ── Transaction status ───────────────────────────────────────────────
router.get('/transactions', Sep24Controller.listTransactions);
router.get('/transactions/:id', Sep24Controller.getTransaction);

export default router;
