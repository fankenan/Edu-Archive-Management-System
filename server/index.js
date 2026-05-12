require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { initDB } = require('./db');

// Route modules
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const documentRoutes = require('./routes/documents');
const fieldWorkRoutes = require('./routes/fieldWorks');
const adminRoutes = require('./routes/admin');
const uploadedFileRoutes = require('./routes/uploadedFiles');

const app = express();
const PORT = parseInt(process.env.PORT || '4000');
const UPLOADS_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');

// ============ Security Middleware ============
app.use(helmet({
  contentSecurityPolicy: false, // CSP managed by frontend
  crossOriginEmbedderPolicy: false,
}));

// CORS - restrict in production
const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use(cors({ origin: corsOrigin, credentials: true }));

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: '登录尝试过于频繁，请15分钟后再试' },
});
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
});

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static uploads - protected by auth middleware for security
const { authMiddleware } = require('./middleware/auth');
app.use('/uploads', authMiddleware, express.static(UPLOADS_DIR));

// ============ Routes ============
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/dashboard', apiLimiter, dashboardRoutes);
app.use('/api/documents', apiLimiter, documentRoutes);
app.use('/api/field-works', apiLimiter, fieldWorkRoutes);
app.use('/api', adminRoutes);
app.use('/api/uploaded-files', apiLimiter, uploadedFileRoutes);

const convertRoutes = require('./routes/convert');
app.use('/api/convert', apiLimiter, convertRoutes);

// ============ Health Check ============
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ============ Global Error Handler ============
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);

  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: '请求体过大' });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: '文件大小超过限制(50MB)' });
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: '上传文件字段不正确' });
  }

  res.status(500).json({ error: '服务器内部错误' });
});

// ============ Start ============
async function start() {
  try {
    await initDB();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[Server] Education Archive API running on http://0.0.0.0:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[Server] Shutting down gracefully...');
  process.exit(0);
});
process.on('SIGTERM', async () => {
  console.log('\n[Server] Shutting down gracefully...');
  process.exit(0);
});

start();
