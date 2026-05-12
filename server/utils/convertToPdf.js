const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function getLibreOfficePath() {
  // Check env override first
  if (process.env.LIBREOFFICE_PATH) return process.env.LIBREOFFICE_PATH;

  // Windows default installation paths
  const winPaths = [
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  ];
  if (process.platform === 'win32') {
    for (const p of winPaths) {
      if (fs.existsSync(p)) return p;
    }
  }

  // Fall back to PATH lookup (Linux/Mac)
  return 'libreoffice';
}

const libreofficeBin = getLibreOfficePath();

/**
 * Run LibreOffice to convert an Office file to PDF.
 * Returns the path to the generated PDF, or null on failure.
 */
function libreOfficeConvert(filePath, outDir) {
  try {
    execSync(`"${libreofficeBin}" --headless --convert-to pdf --outdir "${outDir}" "${filePath}"`, {
      timeout: 30000,
      maxBuffer: 2 * 1024 * 1024,
      stdio: 'pipe',
    });
    return true;
  } catch (e) {
    console.error('LibreOffice conversion failed:', e.stderr?.toString() || e.message);
    return false;
  }
}

function getGhostscriptPath() {
  if (process.env.GHOSTSCRIPT_PATH) return process.env.GHOSTSCRIPT_PATH;

  if (process.platform === 'win32') {
    const winPaths = [
      'C:\\Program Files\\gs\\gs10.03.1\\bin\\gswin64c.exe',
      'C:\\Program Files\\gs\\gs10.03.0\\bin\\gswin64c.exe',
      'C:\\Program Files\\gs\\gs9.56.1\\bin\\gswin64c.exe',
      'C:\\Program Files (x86)\\gs\\gs10.03.1\\bin\\gswin32c.exe',
      'C:\\Program Files (x86)\\gs\\gs10.03.0\\bin\\gswin32c.exe',
      'C:\\Program Files (x86)\\gs\\gs9.56.1\\bin\\gswin32c.exe',
    ];
    for (const p of winPaths) {
      if (fs.existsSync(p)) return p;
    }
  }

  return 'gs';
}

const gsBin = getGhostscriptPath();

/**
 * Optimize PDF with Ghostscript: compress, reduce size, standardize layout.
 * Returns true if successful, false otherwise.
 */
function optimizePdfWithGhostscript(pdfPath) {
  if (!fs.existsSync(pdfPath)) return false;

  const optimizedPath = pdfPath.replace(/\.pdf$/i, '.optimized.pdf');

  try {
    const cmd = `"${gsBin}" -dNOPAUSE -dBATCH -sDEVICE=pdfwrite \
      -dCompatibilityLevel=1.4 \
      -dPDFSETTINGS=/ebook \
      -dColorImageResolution=150 \
      -dGrayImageResolution=150 \
      -dMonoImageResolution=150 \
      -dDownsampleColorImages=true \
      -dDownsampleGrayImages=true \
      -dEmbedAllFonts=true \
      -dSubsetFonts=true \
      -dAutoRotatePages=/PageByPage \
      -sOutputFile="${optimizedPath}" \
      "${pdfPath}"`;

    execSync(cmd, { timeout: 60000, stdio: 'pipe' });

    if (fs.existsSync(optimizedPath)) {
      const origSize = fs.statSync(pdfPath).size;
      const optSize = fs.statSync(optimizedPath).size;
      console.log(`[Ghostscript] Optimized: ${origSize} -> ${optSize} bytes (${Math.round(optSize / origSize * 100)}%)`);
      fs.unlinkSync(pdfPath);
      fs.renameSync(optimizedPath, pdfPath);
      return true;
    }
    return false;
  } catch (e) {
    console.error('Ghostscript optimization failed:', e.stderr?.toString() || e.message);
    try { if (fs.existsSync(optimizedPath)) fs.unlinkSync(optimizedPath); } catch (_) {}
    return false;
  }
}

/**
 * Convert a Word/Excel file to PDF at upload time.
 * Deletes the original file and renames the PDF to a unique name.
 * Returns new file metadata if successful, null if conversion fails.
 */
