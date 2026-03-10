require('dotenv').config({ path: '/home/ubuntu/kwiweb/.env' });
const express = require('express');
const path    = require('path');
const app     = express();

const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Fichiers statiques (site vitrine) ─────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Route API planning Twitch ──────────────────────────────
const twitchSchedule = require('./routes/twitch-schedule');
app.use('/api/twitch-schedule', twitchSchedule);

// ── Route dernière vidéo YouTube ──────────────────────────
const youtubeLatest = require('./routes/youtube-latest');
app.use('/api/youtube-latest', youtubeLatest);

// ── Route dernier clip Twitch ─────────────────────────────
const twitchClips = require('./routes/twitch-clips');
app.use('/api/twitch-clips', twitchClips);

// ── Route propositions viewers ────────────────────────────
const submissions = require('./routes/submissions');
app.use('/api/submissions', submissions);

// ── Fallback → index.html ─────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[kwikwiii-site] Serveur démarré sur le port ${PORT}`);
});