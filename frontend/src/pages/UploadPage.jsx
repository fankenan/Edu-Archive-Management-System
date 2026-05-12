import { Modal } from 'antd';
import { useState, useEffect } from 'react';
import { getFileCategories, getUploadedFiles, uploadFiles, deleteUploadedFile, withToken } from '../api';
import FileUploader from '../components/FileUploader';

export default function UploadPage({ user }) {
  const [categories, setCategories] = useState([]);
  const [selectedCat, setSelectedCat] = useState(null);
  const [files, setFiles] = useState([]);
  const [isInternal, setIsInternal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState(null);

  // File list
  const [fileList, setFileList] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [catFilter, setCatFilter] = useState('');
  const [keyword, setKeyword] = useState('');
  const [uploaderFilter, setUploaderFilter] = useState('');
  const [uploaders, setUploaders] = useState([]);
  const [loading, setLoading] = useState(true);

  const pageSize = 10;

  useEffect(() => { loadCategories(); }, []);
  useEffect(() => { loadFiles(); }, [page, catFilter, keyword, uploaderFilter]);

  useEffect(() => {
    // Fetch all to build uploader list
    const loadUploaders = async () => {
      try {
        const res = await getUploadedFiles({ page: 1, pageSize: 1000 });
        const names = [...new Set(res.data.list.map(f => f.uploaded_by).filter(Boolean))];
        setUploaders(names);
      } catch (e) {}
    };
    loadUploaders();
  }, []);

  const loadCategories = async () => {
    try {
      const res = await getFileCategories();
      setCategories(res.data);
      if (res.data.length > 0) setSelectedCat(res.data[0].id);
    } catch (e) { console.error(e); }
  };

  const loadFiles = async () => {
    setLoading(true);
    try {
      const params = { page, pageSize };
      if (catFilter) params.category_id = catFilter;
      if (keyword) params.keyword = keyword;
      if (uploaderFilter) params.uploaded_by = uploaderFilter;
      const res = await getUploadedFiles(params);
      setFileList(res.data.list);
      setTotal(res.data.total);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleUpload = async () => {
    if (!selectedCat) return setMsg({ type: 'error', text: '请先选择资料分类' });
    if (files.length === 0) return setMsg({ type: 'error', text: '请先选择要上传的文件' });
    setUploading(true);
    setMsg(null);
    try {
      const res = await uploadFiles({ category_id: selectedCat, files, is_internal: isInternal });
      setMsg({ type: 'success', text: res.data.message });
      setFiles([]);
      loadFiles();
    } catch (e) {
      setMsg({ type: 'error', text: e.response?.data?.error || '上传失败' });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除这个文件吗？',
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteUploadedFile(id);
          loadFiles();
        } catch (e) { console.error(e); }
      }
    });
  };

  const totalPages = Math.ceil(total / pageSize);

  const formatSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div>
      <div className="upload-page-header">
        <h2>{'\u{1F4E4}'} 资料上传</h2>
        <p>上传各类档案资料文件，选择分类后拖拽或点击上传</p>
      </div>

      <div className="card mb-4">
        <div className="card-header"><span className="card-title">选择分类并上传</span></div>
        <div className="card-body" style={{ padding: 24 }}>
          <div className="category-selector">
            {categories.map(cat => (
              <button
                key={cat.id}
                className={`category-chip ${selectedCat === cat.id ? 'selected' : ''}`}
                onClick={() => setSelectedCat(cat.id)}
              >
                {'\u{1F4C2}'} {cat.name}
              </button>
            ))}
            {categories.length === 0 && <span className="text-muted text-sm">暂无分类，请联系管理员添加</span>}
          </div>

          <FileUploader
            label="点击或拖拽文件到此处上传"
            accept=".pdf,.zip,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.txt,.ppt,.pptx"
            files={files}
            onFilesChange={setFiles}
            multiple
          />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0', marginTop: 12 }}>
            <span style={{ fontSize: 14, color: '#475569' }}>内部资料（仅本人和管理员可见）</span>
            <input type="checkbox" checked={isInternal} onChange={e => setIsInternal(e.target.checked)} style={{ width: 18, height: 18, cursor: 'pointer' }} />
          </div>

          {msg && <div className={msg.type === 'success' ? 'success-msg mt-4' : 'error-msg mt-4'}>{msg.text}</div>}

          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <button className="btn-primary" style={{ width: 'auto', marginTop: 0, padding: '10px 32px' }} onClick={handleUpload} disabled={uploading}>
              {uploading ? '上传中...' : `上传 ${files.length} 个文件`}
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">{'\u{1F4C4}'} 已上传资料</span>
        </div>
        <div className="toolbar">
          <div className="search-box">
            <input placeholder="搜索文件名..." value={keyword} onChange={e => { setKeyword(e.target.value); setPage(1); }} />
          </div>
          <select className="filter-select" value={catFilter} onChange={e => { setCatFilter(e.target.value); setPage(1); }}>
            <option value="">全部分类</option>
            {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
          </select>
          <select className="filter-select" value={uploaderFilter} onChange={e => { setUploaderFilter(e.target.value); setPage(1); }}>
            <option value="">全部上传人</option>
            {uploaders.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div className="card-body">
          {loading ? <div className="loading-state">加载中...</div> : fileList.length === 0 ? <div className="empty-state"><div className="empty-state-icon">{'\u{1F4AD}'}</div><p>暂无上传文件</p></div> : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>文件名</th>
                  <th>分类</th>
                  <th>大小</th>
                  <th>上传人</th>
                  <th>上传时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {fileList.map(f => (
                  <tr key={f.id}>
                    <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.original_name}</td>
                    <td><span className="tag">{f.category_name}</span></td>
                    <td>{formatSize(f.size)}</td>
                    <td>{f.uploaded_by}</td>
                    <td>{f.created_at}</td>
                    <td>
                      <div className="action-btns">
                        <a href={withToken(`/api/uploaded-files/download/${f.id}`)} className="action-btn download" style={{ textDecoration: 'none' }}>下载</a>
                        {(user?.role === 'admin' || user?.real_name === f.uploaded_by) && (
                          <button className="action-btn delete" onClick={() => handleDelete(f.id)}>删除</button>
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
    </div>
  );
}
