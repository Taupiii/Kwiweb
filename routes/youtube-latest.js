/**
 * ============================================================
 *  youtube-latest.js — Route Express pour la dernière vidéo
 * ============================================================
 */

const express = require('express');
const router  = express.Router();

const YOUTUBE_API_KEY   = process.env.YOUTUBE_API_KEY;
const YOUTUBE_CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID; // UCxxxxxx

// Cache 10 minutes
let cache = { data: null, expires: 0 };
const CACHE_TTL = 10 * 60 * 1000;

// ── Récupérer la dernière vidéo ───────────────────────────
async function getLatestVideo() {
  const url = `https://www.googleapis.com/youtube/v3/search?key=${YOUTUBE_API_KEY}&channelId=${YOUTUBE_CHANNEL_ID}&part=snippet&order=date&maxResults=1&type=video`;

  const res  = await fetch(url);
  const data = await res.json();

  if (data.error) throw new Error(data.error.message);

  const item = data?.items?.[0];
  if (!item) throw new Error('Aucune vidéo trouvée');

  return {
    videoId:     item.id.videoId,
    title:       item.snippet.title,
    description: item.snippet.description,
    thumbnail:   item.snippet.thumbnails?.high?.url,
    publishedAt: item.snippet.publishedAt,
  };
}

// ── Route GET /api/youtube-latest ────────────────────────
router.get('/', async (req, res) => {
  if (cache.data && Date.now() < cache.expires) {
    return res.json(cache.data);
  }

  try {
    const video = await getLatestVideo();
    const payload = { success: true, video };
    cache = { data: payload, expires: Date.now() + CACHE_TTL };
    res.json(payload);

  } catch (err) {
    console.error('[YouTube Latest]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;