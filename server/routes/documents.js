const express = require('express');
const path = require('path');
const fs = require('fs');
const { pool, addLog } = require('../db');
const { authMiddleware, adminOnly, getClientIp } = require('../middleware/auth');
const { createMulter } = require('../uploadConfig');
const { convertToPdfOnUpload } = require('../utils/convertToPdf');

const router = express.Router();
const upload = createMulter();

function optionalUpload(req, res, next) {
  if (req.headers['content-type'] && req.headers['content-type'].startsWith('multipart/form-data')) {
    return upload.array('files', 20)(req, res, next);
  }
  next();
}

function parseAttachments(row) {
  try { return typeof row.attachments_json === 'string' ? JSON.parse(row.attachments_json) : (row.attachments_json || []); } catch (e) { return []; }
}

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { keyword, status, page = 1, pageSize = 5 } = req.query;
    let sql = 'SELECT * FROM documents WHERE 1=1';
    const params = [];

    // Hide internal documents from non-admin, non-creator users
    if (req.user.role !== 'admin') {
      sql += ' AND (is_internal = 0 OR created_by = ?)';
      params.push(req.user.real_name);
    }
    if (keyword) { sql += ' AND (title LIKE ? OR doc_no LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }
    if (status) { sql += ' AND status = ?'; params.push(status); }

    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    const [[{ total }]] = await pool.query(countSql, params);

    sql += ' ORDER BY id DESC LIMIT ? OFFSET ?';
    params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));

    const [list] = await pool.query(sql, params);

    const enriched = [];
    for (const d of list) {
      const [[{ c }]] = await pool.query('SELECT COUNT(*) as c FROM field_works WHERE linked_doc_id = ?', [d.id]);
      const attachments = parseAttachments(d);
      enriched.push({ ...d, linkedWorks: c, attachments });
    }

    res.json({ list: enriched, total, page: Number(page), pageSize: Number(pageSize) });
  } catch (err) {
    console.error('Documents list error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.get('/dropdown', authMiddleware, async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      const [list] = await pool.query('SELECT id, doc_no, title FROM documents ORDER BY id DESC');
      return res.json(list);
    }
    const [list] = await pool.query(
      'SELECT id, doc_no, title FROM documents WHERE is_internal = 0 OR created_by = ? ORDER BY id DESC',
      [req.user.real_name]
    );
    res.json(list);
  } catch (err) {
    console.error('Documents dropdown error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const [[doc]] = await pool.query('SELECT * FROM documents WHERE id = ?', [req.params.id]);
    if (!doc) return res.status(404).json({ error: '文件不存在' });
    if (doc.is_internal && req.user.role !== 'admin' && doc.created_by !== req.user.real_name) {
      return res.status(404).json({ error: '文件不存在' });
    }

    const [linkedWorks] = await pool.query(
      'SELECT id, title, work_date, location, participants FROM field_works WHERE linked_doc_id = ?',
      [doc.id]
    );

    const attachments = parseAttachments(doc);
    res.json({ ...doc, linkedWorks, attachments });
  } catch (err) {
    console.error('Document detail error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.post('/', authMiddleware, optionalUpload, async (req, res) => {
  try {
    const { doc_no, title, send_unit, receive_date, status, implement_html, is_internal } = req.body;
    if (!doc_no || !title || !receive_date) return res.status(400).json({ error: '必填字段不能为空' });
    const internal = is_internal === true || is_internal === 'true' || is_internal === 1 || is_internal === '1' ? 1 : 0;

    const uploadDir = process.env.UPLOAD_DIR || 'uploads';
    const attachments = [];
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        const originalName = decodeFilename(file.originalname);
        const filePath = path.join(uploadDir, file.filename);
        const pdfResult = convertToPdfOnUpload(filePath, originalName);
        if (pdfResult) {
          attachments.push(pdfResult);
        } else {
          attachments.push({ name: originalName, path: file.filename, size: file.size, url: `/uploads/${file.filename}` });
        }
      });
    }

    const [result] = await pool.query(
      `INSERT INTO documents (doc_no, title, send_unit, receive_date, status, implement_html, attachments_json, is_internal, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [doc_no, title, send_unit || '', receive_date, status || 'pending', implement_html || '',
       attachments.length > 0 ? JSON.stringify(attachments) : null, internal, req.user.real_name]
    );

    await addLog(req.user.real_name, '新增', '收文落实', doc_no, getClientIp(req));
    res.json({ id: result.insertId, message: '添加成功' });
  } catch (err) {
    console.error('Document create error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.put('/:id', authMiddleware, optionalUpload, async (req, res) => {
  try {
    const [[doc]] = await pool.query('SELECT * FROM documents WHERE id = ?', [req.params.id]);
    if (!doc) return res.status(404).json({ error: '文件不存在' });

    const { doc_no, title, send_unit, receive_date, status, implement_html, is_internal, existing_attachments, removed_attachments } = req.body;

    // Parse existing attachments from client or fall back to DB
    let attachments = [];
    if (existing_attachments !== undefined) {
      try { attachments = JSON.parse(existing_attachments); } catch (e) {}
    } else {
      attachments = parseAttachments(doc);
    }

    // Delete removed files from disk
    let removed = [];
    try { removed = JSON.parse(removed_attachments || '[]'); } catch (e) {}
    removed.forEach(p => {
      try { fs.unlinkSync(path.join(process.env.UPLOAD_DIR || 'uploads', p)); } catch (e) {}
    });

    // Append newly uploaded files
    const uploadDir = process.env.UPLOAD_DIR || 'uploads';
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        const originalName = decodeFilename(file.originalname);
        const filePath = path.join(uploadDir, file.filename);
        const pdfResult = convertToPdfOnUpload(filePath, originalName);
        if (pdfResult) {
          attachments.push(pdfResult);
        } else {
          attachments.push({ name: originalName, path: file.filename, size: file.size, url: `/uploads/${file.filename}` });
        }
      });
    }

    const safe = (val, oldVal) => (val !== undefined && val !== '') ? val : oldVal;

    await pool.query(
      `UPDATE documents SET doc_no=?, title=?, send_unit=?, receive_date=?, status=?, implement_html=?, is_internal=?, attachments_json=? WHERE id=?`,
      [safe(doc_no, doc.doc_no), safe(title, doc.title), safe(send_unit, doc.send_unit), safe(receive_date, doc.receive_date),
       safe(status, doc.status), safe(implement_html, doc.implement_html),
       is_internal !== undefined ? (is_internal === true || is_internal === 'true' || is_internal === 1 || is_internal === '1' ? 1 : 0) : doc.is_internal,
       JSON.stringify(attachments), req.params.id]
    );

    await addLog(req.user.real_name, '编辑', '收文落实', doc_no || doc.doc_no, getClientIp(req));
    res.json({ message: '修改成功' });
  } catch (err) {
    console.error('Document update error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [[doc]] = await pool.query('SELECT * FROM documents WHERE id = ?', [req.params.id]);
    if (!doc) return res.status(404).json({ error: '文件不存在' });

    // Delete attachment files from disk
    const attachments = parseAttachments(doc);
    attachments.forEach(f => {
      if (f.path) {
        try { fs.unlinkSync(path.join(process.env.UPLOAD_DIR || 'uploads', f.path)); } catch (e) {}
      }
    });

    // Unlink related field works
    await pool.query('UPDATE field_works SET linked_doc_id = NULL WHERE linked_doc_id = ?', [req.params.id]);

    await pool.query('DELETE FROM documents WHERE id = ?', [req.params.id]);

    await addLog(req.user.real_name, '删除', '收文落实', doc.doc_no, getClientIp(req));
    res.json({ message: '删除成功' });
  } catch (err) {
    console.error('Document delete error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// Shared helper for CJK filename decoding
function decodeFilename(originalname) {
  try {
    const decoded = Buffer.from(originalname, 'latin1').toString('utf8');
    if (/[一-鿿㐀-䶿]/.test(decoded) && !decoded.includes('�')) {
      return decoded;
    }
  } catch(e) {}
  if (/[一-鿿㐀-䶿]/.test(originalname) && !originalname.includes('�')) {
    return originalname;
  }
  try {
    return Buffer.from(originalname, 'latin1').toString('utf8');
  } catch(e) {
    return originalname;
  }
}

module.exports = router;
