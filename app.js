'use strict';
const REDIRECT = 'http://127.0.0.1:8888/callback';
const SCOPES = 'user-read-private user-read-email user-top-read user-read-recently-played user-read-currently-playing user-read-playback-state user-library-read playlist-read-private playlist-read-collaborative user-follow-read';
const API = 'https://api.spotify.com/v1';
const MAX_ITEMS = 2000;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* stockage indisponible */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
};
const sget = (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
const sset = (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Auth PKCE ----------
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const rand = (n) => b64url(crypto.getRandomValues(new Uint8Array(n)));

async function login() {
  const id = $('client-id').value.trim();
  if (!/^[0-9a-f]{32}$/i.test(id)) { $('login-msg').textContent = 'Client ID invalide (32 caractères hexadécimaux).'; return; }
  store.set('spt_client_id', id);
  const verifier = rand(64), state = rand(16);
  sset('spt_verifier', verifier); sset('spt_state', state);
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const q = new URLSearchParams({ client_id: id, response_type: 'code', redirect_uri: REDIRECT, scope: SCOPES, state, code_challenge_method: 'S256', code_challenge: challenge });
  location.href = 'https://accounts.spotify.com/authorize?' + q;
}

async function tokenRequest(params) {
  const r = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: store.get('spt_client_id'), ...params }) });
  if (!r.ok) throw new Error('token ' + r.status);
  const t = await r.json();
  const old = JSON.parse(store.get('spt_token') || '{}');
  store.set('spt_token', JSON.stringify({ access: t.access_token, refresh: t.refresh_token || old.refresh, exp: Date.now() + (t.expires_in - 60) * 1000 }));
}

async function handleCallback() {
  const p = new URLSearchParams(location.search);
  if (!p.has('code') && !p.has('error')) return null;
  history.replaceState(null, '', '/');
  if (p.has('error')) return 'Autorisation refusée : ' + p.get('error');
  if (p.get('state') !== sget('spt_state')) return 'Paramètre state invalide, connexion annulée.';
  try { await tokenRequest({ grant_type: 'authorization_code', code: p.get('code'), redirect_uri: REDIRECT, code_verifier: sget('spt_verifier') }); } catch (e) { return 'Échec de l\'échange du code : ' + e.message; }
  return null;
}

const tok = () => { try { return JSON.parse(store.get('spt_token')); } catch (e) { return null; } };
async function refresh() {
  const t = tok();
  if (!t || !t.refresh) return false;
  try { await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh }); return true; } catch (e) { return false; }
}
function logout() { store.del('spt_token'); location.reload(); }

// ---------- API ----------
class ApiError extends Error { constructor(status) { super('HTTP ' + status); this.status = status; } }
async function api(url, tries = 0) {
  let t = tok();
  if (t && Date.now() > t.exp && !(await refresh())) { logout(); throw new ApiError(401); }
  t = tok();
  const r = await fetch(url.startsWith('http') ? url : API + url, { headers: { Authorization: 'Bearer ' + t.access } });
  if (r.status === 401 && tries < 1) { if (await refresh()) return api(url, tries + 1); logout(); }
  if (r.status === 429 && tries < 5) { await sleep((parseInt(r.headers.get('Retry-After'), 10) || 1) * 1000 + 200); return api(url, tries + 1); }
  if (r.status === 204) return null;
  if (!r.ok) throw new ApiError(r.status);
  return r.json();
}
// Pagine par "next" ; retourne { items, total }
async function fetchAll(url, onProgress) {
  const items = []; let total = 0, next = url;
  while (next && items.length < MAX_ITEMS) { // shortcut: plafond 2000, à relever si bibliothèque plus grosse
    const d = await api(next);
    total = d.total; items.push(...d.items.filter(Boolean)); next = d.next;
    if (onProgress) onProgress(items.length, total);
  }
  return { items: items.slice(0, MAX_ITEMS), total };
}