function convertToPdfOnUpload(filePath, originalName) {
  const ext = path.extname(originalName).toLowerCase();
  if (!['.doc', '.docx', '.xls', '.xlsx'].includes(ext)) return null;

  const outDir = path.dirname(filePath);

  if (!libreOfficeConvert(filePath, outDir)) return null;

  // LibreOffice creates: originalname_without_ext.pdf (e.g., report.pdf)
  const loPdfName = path.basename(originalName, ext) + '.pdf';

  // Derive PDF unique name from the uploaded file's multer name
  const uploadedBasename = path.basename(filePath);
  const uniquePdfName = path.basename(uploadedBasename, path.extname(uploadedBasename)) + '.pdf';
  const uniquePdfPath = path.join(outDir, uniquePdfName);

  const loPdfPath = path.join(outDir, loPdfName);

  if (!fs.existsSync(loPdfPath)) return null;

  if (loPdfPath !== uniquePdfPath) {
    if (fs.existsSync(uniquePdfPath)) fs.unlinkSync(uniquePdfPath);
    fs.renameSync(loPdfPath, uniquePdfPath);
  }

  // Optimize with Ghostscript
  optimizePdfWithGhostscript(uniquePdfPath);

  // Delete the original non-PDF file
  try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }

  const pdfSize = fs.statSync(uniquePdfPath).size;
  const pdfDisplayName = path.basename(originalName, ext) + '.pdf';

  return {
    name: pdfDisplayName,
    path: uniquePdfName,
    size: pdfSize,
    url: `/uploads/${uniquePdfName}`,
  };
}

/**
 * Convert any file to optimized PDF via LibreOffice + Ghostscript.
 * Returns { success, pdfPath, pdfUrl, error }.
 */
function convertToPdf(sourcePath, originalName) {
  const ext = path.extname(originalName).toLowerCase();
  if (!['.pdf', '.doc', '.docx', '.xls', '.xlsx'].includes(ext)) {
    return { success: false, error: 'Unsupported format for PDF conversion' };
  }

  if (ext === '.pdf') {
    // Optimize existing PDF
    if (optimizePdfWithGhostscript(sourcePath)) {
      return { success: true, pdfPath: sourcePath, pdfUrl: `/uploads/${path.basename(sourcePath)}` };
    }
    return { success: false, error: 'PDF optimization failed' };
  }

  const outDir = path.dirname(sourcePath);
  if (!libreOfficeConvert(sourcePath, outDir)) {
    return { success: false, error: 'LibreOffice conversion failed' };
  }

  const loPdfName = path.basename(originalName, ext) + '.pdf';
  const loPdfPath = path.join(outDir, loPdfName);

  if (!fs.existsSync(loPdfPath)) {
    return { success: false, error: 'LibreOffice did not produce output file' };
  }

  const convertedName = path.basename(sourcePath).replace(/\.[^.]+$/, '') + '.converted.pdf';
  const convertedPath = path.join(outDir, convertedName);

  if (loPdfPath !== convertedPath) {
    if (fs.existsSync(convertedPath)) fs.unlinkSync(convertedPath);
    fs.renameSync(loPdfPath, convertedPath);
  }

  if (!fs.existsSync(convertedPath)) {
    return { success: false, error: 'Failed to rename converted file' };
  }

  // Optimize with Ghostscript
  optimizePdfWithGhostscript(convertedPath);

  return {
    success: true,
    pdfPath: convertedPath,
    pdfUrl: `/uploads/${path.basename(convertedPath)}`
  };
}

/**
 * Clean up temporary converted PDF files older than maxAgeMs.
 * Returns the number of files deleted.
 */
function cleanupTempFiles(uploadsDir, maxAgeMs = 24 * 60 * 60 * 1000) {
  if (!fs.existsSync(uploadsDir)) return 0;

  const now = Date.now();
  let deleted = 0;
  const patterns = ['.converted.pdf', '.converted.png', '.optimized.pdf'];

  try {
    const files = fs.readdirSync(uploadsDir);
    for (const file of files) {
      const isTemp = patterns.some(p => file.endsWith(p));
      if (!isTemp) continue;

      const filePath = path.join(uploadsDir, file);
      try {
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > maxAgeMs) {
          fs.unlinkSync(filePath);
          deleted++;
          console.log(`[Cleanup] Deleted old temp file: ${file}`);
        }
      } catch (e) {
        // Skip inaccessible files
      }
    }
  } catch (e) {
    console.error('[Cleanup] Failed to read uploads directory:', e.message);
  }

  return deleted;
}

