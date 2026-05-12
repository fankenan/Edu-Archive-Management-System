import { useState, useEffect, useRef } from 'react';
import dayjs from 'dayjs';
import { withToken, getPreviewUrl } from '../api';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import ImagePreview from './ImagePreview';

// ============ Browser Capability Detection ============
function detectBrowserCapability() {
  const ua = navigator.userAgent;

  // IE 11
  if (ua.includes('Trident') || ua.includes('MSIE')) {
    return { isModern: false, isWeakDevice: true, reason: 'ie11' };
  }

  // Old Edge (EdgeHTML-based, not Chromium)
  if (ua.includes('Edge/') && !ua.includes('Edg/')) {
    const version = parseInt(ua.match(/Edge\/(\d+)/)?.[1] || '0');
    if (version < 79) return { isModern: false, isWeakDevice: true, reason: 'old-edge' };
  }

  // Old Chrome
  if (ua.includes('Chrome/') && !ua.includes('Chromium')) {
    const match = ua.match(/Chrome\/(\d+)/);
    const version = match ? parseInt(match[1]) : 0;
    if (version < 80) return { isModern: false, isWeakDevice: true, reason: 'old-chrome' };
  }

  // Old Firefox
  if (ua.includes('Firefox/')) {
    const match = ua.match(/Firefox\/(\d+)/);
    const version = match ? parseInt(match[1]) : 0;
    if (version < 75) return { isModern: false, isWeakDevice: true, reason: 'old-firefox' };
  }

  // Windows 7 detection
  const isWin7 = ua.includes('Windows NT 6.1');

  // Kylin (银河麒麟) detection
  const isKylin = ua.includes('Kylin') || ua.includes('麒麟');

  // Check for low-memory / weak device indicators
  // navigator.hardwareConcurrency < 2, deviceMemory not available in all browsers
  if (isWin7 || isKylin) {
    return { isModern: false, isWeakDevice: true, reason: isKylin ? 'kylin' : 'windows7' };
  }

  return { isModern: true, isWeakDevice: false, reason: 'modern' };
}

function isNativePdfFile(filename) {
  return /\.pdf$/i.test(filename);
}

function shouldUseServerFallback(filename, cap) {
  // Use server fallback if: not a native PDF (Office docs need conversion)
  // OR browser is weak (PDF.js canvas rendering would be slow)
  if (!isNativePdfFile(filename)) return true;
  if (cap.isWeakDevice) return true;
  return false;
}

