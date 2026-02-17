import express from 'express';
import {
  getBankDropData,
  getBankDropDataByBatches,
  getBatchHistory,
  getCashDropById,
  updateCashDropDenominations,
  getBankDropSummary,
  markAsBankDropped
} from '../controllers/bankDropController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/', getBankDropData);
router.post('/by-batches', getBankDropDataByBatches);
router.get('/history', getBatchHistory);
router.get('/cash-drop/:id', getCashDropById);
router.put('/cash-drop/:id/denominations', updateCashDropDenominations);
router.post('/summary', getBankDropSummary);
router.post('/mark-dropped', markAsBankDropped);

export default router;
