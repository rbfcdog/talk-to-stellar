import { Router } from 'express';
import { ReflectorController } from '../controllers/reflector.controller';
const router = Router();
router.get('/price/:asset', ReflectorController.getPrice);
router.get('/prices', ReflectorController.getPrices);
router.get('/rates', ReflectorController.getRates);
export default router;
