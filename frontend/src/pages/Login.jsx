import { useState } from 'react';
import { login } from '../api';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await login(username, password);
      const { token, user } = res.data;
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      onLogin(user);
    } catch (err) {
      setError(err.response?.data?.error || '登录失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-icon" style={{ lineHeight: '1.1', fontSize: '20px', letterSpacing: '2px' }}>档案<br/>管理</div>
          <h1>体卫艺科档案管理</h1>
          <p>Archive Management System</p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-item">
            <label>用户名</label>
            <input value={username} onChange={e => setUsername(e.target.value)} placeholder="请输入用户名" required />
          </div>
          <div className="form-item">
            <label>密码</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="请输入密码" required />
          </div>
          {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? '登录中...' : '登录系统'}
          </button>
        </form>
      </div>
    </div>
  );
}
