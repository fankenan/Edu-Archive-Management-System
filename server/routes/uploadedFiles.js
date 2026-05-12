const express = require('express');
const { pool, addLog } = require('../db');
const { authMiddleware, getClientIp } = require('../middleware/auth');
const { createMulter } = require('../uploadConfig');

const router = express.Router();
const upload = createMulter();

function decodeFilename(originalname) {
  try {
    const decoded = Buffer.from(originalname, 'latin1').toString('utf8');
    if (/[一-鿿㐀-䶿]/.test(decoded) && !decoded.includes('�')) return decoded;
  } catch(e) {}
  if (/[一-鿿㐀-䶿]/.test(originalname) && !originalname.includes('�')) return originalname;
  try { return Buffer.from(originalname, 'latin1').toString('utf8'); } catch(e) { return originalname; }
}

// List uploaded files with optional category filter
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { category_id, keyword, uploaded_by, page = 1, pageSize = 10 } = req.query;
    let sql = `SELECT uf.*, fc.name as category_name FROM uploaded_files uf
               LEFT JOIN file_categories fc ON uf.category_id = fc.id WHERE 1=1`;
    const params = [];

    if (req.user.role !== 'admin') {
      sql += ' AND (uf.is_internal = 0 OR uf.uploaded_by = ?)';
      params.push(req.user.real_name);
    }
    if (category_id) { sql += ' AND uf.category_id = ?'; params.push(Number(category_id)); }
    if (keyword) { sql += ' AND (uf.original_name LIKE ?)'; params.push(`%${keyword}%`); }
    if (uploaded_by) { sql += ' AND uf.uploaded_by = ?'; params.push(uploaded_by); }

    const countSql = sql.replace(/SELECT uf\.\*, fc\.name as category_name/, 'SELECT COUNT(*) as total');
    const [[{ total }]] = await pool.query(countSql, params);

    sql += ' ORDER BY uf.id DESC LIMIT ? OFFSET ?';
    params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));

    const [list] = await pool.query(sql, params);
    res.json({ list, total, page: Number(page), pageSize: Number(pageSize) });
  } catch (err) {
    console.error('Uploaded files list error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// Upload files
router.post('/', authMiddleware, upload.array('files', 20), async (req, res) => {
  try {
    const { category_id, is_internal } = req.body;
    if (!category_id) return res.status(400).json({ error: '请选择资料分类' });
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: '请选择文件' });
    const internal = is_internal === true || is_internal === 'true' || is_internal === 1 || is_internal === '1' ? 1 : 0;

    const results = [];
    for (const file of req.files) {
      const originalName = decodeFilename(file.originalname);
      const [result] = await pool.query(
        'INSERT INTO uploaded_files (category_id, filename, original_name, path, size, is_internal, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [Number(category_id), file.filename, originalName, file.filename, file.size, internal, req.user.real_name]
      );
      results.push({
        id: result.insertId,
        category_id: Number(category_id),
        filename: file.filename,
        original_name: originalName,
        size: file.size,
      });
    }

    await addLog(req.user.real_name, '上传', '资料上传', `上传了${results.length}个文件`, getClientIp(req));
    res.json({ files: results, message: `成功上传${results.length}个文件` });
  } catch (err) {
    console.error('File upload error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// Delete a file
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const [[file]] = await pool.query('SELECT * FROM uploaded_files WHERE id = ?', [req.params.id]);
    if (!file) return res.status(404).json({ error: '文件不存在' });

    // Only admin or the uploader can delete
    if (req.user.role !== 'admin' && file.uploaded_by !== req.user.real_name) {
      return res.status(403).json({ error: '无权限删除此文件' });
    }

    // Delete from disk
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(process.env.UPLOAD_DIR || 'uploads', file.filename);
    try { fs.unlinkSync(filePath); } catch(e) {}

    await pool.query('DELETE FROM uploaded_files WHERE id=?', [req.params.id]);
    await addLog(req.user.real_name, '删除', '资料上传', file.original_name, getClientIp(req));
    res.json({ message: '删除成功' });
  } catch (err) {
    console.error('File delete error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// Download a file (with auth check)
router.get('/download/:id', authMiddleware, async (req, res) => {
  try {
    const [[file]] = await pool.query('SELECT * FROM uploaded_files WHERE id = ?', [req.params.id]);
    if (!file) return res.status(404).json({ error: '文件不存在' });
    if (file.is_internal && req.user.role !== 'admin' && file.uploaded_by !== req.user.real_name) {
      return res.status(404).json({ error: '文件不存在' });
    }

    const path = require('path');
    const filePath = path.join(process.env.UPLOAD_DIR || 'uploads', file.filename);
    const fs = require('fs');
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: '文件不存在' });

    res.download(filePath, file.original_name);
  } catch (err) {
    console.error('File download error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

module.exports = router;
