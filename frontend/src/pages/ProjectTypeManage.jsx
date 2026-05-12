import { Modal } from 'antd';
import { useState, useEffect } from 'react';
import { getProjectTypes, createProjectType, updateProjectType, deleteProjectType } from '../api';

export default function ProjectTypeManage() {
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadTypes(); }, []);

  const loadTypes = async () => {
    setLoading(true);
    try { const res = await getProjectTypes(); setTypes(res.data); } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const openAdd = () => { setEditId(null); setName(''); setShowModal(true); };
  const openEdit = (t) => { setEditId(t.id); setName(t.name); setShowModal(true); };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (editId) {
        await updateProjectType(editId, { name: name.trim() });
      } else {
        await createProjectType({ name: name.trim() });
      }
      setShowModal(false);
      loadTypes();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const handleDelete = async (t) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定删除"${t.name}"吗？`,
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try { await deleteProjectType(t.id); loadTypes(); } catch (e) { console.error(e); }
      }
    });
  };

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <span className="card-title">{'\u{1F4C1}'} 项目类型管理</span>
          <button className="btn-primary" style={{ width: 'auto', marginTop: 0, padding: '10px 20px' }} onClick={openAdd}>新增类型</button>
        </div>
        <div className="card-body">
          {loading ? <div className="loading-state">加载中...</div> : types.length === 0 ? <div className="empty-state"><p>暂无数据</p></div> : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>类型名称</th>
                  <th>类型</th>
                  <th>创建时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {types.map(t => (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td><span className={`badge ${t.is_builtin ? 'badge-warning' : 'badge-info'}`}>{t.is_builtin ? '内置' : '自定义'}</span></td>
                    <td>{t.created_at}</td>
                    <td>
                      <div className="action-btns">
                        <button className="action-btn edit" onClick={() => openEdit(t)}>编辑</button>
                        <button className="action-btn delete" onClick={() => handleDelete(t)}>删除</button>
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
          <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 440 }}>
            <div className="modal-header">
              <h3>{editId ? '编辑类型' : '新增类型'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>{'×'}</button>
            </div>
            <div className="modal-body">
              <div className="form-item">
                <label>类型名称</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="例如：下乡检查" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-outline" onClick={() => setShowModal(false)}>取消</button>
              <button className="btn-primary" style={{ width: 'auto', marginTop: 0 }} onClick={handleSave} disabled={saving}>{saving ? '保存中...' : '保存'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
