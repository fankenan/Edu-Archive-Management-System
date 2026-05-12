const express = require('express');
const bcrypt = require('bcryptjs');
const { pool, addLog } = require('../db');
const { authMiddleware, adminOnly, getClientIp } = require('../middleware/auth');

const router = express.Router();

// ============ Users ============
router.get('/users', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [list] = await pool.query('SELECT id, username, real_name, role, department, created_at FROM users ORDER BY id');
    res.json(list);
  } catch (err) {
    console.error('Users list error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.post('/users', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { username, password, real_name, department, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
    if (username.length < 3) return res.status(400).json({ error: '用户名至少3个字符' });
    if (password.length < 6) return res.status(400).json({ error: '密码至少6个字符' });

    const hash = bcrypt.hashSync(password, 10);
    await pool.query(
      'INSERT INTO users (username, password, real_name, role, department) VALUES (?, ?, ?, ?, ?)',
      [username, hash, real_name || '', role || 'user', department || '']
    );

    await addLog(req.user.real_name, '新增', '用户管理', username, getClientIp(req));
    res.json({ message: '添加成功' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: '用户名已存在' });
    console.error('User create error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.put('/users/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [[user]] = await pool.query('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: '用户不存在' });

    const { real_name, department, role, password } = req.body;

    if (password) {
      // Only the admin user can change the admin account's password
      if (user.username === 'admin' && req.user.username !== 'admin') {
        return res.status(403).json({ error: '只有admin账户才能修改自己的密码' });
      }
      if (password.length < 6) return res.status(400).json({ error: '密码至少6个字符' });
      const hash = bcrypt.hashSync(password, 10);
      await pool.query('UPDATE users SET real_name=?, department=?, role=?, password=? WHERE id=?',
        [real_name ?? user.real_name, department ?? user.department, role ?? user.role, hash, req.params.id]);
    } else {
      await pool.query('UPDATE users SET real_name=?, department=?, role=? WHERE id=?',
        [real_name ?? user.real_name, department ?? user.department, role ?? user.role, req.params.id]);
    }

    await addLog(req.user.real_name, '编辑', '用户管理', user.username, getClientIp(req));
    res.json({ message: '保存成功' });
  } catch (err) {
    console.error('User update error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.delete('/users/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [[user]] = await pool.query('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    if (user.username === 'admin') return res.status(400).json({ error: '不能删除admin账户' });
    if (user.id === req.user.id) return res.status(400).json({ error: '不能删除自己的账户' });

    await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    await addLog(req.user.real_name, '删除', '用户管理', user.username, getClientIp(req));
    res.json({ message: '删除成功' });
  } catch (err) {
    console.error('User delete error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ============ Project Types ============
router.get('/project-types', authMiddleware, async (req, res) => {
  try {
    const [list] = await pool.query('SELECT * FROM project_types ORDER BY is_builtin DESC, id');
    res.json(list);
  } catch (err) {
    console.error('Project types error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.post('/project-types', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: '类型名称不能为空' });
    const [result] = await pool.query('INSERT INTO project_types (name, is_builtin) VALUES (?, 0)', [name]);
    await addLog(req.user.real_name, '新增', '项目类型', name, getClientIp(req));
    res.json({ id: result.insertId, message: '添加成功' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: '类型名称已存在' });
    console.error('Project type create error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.put('/project-types/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [[type]] = await pool.query('SELECT * FROM project_types WHERE id = ?', [req.params.id]);
    if (!type) return res.status(404).json({ error: '类型不存在' });
    await pool.query('UPDATE project_types SET name=? WHERE id=?', [req.body.name, req.params.id]);
    await addLog(req.user.real_name, '编辑', '项目类型', req.body.name, getClientIp(req));
    res.json({ message: '保存成功' });
  } catch (err) {
    console.error('Project type update error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.delete('/project-types/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [[type]] = await pool.query('SELECT * FROM project_types WHERE id = ?', [req.params.id]);
    if (!type) return res.status(404).json({ error: '类型不存在' });
    await pool.query('DELETE FROM project_types WHERE id=?', [req.params.id]);
    await addLog(req.user.real_name, '删除', '项目类型', type.name, getClientIp(req));
    res.json({ message: '删除成功' });
  } catch (err) {
    console.error('Project type delete error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ============ File Categories ============
router.get('/file-categories', authMiddleware, async (req, res) => {
  try {
    const [list] = await pool.query('SELECT * FROM file_categories ORDER BY is_builtin DESC, id');
    res.json(list);
  } catch (err) {
    console.error('File categories error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.post('/file-categories', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: '分类名称不能为空' });
    const [result] = await pool.query('INSERT INTO file_categories (name, is_builtin) VALUES (?, 0)', [name]);
    await addLog(req.user.real_name, '新增', '资料分类', name, getClientIp(req));
    res.json({ id: result.insertId, message: '添加成功' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: '分类名称已存在' });
    console.error('File category create error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.put('/file-categories/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [[cat]] = await pool.query('SELECT * FROM file_categories WHERE id = ?', [req.params.id]);
    if (!cat) return res.status(404).json({ error: '分类不存在' });
    await pool.query('UPDATE file_categories SET name=? WHERE id=?', [req.body.name, req.params.id]);
    await addLog(req.user.real_name, '编辑', '资料分类', req.body.name, getClientIp(req));
    res.json({ message: '保存成功' });
  } catch (err) {
    console.error('File category update error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.delete('/file-categories/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [[cat]] = await pool.query('SELECT * FROM file_categories WHERE id = ?', [req.params.id]);
    if (!cat) return res.status(404).json({ error: '分类不存在' });
    await pool.query('DELETE FROM file_categories WHERE id=?', [req.params.id]);
    await addLog(req.user.real_name, '删除', '资料分类', cat.name, getClientIp(req));
    res.json({ message: '删除成功' });
  } catch (err) {
    console.error('File category delete error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ============ Logs ============
router.get('/logs', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { module, user_name, page = 1, pageSize = 20 } = req.query;
    let sql = 'SELECT * FROM logs WHERE 1=1';
    const params = [];
    if (module) { sql += ' AND module = ?'; params.push(module); }
    if (user_name) { sql += ' AND user_name = ?'; params.push(user_name); }

    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    const [[{ total }]] = await pool.query(countSql, params);

    sql += ' ORDER BY id DESC LIMIT ? OFFSET ?';
    params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));

    const [list] = await pool.query(sql, params);
    res.json({ list, total, page: Number(page), pageSize: Number(pageSize) });
  } catch (err) {
    console.error('Logs error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

module.exports = router;
