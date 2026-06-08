import { Router, Request, Response, NextFunction } from 'express';
import EvolutionController from '../controllers/evolution.controller';
import { logger, truncate } from '../../utils/logger';

const router = Router();

router.use((req: Request, _res: Response, next: NextFunction) => {
  const bodySize = JSON.stringify(req.body || {}).length;
  logger.info(`[evolution-router] request method=${req.method} path=${truncate(req.path, 80)} content_type=${truncate(String(req.get('content-type') || '?'), 40)} body_bytes=${bodySize} ip=${req.ip || '?'}`);
  next();
});

router.get('/', EvolutionController.ping);
router.get('/health', EvolutionController.health);
router.post('/echo', EvolutionController.echo);
router.post('/', EvolutionController.webhook);
router.post('/test-send', EvolutionController.testSend);
router.post('/test-notify', EvolutionController.testNotify);
router.post('/outbox/drain', EvolutionController.drainOutbox);
router.post('/inbox/drain', EvolutionController.drainInbox);
router.get('/webhook', EvolutionController.ping);
router.get('/webhook/health', EvolutionController.health);
router.post('/webhook/echo', EvolutionController.echo);
router.post('/webhook', EvolutionController.webhook);
router.post('/webhook/:event', EvolutionController.webhook);
router.post('/:event', EvolutionController.webhook);

export default router;
