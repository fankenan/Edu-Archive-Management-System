import { useState, useEffect } from 'react';
import { withToken } from '../api';

export default function FileUploader({ label, accept, files, onFilesChange, existingFiles = [], onExistingRemove = null, multiple = false }) {
  const [dragover, setDragover] = useState(false);
  const [previews, setPreviews] = useState({});

  useEffect(() => {
    const urls = {};
    files.forEach((f, i) => {
      if (f instanceof File && f.type.startsWith('image/')) {
        urls[i] = URL.createObjectURL(f);
      }
    });
    setPreviews(urls);
    return () => Object.values(urls).forEach(u => URL.revokeObjectURL(u));
  }, [files]);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragover(false);
    const dropped = Array.from(e.dataTransfer.files);
    onFilesChange(multiple ? [...files, ...dropped] : dropped);
  };

  const handleChange = (e) => {
    const selected = Array.from(e.target.files);
    onFilesChange(multiple ? [...files, ...selected] : selected);
    e.target.value = '';
  };

  const removeFile = (i) => {
    onFilesChange(files.filter((_, idx) => idx !== i));
  };

  const formatSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const isImage = (f) => {
    if (f instanceof File) return f.type.startsWith('image/');
    return /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(f.name || f.url || '');
  };

  const allItems = [
    ...existingFiles.map((f, i) => ({ ...f, _isExisting: true, _idx: i })),
    ...files.map((f, i) => ({ ...f, _isExisting: false, _idx: i })),
  ];

  return (
    <div>
      <div
        className={`upload-zone ${dragover ? 'dragover' : ''}`}
        onClick={() => document.getElementById('file-input-' + label)?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
        onDragLeave={() => setDragover(false)}
        onDrop={handleDrop}
      >
        <div className="upload-zone-icon">{'\u{1F4E4}'}</div>
        <div className="upload-zone-text">{label || '点击或拖拽文件到此处上传'}</div>
        {accept && <div className="upload-zone-hint">支持格式: {accept}</div>}
        <input
          id={'file-input-' + label}
          type="file"
          multiple={multiple}
          accept={accept}
          onChange={handleChange}
          style={{ display: 'none' }}
        />
      </div>

      {allItems.length > 0 && (
        <div className="photo-grid">
          {allItems.map((f, i) => {
            const isExisting = f._isExisting;
            const idx = f._idx;
            return (
              <div key={isExisting ? 'existing-' + i : 'new-' + i} className="photo-thumb" style={{ position: 'relative' }}>
                {isExisting ? (
                  isImage(f) ? <img src={withToken(f.url)} alt={f.name} /> : <span style={{ fontSize: 28 }}>{'\u{1F4CE}'}</span>
                ) : (
                  previews[idx] != null ? <img src={previews[idx]} alt={f.name} /> : <span style={{ fontSize: 28 }}>{'\u{1F4CE}'}</span>
                )}
                <button
                  className="file-remove"
                  style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.5)', color: 'white', borderRadius: '50%', width: 22, height: 22, fontSize: 12, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isExisting && onExistingRemove) {
                      onExistingRemove(idx);
                    } else {
                      removeFile(idx);
                    }
                  }}
                >{'×'}</button>
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.5)', color: 'white', fontSize: 10, padding: '2px 6px', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.name} {!isExisting && f.size ? formatSize(f.size) : ''}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
