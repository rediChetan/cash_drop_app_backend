import express from 'express';
import { getDriveImage } from '../controllers/driveImageController.js';

const router = express.Router();

// GET /api/drive-image?id=FILE_ID - no auth so <img src> works from frontend
router.get('/', getDriveImage);

export default router;
