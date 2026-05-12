import { Modal } from 'antd';
import { useState, useEffect } from 'react';
import { getDocuments, createDocument, updateDocument, deleteDocument } from '../api';
import FileUploader from '../components/FileUploader';

const TYPE_LABELS = { pending: '待落实', processing: '落实中', completed: '已完成' };
const TYPE_CLASSES = { pending: 'badge-warning', processing: 'badge-info', completed: 'badge-success' };

export default function DocumentList({ user, onNavigate }) {
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ doc_no: '', title: '', send_unit: '', receive_date: '', status: 'pending', implement_html: '', is_internal: false });
  const [files, setFiles] = useState([]);
  const [existingAttachments, setExistingAttachments] = useState([]);
  const [removedAttachments, setRemovedAttachments] = useState([]);
  const [saving, setSaving] = useState(false);

  const pageSize = 10;

  useEffect(() => { loadData(); }, [page, keyword, statusFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await getDocuments({ page, pageSize, keyword, status: statusFilter || undefined });
      setList(res.data.list);
      setTotal(res.data.total);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const totalPages = Math.ceil(total / pageSize);

  const openAdd = () => {
    setEditId(null);
    setForm({ doc_no: '', title: '', send_unit: '', receive_date: '', status: 'pending', implement_html: '', is_internal: false });
    setFiles([]);
    setExistingAttachments([]);
    setRemovedAttachments([]);
    setShowModal(true);
  };

  const openEdit = (doc) => {
    setEditId(doc.id);
    setForm({ doc_no: doc.doc_no, title: doc.title, send_unit: doc.send_unit, receive_date: (doc.receive_date || '').substring(0, 10), status: doc.status, implement_html: doc.implement_html || '', is_internal: !!doc.is_internal });
    setFiles([]);
    setRemovedAttachments([]);
    setExistingAttachments(doc.attachments || []);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.doc_no || !form.title || !form.receive_date) return;
    setSaving(true);
    try {
      const data = { ...form };
      if (files.length > 0) data.files = files;
      if (editId) {
        data.existing_attachments = JSON.stringify(existingAttachments);
        data.removed_attachments = JSON.stringify(removedAttachments);
        await updateDocument(editId, data);
      } else {
        await createDocument(data);
      }
      setShowModal(false);
      loadData();
    } catch (e) {
      alert(e.response?.data?.error || e.message || '保存失败');
    }
    finally { setSaving(false); }
  };

  const handleDelete = async (doc) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定删除收文"${doc.doc_no}"吗？关联的现场工作将被解除关联，附件文件将被删除。此操作不可恢复。`,
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteDocument(doc.id);
          loadData();
        } catch (e) { console.error(e); }
      }
    });
  };

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <span className="card-title">{'\u{1F4C4}'} 收文落实列表</span>
          <button className="btn-primary" style={{ width: 'auto', marginTop: 0, padding: '10px 20px' }} onClick={openAdd}>新增收文</button>
        </div>
        <div className="toolbar">
          <div className="search-box">
            <input placeholder="搜索文号、标题..." value={keyword} onChange={e => { setKeyword(e.target.value); setPage(1); }} />
          </div>
          <select className="filter-select" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">全部状态</option>
            <option value="pending">待落实</option>
            <option value="processing">落实中</option>
            <option value="completed">已完成</option>
          </select>
        </div>
        <div className="card-body">
          {loading ? <div className="loading-state">加载中...</div> : list.length === 0 ? <div className="empty-state"><div className="empty-state-icon">{'\u{1F4AD}'}</div><p>暂无数据</p></div> : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>文号</th>
                  <th>标题</th>
                  <th>来文单位</th>
                  <th>收文日期</th>
                  <th>状态</th>
                  <th>关联工作</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {list.map(doc => (
                  <tr key={doc.id}>
                    <td>{doc.doc_no}</td>
                    <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title}</td>
                    <td>{doc.send_unit}</td>
                    <td>{doc.receive_date}</td>
                    <td><span className={`badge ${TYPE_CLASSES[doc.status]}`}>{TYPE_LABELS[doc.status]}</span></td>
                    <td>{doc.linkedWorks > 0 ? `${doc.linkedWorks} 项` : '—'}</td>
                    <td>
                      <div className="action-btns">
                        <button className="action-btn view" onClick={() => onNavigate('docDetail', { id: doc.id })}>详情</button>
                        <button className="action-btn edit" onClick={() => openEdit(doc)}>编辑</button>
                        {user?.role === 'admin' && (
                          <button className="action-btn delete" onClick={() => handleDelete(doc)}>删除</button>
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
            <span>显示 {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} 条，共 {total} 条</span>
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
              <h3>{editId ? '编辑收文' : '新增收文'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>{'×'}</button>
            </div>
            <div className="modal-body">
              <div className="two-col">
                <div className="form-item">
                  <label>文号 *</label>
                  <input value={form.doc_no} onChange={e => setForm({ ...form, doc_no: e.target.value })} placeholder="例如：教发〔2026〕15号" />
                </div>
                <div className="form-item">
                  <label>收文日期 *</label>
                  <input type="date" value={form.receive_date} onChange={e => setForm({ ...form, receive_date: e.target.value })} />
                </div>
              </div>
              <div className="form-item">
                <label>标题 *</label>
                <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="文件标题" />
              </div>
              <div className="two-col">
                <div className="form-item">
                  <label>来文单位</label>
                  <select value={form.send_unit.startsWith('其他:') ? '其他' : form.send_unit} onChange={e => {
                    const v = e.target.value;
                    setForm({ ...form, send_unit: v === '其他' ? '其他:' : v });
                  }}>
                    <option value="">请选择</option>
                    <option value="郑州市教育局">郑州市教育局</option>
                    <option value="登封市人民政府">登封市人民政府</option>
                    <option value="登封市纪委监委">登封市纪委监委</option>
                    <option value="登封市教育局">登封市教育局</option>
                    <option value="登封市市场监管局">登封市市场监管局</option>
                    <option value="登封市卫生健康委员会（疾控中心）">登封市卫生健康委员会（疾控中心）</option>
                    <option value="登封市公安局">登封市公安局</option>
                    <option value="新登集团（平台公司）">新登集团（平台公司）</option>
                    <option value="登封市人民武装部">登封市人民武装部</option>
                    <option value="登封市文化广电旅游体育局">登封市文化广电旅游体育局</option>
                    <option value="登封市审计局">登封市审计局</option>
                    <option value="其他">其他</option>
                  </select>
                  {form.send_unit.startsWith('其他:') && (
                    <input style={{ marginTop: 8 }} value={form.send_unit.replace('其他:', '')} onChange={e => setForm({ ...form, send_unit: '其他:' + e.target.value })} placeholder="请输入来文单位名称" />
                  )}
                </div>
                <div className="form-item">
                  <label>状态</label>
                  <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                    <option value="pending">待落实</option>
                    <option value="processing">落实中</option>
                    <option value="completed">已完成</option>
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
                <label>落实措施</label>
                <textarea rows={4} value={form.implement_html} onChange={e => setForm({ ...form, implement_html: e.target.value })} placeholder="输入落实措施..." />
              </div>
              <div className="form-item">
                <label>附件</label>
                <FileUploader
                  label="上传附件（最多20个）"
                  accept=".pdf,.zip,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.txt,.ppt,.pptx"
                  files={files}
                  onFilesChange={setFiles}
                  existingFiles={editId ? existingAttachments : []}
                  onExistingRemove={editId ? (i) => {
                    setRemovedAttachments([...removedAttachments, existingAttachments[i].path]);
                    setExistingAttachments(existingAttachments.filter((_, idx) => idx !== i));
                  } : null}
                  multiple
                />
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
