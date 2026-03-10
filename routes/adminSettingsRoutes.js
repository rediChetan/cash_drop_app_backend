import express from 'express';
import { getAdminSettings, updateAdminSettings, getCashDropCalendar } from '../controllers/adminSettingsController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get admin settings (public for cash drop page to get workstations/shifts)
router.get('/', getAdminSettings);

// Cash drop calendar for a month (green/red/blue) - public so cash drop page can show it
router.get('/cash-drop-calendar', getCashDropCalendar);

// Update admin settings (admin only)
router.put('/', authenticateToken, (req, res, next) => {
  if (!req.user.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}, updateAdminSettings);

export default router;
