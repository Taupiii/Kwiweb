/**
 * ============================================================
 *  twitch-schedule.js — Route Express pour le planning Twitch
 *  + export ICS (Google Calendar, Apple Calendar, Outlook)
 * ============================================================
 */

const express = require('express');
const router  = express.Router();

const TWITCH_CLIENT_ID         = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET     = process.env.TWITCH_CLIENT_SECRET;
const TWITCH_BROADCASTER_LOGIN = 'kwikwiii';

// Cache en mémoire
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
        label:      daysMap[dayName] ?? dayName,
        time:       timeStr,
        title:      seg.title ?? '',
        category:   seg.category?.name ?? '',
        active:     true,
        start_time: seg.start_time, // heure UTC brute pour le ICS
        duration:   seg.duration_in_seconds ?? 7200, // durée en secondes (défaut 2h)
        day_en:     dayName,
      };
    }
  }

  return week.map(day => byDay[day] ?? {
    label: daysMap[day], time: null, title: null, category: null,
    active: false, start_time: null, duration: 7200, day_en: day,
  });
}

// ── Formater une date en ICS (YYYYMMDDTHHmmssZ) ──────────
function toICSDate(isoString) {
  return new Date(isoString).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

// ── Générer un fichier ICS avec tous les streams ──────────
function generateICS(segments) {
  const rruleDayMap = {
    Monday: 'MO', Tuesday: 'TU', Wednesday: 'WE',
    Thursday: 'TH', Friday: 'FR', Saturday: 'SA', Sunday: 'SU',
  };

  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  let events = '';
  for (const seg of segments) {
    if (!seg.active || !seg.start_time) continue;

    const dtStart  = toICSDate(seg.start_time);
    const dtEnd    = toICSDate(new Date(new Date(seg.start_time).getTime() + seg.duration * 1000).toISOString());
    const rruleDay = rruleDayMap[seg.day_en] ?? 'MO';
    const uid      = `kwikwiii-${seg.day_en.toLowerCase()}@kwikwiii.online`;
    const title    = seg.title ? `Kwikwiii live — ${seg.title}` : 'Kwikwiii en live sur Twitch';
    const category = seg.category ? ` (${seg.category})` : '';

    events += `BEGIN:VEVENT
UID:${uid}
DTSTAMP:${now}
DTSTART:${dtStart}
DTEND:${dtEnd}
RRULE:FREQ=WEEKLY;BYDAY=${rruleDay}
SUMMARY:${title}${category}
DESCRIPTION:Kwikwiii est en live sur Twitch !\\nhttps://twitch.tv/kwikwiii
URL:https://twitch.tv/kwikwiii
LOCATION:https://twitch.tv/kwikwiii
BEGIN:VALARM
TRIGGER:-PT15M
ACTION:DISPLAY
DESCRIPTION:Kwikwiii commence dans 15 minutes !
END:VALARM
END:VEVENT
`;
  }

  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//kwikwiii.online//Stream Schedule//FR
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:Kwikwiii — Planning stream
X-WR-TIMEZONE:Europe/Paris
X-WR-CALDESC:Planning de stream de Kwikwiii sur Twitch
${events}END:VCALENDAR`.trim();
}

// ── Route GET /api/twitch-schedule (JSON) ─────────────────
router.get('/', async (req, res) => {
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

    cache = { data: payload, expires: Date.now() + CACHE_TTL };
    res.json(payload);

  } catch (err) {
    console.error('[Twitch Schedule]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Route GET /api/twitch-schedule/calendar.ics ───────────
router.get('/calendar.ics', async (req, res) => {
  try {
    const token         = await getTwitchToken();
    const broadcasterId = await getBroadcasterId(token);
    const rawSegments   = await getSchedule(token, broadcasterId);
    const schedule      = buildWeekSchedule(rawSegments);
    const icsContent    = generateICS(schedule);

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="kwikwiii-streams.ics"');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(icsContent);

  } catch (err) {
    console.error('[Twitch ICS]', err.message);
    res.status(500).send('Erreur génération calendrier');
  }
});

module.exports = router;