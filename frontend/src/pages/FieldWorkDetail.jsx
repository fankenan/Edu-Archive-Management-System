import { useState, useEffect } from 'react';
import { getFieldWork, withToken } from '../api';
import PdfPreview from '../components/PdfPreview';

const TYPE_CLASSES = { completed: 'badge-success', processing: 'badge-info', pending: 'badge-warning' };
const TYPE_LABELS = { completed: '已完成', processing: '进行中', pending: '待落实' };

export default function FieldWorkDetail({ id, onNavigate }) {
  const [work, setWork] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPdf, setShowPdf] = useState(false);

  useEffect(() => { loadWork(); }, [id]);

  const loadWork = async () => {
    try {
      const res = await getFieldWork(id);
      setWork(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  if (loading) return <div className="loading-state">加载中...</div>;
  if (!work) return <div className="empty-state"><p>记录不存在</p></div>;

  return (
    <div>
      <button className="btn-outline mb-4" style={{ float: 'right' }} onClick={() => onNavigate('fieldWork')}>返回列表</button>

      <div className="detail-header">
        <div className="flex-between">
          <h2>{work.title}</h2>
          <span className={`badge ${TYPE_CLASSES[work.status]}`} style={{ fontSize: 14, padding: '6px 16px' }}>{TYPE_LABELS[work.status]}</span>
        </div>
        <div className="detail-meta">
          <div className="detail-meta-item"><span>类型</span>{work.type}</div>
          <div className="detail-meta-item"><span>地点</span>{work.location}</div>
          <div className="detail-meta-item"><span>日期</span>{work.work_date}</div>
          <div className="detail-meta-item"><span>参与人</span>{work.participants}</div>
          <div className="detail-meta-item"><span>登记人</span>{work.created_by}</div>
        </div>
      </div>

      <div className="detail-body">
        <div className="detail-section">
          <h4>工作描述</h4>
          <div className="rich-content" dangerouslySetInnerHTML={{ __html: work.description_html || '<p style="color:var(--text-muted)">暂无</p>' }} />
        </div>

        <div className="detail-section">
          <h4>结论与反馈</h4>
          <div className="rich-content" dangerouslySetInnerHTML={{ __html: work.conclusion_html || '<p style="color:var(--text-muted)">暂无</p>' }} />
        </div>

        {work.photos?.length > 0 && (
          <div className="detail-section">
            <h4>现场照片（{work.photos.length}张）</h4>
            <div className="photo-grid">
              {work.photos.map((p, i) => (
                <a key={i} className="photo-thumb" href={withToken(p.url)} target="_blank" rel="noopener noreferrer">
                  {p.url.match(/\.(jpg|jpeg|png)$/i) ? <img src={withToken(p.url)} alt={p.name} /> : <span>{'\u{1F4C4}'}</span>}
                </a>
              ))}
            </div>
          </div>
        )}

        {work.attachments?.length > 0 && (
          <div className="detail-section">
            <h4>附件文件</h4>
            {work.attachments.map((a, i) => (
              <a key={i} href={withToken(a.url)} target="_blank" rel="noopener noreferrer" className="btn-outline" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 8 }}>
                {'\u{1F4CE}'} {a.name}
              </a>
            ))}
          </div>
        )}

        {work.linked_doc && (
          <div className="detail-section">
            <h4>关联收文</h4>
            <div style={{ cursor: 'pointer', color: 'var(--primary)', fontWeight: 600 }} onClick={() => onNavigate('docDetail', { id: work.linked_doc.id })}>
              {work.linked_doc.doc_no} — {work.linked_doc.title}
            </div>
          </div>
        )}

        <div className="detail-section">
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="action-btn pdf" onClick={() => setShowPdf(true)}>{'\u{1F5A8}'} 导出PDF</button>
          </div>
        </div>
      </div>

      {showPdf && (
        <PdfPreview title="现场工作报告" type="work" data={work} onClose={() => setShowPdf(false)} />
      )}
    </div>
  );
}
