/**
 * Google Drive storage: upload images to Year/MonthName folder structure (e.g. 2026/March).
 * Image name format: {shift}_{workstation}_mmddyyyyhhmmss.ext (e.g. 1_Register1_02112026143022.png)
 * Uses OAuth2: GOOGLE_DRIVE_ENABLED, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN.
 */

import { google } from 'googleapis';
import path from 'path';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCOPES = ['https://www.googleapis.com/auth/drive'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
};

function getDriveClient() {
  const enabled = String(process.env.GOOGLE_DRIVE_ENABLED || '').toLowerCase() === 'true';
  if (!enabled) {
    if (process.env.GOOGLE_DRIVE_ENABLED) {
      console.warn('Google Drive: GOOGLE_DRIVE_ENABLED must be exactly "true" (current:', process.env.GOOGLE_DRIVE_ENABLED + ')');
    }
    return null;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    console.warn('Google Drive: missing credentials. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN in .env');
    return null;
  }

  try {
    const redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI || 'http://localhost:3000/oauth2callback';
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    return google.drive({ version: 'v3', auth: oauth2Client });
  } catch (err) {
    console.warn('Google Drive auth failed:', err.message);
    return null;
  }
}

let _drive = null;
function drive() {
  if (_drive === null) _drive = getDriveClient();
  return _drive;
}

/**
 * Get or create a folder by name under parentId. Returns folder id.
 * parentId can be 'root' for the drive root.
 */
async function getOrCreateFolder(parentId, folderName) {
  const d = drive();
  if (!d) return null;

  const parent = parentId || 'root';
  const q = `'${parent}' in parents and name = '${folderName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const list = await d.files.list({ q, fields: 'files(id,name)', spaces: 'drive' });
  if (list.data.files && list.data.files.length > 0) {
    return list.data.files[0].id;
  }
  const create = await d.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parent]
    },
    fields: 'id'
  });
  return create.data.id;
}

/**
 * Get or create folder path Year/MonthName (e.g. 2026/March). No day subfolder.
 * rootFolderId is optional (use drive root if not set).
 * year, month are numbers or strings from date (e.g. 2026, 3).
 */
async function getOrCreateFolderPath(year, month, rootFolderId) {
  const d = drive();
  if (!d) return null;

  const y = String(year);
  const monthNum = parseInt(String(month).replace(/^0+/, ''), 10) || 1;
  const monthName = MONTH_NAMES[Math.max(0, monthNum - 1)] || MONTH_NAMES[0];

  const yearId = await getOrCreateFolder(rootFolderId || 'root', y);
  if (!yearId) return null;
  const monthId = await getOrCreateFolder(yearId, monthName);
  return monthId;
}

/**
 * Build image name: {shift}_{workstation}_mmddyyyyhhmmss.ext
 * e.g. 1_Register1_02112026143022.png
 */
function buildImageName(workstation, shiftNumber, extension = '.png') {
  const safe = (v) => String(v ?? '').replace(/[\s/\\:*?"<>|]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'unknown';
  const shift = safe(shiftNumber);
  const ws = safe(workstation);
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const base = `${shift}_${ws}_${mm}${dd}${yyyy}${hh}${min}${ss}`;
  const ext = extension.startsWith('.') ? extension : '.' + extension;
  return base + ext;
}

/**
 * Upload image buffer to Drive at year/monthname folder with name {shift}_{workstation}_mmddyyyyhhmmss.ext.
 * dateStr: YYYY-MM-DD (used for path year/month). workstation, shiftNumber: for filename.
 * Returns public view URL or null.
 */
export async function uploadImageToDrive(buffer, dateStr, workstation, shiftNumber, originalFileName) {
  const d = drive();
  if (!d) {
    console.warn('Google Drive: client not available; upload skipped.');
    return null;
  }

  const ext = path.extname(originalFileName || '.png').toLowerCase() || '.png';
  const mimeType = MIME_BY_EXT[ext] || 'image/png';
  const [y, m] = (dateStr || '').split(/[-/]/);
  if (!y || !m) {
    console.warn('Google Drive: invalid date for path (use YYYY-MM-DD):', dateStr);
    return null;
  }

  const rootId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || null;
  let folderId;
  try {
    folderId = await getOrCreateFolderPath(y, m, rootId);
  } catch (err) {
    console.error('Google Drive: folder create failed:', err.message, err.response?.data || '');
    return null;
  }
  if (!folderId) return null;

  const fileName = buildImageName(workstation, shiftNumber, ext);

  try {
    const createRes = await d.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId]
      },
      media: {
        mimeType,
        body: Readable.from(buffer)
      },
      fields: 'id, webViewLink'
    });

    const fileId = createRes.data.id;
    await d.permissions.create({
      fileId,
      requestBody: {
        type: 'anyone',
        role: 'reader'
      }
    });

    const viewUrl = `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;
    return viewUrl;
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error('Google Drive upload error:', detail);
    return null;
  }
}

export function isDriveEnabled() {
  return (
    String(process.env.GOOGLE_DRIVE_ENABLED || '').toLowerCase() === 'true' &&
    !!process.env.GOOGLE_CLIENT_ID &&
    !!process.env.GOOGLE_CLIENT_SECRET &&
    !!process.env.GOOGLE_REFRESH_TOKEN
  );
}

/** Extract Google Drive file ID from a view/sharing URL, or return null. */
export function getDriveFileId(url) {
  if (!url || typeof url !== 'string') return null;
  const m = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  return m ? m[1] : null;
}

/**
 * Build URL for our backend proxy that streams the Drive image.
 * Google disabled direct /uc?export=view links (403); proxying works for <img src>.
 */
export function getDriveImageProxyUrl(baseUrl, storedLabelImage) {
  if (!storedLabelImage || !storedLabelImage.startsWith('http')) return null;
  const id = getDriveFileId(storedLabelImage);
  if (!id) return null;
  const base = (baseUrl || '').replace(/\/$/, '');
  return `${base}/api/drive-image?id=${encodeURIComponent(id)}`;
}

/**
 * Stream a Drive file (image) by ID. Returns { stream, mimeType } or null.
 * Used by the /api/drive-image proxy so <img src> works (Google's direct links return 403).
 */
export async function streamDriveFile(fileId) {
  const d = drive();
  if (!d) return null;
  try {
    const meta = await d.files.get({ fileId, fields: 'mimeType' });
    const mimeType = meta.data.mimeType || 'image/jpeg';
    const res = await d.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
    return { stream: res.data, mimeType };
  } catch (err) {
    console.error('Drive stream error:', err.message);
    return null;
  }
}

/** Scopes needed for the one-time OAuth flow (get refresh token). */
export { SCOPES };
