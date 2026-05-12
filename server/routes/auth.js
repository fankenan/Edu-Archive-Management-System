const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool, addLog } = require('../db');
const { authMiddleware, getClientIp, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '请输入用户名和密码' });

    const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
    const user = rows[0];
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, real_name: user.real_name, role: user.role, department: user.department },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    await addLog(user.real_name, '登录', '用户管理', user.username, getClientIp(req));

    res.json({
      token,
      user: { id: user.id, username: user.username, real_name: user.real_name, role: user.role, department: user.department }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.get('/verify', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

router.put('/password', authMiddleware, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) return res.status(400).json({ error: '请填写旧密码和新密码' });
    if (newPassword.length < 6) return res.status(400).json({ error: '新密码至少6个字符' });

    const [[user]] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ error: '用户不存在' });

    if (!bcrypt.compareSync(oldPassword, user.password)) {
      return res.status(400).json({ error: '旧密码不正确' });
    }

    const hash = bcrypt.hashSync(newPassword, 10);
    await pool.query('UPDATE users SET password = ? WHERE id = ?', [hash, req.user.id]);

    await addLog(req.user.real_name, '修改密码', '用户管理', req.user.username, getClientIp(req));
    res.json({ message: '密码修改成功' });
  } catch (err) {
    console.error('Password change error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

module.exports = router;