// ---------- UI helpers ----------
const body = (id) => document.querySelector('#' + id + ' .body');
const charts = {};
function chart(id, type, labels, data, label) {
  const host = body(id);
  host.innerHTML = '<canvas></canvas>';
  if (charts[id]) charts[id].destroy();
  const horiz = type === 'bar' && labels.length > 12;
  charts[id] = new Chart(host.firstChild, {
    type: type === 'doughnut' ? 'doughnut' : 'bar',
    data: { labels, datasets: [{ label, data, backgroundColor: type === 'doughnut' ? labels.map((_, i) => `hsl(${(i * 47) % 360} 60% 50%)`) : '#1db954' }] },
    options: { indexAxis: horiz ? 'y' : 'x', plugins: { legend: { display: type === 'doughnut', labels: { color: '#ddd' } } }, scales: type === 'doughnut' ? {} : { x: { ticks: { color: '#aaa' } }, y: { ticks: { color: '#aaa' }, beginAtZero: true } } },
  });
}
const na = (id, msg) => { body(id).innerHTML = '<span class="na">' + (msg || 'Aucune donnée disponible') + '</span>'; };
// Isole chaque section : 403/404 -> "Indisponible", sans casser le reste
async function section(id, fn) {
  const ids = [].concat(id);
  ids.forEach((i) => { body(i).innerHTML = '<span class="muted">Chargement…</span>'; });
  try { await fn(); } catch (e) {
    const msg = e.status === 403 || e.status === 404 ? 'Indisponible pour cette appli' : 'Erreur : ' + esc(e.message);
    ids.forEach((i) => na(i, msg));
  }
}
const img = (o) => { const u = o && o.images && o.images[o.images.length ? 0 : 0]; return u ? '<img src="' + esc(u.url) + '" alt="">' : '<img alt="">'; };
const list = (rows) => '<ol>' + rows.join('') + '</ol>';
const kv = (k, v) => '<div class="kv"><span>' + k + '</span><b>' + v + '</b></div>';
const trackName = (t) => esc(t.name) + ' <span class="muted">- ' + esc((t.artists || []).map((a) => a.name).join(', ')) + '</span>';

// ---------- Sections ----------
let me = null;
async function loadProfile() {
  await section('s-profile', async () => {
    me = await api('/me');
    const f = me.followers && typeof me.followers.total === 'number' ? me.followers.total : null;
    body('s-profile').innerHTML = (me.images && me.images[0] ? '<img class="avatar" src="' + esc(me.images[0].url) + '" alt=""> ' : '') +
      '<div class="big">' + esc(me.display_name || me.id) + '</div>' +
      (me.country ? kv('Pays', esc(me.country)) : '') +
      (me.product ? kv('Abonnement', esc(me.product)) : '') +
      (f !== null ? kv('Abonnés', f) : '');
  });
}

async function loadNow() {
  await section('s-now', async () => {
    const d = await api('/me/player/currently-playing');
    const t = d && d.item;
    if (!t) return na('s-now', 'Rien en cours de lecture');
    body('s-now').innerHTML = '<ul><li>' + img(t.album) + '<span class="t">' + trackName(t) + '</span></li></ul>' + kv('Album', esc(t.album ? t.album.name : '')) + kv('Statut', d.is_playing ? 'Lecture' : 'Pause');
  });
}

const tops = {}; // période -> { artists, tracks }
async function loadTop(range) {
  const [a, t] = await Promise.all([api('/me/top/artists?limit=50&time_range=' + range), api('/me/top/tracks?limit=50&time_range=' + range)]);
  tops[range] = { artists: a.items, tracks: t.items };
}
async function loadTops() {
  const range = $('range').value;
  await section(['s-topartists', 's-toptracks', 'd-genres', 'd-decades', 'd-misc', 'd-artists'], async () => {
    if (!tops[range]) await loadTop(range);
    const { artists, tracks } = tops[range];
    body('s-topartists').innerHTML = artists.length ? list(artists.map((a, i) => '<li>' + img(a) + '<span class="t">' + (i + 1) + '. ' + esc(a.name) + '</span></li>')) : '<span class="na">Aucune donnée</span>';
    body('s-toptracks').innerHTML = tracks.length ? list(tracks.map((t, i) => '<li>' + img(t.album) + '<span class="t">' + (i + 1) + '. ' + trackName(t) + '</span></li>')) : '<span class="na">Aucune donnée</span>';
    const g = Stats.genreDistribution(artists);
    g.length ? chart('d-genres', 'doughnut', g.map((x) => x.label), g.map((x) => x.count), 'Artistes') : na('d-genres', 'Genres non fournis par l\'API pour cette appli');
    const dec = Stats.decadeDistribution(tracks);
    dec.length ? chart('d-decades', 'bar', dec.map((x) => x.label), dec.map((x) => x.count), 'Titres') : na('d-decades');
    const pa = Stats.avgPopularity(artists), pt = Stats.avgPopularity(tracks), ex = Stats.explicitPct(tracks), du = Stats.avgDurationMs(tracks);
    const rows = [pa !== null && kv('Popularité moyenne (artistes)', pa.toFixed(1)), pt !== null && kv('Popularité moyenne (titres)', pt.toFixed(1)),
      ex !== null && kv('Titres explicites', ex.toFixed(0) + ' %'), du !== null && kv('Durée moyenne', Stats.fmtDuration(du).replace(/^0 /, '') + ' (' + Math.round(du / 1000) + ' s)')].filter(Boolean);
    rows.length ? (body('d-misc').innerHTML = rows.join('')) : na('d-misc');
    const ta = Stats.topArtistsInTracks(tracks, 10);
    ta.length ? chart('d-artists', 'bar', ta.map((x) => x.label), ta.map((x) => x.count), 'Titres') : na('d-artists');
  });
}

