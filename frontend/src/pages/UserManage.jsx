import { useState, useEffect } from 'react';
import { Modal } from 'antd';
import { getUsers, createUser, updateUser, deleteUser } from '../api';

export default function UserManage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', real_name: '', department: '', role: 'user' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async () => {
    setLoading(true);
    try { const res = await getUsers(); setUsers(res.data); } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const openAdd = () => {
    setEditing(false);
    setForm({ username: '', password: '', real_name: '', department: '', role: 'user' });
    setError('');
    setShowModal(true);
  };

  const openEdit = (u) => {
    setEditing(true);
    setForm({ username: u.username, password: '', real_name: u.real_name, department: u.department, role: u.role, id: u.id });
    setError('');
    setShowModal(true);
  };

  const handleDelete = (u) => {
    if (u.username === 'admin') return alert('不能删除admin账户');
    Modal.confirm({
      title: '确认删除',
      content: `确定删除用户"${u.username}"（${u.real_name}）吗？此操作不可恢复。`,
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteUser(u.id);
          loadUsers();
        } catch (e) { alert(e.response?.data?.error || '删除失败'); }
      }
    });
  };

  const handleSave = async () => {
    if (!form.username || (!editing && !form.password)) {
      setError('请填写必填字段');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editing) {
        const data = { real_name: form.real_name, department: form.department, role: form.role };
        if (form.password) data.password = form.password;
        await updateUser(form.id, data);
      } else {
        await createUser({ username: form.username, password: form.password, real_name: form.real_name, department: form.department, role: form.role });
      }
      setShowModal(false);
      loadUsers();
    } catch (e) {
      setError(e.response?.data?.error || '操作失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <span className="card-title">{'\u{1F464}'} 用户管理</span>
          <button className="btn-primary" style={{ width: 'auto', marginTop: 0, padding: '10px 20px' }} onClick={openAdd}>新增用户</button>
        </div>
        <div className="card-body">
          {loading ? <div className="loading-state">加载中...</div> : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>用户名</th>
                  <th>真实姓名</th>
                  <th>角色</th>
                  <th>部门</th>
                  <th>创建时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>{u.username}</td>
                    <td>{u.real_name}</td>
                    <td><span className={`badge ${u.role === 'admin' ? 'badge-warning' : 'badge-info'}`}>{u.role === 'admin' ? '管理员' : '普通用户'}</span></td>
                    <td>{u.department}</td>
                    <td>{u.created_at}</td>
                    <td>
                      <div className="action-btns">
                        <button className="action-btn edit" onClick={() => openEdit(u)}>编辑</button>
                        <button className="action-btn delete" onClick={() => handleDelete(u)}>删除</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 480 }}>
            <div className="modal-header">
              <h3>{editing ? '编辑用户' : '新增用户'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>{'×'}</button>
            </div>
            <div className="modal-body">
              <div className="form-item">
                <label>用户名 {!editing && '*'}</label>
                <input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="请输入用户名" disabled={editing} />
              </div>
              <div className="form-item">
                <label>密码 {!editing && '*'}</label>
                <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder={editing ? '留空则不修改' : '请输入密码'} />
              </div>
              <div className="form-item">
                <label>真实姓名</label>
                <input value={form.real_name} onChange={e => setForm({ ...form, real_name: e.target.value })} placeholder="请输入真实姓名" />
              </div>
              <div className="form-item">
                <label>部门</label>
                <input value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} placeholder="请输入部门" />
              </div>
              <div className="form-item">
                <label>角色</label>
                <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                  <option value="user">普通用户</option>
                  <option value="admin">管理员</option>
                </select>
              </div>
              {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>{error}</div>}
            </div>
            <div className="modal-footer">
              <button className="btn-outline" onClick={() => setShowModal(false)}>取消</button>
              <button className="btn-primary" style={{ width: 'auto', marginTop: 0 }} onClick={handleSave} disabled={saving}>
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
