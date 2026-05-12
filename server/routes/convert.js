const express = require('express');
const path = require('path');
const fs = require('fs');
const mammoth = require('mammoth');
const XLSX = require('xlsx');
const { authMiddleware } = require('../middleware/auth');
const { libreOfficeConvert, convertToPdf, convertToImages } = require('../utils/convertToPdf');

const router = express.Router();

router.get('/:filename', authMiddleware, async (req, res) => {
  try {
    const filename = req.params.filename;
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    const uploadsDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
    const filePath = path.join(uploadsDir, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const ext = path.extname(filename).toLowerCase();

    if (ext === '.pdf') {
      return res.json({ type: 'pdf', url: `/uploads/${filename}` });
    }

    if (ext === '.docx') {
      return await convertOfficeWithFallback(uploadsDir, filePath, filename, 'docx', res);
    }

    if (ext === '.doc') {
      return await convertOfficeWithFallback(uploadsDir, filePath, filename, 'doc', res);
    }

    if (ext === '.xlsx') {
      return await convertOfficeWithFallback(uploadsDir, filePath, filename, 'xlsx', res);
    }

    if (ext === '.xls') {
      return await convertOfficeWithFallback(uploadsDir, filePath, filename, 'xls', res);
    }

    if (/\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(ext)) {
      return res.json({ type: 'image', url: `/uploads/${filename}` });
    }

    return res.json({ type: 'unsupported', message: '该文件格式不支持在线预览' });
  } catch (err) {
    console.error('Convert error:', err);
    res.status(500).json({ error: '转换服务错误' });
  }
});

async function convertOfficeWithFallback(uploadsDir, filePath, filename, format, res) {
  // Tier 1: LibreOffice to PDF (produces best fidelity)
  try {
    const pdfName = filename.replace(/\.[^.]+$/, '') + '.converted.pdf';
    const pdfPath = path.join(uploadsDir, pdfName);

    if (fs.existsSync(pdfPath)) {
      const srcStat = fs.statSync(filePath);
      const pdfStat = fs.statSync(pdfPath);
      if (pdfStat.mtime >= srcStat.mtime) {
        return res.json({ type: 'pdf', url: `/uploads/${pdfName}` });
      }
    }

    const outDir = path.dirname(filePath);

    if (!libreOfficeConvert(filePath, outDir)) {
      throw new Error('LibreOffice conversion failed');
    }

    const loPdfName = path.basename(filename, path.extname(filename)) + '.pdf';
    const loPdfPath = path.join(uploadsDir, loPdfName);

    if (fs.existsSync(loPdfPath)) {
      if (loPdfPath !== pdfPath) {
        if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
        fs.renameSync(loPdfPath, pdfPath);
      }
      return res.json({ type: 'pdf', url: `/uploads/${pdfName}` });
    }

    throw new Error('LibreOffice 未生成输出文件');
  } catch (e) {
    console.error('LibreOffice conversion failed:', e.stderr?.toString() || e.message);
  }

  // Tier 2: JS-based fallback for docx/xlsx (mammoth / xlsx library)
  if (format === 'docx') {
    return await convertDocxToHtml(filePath, res);
  }
  if (format === 'xlsx') {
    return await convertXlsxToHtml(filePath, res);
  }

  // .doc and .xls have no JS fallback
  return res.status(500).json({
    error: '该旧版格式需要安装 LibreOffice 才能预览，请安装 LibreOffice 或将文件转换为 .docx / .xlsx 格式后再试',
  });
}

async function convertDocxToHtml(filePath, res) {
  try {
    const result = await mammoth.convertToHtml({ path: filePath });
    const html = result.value;

    if (result.messages?.length) {
      result.messages.forEach(m => console.warn('Mammoth:', m.type, m.message));
    }

    const wrapped = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"></head>
<body><div class="docx-content">${html}</div></body>
</html>`;

    return res.json({ type: 'html', html: wrapped });
  } catch (e) {
    console.error('Mammoth conversion error:', e.message);
    return res.status(500).json({ error: '文档转换失败，请尝试安装 LibreOffice 以获取更好体验' });
  }
}

async function convertXlsxToHtml(filePath, res) {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetNames = workbook.SheetNames;
    let html = '';

    for (let i = 0; i < sheetNames.length; i++) {
      const name = sheetNames[i];
      const sheet = workbook.Sheets[name];
      const sheetHtml = XLSX.utils.sheet_to_html(sheet, {
        id: `sheet-${i}`,
        editable: false,
      });

      if (sheetNames.length > 1) {
        html += `<h3 style="margin:16px 0 8px;font-size:14px;">${name}</h3>`;
      }
      html += sheetHtml;
    }

    const wrapped = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"></head>
<body><div class="xlsx-content">${html}</div></body>
</html>`;

    return res.json({ type: 'html', html: wrapped });
  } catch (e) {
    console.error('XLSX conversion error:', e.message);
    return res.status(500).json({ error: '电子表格转换失败，请尝试安装 LibreOffice 以获取更好体验' });
  }
}

/**
 * POST /api/preview
 * Unified endpoint for iframe-based PDF preview and export.
 * Converts Office documents to optimized PDF and returns the URL.
 * Body: { filename: "xxx.docx", action: "preview" | "export" }
 */
router.post('/preview', authMiddleware, async (req, res) => {
  try {
    const { filename, action } = req.body;
    if (!filename) return res.status(400).json({ error: 'filename is required' });

    // Security: prevent path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    const uploadsDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
    const filePath = path.join(uploadsDir, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const result = convertToPdf(filePath, filename);

    if (!result.success) {
      return res.status(500).json({ error: result.error || 'Conversion failed' });
    }

    const expiresAt = new Date(Date.now() + (action === 'export' ? 60 * 60 * 1000 : 30 * 60 * 1000));

    return res.json({
      success: true,
      pdfUrl: result.pdfUrl,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err) {
    console.error('Preview error:', err);
    res.status(500).json({ error: '预览服务错误' });
  }
});

/**
 * POST /api/preview/images
 * Converts document to images for preview (for weak devices / old browsers).
 * Body: { filename: "xxx.docx" }
 * Returns: { success, images: [{ page, url }], totalPages }
 */
router.post('/preview/images', authMiddleware, async (req, res) => {
  try {
    const { filename } = req.body;
    if (!filename) return res.status(400).json({ error: 'filename is required' });

    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    const uploadsDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
    const filePath = path.join(uploadsDir, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const result = convertToImages(filePath, filename);

    if (!result.success) {
      return res.status(500).json({ error: result.error || 'Image conversion failed' });
    }

    return res.json({
      success: true,
      images: result.images,
      totalPages: result.totalPages,
    });
  } catch (err) {
    console.error('Preview images error:', err);
    res.status(500).json({ error: '图片转换服务错误' });
  }
});

module.exports = router;
