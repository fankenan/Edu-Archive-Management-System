const express = require('express');
const path = require('path');
const { pool, addLog } = require('../db');
const { authMiddleware, adminOnly, getClientIp } = require('../middleware/auth');
const { createMulter } = require('../uploadConfig');
const { convertToPdfOnUpload } = require('../utils/convertToPdf');

const router = express.Router();
const upload = createMulter();

// Conditional multer: only parse files when Content-Type is multipart
function optionalUpload(req, res, next) {
  if (req.headers['content-type'] && req.headers['content-type'].startsWith('multipart/form-data')) {
    return upload.array('files', 20)(req, res, next);
  }
  next();
}

function decodeFilename(originalname) {
  try {
    const decoded = Buffer.from(originalname, 'latin1').toString('utf8');
    if (/[一-鿿㐀-䶿]/.test(decoded) && !decoded.includes('�')) return decoded;
  } catch(e) {}
  if (/[一-鿿㐀-䶿]/.test(originalname) && !originalname.includes('�')) return originalname;
  try { return Buffer.from(originalname, 'latin1').toString('utf8'); } catch(e) { return originalname; }
}

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { keyword, type, page = 1, pageSize = 5 } = req.query;
    let sql = 'SELECT * FROM field_works WHERE 1=1';
    const params = [];

    if (req.user.role !== 'admin') {
      sql += ' AND (is_internal = 0 OR created_by = ?)';
      params.push(req.user.real_name);
    }
    if (keyword) { sql += ' AND (title LIKE ? OR location LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }
    if (type) { sql += ' AND type = ?'; params.push(type); }

    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    const [[{ total }]] = await pool.query(countSql, params);

    sql += ' ORDER BY id DESC LIMIT ? OFFSET ?';
    params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));

    const [list] = await pool.query(sql, params);

    const enriched = [];
    for (const w of list) {
      let linked_doc = null;
      if (w.linked_doc_id) {
        const [[doc]] = await pool.query('SELECT id, doc_no, title FROM documents WHERE id = ?', [w.linked_doc_id]);
        linked_doc = doc || null;
      }
      enriched.push({ ...w, linked_doc });
    }

    res.json({ list: enriched, total, page: Number(page), pageSize: Number(pageSize) });
  } catch (err) {
    console.error('Field works list error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const [[work]] = await pool.query('SELECT * FROM field_works WHERE id = ?', [req.params.id]);
    if (!work) return res.status(404).json({ error: '记录不存在' });
    if (work.is_internal && req.user.role !== 'admin' && work.created_by !== req.user.real_name) {
      return res.status(404).json({ error: '记录不存在' });
    }

    let linked_doc = null;
    if (work.linked_doc_id) {
      const [[doc]] = await pool.query('SELECT id, doc_no, title FROM documents WHERE id = ?', [work.linked_doc_id]);
      linked_doc = doc || null;
    }

    let photos = [], attachments = [];
    try { photos = typeof work.photos_json === 'string' ? JSON.parse(work.photos_json) : (work.photos_json || []); } catch(e) {}
    try { attachments = typeof work.attachments_json === 'string' ? JSON.parse(work.attachments_json) : (work.attachments_json || []); } catch(e) {}

    res.json({ ...work, linked_doc, photos, attachments });
  } catch (err) {
    console.error('Field work detail error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.post('/', authMiddleware, optionalUpload, async (req, res) => {
  try {
    const { type, title, location, work_date, participants, linked_doc_id, description_html, conclusion_html, status, is_internal } = req.body;
    if (!type || !title || !work_date) return res.status(400).json({ error: '必填字段不能为空' });
    const internal = is_internal === true || is_internal === 'true' || is_internal === 1 || is_internal === '1' ? 1 : 0;

    const uploadDir = process.env.UPLOAD_DIR || 'uploads';
    const photos = [], attachments = [];
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        const originalName = decodeFilename(file.originalname);
        if (file.mimetype && file.mimetype.startsWith('image/')) {
          photos.push({ name: originalName, path: file.filename, url: `/uploads/${file.filename}` });
        } else {
          const filePath = path.join(uploadDir, file.filename);
          const pdfResult = convertToPdfOnUpload(filePath, originalName);
          if (pdfResult) {
            attachments.push(pdfResult);
          } else {
            attachments.push({ name: originalName, path: file.filename, url: `/uploads/${file.filename}` });
          }
        }
      });
    }

    const [result] = await pool.query(
      `INSERT INTO field_works (type, title, location, work_date, participants, status, is_internal, linked_doc_id, description_html, conclusion_html, photos_json, attachments_json, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [type, title, location || '', work_date, participants || '', status || 'completed', internal,
       linked_doc_id || null, description_html || '', conclusion_html || '',
       JSON.stringify(photos), JSON.stringify(attachments), req.user.real_name]
    );

    await addLog(req.user.real_name, '新增', '现场工作', title, getClientIp(req));
    res.json({ id: result.insertId, message: '添加成功' });
  } catch (err) {
    console.error('Field work create error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.put('/:id', authMiddleware, optionalUpload, async (req, res) => {
  try {
    const [[work]] = await pool.query('SELECT * FROM field_works WHERE id = ?', [req.params.id]);
    if (!work) return res.status(404).json({ error: '记录不存在' });

    const { type, title, location, work_date, participants, linked_doc_id, description_html, conclusion_html, status, is_internal, existing_photos, existing_attachments, removed_photos, removed_attachments } = req.body;

    // Use client-provided existing files (after removal edits) or parse from DB
    let photos = [], attachments = [];
    if (existing_photos !== undefined) {
      try { photos = JSON.parse(existing_photos); } catch(e) {}
    } else {
      try { photos = typeof work.photos_json === 'string' ? JSON.parse(work.photos_json) : (work.photos_json || []); } catch(e) {}
    }
    if (existing_attachments !== undefined) {
      try { attachments = JSON.parse(existing_attachments); } catch(e) {}
    } else {
      try { attachments = typeof work.attachments_json === 'string' ? JSON.parse(work.attachments_json) : (work.attachments_json || []); } catch(e) {}
    }

    // Delete removed files from disk
    const fs = require('fs');
    const uploadDir = process.env.UPLOAD_DIR || 'uploads';

    let removedP = [], removedA = [];
    try { removedP = JSON.parse(removed_photos || '[]'); } catch(e) {}
    try { removedA = JSON.parse(removed_attachments || '[]'); } catch(e) {}
    [...removedP, ...removedA].forEach(p => {
      try { fs.unlinkSync(path.join(uploadDir, p)); } catch(e) {}
    });

    // Append newly uploaded files (Word/Excel → PDF at upload time)
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        const originalName = decodeFilename(file.originalname);
        if (file.mimetype && file.mimetype.startsWith('image/')) {
          photos.push({ name: originalName, path: file.filename, url: `/uploads/${file.filename}` });
        } else {
          const filePath = path.join(uploadDir, file.filename);
          const pdfResult = convertToPdfOnUpload(filePath, originalName);
          if (pdfResult) {
            attachments.push(pdfResult);
          } else {
            attachments.push({ name: originalName, path: file.filename, url: `/uploads/${file.filename}` });
          }
        }
      });
    }

    const safe = (val, oldVal) => (val !== undefined && val !== '') ? val : oldVal;

    await pool.query(
      `UPDATE field_works SET type=?, title=?, location=?, work_date=?, participants=?, status=?, is_internal=?, linked_doc_id=?, description_html=?, conclusion_html=?, photos_json=?, attachments_json=? WHERE id=?`,
      [safe(type, work.type), safe(title, work.title), safe(location, work.location), safe(work_date, work.work_date),
       safe(participants, work.participants), safe(status, work.status),
       is_internal !== undefined ? (is_internal === true || is_internal === 'true' || is_internal === 1 || is_internal === '1' ? 1 : 0) : work.is_internal,
       safe(linked_doc_id, work.linked_doc_id),
       safe(description_html, work.description_html), safe(conclusion_html, work.conclusion_html),
       JSON.stringify(photos), JSON.stringify(attachments), req.params.id]
    );

    await addLog(req.user.real_name, '编辑', '现场工作', title || work.title, getClientIp(req));
    res.json({ message: '修改成功' });
  } catch (err) {
    console.error('Field work update error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [[work]] = await pool.query('SELECT * FROM field_works WHERE id = ?', [req.params.id]);
    if (!work) return res.status(404).json({ error: '记录不存在' });

    // Delete associated photos and attachments from disk
    const fs = require('fs');
    const uploadDir = process.env.UPLOAD_DIR || 'uploads';

    let photos = [], attachments = [];
    try { photos = typeof work.photos_json === 'string' ? JSON.parse(work.photos_json) : (work.photos_json || []); } catch (e) {}
    try { attachments = typeof work.attachments_json === 'string' ? JSON.parse(work.attachments_json) : (work.attachments_json || []); } catch (e) {}

    [...photos, ...attachments].forEach(f => {
      if (f.path) {
        try { fs.unlinkSync(path.join(uploadDir, f.path)); } catch (e) {}
      }
    });

    await pool.query('DELETE FROM field_works WHERE id = ?', [req.params.id]);

    await addLog(req.user.real_name, '删除', '现场工作', work.title, getClientIp(req));
    res.json({ message: '删除成功' });
  } catch (err) {
    console.error('Field work delete error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

module.exports = router;
