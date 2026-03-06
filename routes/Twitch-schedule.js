/**
 * ============================================================
 *  twitch-schedule.js — Route Express pour le planning Twitch
 * ============================================================
 *  À intégrer dans ton app Express existante.
 *  Voir README-integration.md pour les instructions complètes.
 * ============================================================
 */

const express = require('express');
const router  = express.Router();

const TWITCH_CLIENT_ID       = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET   = process.env.TWITCH_CLIENT_SECRET;
const TWITCH_BROADCASTER_LOGIN = 'kwikwiii';

// Cache en mémoire pour éviter de trop appeler l'API Twitch
let cache = { data: null, expires: 0 };
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ── Obtenir un token App Twitch ───────────────────────────
async function getTwitchToken() {
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     TWITCH_CLIENT_ID,
      client_secret: TWITCH_CLIENT_SECRET,
      grant_type:    'client_credentials',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Token Twitch invalide');
  return data.access_token;
}

// ── Obtenir l'ID du broadcaster ───────────────────────────
async function getBroadcasterId(token) {
  const res = await fetch(
    `https://api.twitch.tv/helix/users?login=${TWITCH_BROADCASTER_LOGIN}`,
    { headers: { 'Client-Id': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` } }
  );
  const data = await res.json();
  const id = data?.data?.[0]?.id;
  if (!id) throw new Error('Broadcaster introuvable');
  return id;
}

// ── Récupérer le planning ─────────────────────────────────
async function getSchedule(token, broadcasterId) {
  const res = await fetch(
    `https://api.twitch.tv/helix/schedule?broadcaster_id=${broadcasterId}&first=20`,
    { headers: { 'Client-Id': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` } }
  );
  const data = await res.json();
  return data?.data?.segments ?? [];
}

// ── Transformer les segments en planning hebdomadaire ─────
function buildWeekSchedule(segments) {
  const daysMap = {
    Monday: 'Lun', Tuesday: 'Mar', Wednesday: 'Mer',
    Thursday: 'Jeu', Friday: 'Ven', Saturday: 'Sam', Sunday: 'Dim',
  };
  const week = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

  // Index les segments par jour (premier créneau par jour)
  const byDay = {};
  for (const seg of segments) {
    const dt = new Date(seg.start_time);
    const dayName = dt.toLocaleDateString('en-US', {
      weekday: 'long',
      timeZone: 'Europe/Paris',
    });
    const timeStr = dt.toLocaleTimeString('fr-FR', {
      hour: '2-digit', minute: '2-digit',
      timeZone: 'Europe/Paris',
    }).replace(':', 'h');

    if (!byDay[dayName]) {
      byDay[dayName] = {
        label:    daysMap[dayName] ?? dayName,
        time:     timeStr,
        title:    seg.title ?? '',
        category: seg.category?.name ?? '',
        active:   true,
      };
    }
  }

  // Retourner les 7 jours dans l'ordre
  return week.map(day => byDay[day] ?? {
    label: daysMap[day], time: null, title: null, category: null, active: false,
  });
}

// ── Route GET /api/twitch-schedule ────────────────────────
router.get('/', async (req, res) => {
  // Vérifier le cache
  if (cache.data && Date.now() < cache.expires) {
    return res.json(cache.data);
  }

  try {
    const token         = await getTwitchToken();
    const broadcasterId = await getBroadcasterId(token);
    const segments      = await getSchedule(token, broadcasterId);
    const schedule      = buildWeekSchedule(segments);

    const payload = {
      success:  true,
      schedule,
      updated: new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }),
    };

    // Mettre en cache
    cache = { data: payload, expires: Date.now() + CACHE_TTL };

    res.json(payload);

  } catch (err) {
    console.error('[Twitch Schedule]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;