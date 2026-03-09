import { streamDriveFile } from '../services/googleDriveService.js';

/**
 * GET /api/drive-image?id=FILE_ID
 * Streams the image from Google Drive so <img src> works.
 * (Google's direct /uc links return 403 for embedding.)
 */
export const getDriveImage = async (req, res) => {
  const fileId = req.query.id;
  if (!fileId) {
    return res.status(400).json({ error: 'Missing id query parameter' });
  }
  const result = await streamDriveFile(fileId);
  if (!result) {
    return res.status(404).json({ error: 'Image not found or Drive unavailable' });
  }
  res.setHeader('Content-Type', result.mimeType);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  result.stream.on('error', (err) => {
    console.error('Drive image stream error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Stream error' });
  });
  result.stream.pipe(res);
};
