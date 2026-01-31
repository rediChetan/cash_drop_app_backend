import express from 'express';
import { getAdminSettings, updateAdminSettings } from '../controllers/adminSettingsController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get admin settings (public for cash drop page to get workstations/shifts)
router.get('/', getAdminSettings);

// Update admin settings (admin only)
router.put('/', authenticateToken, (req, res, next) => {
  if (!req.user.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}, updateAdminSettings);

export default router;