// ============ PDF Page Renderer (Canvas-based for modern browsers) ============
function PdfPageRenderer({ path: filePath, name }) {
  const [pages, setPages] = useState([]);
  const [htmlContent, setHtmlContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function render() {
      try {
        const resp = await fetch(withToken(`/api/convert/${filePath}`));
        const data = await resp.json();

        if (data.type === 'html') {
          if (!cancelled) { setHtmlContent(data.html); setLoading(false); }
          return;
        }

        if (data.type !== 'pdf') {
          if (!cancelled) setError(data.error || '文档转换失败');
          return;
        }

        const pdfUrl = withToken(data.url);

        const pdfjsLib = await import('pdfjs-dist');
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
        }

        const loadingTask = pdfjsLib.getDocument({ url: pdfUrl, disableAutoFetch: false });
        const pdf = await loadingTask.promise;
        const total = pdf.numPages;
        const pageImages = [];

        for (let i = 1; i <= total; i++) {
          if (cancelled) return;
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          await page.render({
            canvasContext: ctx,
            viewport,
            intent: 'print',
            annotationMode: 0,
          }).promise;
          pageImages.push(canvas.toDataURL('image/jpeg', 0.92));
        }

        if (!cancelled) setPages(pageImages);
      } catch (e) {
        if (!cancelled) setError('文档渲染失败: ' + e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    render();
    return () => { cancelled = true; };
  }, [filePath]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>正在加载文档内容...</div>;
  if (error) return <div style={{ padding: 20, color: '#c00', textAlign: 'center' }}>{error}</div>;

  if (htmlContent) {
    return (
      <div className="pdf-page" style={{ padding: 0 }}>
        <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
      </div>
    );
  }

  if (pages.length === 0) return null;

  return pages.map((dataUrl, i) => (
    <div key={i} className="pdf-page" style={{ padding: 0 }}>
      <img src={dataUrl} alt={`${name} 第${i + 1}页`} style={{ width: '100%', height: 'auto', display: 'block' }} />
    </div>
  ));
}

function isImageFile(name) {
  return /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(name);
}

function PhotoImg({ src, alt, ...rest }) {
  const [rotatedSrc, setRotatedSrc] = useState(null);

  const handleLoad = (e) => {
    const img = e.target;
    if (img.naturalHeight > img.naturalWidth) {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalHeight;
      canvas.height = img.naturalWidth;
      const ctx = canvas.getContext('2d');
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      setRotatedSrc(canvas.toDataURL('image/jpeg', 0.92));
    }
  };

  const displaySrc = rotatedSrc || src;
  return <img src={displaySrc} alt={alt} onLoad={handleLoad} style={{ maxWidth: '100%', height: 'auto', display: 'block', margin: '0 auto' }} {...rest} />;
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

// ============ Iframe-based Renderer for Weak Devices ============
function FallbackAttachmentRenderer({ attachments }) {
  const [previewFile, setPreviewFile] = useState(null);

  if (!attachments?.length) return null;

  return (
    <>
      {attachments.map((a, i) => {
        const ext = (a.name || '').split('.').pop()?.toLowerCase();
        if (isImageFile(a.name)) return null;

        return (
          <div key={`fallback-${i}`} className="pdf-page">
            <div className="pdf-section">
              <div style={{ padding: 40, textAlign: 'center' }}>
                <div style={{ marginBottom: 16, fontSize: 16 }}>{a.name}</div>
                <button
                  className="btn-sm btn-primary"
                  onClick={() => setPreviewFile(a)}
                >
                  预览 / 打印 / 另存
                </button>
              </div>
            </div>
          </div>
        );
      })}
      {previewFile && (
        <ImagePreview
          filename={previewFile.path}
          title={previewFile.name}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </>
  );
}

// ============ Main Component ============
export default function PdfPreview({ title, type, data, onClose }) {
  const [saving, setSaving] = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);
  const [cap] = useState(() => detectBrowserCapability());
  const bodyRef = useRef(null);

  // Determine whether to use iframe fallback based on attachments
  useEffect(() => {
    if (!data.attachments?.length) return;

    // If any attachment is not a native PDF on a weak device, use fallback mode
    const hasNonPdf = data.attachments.some(a => {
      const ext = (a.name || '').split('.').pop()?.toLowerCase();
      return !isImageFile(a.name) && ext !== 'pdf';
    });

    if (hasNonPdf && cap.isWeakDevice) {
      setUsingFallback(true);
    }
  }, [data.attachments, cap]);

  const handleSave = async () => {
    // Use server-side conversion for export (more reliable for complex docs)
    const firstAttachment = data.attachments?.[0];
    if (firstAttachment && !isImageFile(firstAttachment.name)) {
      setSaving(true);
      try {
        const resp = await getPreviewUrl(firstAttachment.path, 'export');
        if (resp.data.success) {
          const a = document.createElement('a');
          a.href = withToken(resp.data.pdfUrl);
          a.download = firstAttachment.name.replace(/\.[^.]+$/, '.pdf');
          a.target = '_blank';
          a.click();
        }
      } catch (e) {
        console.error('Export failed:', e);
      } finally {
        setSaving(false);
      }
      return;
    }

    // Fallback to client-side for images
    const pages = bodyRef.current?.querySelectorAll('.pdf-page');
    if (!pages || pages.length === 0) return;

    setSaving(true);
    try {
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const imgWidth = pageWidth - margin * 2;
      const maxImgHeight = pageHeight - margin * 2;
      let firstPage = true;

      for (let pi = 0; pi < pages.length; pi++) {
        const page = pages[pi];
        const photoItems = page.querySelectorAll('.pdf-photo-item');

        if (photoItems.length > 0) {
          const canvas = await html2canvas(page, {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            logging: false,
          });
          const imgH = (canvas.height * imgWidth) / canvas.width;
          const finalH = Math.min(imgH, maxImgHeight);
          const scale = finalH / imgH;

          if (!firstPage) pdf.addPage();
          firstPage = false;

          if (scale < 1) {
            const scaledW = imgWidth * scale;
            const scaledH = imgH * scale;
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, scaledW, scaledH);
          } else {
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, imgWidth, imgH);
          }
        } else {
          const canvas = await html2canvas(page, {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            logging: false,
          });

          const imgHeight = (canvas.height * imgWidth) / canvas.width;
          const remainingHeight = pageHeight - margin * 2;
          let srcY = 0;

          while (srcY < canvas.height) {
            if (!firstPage) pdf.addPage();
            firstPage = false;

            const sliceHeight = Math.min(
              (canvas.height - srcY),
              (remainingHeight / imgHeight) * canvas.height
            );
            const sliceCanvas = document.createElement('canvas');
            sliceCanvas.width = canvas.width;
            sliceCanvas.height = Math.ceil(sliceHeight);
            const ctx = sliceCanvas.getContext('2d');
            ctx.drawImage(canvas, 0, srcY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

            const sliceData = sliceCanvas.toDataURL('image/jpeg', 0.92);
            const sliceImgH = (sliceHeight * imgWidth) / canvas.width;

            pdf.addImage(sliceData, 'JPEG', margin, margin, imgWidth, sliceImgH);

            srcY += sliceHeight;
          }
        }
      }

      pdf.save(`${title || '档案导出'}_${dayjs().format('YYYY-MM-DD')}.pdf`);
    } catch (e) {
      console.error('PDF generation error:', e);
    } finally {
      setSaving(false);
    }
  };

  const renderDocAttachmentPages = () => {
    if (!data.attachments?.length) return null;
    const pages = [];
    data.attachments.forEach((a, idx) => {
      const ext = (a.name || '').split('.').pop()?.toLowerCase();
      if (isImageFile(a.name)) return;
      if (/^(pdf|docx?|xlsx?)$/i.test(ext)) {
        pages.push(<PdfPageRenderer key={`att-${idx}`} path={a.path} name={a.name} />);
      } else {
        pages.push(
          <div key={`att-${idx}`} className="pdf-page">
            <div className="pdf-section">
              <div style={{ padding: 40, textAlign: 'center' }}>
                <a href={withToken(a.url)} target="_blank" rel="noopener noreferrer">{a.name}</a><br />点击下载查看
              </div>
            </div>
          </div>
        );
      }
    });
    return pages.length > 0 ? pages : null;
  };

  const renderWorkAttachmentPages = () => {
    if (!data.attachments?.length) return null;
    const pages = [];
    data.attachments.forEach((a, idx) => {
      const ext = (a.name || '').split('.').pop()?.toLowerCase();
      if (/^(pdf|docx?|xlsx?)$/i.test(ext)) {
        pages.push(<PdfPageRenderer key={`watt-${idx}`} path={a.path} name={a.name} />);
      } else {
        pages.push(
          <div key={`watt-${idx}`} className="pdf-page">
            <div className="pdf-section">
              <div style={{ padding: 40, textAlign: 'center' }}>
                <a href={withToken(a.url)} target="_blank" rel="noopener noreferrer">{a.name}</a><br />点击下载查看
              </div>
            </div>
          </div>
        );
      }
    });
    return pages.length > 0 ? pages : null;
  };

  const docImageAttachments = data.attachments?.filter(a => isImageFile(a.name)) || [];
  const renderDocPdf = () => (
    <>
      <div className="pdf-page">
        <div className="pdf-title">{data.title}</div>
        <div className="pdf-subtitle">
          文号：{data.doc_no} | 来文单位：{data.send_unit} | 收文日期：{data.receive_date}
        </div>
        <div className="pdf-section">
          <div className="pdf-section-title">落实措施</div>
          <div className="pdf-body-text" dangerouslySetInnerHTML={{ __html: data.implement_html || '暂无' }} />
        </div>
        <div className="pdf-section" style={{ marginTop: 24 }}>
          <div className="pdf-section-title">开展情况（{data.linkedWorks?.length || 0}项）</div>
          {data.linkedWorks?.map((w, i) => (
            <div key={i} style={{ marginBottom: 10, fontSize: 11, color: '#555' }}>
              {i + 1}. {w.title} — {w.location} ({w.work_date}) 参与人：{w.participants}
            </div>
          ))}
        </div>
        {data.attachments?.length > 0 && (
          <div className="pdf-section" style={{ marginTop: 24 }}>
            <div className="pdf-section-title">附件文件（{data.attachments.length}个）</div>
            {data.attachments.map((a, i) => (
              <div key={i} style={{ marginBottom: 6, fontSize: 16, fontFamily: "'FangSong', 'FangSong_GB2312', serif" }}>
                {i + 1}. {a.name.replace(/\.[^.]+$/, '')}
              </div>
            ))}
          </div>
        )}
        <div className="pdf-footer" style={{ justifyContent: 'flex-end' }}>
          <span>{dayjs().format('YYYY-MM-DD')}</span>
        </div>
      </div>
      {docImageAttachments.length > 0 && chunkArray(docImageAttachments, 2).map((group, gi) => (
        <div key={`img-page-${gi}`} className="pdf-page" style={gi === 0 ? { pageBreakBefore: 'always' } : {}}>
          <div className="pdf-section-title" style={{ textAlign: 'center', marginBottom: 16 }}>附件图片（{gi * 2 + 1}{group.length > 1 ? '-' + (gi * 2 + 2) : ''}/{docImageAttachments.length}）</div>
          <div className="pdf-photos">
            {group.map((a, i) => (
              <div key={`img-${gi}-${i}`} className="pdf-photo-item" style={{ marginBottom: 16 }}>
                <PhotoImg src={withToken(a.url)} alt={a.name} />
                <div style={{ textAlign: 'center', fontSize: 10, color: '#888', marginTop: 4 }}>{a.name}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );

  const renderWorkPdf = () => (
    <>
      <div className="pdf-page">
        <div className="pdf-title">{data.title}</div>
        <div className="pdf-subtitle">
          类型：{data.type} | 地点：{data.location} | 日期：{data.work_date}
        </div>
        <div className="pdf-section">
          <div className="pdf-section-title">参与人员</div>
          <div className="pdf-body-text">{data.participants || '—'}</div>
        </div>
        <div className="pdf-section">
          <div className="pdf-section-title">开展情况</div>
          <div className="pdf-body-text" dangerouslySetInnerHTML={{ __html: data.description_html || '暂无' }} />
        </div>
        <div className="pdf-section">
          <div className="pdf-section-title">结论与反馈</div>
          <div className="pdf-body-text" dangerouslySetInnerHTML={{ __html: data.conclusion_html || '暂无' }} />
        </div>
        {data.linked_doc && (
          <div className="pdf-section">
            <div className="pdf-section-title">关联收文</div>
            <div style={{ fontSize: 14 }}>{data.linked_doc.doc_no} — {data.linked_doc.title}</div>
          </div>
        )}
        <div className="pdf-footer" style={{ justifyContent: 'flex-end' }}>
          <span>{dayjs().format('YYYY-MM-DD')}</span>
        </div>
      </div>
      {data.photos?.length > 0 && chunkArray(data.photos, 2).map((group, gi) => (
        <div key={`photo-page-${gi}`} className="pdf-page" style={gi === 0 ? { pageBreakBefore: 'always' } : {}}>
          <div className="pdf-section-title" style={{ textAlign: 'center', marginBottom: 16 }}>现场照片（{gi * 2 + 1}{group.length > 1 ? '-' + (gi * 2 + 2) : ''}/{data.photos.length}）</div>
          <div className="pdf-photos">
            {group.map((p, i) => (
              <div key={`photo-${gi}-${i}`} className="pdf-photo-item" style={{ marginBottom: 16 }}>
                <PhotoImg src={withToken(p.url)} alt={p.name} />
                <div style={{ textAlign: 'center', fontSize: 10, color: '#888', marginTop: 4 }}>{p.name}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );

  return (
    <div className="pdf-preview-overlay" onClick={onClose}>
      <div className="pdf-preview-modal" onClick={e => e.stopPropagation()}>
        <div className="pdf-preview-header">
          <h3>{title || 'PDF 预览'}</h3>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button className="btn-sm btn-primary" style={{ width: 'auto', marginTop: 0 }} onClick={handleSave} disabled={saving}>
              {saving ? '正在生成PDF...' : '保存'}
            </button>
            <button className="btn-sm btn-secondary" onClick={() => window.print()}>打印</button>
            <button className="btn-sm btn-outline" onClick={onClose}>关闭</button>
          </div>
        </div>
        <div className="pdf-preview-body" ref={bodyRef}>
          {usingFallback ? (
            <>
              {type === 'doc' ? renderDocPdf() : renderWorkPdf()}
              <FallbackAttachmentRenderer attachments={data.attachments} />
            </>
          ) : (
            <>
              {type === 'doc' ? renderDocPdf() : renderWorkPdf()}
              {type === 'doc' ? renderDocAttachmentPages() : renderWorkAttachmentPages()}
            </>
          )}
        </div>
      </div>
    </div>
  );
}