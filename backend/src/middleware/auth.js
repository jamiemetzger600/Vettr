import jwt from 'jsonwebtoken';
import { readAuthToken } from '../lib/authCookies.js';

export const authMiddleware = (req, res, next) => {
  try {
    const { token, source } = readAuthToken(req);

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.typ === 'mcp_access') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    req.user = decoded; // Contains { userId, email }
    req.authSource = source;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
};

export const optionalAuth = (req, res, next) => {
  try {
    const { token, source } = readAuthToken(req);

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded.typ === 'mcp_access') return next();
      req.user = decoded;
      req.authSource = source;
    }
    next();
  } catch (error) {
    next();
  }
};
