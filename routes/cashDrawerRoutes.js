import express from 'express';
import {
  createCashDrawer,
  getCashDrawers
} from '../controllers/cashDrawerController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

router.post('/', createCashDrawer);
router.get('/', getCashDrawers);

export default router;
