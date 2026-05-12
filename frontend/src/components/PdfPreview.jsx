import { useState, useEffect, useRef } from 'react';
import dayjs from 'dayjs';
import { withToken, getPreviewUrl, getPreviewImages } from '../api';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

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
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

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

// ============ Inline Office Renderer (auto-convert to images) ============
function InlineDocRenderer({ filePath, name }) {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const resp = await getPreviewImages(filePath);
        if (!cancelled) {
          if (resp.data.success) setImages(resp.data.images);
          else setError(resp.data.error || '转换失败');
        }
      } catch (e) {
        if (!cancelled) setError('文档转换失败，请稍后重试');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [filePath]);

  if (loading) return <div style={{ padding: 30, textAlign: 'center', color: '#999' }}>正在转换...</div>;
  if (error) return <div style={{ padding: 20, color: '#c00', textAlign: 'center' }}><b>{name}</b>: {error}</div>;
  if (images.length === 0) return null;

  return (
    <div className="pdf-page" style={{ padding: 0, background: '#f0f0f0' }}>
      {images.map((img, i) => (
        <img
          key={i}
          src={withToken(img.url)}
          alt={`第${i + 1}页`}
          style={{ width: '100%', maxWidth: '100%', display: 'block', marginBottom: 4, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
        />
      ))}
    </div>
  );
}

// ============ Main Component ============
export default function PdfPreview({ title, type, data, onClose }) {
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef(null);

  const handleSave = async () => {
    setSaving(true);
    const pdfName = (data.title || '文档') + '_落实情况.pdf';

    try {
      // Collect all attachment paths that need conversion
      const attachments = data.attachments?.filter(a => !isImageFile(a.name)) || [];
      const allPages = bodyRef.current?.querySelectorAll('.pdf-page');
      const photoPages = bodyRef.current?.querySelectorAll('.pdf-photo-item');

      // Strategy: generate PDF from rendered pages (includes metadata + attachments)
      // This preserves the document formatting (fonts, layout) shown in preview
      const bodyEl = bodyRef.current;
      if (!bodyEl || allPages.length === 0) {
        setSaving(false);
        return;
      }

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const imgWidth = pageWidth - margin * 2;
      const maxImgHeight = pageHeight - margin * 2;
      let isFirstPage = true;

      for (let pi = 0; pi < allPages.length; pi++) {
        const page = allPages[pi];
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
          if (!isFirstPage) pdf.addPage();
          isFirstPage = false;

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

      pdf.save(pdfName);
    } catch (e) {
      console.error('PDF generation error:', e);
      alert('PDF生成失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  // Check if file is a PDF (should use PdfPageRenderer)
  function isPdfFile(name) {
    return /\.pdf$/i.test(name);
  }

  // Check if file is an Office document (should use inline image conversion)
  function isOfficeFile(name) {
    return /\.(docx?|xlsx?)$/i.test(name);
  }

  const renderDocAttachmentPages = () => {
    if (!data.attachments?.length) return null;
    const pages = [];
    data.attachments.forEach((a, idx) => {
      if (isImageFile(a.name)) return;
      if (isPdfFile(a.name)) {
        pages.push(<PdfPageRenderer key={`att-${idx}`} path={a.path} name={a.name} />);
      } else if (isOfficeFile(a.name)) {
        pages.push(<InlineDocRenderer key={`att-${idx}`} filePath={a.path} name={a.name} />);
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
      if (isPdfFile(a.name)) {
        pages.push(<PdfPageRenderer key={`watt-${idx}`} path={a.path} name={a.name} />);
      } else if (isOfficeFile(a.name)) {
        pages.push(<InlineDocRenderer key={`watt-${idx}`} filePath={a.path} name={a.name} />);
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
        <div className="pdf-body-text" style={{ textAlign: 'center', textIndent: 0, marginBottom: 20 }}>
          {data.doc_no}
        </div>
        <div className="pdf-section">
          <div className="pdf-section-title">一、来文信息</div>
          <div className="pdf-body-text" style={{ textIndent: 0 }}>
            来文单位：{data.send_unit}&emsp;收文日期：{data.receive_date}
          </div>
        </div>
        <div className="pdf-section">
          <div className="pdf-section-title">二、落实措施</div>
          <div className="pdf-body-text" dangerouslySetInnerHTML={{ __html: data.implement_html || '暂无' }} />
        </div>
        {data.linkedWorks?.length > 0 && (
          <div className="pdf-section">
            <div className="pdf-section-title">三、开展情况（共{data.linkedWorks.length}项）</div>
            {data.linkedWorks.map((w, i) => (
              <div key={i} className="pdf-body-text" style={{ textIndent: 0, marginBottom: 4 }}>
                {i + 1}. {w.title} — {w.location}（{w.work_date}）参与人：{w.participants}
              </div>
            ))}
          </div>
        )}
        {data.attachments?.length > 0 && (
          <div className="pdf-section">
            <div className="pdf-section-title">附件</div>
            {data.attachments.map((a, i) => (
              <div key={i} className="pdf-body-text" style={{ textIndent: 0 }}>
                {i + 1}. {a.name.replace(/\.[^.]+$/, '')}
              </div>
            ))}
          </div>
        )}
      </div>
      {docImageAttachments.length > 0 && chunkArray(docImageAttachments, 2).map((group, gi) => (
        <div key={`img-page-${gi}`} className="pdf-page" style={gi === 0 ? {} : {}}>
          <div className="pdf-section-title" style={{ textAlign: 'center', marginBottom: 16 }}>附件图片（{gi * 2 + 1}{group.length > 1 ? '-' + (gi * 2 + 2) : ''}/{docImageAttachments.length}）</div>
          <div className="pdf-photos">
            {group.map((a, i) => (
              <div key={`img-${gi}-${i}`} className="pdf-photo-item" style={{ marginBottom: 16 }}>
                <PhotoImg src={withToken(a.url)} alt={a.name} />
                <div style={{ textAlign: 'center', fontSize: 16, color: '#000', marginTop: 4 }}>{a.name}</div>
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
        <div className="pdf-body-text" style={{ textAlign: 'center', textIndent: 0, marginBottom: 20 }}>
          类型：{data.type}&emsp;地点：{data.location}&emsp;日期：{data.work_date}
        </div>
        <div className="pdf-section">
          <div className="pdf-section-title">一、参与人员</div>
          <div className="pdf-body-text">{data.participants || '—'}</div>
        </div>
        <div className="pdf-section">
          <div className="pdf-section-title">二、开展情况</div>
          <div className="pdf-body-text" dangerouslySetInnerHTML={{ __html: data.description_html || '暂无' }} />
        </div>
        <div className="pdf-section">
          <div className="pdf-section-title">三、结论与反馈</div>
          <div className="pdf-body-text" dangerouslySetInnerHTML={{ __html: data.conclusion_html || '暂无' }} />
        </div>
        {data.linked_doc && (
          <div className="pdf-section">
            <div className="pdf-section-title">四、关联收文</div>
            <div className="pdf-body-text">{data.linked_doc.doc_no} — {data.linked_doc.title}</div>
          </div>
        )}
      </div>
      {data.photos?.length > 0 && chunkArray(data.photos, 2).map((group, gi) => (
        <div key={`photo-page-${gi}`} className="pdf-page" style={gi === 0 ? {} : {}}>
          <div className="pdf-section-title" style={{ textAlign: 'center', marginBottom: 16 }}>现场照片（{gi * 2 + 1}{group.length > 1 ? '-' + (gi * 2 + 2) : ''}/{data.photos.length}）</div>
          <div className="pdf-photos">
            {group.map((p, i) => (
              <div key={`photo-${gi}-${i}`} className="pdf-photo-item" style={{ marginBottom: 16 }}>
                <PhotoImg src={withToken(p.url)} alt={p.name} />
                <div style={{ textAlign: 'center', fontSize: 16, color: '#000', marginTop: 4 }}>{p.name}</div>
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
          {type === 'doc' ? renderDocPdf() : renderWorkPdf()}
          {type === 'doc' ? renderDocAttachmentPages() : renderWorkAttachmentPages()}
        </div>
      </div>
    </div>
  );
}