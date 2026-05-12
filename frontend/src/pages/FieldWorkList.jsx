import { Modal } from 'antd';
import { useState, useEffect, useRef } from 'react';
import { getFieldWorks, getFieldWork, createFieldWork, updateFieldWork, deleteFieldWork, getDocumentsDropdown, getProjectTypes } from '../api';
import FileUploader from '../components/FileUploader';

export default function FieldWorkList({ user, onNavigate }) {
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [projectTypes, setProjectTypes] = useState([]);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ type: '', title: '', location: '', work_date: '', participants: '', linked_doc_id: '', description_html: '', conclusion_html: '', status: 'completed', is_internal: false });
  const [files, setFiles] = useState([]);
  const [existingPhotos, setExistingPhotos] = useState([]);
  const [existingAttachments, setExistingAttachments] = useState([]);
  const [removedPhotos, setRemovedPhotos] = useState([]);
  const [removedAttachments, setRemovedAttachments] = useState([]);
  const [docOptions, setDocOptions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const modalKey = useRef(0);

  const pageSize = 10;

  useEffect(() => { loadData(); loadProjectTypes(); }, [page, keyword, typeFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await getFieldWorks({ page, pageSize, keyword, type: typeFilter || undefined });
      setList(res.data.list);
      setTotal(res.data.total);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const loadProjectTypes = async () => {
    try { const res = await getProjectTypes(); setProjectTypes(res.data); } catch (e) {}
  };

  const totalPages = Math.ceil(total / pageSize);

  const openAdd = async () => {
    modalKey.current += 1;
    setEditId(null);
    setForm({ type: '', title: '', location: '', work_date: '', participants: '', linked_doc_id: '', description_html: '', conclusion_html: '', status: 'completed', is_internal: false });
    setFiles([]);
    setExistingPhotos([]);
    setExistingAttachments([]);
    setRemovedPhotos([]);
    setRemovedAttachments([]);
    setSaveError('');
    try { const res = await getDocumentsDropdown(); setDocOptions(res.data); } catch (e) {}
    setShowModal(true);
  };

  const openEdit = async (w) => {
    modalKey.current += 1;
    setEditId(w.id);
    setForm({ type: w.type, title: w.title, location: w.location, work_date: (w.work_date || '').substring(0, 10), participants: w.participants, linked_doc_id: w.linked_doc_id || '', description_html: w.description_html || '', conclusion_html: w.conclusion_html || '', status: w.status, is_internal: !!w.is_internal });
    setFiles([]);
    setRemovedPhotos([]);
    setRemovedAttachments([]);
    setSaveError('');
    try {
      const [docsRes, detailRes] = await Promise.all([getDocumentsDropdown(), getFieldWork(w.id)]);
      setDocOptions(docsRes.data);
      setExistingPhotos(detailRes.data.photos || []);
      setExistingAttachments(detailRes.data.attachments || []);
    } catch (e) {}
    setShowModal(true);
  };

  const handleRemoveExistingPhoto = (i) => {
    setRemovedPhotos([...removedPhotos, existingPhotos[i].path]);
    setExistingPhotos(existingPhotos.filter((_, idx) => idx !== i));
  };

  const handleRemoveExistingAttachment = (i) => {
    setRemovedAttachments([...removedAttachments, existingAttachments[i].path]);
    setExistingAttachments(existingAttachments.filter((_, idx) => idx !== i));
  };

  const handleSave = async () => {
    if (!form.type || !form.title || !form.work_date) { setSaveError('请填写必填字段（类型、标题、日期）'); return; }
    setSaving(true);
    setSaveError('');
    try {
      const data = { ...form };
      if (files.length > 0) data.files = files;
      if (editId) {
        data.existing_photos = JSON.stringify(existingPhotos);
        data.existing_attachments = JSON.stringify(existingAttachments);
        data.removed_photos = JSON.stringify(removedPhotos);
        data.removed_attachments = JSON.stringify(removedAttachments);
        await updateFieldWork(editId, data);
      } else {
        await createFieldWork(data);
      }
      setShowModal(false);
      loadData();
    } catch (e) {
      setSaveError(e.response?.data?.error || e.message || '保存失败');
    }
    finally { setSaving(false); }
  };

  const handleDelete = async (work) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定删除"${work.title}"吗？关联的照片和附件文件将被删除。此操作不可恢复。`,
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteFieldWork(work.id);
          loadData();
        } catch (e) { console.error(e); }
      }
    });
  };

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <span className="card-title">{'\u{1F3E0}'} 现场工作列表</span>
          <button className="btn-primary" style={{ width: 'auto', marginTop: 0, padding: '10px 20px' }} onClick={openAdd}>新增工作</button>
        </div>
        <div className="toolbar">
          <div className="search-box">
            <input placeholder="搜索标题、地点..." value={keyword} onChange={e => { setKeyword(e.target.value); setPage(1); }} />
          </div>
          <select className="filter-select" value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}>
            <option value="">全部类型</option>
            {projectTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
          </select>
        </div>
        <div className="card-body">
          {loading ? <div className="loading-state">加载中...</div> : list.length === 0 ? <div className="empty-state"><div className="empty-state-icon">{'\u{1F4AD}'}</div><p>暂无数据</p></div> : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>标题</th>
                  <th>类型</th>
                  <th>地点</th>
                  <th>日期</th>
                  <th>参与人</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {list.map(w => (
                  <tr key={w.id}>
                    <td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.title}</td>
                    <td><span className="badge badge-default">{w.type}</span></td>
                    <td>{w.location}</td>
                    <td>{w.work_date}</td>
                    <td>{w.participants}</td>
                    <td><span className={`badge ${w.status === 'completed' ? 'badge-success' : 'badge-info'}`}>{w.status === 'completed' ? '已完成' : '进行中'}</span></td>
                    <td>
                      <div className="action-btns">
                        <button className="action-btn view" onClick={() => onNavigate('fieldWorkDetail', { id: w.id })}>详情</button>
                        <button className="action-btn edit" onClick={() => openEdit(w)}>编辑</button>
                        {user?.role === 'admin' && (
                          <button className="action-btn delete" onClick={() => handleDelete(w)}>删除</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {total > pageSize && (
          <div className="table-pagination">
            <span>共 {total} 条</span>
            <div className="pagination">
              <button className="page-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>{'<'}</button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let p;
                if (totalPages <= 7) { p = i + 1; }
                else if (page <= 4) { p = i + 1; }
                else if (page >= totalPages - 3) { p = totalPages - 6 + i; }
                else { p = page - 3 + i; }
                return <button key={p} className={`page-btn ${page === p ? 'active' : ''}`} onClick={() => setPage(p)}>{p}</button>;
              })}
              <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>{'>'}</button>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 700 }}>
            <div className="modal-header">
              <h3>{editId ? '编辑现场工作' : '新增现场工作'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>{'×'}</button>
            </div>
            <div className="modal-body">
              <div className="two-col">
                <div className="form-item">
                  <label>工作类型 *</label>
                  <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                    <option value="">请选择</option>
                    {projectTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                  </select>
                </div>
                <div className="form-item">
                  <label>工作日期 *</label>
                  <input type="date" value={form.work_date} onChange={e => setForm({ ...form, work_date: e.target.value })} />
                </div>
              </div>
              <div className="form-item">
                <label>标题 *</label>
                <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="two-col">
                <div className="form-item">
                  <label>地点</label>
                  <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} />
                </div>
                <div className="form-item">
                  <label>参与人员</label>
                  <input value={form.participants} onChange={e => setForm({ ...form, participants: e.target.value })} placeholder="多人用、分隔" />
                </div>
              </div>
              <div className="two-col">
                <div className="form-item">
                  <label>关联收文</label>
                  <select value={form.linked_doc_id} onChange={e => setForm({ ...form, linked_doc_id: e.target.value })}>
                    <option value="">无</option>
                    {docOptions.map(d => <option key={d.id} value={d.id}>{d.doc_no} — {d.title}</option>)}
                  </select>
                </div>
                <div className="form-item">
                  <label>状态</label>
                  <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                    <option value="completed">已完成</option>
                    <option value="processing">进行中</option>
                    <option value="pending">待落实</option>
                  </select>
                </div>
              </div>
              <div className="form-item">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: 14, color: '#475569' }}>内部资料（仅本人和管理员可见）</span>
                  <input type="checkbox" checked={form.is_internal} onChange={e => setForm({ ...form, is_internal: e.target.checked })} style={{ width: 18, height: 18, cursor: 'pointer' }} />
                </div>
              </div>
              <div className="form-item">
                <label>工作描述</label>
                <textarea rows={3} value={form.description_html} onChange={e => setForm({ ...form, description_html: e.target.value })} />
              </div>
              <div className="form-item">
                <label>结论与反馈</label>
                <textarea rows={3} value={form.conclusion_html} onChange={e => setForm({ ...form, conclusion_html: e.target.value })} />
              </div>
              <div className="form-item">
                <label>附件</label>
                <FileUploader
                  key={modalKey.current}
                  label="上传照片或文件（最多20个）"
                  accept=".jpg,.jpeg,.png,.pdf,.doc,.docx"
                  files={files}
                  onFilesChange={setFiles}
                  existingFiles={editId ? [...existingPhotos.map(p => ({ ...p, _type: 'photo' })), ...existingAttachments.map(a => ({ ...a, _type: 'attachment' }))] : []}
                  onExistingRemove={editId ? (i) => {
                    const allExisting = [...existingPhotos.map(p => ({ ...p, _type: 'photo' })), ...existingAttachments.map(a => ({ ...a, _type: 'attachment' }))];
                    const removed = allExisting[i];
                    if (removed._type === 'photo') {
                      handleRemoveExistingPhoto(existingPhotos.findIndex(p => p.path === removed.path));
                    } else {
                      handleRemoveExistingAttachment(existingAttachments.findIndex(a => a.path === removed.path));
                    }
                  } : null}
                  multiple
                />
              </div>
            </div>
            {saveError && <div className="error-msg" style={{ margin: '0 28px' }}>{saveError}</div>}
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
