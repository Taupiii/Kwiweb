/**
 * ============================================================
 *  twitch-clips.js — Dernier clip Twitch automatique
 * ============================================================
 */

const express = require('express');
const router  = express.Router();

const TWITCH_CLIENT_ID         = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET     = process.env.TWITCH_CLIENT_SECRET;
const TWITCH_BROADCASTER_LOGIN = 'kwikwiii';

// Cache 10 minutes
let cache = { data: null, expires: 0 };
const CACHE_TTL = 0; // Pas de cache — clip aléatoire à chaque visite

// ── Token Twitch ──────────────────────────────────────────
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

// ── ID du broadcaster ─────────────────────────────────────
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

// ── Récupérer le dernier clip ─────────────────────────────
async function getLatestClip(token, broadcasterId) {

  async function fetchClipsSince(daysAgo) {
    const since = new Date();
    since.setDate(since.getDate() - daysAgo);
    let allClips = [];
    let cursor = null;

    while (true) {
      const url = `https://api.twitch.tv/helix/clips?broadcaster_id=${broadcasterId}&first=100&started_at=${since.toISOString()}${cursor ? '&after=' + cursor : ''}`;
      const res  = await fetch(url, { headers: { 'Client-Id': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      const clips = data?.data ?? [];
      allClips = allClips.concat(clips);
      cursor = data?.pagination?.cursor;
      if (!cursor || !clips.length) break;
    }
    return allClips;
  }

  // Essaie 30j, puis 90j, puis 365j
  let clips = await fetchClipsSince(30);
  if (!clips.length) clips = await fetchClipsSince(90);
  if (!clips.length) clips = await fetchClipsSince(365);
  if (!clips.length) throw new Error('Aucun clip trouvé');

  clips.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const clip = clips[Math.floor(Math.random() * clips.length)];

  return {
    id:           clip.id,
    title:        clip.title,
    thumbnail:    clip.thumbnail_url,
    embedUrl:     `https://clips.twitch.tv/embed?clip=${clip.id}&parent=kwikwiii.online&autoplay=false`,
    clipUrl:      clip.url,
    viewCount:    clip.view_count,
    createdAt:    clip.created_at,
    duration:     clip.duration,
  };
}

// ── Route GET /api/twitch-clips ───────────────────────────
router.get('/', async (req, res) => {
  if (cache.data && Date.now() < cache.expires) {
    return res.json(cache.data);
  }

  try {
    const token         = await getTwitchToken();
    const broadcasterId = await getBroadcasterId(token);
    const clip          = await getLatestClip(token, broadcasterId);

    const payload = { success: true, clip };
    cache = { data: payload, expires: Date.now() + CACHE_TTL };
    res.json(payload);

  } catch (err) {
    console.error('[Twitch Clips]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;