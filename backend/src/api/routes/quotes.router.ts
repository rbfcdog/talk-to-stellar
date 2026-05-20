import { Router } from 'express';
import { QuotesController } from '../controllers/quotes.controller';

const router = Router();

router.post('/brl-usd', QuotesController.createBrlUsdQuote);

export default router;
