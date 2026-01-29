import express from 'express';
import multer from 'multer';
import {
  createCashDrop,
  getCashDrops
} from '../controllers/cashDropController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

router.use(authenticateToken);

router.post('/', upload.single('label_image'), createCashDrop);
router.get('/', getCashDrops);

export default router;
