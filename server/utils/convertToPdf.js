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

module.exports = { convertToPdfOnUpload, libreOfficeConvert, getLibreOfficePath };
