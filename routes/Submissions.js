/**
 * submissions.js — Routes pour les propositions viewers
 */

const express  = require('express');
const router   = express.Router();
const fs       = require('fs');
const path     = require('path');
const crypto   = require('crypto');
const multer   = require('multer');

const DATA_DIR    = path.join(__dirname, '..', 'data');
const VIDEOS_FILE = path.join(DATA_DIR, 'videos.json');
const PHOTOS_FILE = path.join(DATA_DIR, 'photos.json');
const UPLOADS_DIR = path.join(__dirname, '..', 'public', 'uploads');

[DATA_DIR, UPLOADS_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});
if (!fs.existsSync(VIDEOS_FILE)) fs.writeFileSync(VIDEOS_FILE, '[]');
if (!fs.existsSync(PHOTOS_FILE)) fs.writeFileSync(PHOTOS_FILE, '[]');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `photo-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
  },
});

const readJSON  = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const writeJSON = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));

const ADMIN_KEY = process.env.ADMIN_KEY || 'kwikwiii-admin';
function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.key;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: 'Non autorise' });
  next();
}

router.post('/video', (req, res) => {
  const { url, pseudo, danger } = req.body;
  if (!url || !pseudo) return res.status(400).json({ error: 'URL et pseudo requis' });

  const isValid = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be|tiktok\.com|twitch\.tv|clips\.twitch\.tv)/.test(url);
  if (!isValid) return res.status(400).json({ error: 'Lien invalide - YouTube, TikTok ou Twitch uniquement' });

  const dangerMap = { 1: 'Bof', 2: 'Risque', 3: 'Solide', 4: 'Mortel' };
  const videos = readJSON(VIDEOS_FILE);
  videos.unshift({
    id:          crypto.randomUUID(),
    url,
    pseudo:      pseudo.trim().substring(0, 50),
    danger:      parseInt(danger) || 0,
    dangerLabel: dangerMap[parseInt(danger)] || '-',
    createdAt:   new Date().toISOString(),
    status:      'pending',
  });
  writeJSON(VIDEOS_FILE, videos);
  res.json({ success: true });
});

router.post('/photo', upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Photo requise' });
  const pseudo = (req.body.pseudo || 'Anonyme').trim().substring(0, 50);
  const words  = (req.body.words || '').split(',').map(w => w.trim()).filter(Boolean);
  const photos = readJSON(PHOTOS_FILE);
  photos.unshift({
    id:        crypto.randomUUID(),
    filename:  req.file.filename,
    url:       `/uploads/${req.file.filename}`,
    pseudo,
    words,
    createdAt: new Date().toISOString(),
    status:    'pending',
  });
  writeJSON(PHOTOS_FILE, photos);
  res.json({ success: true });
});

const { spawn } = require('child_process');

const DOWNLOADS_DIR = path.join(__dirname, '..', 'downloads');
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

// ── GET /api/submissions/download/:id ────────────────────
// Lance yt-dlp sur le serveur et streame le fichier au client
router.get('/download/:id', requireAdmin, (req, res) => {
  const videos = readJSON(VIDEOS_FILE);
  const video  = videos.find(v => v.id === req.params.id);
  if (!video) return res.status(404).json({ error: 'Vidéo introuvable' });

  const filename = `video-${video.id}.mp4`;
  const outPath  = path.join(DOWNLOADS_DIR, filename);

  // Si déjà téléchargé, on renvoie directement
  if (fs.existsSync(outPath)) {
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'video/mp4');
    return fs.createReadStream(outPath).pipe(res);
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (type, data) => res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);

  send('status', { message: 'Téléchargement en cours...' });

  const ytdlp = spawn('yt-dlp', [
    '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
    '--merge-output-format', 'mp4',
    '-o', outPath,
    '--no-playlist',
    video.url,
  ]);

  ytdlp.stdout.on('data', d => send('progress', { message: d.toString().trim() }));
  ytdlp.stderr.on('data', d => send('progress', { message: d.toString().trim() }));

  ytdlp.on('close', code => {
    if (code === 0 && fs.existsSync(outPath)) {
      send('done', { url: `/api/submissions/file/${filename}` });
    } else {
      send('error', { message: 'Échec du téléchargement' });
    }
    res.end();
  });
});

// ── GET /api/submissions/file/:filename ───────────────────
router.get('/file/:filename', requireAdmin, (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(DOWNLOADS_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Fichier introuvable' });
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'video/mp4');
  fs.createReadStream(filePath).pipe(res);
});


router.get('/photos', requireAdmin, (req, res) => res.json(readJSON(PHOTOS_FILE)));

router.delete('/video/:id', requireAdmin, (req, res) => {
  writeJSON(VIDEOS_FILE, readJSON(VIDEOS_FILE).filter(v => v.id !== req.params.id));
  res.json({ success: true });
});

router.delete('/photo/:id', requireAdmin, (req, res) => {
  const photos = readJSON(PHOTOS_FILE);
  const photo  = photos.find(p => p.id === req.params.id);
  if (photo) {
    const fp = path.join(UPLOADS_DIR, photo.filename);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }
  writeJSON(PHOTOS_FILE, photos.filter(p => p.id !== req.params.id));
  res.json({ success: true });
});

router.patch('/photo/:id/words', requireAdmin, (req, res) => {
  const photos = readJSON(PHOTOS_FILE);
  const photo  = photos.find(p => p.id === req.params.id);
  if (!photo) return res.status(404).json({ error: 'Photo introuvable' });
  photo.words = req.body.words || '';
  writeJSON(PHOTOS_FILE, photos);
  res.json({ success: true });
});

module.exports = router;