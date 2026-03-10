/**
 * ============================================================
 *  submissions.js — Routes pour les propositions viewers
 *  POST /api/submissions/video  → proposer une vidéo drôle
 *  POST /api/submissions/photo  → proposer une photo
 *  GET  /api/submissions/videos → liste admin vidéos
 *  GET  /api/submissions/photos → liste admin photos
 *  DELETE /api/submissions/video/:id
 *  DELETE /api/submissions/photo/:id
 * ============================================================
 */

const express  = require('express');
const router   = express.Router();
const fs       = require('fs');
const path     = require('path');
const crypto   = require('crypto');
const multer   = require('multer');

const DATA_DIR   = path.join(__dirname, '..', 'data');
const VIDEOS_FILE = path.join(DATA_DIR, 'videos.json');
const PHOTOS_FILE = path.join(DATA_DIR, 'photos.json');
const UPLOADS_DIR = path.join(__dirname, '..', 'public', 'uploads');

// ── Créer les dossiers/fichiers si besoin ─────────────────
[DATA_DIR, UPLOADS_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });
if (!fs.existsSync(VIDEOS_FILE)) fs.writeFileSync(VIDEOS_FILE, '[]');
if (!fs.existsSync(PHOTOS_FILE)) fs.writeFileSync(PHOTOS_FILE, '[]');

// ── Multer pour les photos ────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `photo-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
  },
});

// ── Helpers JSON ──────────────────────────────────────────
const readJSON  = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const writeJSON = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));

// ── ADMIN : clé simple ────────────────────────────────────
const ADMIN_KEY = process.env.ADMIN_KEY || 'kwikwiii-admin';

function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.key;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: 'Non autorisé' });
  next();
}

// ── POST /api/submissions/video ───────────────────────────
router.post('/video', (req, res) => {
  const { url, pseudo } = req.body;
  if (!url || !pseudo) return res.status(400).json({ error: 'URL et pseudo requis' });

  // Valider que c'est bien un lien vidéo
  const isValid = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be|tiktok\.com|twitch\.tv|clips\.twitch\.tv)/.test(url);
  if (!isValid) return res.status(400).json({ error: 'Lien invalide — YouTube, TikTok ou Twitch uniquement' });

  const videos = readJSON(VIDEOS_FILE);
  const entry = {
    id:        crypto.randomUUID(),
    url,
    pseudo:    pseudo.trim().substring(0, 50),
    createdAt: new Date().toISOString(),
    status:    'pending',
  };
  videos.unshift(entry);
  writeJSON(VIDEOS_FILE, videos);
  res.json({ success: true, message: 'Vidéo proposée avec succès !' });
});

// ── POST /api/submissions/photo ───────────────────────────
router.post('/photo', upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Photo requise' });
  const pseudo = (req.body.pseudo || 'Anonyme').trim().substring(0, 50);

  const photos = readJSON(PHOTOS_FILE);
  const entry = {
    id:        crypto.randomUUID(),
    filename:  req.file.filename,
    url:       `/uploads/${req.file.filename}`,
    pseudo,
    createdAt: new Date().toISOString(),
    status:    'pending',
    words:     '',
  };
  photos.unshift(entry);
  writeJSON(PHOTOS_FILE, entry.id ? photos : [...photos, entry]);
  res.json({ success: true, message: 'Photo proposée avec succès !' });
});

// ── GET /api/submissions/videos (admin) ───────────────────
router.get('/videos', requireAdmin, (req, res) => {
  res.json(readJSON(VIDEOS_FILE));
});

// ── GET /api/submissions/photos (admin) ───────────────────
router.get('/photos', requireAdmin, (req, res) => {
  res.json(readJSON(PHOTOS_FILE));
});

// ── DELETE /api/submissions/video/:id (admin) ─────────────
router.delete('/video/:id', requireAdmin, (req, res) => {
  const videos = readJSON(VIDEOS_FILE).filter(v => v.id !== req.params.id);
  writeJSON(VIDEOS_FILE, videos);
  res.json({ success: true });
});

// ── DELETE /api/submissions/photo/:id (admin) ─────────────
router.delete('/photo/:id', requireAdmin, (req, res) => {
  const photos = readJSON(PHOTOS_FILE);
  const photo  = photos.find(p => p.id === req.params.id);
  if (photo) {
    const filePath = path.join(UPLOADS_DIR, photo.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  writeJSON(PHOTOS_FILE, photos.filter(p => p.id !== req.params.id));
  res.json({ success: true });
});

// ── PATCH /api/submissions/photo/:id/words (admin) ────────
router.patch('/photo/:id/words', requireAdmin, (req, res) => {
  const photos = readJSON(PHOTOS_FILE);
  const photo  = photos.find(p => p.id === req.params.id);
  if (!photo) return res.status(404).json({ error: 'Photo introuvable' });
  photo.words = req.body.words || '';
  writeJSON(PHOTOS_FILE, photos);
  res.json({ success: true });
});

module.exports = router;