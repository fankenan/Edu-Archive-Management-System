import { useState, useEffect } from 'react';
import { getPreviewImages, getPreviewUrl, withToken } from '../api';

export default function ImagePreview({ filename, title, onClose }) {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [converting, setConverting] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchImages() {
      setConverting(true);
      setLoading(true);
      setError(null);

      try {
        const resp = await getPreviewImages(filename);
        if (cancelled) return;

        if (resp.data.success) {
          setImages(resp.data.images);
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

    fetchImages();

    return () => { cancelled = true; };
  }, [filename]);

  const handleSaveAsPdf = async () => {
    if (!filename) return;

    setLoading(true);
    try {
      const resp = await getPreviewUrl(filename, 'export');
      if (resp.data.success) {
        const a = document.createElement('a');
        a.href = withToken(resp.data.pdfUrl);
        a.download = filename.replace(/\.[^.]+$/, '.pdf');
        a.target = '_blank';
        a.click();
      }
    } catch (e) {
      console.error('Save as PDF failed:', e);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handlePrev = () => {
    setCurrentPage(p => Math.max(0, p - 1));
  };

  const handleNext = () => {
    setCurrentPage(p => Math.min(images.length - 1, p + 1));
  };

  return (
    <div className="pdf-preview-overlay" onClick={onClose}>
      <div className="pdf-preview-modal" onClick={e => e.stopPropagation()} style={{ width: '90%', maxWidth: 900, height: '90vh' }}>
        <div className="pdf-preview-header">
          <h3>{title || '文档预览'}</h3>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
            {images.length > 0 && (
              <>
                <span style={{ fontSize: 13, color: '#666' }}>
                  第 {currentPage + 1} / {images.length} 页
                </span>
                <button
                  className="btn-sm btn-outline"
                  onClick={handlePrev}
                  disabled={currentPage === 0}
                  style={{ opacity: currentPage === 0 ? 0.5 : 1 }}
                >
                  上一页
                </button>
                <button
                  className="btn-sm btn-outline"
                  onClick={handleNext}
                  disabled={currentPage === images.length - 1}
                  style={{ opacity: currentPage === images.length - 1 ? 0.5 : 1 }}
                >
                  下一页
                </button>
                <button className="btn-sm btn-secondary" onClick={handlePrint}>打印</button>
                <button className="btn-sm btn-primary" onClick={handleSaveAsPdf} disabled={loading}>另存PDF</button>
              </>
            )}
            <button className="btn-sm btn-outline" onClick={onClose}>关闭</button>
          </div>
        </div>
        <div className="pdf-preview-body" style={{ height: 'calc(100% - 60px)', overflow: 'auto', display: 'flex', justifyContent: 'center', background: '#f0f0f0' }}>
          {loading && (
            <div style={{ padding: 60, textAlign: 'center', color: '#666' }}>
              {converting ? (
                <>
                  <div style={{ fontSize: 32, marginBottom: 16 }}>⚙️</div>
                  <div>正在转换文档为图片（可能需要十几秒）...</div>
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
          {images.length > 0 && !loading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 20 }}>
              {images.map((img, idx) => (
                <img
                  key={idx}
                  src={withToken(img.url)}
                  alt={`第${idx + 1}页`}
                  style={{
                    maxWidth: '100%',
                    height: 'auto',
                    display: idx === currentPage ? 'block' : 'none',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                    background: 'white',
                  }}
                />
              ))}
              {images.length > 1 && (
                <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {images.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentPage(idx)}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 4,
                        border: idx === currentPage ? '2px solid #1890ff' : '1px solid #ddd',
                        background: idx === currentPage ? '#1890ff' : 'white',
                        color: idx === currentPage ? 'white' : '#666',
                        cursor: 'pointer',
                        fontSize: 12,
                      }}
                    >
                      {idx + 1}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}