/**
 * Convert document to image(s) using two-step approach:
 * 1. LibreOffice converts Office files to PDF
 * 2. pdftoppm converts PDF to PNG images
 * Returns { success, images: [{ page, path, url }], totalPages }
 */
function convertToImages(sourcePath, originalName) {
  const ext = path.extname(originalName).toLowerCase();
  if (!['.pdf', '.doc', '.docx', '.xls', '.xlsx'].includes(ext)) {
    return { success: false, error: 'Unsupported format for image conversion' };
  }

  const outDir = path.dirname(sourcePath);
  const baseName = path.basename(sourcePath).replace(/\.[^.]+$/, '');
  const dpi = parseInt(process.env.LIBREOFFICE_DPI || '150');

  let pdfPath = null;

  try {
    // Step 1: Ensure we have a PDF
    if (ext === '.pdf') {
      pdfPath = sourcePath;
    } else {
      // Convert Office file to PDF using LibreOffice
      if (!libreOfficeConvert(sourcePath, outDir)) {
        return { success: false, error: 'LibreOffice conversion failed' };
      }
      const loPdfName = path.basename(originalName, ext) + '.pdf';
      const loPdfPath = path.join(outDir, loPdfName);
      if (!fs.existsSync(loPdfPath)) {
        return { success: false, error: 'LibreOffice did not produce PDF' };
      }
      const convertedPdfName = baseName + '.image_temp.pdf';
      pdfPath = path.join(outDir, convertedPdfName);
      if (loPdfPath !== pdfPath) {
        if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
        fs.renameSync(loPdfPath, pdfPath);
      }
    }

    // Step 2: Convert PDF to PNG images using pdftoppm
    const imgPrefix = path.join(outDir, baseName + '.image_temp');
    try {
      execSync(`pdftoppm -r ${dpi} -png "${pdfPath}" "${imgPrefix}"`, {
        timeout: 60000,
        stdio: 'pipe',
      });
    } catch (e) {
      console.error('pdftoppm failed:', e.message);
      if (pdfPath !== sourcePath) try { fs.unlinkSync(pdfPath); } catch (_) {}
      return { success: false, error: 'PDF转图片失败，请确保poppler-utils已安装' };
    }

    // Step 3: Find and rename generated images
    const pattern = baseName + '.image_temp';
    const files = fs.readdirSync(outDir)
      .filter(f => f.startsWith(pattern) && f.endsWith('.png'))
      .sort();

    if (files.length === 0) {
      if (pdfPath !== sourcePath) try { fs.unlinkSync(pdfPath); } catch (_) {}
      return { success: false, error: 'No images generated' };
    }

    const images = [];
    for (let i = 0; i < files.length; i++) {
      const newName = `${baseName}.page_${i + 1}.png`;
      const newPath = path.join(outDir, newName);
      const oldPath = path.join(outDir, files[i]);
      if (fs.existsSync(newPath)) fs.unlinkSync(newPath);
      fs.renameSync(oldPath, newPath);
      images.push({
        page: i + 1,
        path: newName,
        url: `/uploads/${newName}`,
      });
    }

    // Cleanup the intermediate PDF
    if (pdfPath !== sourcePath) try { fs.unlinkSync(pdfPath); } catch (_) {}

    return { success: true, images, totalPages: images.length };
  } catch (e) {
    console.error('convertToImages error:', e.message);
    if (pdfPath && pdfPath !== sourcePath) try { fs.unlinkSync(pdfPath); } catch (_) {}
    return { success: false, error: e.message };
  }
}

module.exports = { convertToPdfOnUpload, libreOfficeConvert, getLibreOfficePath, getGhostscriptPath, optimizePdfWithGhostscript, convertToPdf, convertToImages, cleanupTempFiles };
