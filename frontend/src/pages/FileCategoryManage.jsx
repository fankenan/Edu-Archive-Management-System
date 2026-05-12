import { Modal } from 'antd';
import { useState, useEffect } from 'react';
import { getFileCategories, createFileCategory, updateFileCategory, deleteFileCategory } from '../api';

export default function FileCategoryManage() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadCategories(); }, []);

  const loadCategories = async () => {
    setLoading(true);
    try { const res = await getFileCategories(); setCategories(res.data); } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const openAdd = () => { setEditId(null); setName(''); setShowModal(true); };
  const openEdit = (c) => { setEditId(c.id); setName(c.name); setShowModal(true); };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (editId) {
        await updateFileCategory(editId, { name: name.trim() });
      } else {
        await createFileCategory({ name: name.trim() });
      }
      setShowModal(false);
      loadCategories();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const handleDelete = async (c) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定删除分类"${c.name}"吗？该分类下的所有文件也将被删除。`,
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try { await deleteFileCategory(c.id); loadCategories(); } catch (e) { console.error(e); }
      }
    });
  };

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <span className="card-title">{'\u{1F4CB}'} 资料分类管理</span>
          <button className="btn-primary" style={{ width: 'auto', marginTop: 0, padding: '10px 20px' }} onClick={openAdd}>新增分类</button>
        </div>
        <div className="card-body">
          {loading ? <div className="loading-state">加载中...</div> : categories.length === 0 ? <div className="empty-state"><p>暂无数据</p></div> : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>分类名称</th>
                  <th>类型</th>
                  <th>创建时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {categories.map(c => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td><span className={`badge ${c.is_builtin ? 'badge-warning' : 'badge-info'}`}>{c.is_builtin ? '内置' : '自定义'}</span></td>
                    <td>{c.created_at}</td>
                    <td>
                      <div className="action-btns">
                        <button className="action-btn edit" onClick={() => openEdit(c)}>编辑</button>
                        <button className="action-btn delete" onClick={() => handleDelete(c)}>删除</button>
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
              <h3>{editId ? '编辑分类' : '新增分类'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>{'×'}</button>
            </div>
            <div className="modal-body">
              <div className="form-item">
                <label>分类名称</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="例如：规章制度" />
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
