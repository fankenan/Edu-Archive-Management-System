import { useState, useEffect } from 'react';
import { getLogs } from '../api';

const MODULES = ['', '用户管理', '收文落实', '现场工作', '项目类型', '资料分类', '资料上传'];

export default function LogList() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [module, setModule] = useState('');
  const [operator, setOperator] = useState('');
  const [operators, setOperators] = useState([]);
  const [loading, setLoading] = useState(true);

  const pageSize = 20;

  useEffect(() => { loadOperators(); }, []);
  useEffect(() => { loadLogs(); }, [page, module, operator]);

  const loadOperators = async () => {
    try {
      const res = await getLogs({ page: 1, pageSize: 1000 });
      const names = [...new Set(res.data.list.map(l => l.user_name).filter(Boolean))];
      setOperators(names);
    } catch (e) {}
  };

  const loadLogs = async () => {
    setLoading(true);
    try {
      const res = await getLogs({ page, pageSize, module: module || undefined, user_name: operator || undefined });
      setLogs(res.data.list);
      setTotal(res.data.total);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const totalPages = Math.ceil(total / pageSize);

  const ACTION_COLORS = {
    '登录': 'var(--info)',
    '新增': 'var(--success)',
    '编辑': 'var(--warning)',
    '删除': 'var(--danger)',
    '上传': 'var(--info)',
    '导出PDF': 'var(--text-muted)',
  };

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <span className="card-title">{'\u{1F4DD}'} 操作日志</span>
        </div>
        <div className="toolbar">
          <select className="filter-select" value={module} onChange={e => { setModule(e.target.value); setPage(1); }}>
            <option value="">全部模块</option>
            {MODULES.filter(Boolean).map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select className="filter-select" value={operator} onChange={e => { setOperator(e.target.value); setPage(1); }}>
            <option value="">全部操作人</option>
            {operators.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div className="card-body">
          {loading ? <div className="loading-state">加载中...</div> : logs.length === 0 ? <div className="empty-state"><p>暂无日志</p></div> : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>操作人</th>
                  <th>操作</th>
                  <th>模块</th>
                  <th>目标</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(l => (
                  <tr key={l.id}>
                    <td>{l.created_at}</td>
                    <td>{l.user_name}</td>
                    <td><span style={{ color: ACTION_COLORS[l.action] || 'var(--text-primary)', fontWeight: 500 }}>{l.action}</span></td>
                    <td><span className="tag">{l.module}</span></td>
                    <td>{l.target}</td>
                    <td className="text-muted text-sm">{l.ip}</td>
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
