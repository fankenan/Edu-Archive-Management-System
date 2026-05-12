import { useState } from 'react';
import { changePassword } from '../api';

export default function Sidebar({ user, currentPage, onNavigate, onLogout }) {
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdMsg, setPwdMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const navs = [
    { key: 'dashboard', icon: '\u{1F4CA}', label: '工作台' },
    { key: 'documents', icon: '\u{1F4C4}', label: '收文落实' },
    { key: 'fieldWork', icon: '\u{1F3E0}', label: '现场工作' },
    { key: 'uploads', icon: '\u{1F4E4}', label: '资料上传' },
    { key: 'users', icon: '\u{1F464}', label: '用户管理', roles: ['admin'] },
    { key: 'projectTypes', icon: '\u{1F4C1}', label: '项目类型', roles: ['admin'] },
    { key: 'fileCategories', icon: '\u{1F4CB}', label: '资料分类', roles: ['admin'] },
    { key: 'logs', icon: '\u{1F4DD}', label: '操作日志', roles: ['admin'] },
  ];

  const filteredNavs = navs.filter(n => {
    if (!n.roles) return true;
    return n.roles.includes(user?.role);
  });

  const businessNavs = filteredNavs.filter(n => !n.roles);
  const adminNavs = filteredNavs.filter(n => n.roles);

  const handleChangePwd = async () => {
    if (!oldPwd || !newPwd) { setPwdError('请填写旧密码和新密码'); return; }
    if (newPwd.length < 6) { setPwdError('新密码至少6个字符'); return; }
    setSaving(true);
    setPwdError('');
    setPwdMsg('');
    try {
      const res = await changePassword(oldPwd, newPwd);
      setPwdMsg(res.data.message);
      setTimeout(() => { setShowPwdModal(false); setOldPwd(''); setNewPwd(''); setPwdMsg(''); }, 1200);
    } catch (e) {
      setPwdError(e.response?.data?.error || '修改失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon" style={{ lineHeight: '1.1', fontSize: '13px', letterSpacing: '1px' }}>档案<br/>管理</div>
          <div className="sidebar-logo-text">
            <h2>体卫艺科档案管理</h2>
            <span>Archive Management</span>
          </div>
        </div>
        <div className="sidebar-nav">
          {businessNavs.map(nav => (
            <div
              key={nav.key}
              className={`nav-item ${currentPage === nav.key ? 'active' : ''}`}
              onClick={() => onNavigate(nav.key)}
            >
              <span className="nav-icon">{nav.icon}</span>
              <span>{nav.label}</span>
            </div>
          ))}
          {adminNavs.length > 0 && (
            <>
              <div className="nav-divider" />
              <div className="nav-section-title">管理</div>
              {adminNavs.map(nav => (
                <div
                  key={nav.key}
                  className={`nav-item ${currentPage === nav.key ? 'active' : ''}`}
                  onClick={() => onNavigate(nav.key)}
                >
                  <span className="nav-icon">{nav.icon}</span>
                  <span>{nav.label}</span>
                </div>
              ))}
            </>
          )}
        </div>
        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">{user?.real_name?.charAt(0) || 'U'}</div>
            <div>
              <div className="user-name">{user?.real_name}</div>
              <div className="user-role">{user?.role === 'admin' ? '管理员' : '普通用户'}</div>
            </div>
          </div>
          <button className="logout-btn" style={{ marginBottom: 4 }} onClick={() => { setShowPwdModal(true); setOldPwd(''); setNewPwd(''); setPwdError(''); setPwdMsg(''); }}>
            <span>修改密码</span>
          </button>
          <button className="logout-btn" onClick={onLogout}>
            <span>退出登录</span>
          </button>
        </div>
      </div>

      {showPwdModal && (
        <div className="modal-overlay" onClick={() => setShowPwdModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 420 }}>
            <div className="modal-header">
              <h3>修改密码</h3>
              <button className="modal-close" onClick={() => setShowPwdModal(false)}>{'×'}</button>
            </div>
            <div className="modal-body">
              {pwdMsg ? (
                <div className="success-msg">{pwdMsg}</div>
              ) : (
                <>
                  <div className="form-item">
                    <label>旧密码</label>
                    <input type="password" value={oldPwd} onChange={e => setOldPwd(e.target.value)} placeholder="请输入旧密码" />
                  </div>
                  <div className="form-item">
                    <label>新密码</label>
                    <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="请输入新密码（至少6位）" />
                  </div>
                  {pwdError && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{pwdError}</div>}
                </>
              )}
            </div>
            {!pwdMsg && (
              <div className="modal-footer">
                <button className="btn-outline" onClick={() => setShowPwdModal(false)}>取消</button>
                <button className="btn-primary" style={{ width: 'auto', marginTop: 0 }} onClick={handleChangePwd} disabled={saving}>
                  {saving ? '保存中...' : '确认修改'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
