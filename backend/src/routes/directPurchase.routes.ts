import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  getDirectPurchases,
  createDirectPurchase,
  postDirectPurchase,
  updateDirectPurchase,
  payDirectPurchase
} from '../controllers/directPurchase.controller';

const router = Router();

router.use(authMiddleware);

router.get('/', getDirectPurchases);
router.post('/', createDirectPurchase);
router.put('/:id', updateDirectPurchase);
router.post('/:id/post', postDirectPurchase);
router.post('/:id/pay', payDirectPurchase);

export default router;
