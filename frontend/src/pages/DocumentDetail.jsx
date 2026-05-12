import { useState, useEffect } from 'react';
import { getDocument, withToken } from '../api';
import PdfPreview from '../components/PdfPreview';

const TYPE_LABELS = { pending: '待落实', processing: '落实中', completed: '已完成' };
const TYPE_CLASSES = { pending: 'badge-warning', processing: 'badge-info', completed: 'badge-success' };

export default function DocumentDetail({ id, onNavigate }) {
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPdf, setShowPdf] = useState(false);

  useEffect(() => { loadDoc(); }, [id]);

  const loadDoc = async () => {
    try {
      const res = await getDocument(id);
      setDoc(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  if (loading) return <div className="loading-state">加载中...</div>;
  if (!doc) return <div className="empty-state"><p>记录不存在</p></div>;

  const formatSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div>
      <button className="btn-outline mb-4" style={{ float: 'right' }} onClick={() => onNavigate('documents')}>返回列表</button>

      <div className="detail-header">
        <div className="flex-between">
          <h2>{doc.title}</h2>
          <span className={`badge ${TYPE_CLASSES[doc.status]}`} style={{ fontSize: 14, padding: '6px 16px' }}>{TYPE_LABELS[doc.status]}</span>
        </div>
        <div className="detail-meta">
          <div className="detail-meta-item"><span>文号</span>{doc.doc_no}</div>
          <div className="detail-meta-item"><span>来文单位</span>{doc.send_unit}</div>
          <div className="detail-meta-item"><span>收文日期</span>{doc.receive_date}</div>
          <div className="detail-meta-item"><span>登记人</span>{doc.created_by}</div>
        </div>
      </div>

      <div className="detail-body">
        <div className="detail-section">
          <h4>落实措施</h4>
          <div className="rich-content" dangerouslySetInnerHTML={{ __html: doc.implement_html || '<p style="color:var(--text-muted)">暂无</p>' }} />
        </div>

        {doc.attachments?.length > 0 && (
          <div className="detail-section">
            <h4>附件文件（{doc.attachments.length}个）</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {doc.attachments.map((a, i) => (
                <a key={i} href={withToken(a.url)} target="_blank" rel="noopener noreferrer" className="btn-outline" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {'\u{1F4C4}'} {a.name} {a.size ? `(${formatSize(a.size)})` : ''}
                </a>
              ))}
            </div>
            {doc.attachments.filter(a => /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(a.name)).length > 0 && (
              <div className="photo-grid">
                {doc.attachments.filter(a => /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(a.name)).map((a, i) => (
                  <a key={`img-${i}`} className="photo-thumb" href={withToken(a.url)} target="_blank" rel="noopener noreferrer">
                    <img src={withToken(a.url)} alt={a.name} />
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {doc.linkedWorks?.length > 0 && (
          <div className="detail-section">
            <h4>关联现场工作（{doc.linkedWorks.length}项）</h4>
            <div className="timeline">
              {doc.linkedWorks.map((w, i) => (
                <div key={w.id} className="timeline-item">
                  <div className="timeline-dot">{i + 1}</div>
                  <div className="timeline-content">
                    <h5 style={{ cursor: 'pointer', color: 'var(--primary)' }} onClick={() => onNavigate('fieldWorkDetail', { id: w.id })}>{w.title}</h5>
                    <p>{w.location} · {w.work_date}</p>
                    <div className="time">参与人：{w.participants}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="detail-section">
          <div style={{ display: 'flex', gap: 10 }}>
            {doc.attachments?.length > 0 && <button className="action-btn pdf" onClick={() => setShowPdf(true)}>{'\u{1F5A8}'} 导出PDF</button>}
          </div>
        </div>
      </div>

      {showPdf && (
        <PdfPreview title="收文落实报告" type="doc" data={doc} onClose={() => setShowPdf(false)} />
      )}
    </div>
  );
}
