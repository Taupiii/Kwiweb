require('dotenv').config();
const express = require('express');
const path    = require('path');
const app     = express();

const PORT = process.env.PORT || 3001;

// ── Fichiers statiques (site vitrine) ─────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Route API planning Twitch ──────────────────────────────
const twitchSchedule = require('./routes/twitch-schedule');
app.use('/api/twitch-schedule', twitchSchedule);

// ── Route dernière vidéo YouTube ──────────────────────────
const youtubeLatest = require('./routes/youtube-latest');
app.use('/api/youtube-latest', youtubeLatest);

// ── Fallback → index.html ─────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[kwikwiii-site] Serveur démarré sur le port ${PORT}`);
});