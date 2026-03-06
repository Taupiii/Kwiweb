require('dotenv').config({ path: '/home/ubuntu/kwiweb/.env' });
const express = require('express');
const path    = require('path');
const app     = express();

const PORT = process.env.PORT || 3001;

// ── Fichiers statiques (site vitrine) ─────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Route API planning Twitch ──────────────────────────────
const twitchSchedule = require('./routes/twitch-schedule');
app.use('/api/twitch-schedule', twitchSchedule);

// ── Fallback → index.html ─────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[kwiweb] Serveur démarré sur le port ${PORT}`);
});