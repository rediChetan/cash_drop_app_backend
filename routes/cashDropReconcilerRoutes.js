import express from 'express';
import {
  getCashDropReconcilers,
  updateCashDropReconciler,
  createCashDropReconciler
} from '../controllers/cashDropReconcilerController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/', getCashDropReconcilers);
router.patch('/', updateCashDropReconciler);
router.post('/', createCashDropReconciler);

export default router;
