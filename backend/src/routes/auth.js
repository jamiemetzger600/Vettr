import express from 'express';
import { register, login, logout, getCurrentUser, forgotPassword, resetPassword } from '../controllers/authController.js';
import { authMiddleware } from '../middleware/auth.js';
import {
  registerRateLimiter,
  loginRateLimiter,
  forgotPasswordRateLimiter,
  resetPasswordRateLimiter
} from '../middleware/authRateLimit.js';

const router = express.Router();

router.post('/register', registerRateLimiter, register);
router.post('/login', loginRateLimiter, login);
router.post('/logout', logout);
router.post('/forgot-password', forgotPasswordRateLimiter, forgotPassword);
router.post('/reset-password', resetPasswordRateLimiter, resetPassword);
router.get('/me', authMiddleware, getCurrentUser);

export default router;
