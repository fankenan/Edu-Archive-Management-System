import { useState, useEffect, useRef } from 'react';
import { getPreviewUrl, withToken } from '../api';

export default function IframePreview({ filename, title, onClose }) {
  const [pdfUrl, setPdfUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [converting, setConverting] = useState(false);
  const iframeRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function convertAndLoad() {
      setConverting(true);
      setLoading(true);
      setError(null);

      try {
        const resp = await getPreviewUrl(filename, 'preview');
        if (cancelled) return;

        if (resp.data.success) {
          setPdfUrl(withToken(resp.data.pdfUrl));
        } else {
          setError(resp.data.error || '转换失败');
        }
      } catch (e) {
        if (!cancelled) {
          setError('预览服务暂时不可用，请稍后再试');
        }
      } finally {
        if (!cancelled) {
          setConverting(false);
          setLoading(false);
        }
      }
    }

    convertAndLoad();

    return () => { cancelled = true; };
  }, [filename]);

  const handlePrint = () => {
    const iframe = iframeRef.current?.contentWindow;
    if (iframe) {
      iframe.print();
    }
  };

  return (
    <div className="pdf-preview-overlay" onClick={onClose}>
      <div className="pdf-preview-modal" onClick={e => e.stopPropagation()} style={{ width: '90%', maxWidth: 900, height: '90vh' }}>
        <div className="pdf-preview-header">
          <h3>{title || '文档预览'}</h3>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {pdfUrl && (
              <>
                <button className="btn-sm btn-secondary" onClick={handlePrint}>打印</button>
                <button className="btn-sm btn-outline" onClick={() => {
                  const a = document.createElement('a');
                  a.href = pdfUrl;
                  a.download = filename.replace(/\.[^.]+$/, '.pdf');
                  a.target = '_blank';
                  a.click();
                }}>另存PDF</button>
              </>
            )}
            <button className="btn-sm btn-outline" onClick={onClose}>关闭</button>
          </div>
        </div>
        <div className="pdf-preview-body" style={{ height: 'calc(100% - 60px)' }}>
          {loading && (
            <div style={{ padding: 60, textAlign: 'center', color: '#666' }}>
              {converting ? (
                <>
                  <div style={{ fontSize: 32, marginBottom: 16 }}>⚙️</div>
                  <div>正在转换文档（可能需要十几秒）...</div>
                </>
              ) : (
                <div>正在加载预览...</div>
              )}
            </div>
          )}
          {error && (
            <div style={{ padding: 60, textAlign: 'center', color: '#c00' }}>
              <div style={{ fontSize: 32, marginBottom: 16 }}>⚠️</div>
              <div>{error}</div>
            </div>
          )}
          {pdfUrl && !loading && (
            <iframe
              ref={iframeRef}
              src={pdfUrl}
              style={{ width: '100%', height: '100%', border: 'none' }}
              title="Document Preview"
            />
          )}
        </div>
      </div>
    </div>
  );
}