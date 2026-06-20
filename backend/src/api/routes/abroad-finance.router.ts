import { Router } from 'express';
import { AbroadFinanceController } from '../controllers/abroad-finance.controller';

const router = Router();

// GET /api/abroad/corridors - supported USDC→BRL corridors incl. Stellar
router.get('/corridors', (req, res) => AbroadFinanceController.getCorridors(req, res));

// POST /api/abroad/decode-pix - decode a PIX QR code payload
router.post('/decode-pix', (req, res) => AbroadFinanceController.decodePixQr(req, res));

// GET /api/abroad/quote?amount=100 - get USDC→BRL rate quote
router.get('/quote', (req, res) => AbroadFinanceController.getQuote(req, res));

export default router;
