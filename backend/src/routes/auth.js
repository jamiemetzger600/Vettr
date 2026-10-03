import express from 'express';
import { register, login, logout, getCurrentUser, ensureSessionCookie, forgotPassword, resetPassword } from '../controllers/authController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/me', authMiddleware, getCurrentUser);
router.post('/session-cookie', authMiddleware, ensureSessionCookie);

export default router;
