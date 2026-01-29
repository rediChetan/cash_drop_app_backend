import express from 'express';
import {
  login,
  getCurrentUser,
  getUsers,
  createUser,
  getUserById,
  updateUser,
  deleteUser,
  logout,
  refreshToken,
  getUserCount
} from '../controllers/authController.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { User } from '../models/authModel.js';

const router = express.Router();

router.get('/user-count/', getUserCount); // Public endpoint to check if users exist
router.post('/login', login);
router.post('/logout', authenticateToken, logout);
router.post('/token/refresh', refreshToken);
router.get('/users/me', authenticateToken, getCurrentUser);
router.get('/users', authenticateToken, requireAdmin, getUsers);
// Allow user creation without auth if no users exist (for first admin)
router.post('/users', async (req, res, next) => {
  try {
    const count = await User.count();
    if (count === 0) {
      // No users exist, allow creation without auth
      return createUser(req, res);
    } else {
      // Users exist, require auth
      return authenticateToken(req, res, () => {
        requireAdmin(req, res, () => createUser(req, res));
      });
    }
  } catch (error) {
    console.error('Error checking user count:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
router.get('/users/:id', authenticateToken, requireAdmin, getUserById);
router.put('/users/:id', authenticateToken, requireAdmin, updateUser);
router.delete('/users/:id', authenticateToken, requireAdmin, deleteUser);

export default router;
