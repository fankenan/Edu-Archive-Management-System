const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const docFilter = isAdmin ? '' : ' AND (is_internal = 0 OR created_by = ?)';
    const fwFilter = isAdmin ? '' : ' AND (is_internal = 0 OR created_by = ?)';
    const userParam = isAdmin ? [] : [req.user.real_name];

    const [[{ c: totalDocs }]] = await pool.query(`SELECT COUNT(*) as c FROM documents WHERE 1=1${docFilter}`, userParam);
    const [[{ c: pendingDocs }]] = await pool.query(`SELECT COUNT(*) as c FROM documents WHERE status = 'pending'${docFilter}`, userParam);
    const [[{ c: totalWorks }]] = await pool.query(`SELECT COUNT(*) as c FROM field_works WHERE 1=1${fwFilter}`, userParam);
    const [[{ c: completedWorks }]] = await pool.query(`SELECT COUNT(*) as c FROM field_works WHERE status = 'completed'${fwFilter}`, userParam);
    const [[{ c: pendingWorks }]] = await pool.query(`SELECT COUNT(*) as c FROM field_works WHERE status = 'processing'${fwFilter}`, userParam);

    const [recentDocs] = await pool.query(
      `SELECT id, doc_no, title, send_unit, receive_date, status FROM documents WHERE 1=1${docFilter} ORDER BY id DESC LIMIT 5`,
      userParam
    );
    const [recentWorks] = await pool.query(
      `SELECT id, title, work_date, type, status, location FROM field_works WHERE 1=1${fwFilter} ORDER BY id DESC LIMIT 5`,
      userParam
    );

    res.json({
      totalDocuments: totalDocs,
      pendingDocuments: pendingDocs,
      totalFieldWorks: totalWorks,
      completedWorks,
      pendingWorks,
      recentDocs,
      recentWorks
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

module.exports = router;