async function loadStability() {
  await section('d-stable', async () => {
    const ranges = ['short_term', 'medium_term', 'long_term'];
    await Promise.all(ranges.filter((r) => !tops[r]).map(loadTop));
    const art = Stats.stableItems(ranges.map((r) => tops[r].artists));
    const trk = Stats.stableItems(ranges.map((r) => tops[r].tracks));
    body('d-stable').innerHTML = kv('Artistes présents dans les 3 périodes', art.length) + kv('Titres présents dans les 3 périodes', trk.length) + (art.length ? '<p class="muted">' + art.map((a) => esc(a.name)).join(', ') + '</p>' : '');
  });
}

async function loadRecent() {
  await section(['r-list', 'r-hours', 'r-days'], async () => {
    const plays = (await api('/me/player/recently-played?limit=50')).items;
    if (!plays.length) { ['r-list', 'r-hours', 'r-days'].forEach((i) => na(i)); return; }
    const total = Stats.totalDurationMs(plays.map((p) => p.track));
    body('r-list').innerHTML = kv('Temps total écouté (ces ' + plays.length + ' écoutes)', Stats.fmtDuration(total)) +
      list(plays.map((p) => '<li>' + img(p.track.album) + '<span class="t">' + trackName(p.track) + ' <span class="muted">' + new Date(p.played_at).toLocaleString('fr-FR') + '</span></span></li>'));
    chart('r-hours', 'bar', [...Array(24).keys()].map((h) => h + 'h'), Stats.byHour(plays), 'Écoutes');
    chart('r-days', 'bar', ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'], Stats.byWeekday(plays), 'Écoutes');
  });
}

async function loadLibrary() {
  const prog = (what) => (n, t) => { $('lib-load').textContent = 'Chargement ' + what + ' : ' + n + ' / ' + Math.min(t, MAX_ITEMS); };
  const done = () => { $('lib-load').textContent = ''; };
  let liked = null, albums = null, pls = null, followed = null;
  await section(['l-counts', 'l-years', 'l-artists'], async () => {
    const res = await Promise.allSettled([
      fetchAll('/me/tracks?limit=50', prog('titres')), fetchAll('/me/albums?limit=50', prog('albums')),
      fetchAll('/me/playlists?limit=50', prog('playlists')), api('/me/following?type=artist&limit=1'),
    ]);
    done();
    [liked, albums, pls] = res.slice(0, 3).map((r) => (r.status === 'fulfilled' ? r.value : null));
    followed = res[3].status === 'fulfilled' ? res[3].value.artists.total : null;
    const rows = [];
    if (liked) rows.push(kv('Titres likés', liked.total + (liked.total > MAX_ITEMS ? ' (stats sur les ' + MAX_ITEMS + ' premiers)' : '')));
    if (albums) rows.push(kv('Albums sauvegardés', albums.total));
    if (pls) { const s = Stats.splitPlaylists(pls.items, me && me.id); rows.push(kv('Playlists', pls.total), kv('dont créées par moi', s.mine), kv('dont suivies', s.followed)); }
    if (followed !== null) rows.push(kv('Artistes suivis', followed));
    if (liked) rows.push(kv('Durée totale des titres likés', Stats.fmtDuration(Stats.totalDurationMs(liked.items.map((s) => s.track)))));
    if (!rows.length) throw new ApiError(403);
    body('l-counts').innerHTML = rows.join('');
    if (!liked || !liked.items.length) { na('l-years'); na('l-artists'); return; }
    const y = Stats.likedByYear(liked.items);
    chart('l-years', 'bar', y.map((x) => x.label), y.map((x) => x.count), 'Titres likés');
    const a = Stats.topArtistsInTracks(liked.items.map((s) => s.track), 15);
    chart('l-artists', 'bar', a.map((x) => x.label), a.map((x) => x.count), 'Titres likés');
  });
}

async function loadDashboard() {
  $('login').hidden = true; $('dash').hidden = false; $('actions').hidden = false;
  await loadProfile(); // me.id requis pour la bibliothèque
  loadNow(); loadRecent();
  await loadTops(); loadStability();
  loadLibrary();
}

// ---------- Init ----------
(async function init() {
  $('btn-login').onclick = login;
  $('btn-logout').onclick = logout;
  $('btn-now').onclick = loadNow;
  $('range').onchange = loadTops;
  $('btn-client').onclick = () => { store.del('spt_client_id'); logout(); };
  $('client-id').value = store.get('spt_client_id') || '';
  const err = await handleCallback();
  if (tok() && store.get('spt_client_id')) return loadDashboard();
  $('login').hidden = false;
  if (err) $('login-msg').textContent = err;
})();
