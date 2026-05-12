const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'edu-archive-secret-key-2026';

function authMiddleware(req, res, next) {
  let token = null;

  // 1. Authorization header
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    token = header.slice(7);
  }

  // 2. Query parameter (for img/iframe requests that can't set headers)
  if (!token && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: '未登录' });
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: '登录已过期' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '无权限' });
  }
  next();
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || '127.0.0.1';
}

module.exports = { authMiddleware, adminOnly, getClientIp, JWT_SECRET };
