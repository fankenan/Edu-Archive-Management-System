import { useState, useEffect } from 'react';
import { getDashboardStats } from '../api';

const TYPE_LABELS = { pending: '待落实', processing: '落实中', completed: '已完成' };
const TYPE_CLASSES = { pending: 'badge-warning', processing: 'badge-info', completed: 'badge-success' };

const STATUS_COLORS = { pending: '#F59E0B', processing: '#3B82F6', completed: '#10B981' };

export default function Dashboard({ user, onNavigate }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadStats(); }, []);

  const loadStats = async () => {
    try {
      const res = await getDashboardStats();
      setStats(res.data);
    } catch (e) {
      console.error('Failed to load dashboard stats', e);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !stats) {
    return <div className="loading-state">加载中...</div>;
  }

  const completedPercent = stats.totalFieldWorks > 0 ? Math.round(stats.completedWorks / stats.totalFieldWorks * 100) : 0;
  const pendingPercent = stats.totalFieldWorks > 0 ? Math.round(stats.pendingWorks / stats.totalFieldWorks * 100) : 0;

  return (
    <div>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">{'\u{1F4C4}'}</div>
          <div className="stat-value">{stats.totalDocuments}</div>
          <div className="stat-label">收文总量</div>
          <div className="stat-trend up">本月 +{stats.pendingDocuments} 份待落实</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">{'⏳'}</div>
          <div className="stat-value">{stats.pendingDocuments}</div>
          <div className="stat-label">待落实文件</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">{'\u{1F3E0}'}</div>
          <div className="stat-value">{stats.totalFieldWorks}</div>
          <div className="stat-label">现场工作总数</div>
          <div className="stat-trend up">已完成 {stats.completedWorks} 项</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">{'\u{1F514}'}</div>
          <div className="stat-value">{stats.pendingWorks}</div>
          <div className="stat-label">进行中工作</div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div>
          <div className="card mb-4">
            <div className="card-header">
              <span className="card-title">{'\u{1F4C4}'} 最新收文</span>
              <button className="btn-outline" onClick={() => onNavigate('documents')}>查看全部</button>
            </div>
            <div className="card-body">
              {stats.recentDocs.map((doc, i) => (
                <div key={doc.id} className="recent-item" style={{ borderBottom: i < stats.recentDocs.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div className="recent-item-left">
                    <div className="recent-dot" style={{ background: STATUS_COLORS[doc.status] }} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>{doc.title}</div>
                      <div className="text-sm text-muted" style={{ marginTop: 2 }}>{doc.doc_no} · {doc.send_unit} · {doc.receive_date}</div>
                    </div>
                  </div>
                  <span className={`badge ${TYPE_CLASSES[doc.status]}`}>{TYPE_LABELS[doc.status]}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">{'\u{1F3E0}'} 最新现场工作</span>
              <button className="btn-outline" onClick={() => onNavigate('fieldWork')}>查看全部</button>
            </div>
            <div className="card-body">
              {stats.recentWorks.map((work, i) => (
                <div key={work.id} className="recent-item" style={{ borderBottom: i < stats.recentWorks.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div className="recent-item-left">
                    <div className="recent-dot" style={{ background: work.status === 'processing' ? '#3B82F6' : '#10B981' }} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>{work.title}</div>
                      <div className="text-sm text-muted" style={{ marginTop: 2 }}>{work.type} · {work.location} · {work.work_date}</div>
                    </div>
                  </div>
                  <span className="badge badge-default">{work.type}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-header"><span className="card-title">{'\u{1F4CB}'} 快捷操作</span></div>
            <div className="card-body" style={{ padding: 16 }}>
              <div className="quick-list">
                {[
                  { icon: '\u{1F4E5}', label: '新增收文', desc: '登记上级来文及落实措施', page: 'documents' },
                  { icon: '\u{1F3C3}', label: '新增现场工作', desc: '记录下乡检查、会议等工作', page: 'fieldWork' },
                  { icon: '\u{1F4E4}', label: '上传资料文件', desc: '上传各类档案资料文件', page: 'uploads' },
                  { icon: '\u{1F4DD}', label: '查看操作日志', desc: '审计所有用户操作记录', page: 'logs', adminOnly: true },
                ].filter(o => !o.adminOnly || user?.role === 'admin').map(op => (
                  <div key={op.label} className="quick-list-item" onClick={() => onNavigate(op.page)}>
                    <div className="quick-icon">{op.icon}</div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>{op.label}</div>
                      <div className="text-sm text-muted">{op.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card mt-4">
            <div className="card-header"><span className="card-title">{'\u{1F4C8}'} 工作状态概览</span></div>
            <div className="card-body" style={{ padding: 24 }}>
              {[
                { label: '已完成', color: '#10B981', value: stats.completedWorks, pct: completedPercent },
                { label: '进行中', color: '#3B82F6', value: stats.pendingWorks, pct: pendingPercent },
              ].map(item => (
                <div key={item.label} style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
                    <span style={{ color: item.color, fontWeight: 600 }}>{item.label}</span>
                    <span style={{ color: item.color }}>{item.value} 项 ({item.pct}%)</span>
                  </div>
                  <div style={{ height: 8, background: 'var(--bg-hover)', borderRadius: 4 }}>
                    <div style={{ height: 8, width: `${item.pct}%`, background: item.color, borderRadius: 4 }} />
                  </div>
                </div>
              ))}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
                  <span style={{ color: '#F59E0B', fontWeight: 600 }}>待落实</span>
                  <span style={{ color: '#F59E0B' }}>{stats.pendingDocuments} 份文件</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
