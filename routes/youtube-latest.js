/**
 * ============================================================
 *  youtube-latest.js — Dernière vidéo + dernier Short YouTube
 * ============================================================
 */

const express = require('express');
const router  = express.Router();

const YOUTUBE_API_KEY    = process.env.YOUTUBE_API_KEY;
const YOUTUBE_CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID;

// Cache 10 minutes
let cache = { data: null, expires: 0 };
const CACHE_TTL = 10 * 60 * 1000;

// ── Parser la durée ISO 8601 en secondes ─────────────────
function parseDuration(iso) {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const h = parseInt(match[1] || 0);
  const m = parseInt(match[2] || 0);
  const s = parseInt(match[3] || 0);
  return h * 3600 + m * 60 + s;
}

// ── Récupérer les N dernières vidéos avec leur durée ─────
async function getVideosWithDuration(maxResults = 20) {
  const searchUrl = `https://www.googleapis.com/youtube/v3/search?key=${YOUTUBE_API_KEY}&channelId=${YOUTUBE_CHANNEL_ID}&part=snippet&order=date&maxResults=${maxResults}&type=video`;
  const searchRes  = await fetch(searchUrl);
  const searchData = await searchRes.json();
  if (searchData.error) throw new Error(searchData.error.message);

  const items = searchData?.items ?? [];
  if (!items.length) throw new Error('Aucune vidéo trouvée');

  const ids = items.map(i => i.id.videoId).join(',');
  const videoUrl  = `https://www.googleapis.com/youtube/v3/videos?key=${YOUTUBE_API_KEY}&id=${ids}&part=contentDetails,snippet`;
  const videoRes  = await fetch(videoUrl);
  const videoData = await videoRes.json();

  return (videoData?.items ?? []).map(v => ({
    videoId:     v.id,
    title:       v.snippet.title,
    thumbnail:   v.snippet.thumbnails?.high?.url,
    publishedAt: v.snippet.publishedAt,
    duration:    parseDuration(v.contentDetails.duration),
    isShort:     parseDuration(v.contentDetails.duration) <= 90,
  }));
}

// ── Route GET /api/youtube-latest ────────────────────────
router.get('/', async (req, res) => {
  if (cache.data && Date.now() < cache.expires) {
    return res.json(cache.data);
  }

  try {
    const videos = await getVideosWithDuration(20);

    const latestVideo = videos.find(v => !v.isShort) ?? null;
    const latestShort = videos.find(v => v.isShort)  ?? null;

    const payload = { success: true, latestVideo, latestShort };
    cache = { data: payload, expires: Date.now() + CACHE_TTL };
    res.json(payload);

  } catch (err) {
    console.error('[YouTube Latest]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;