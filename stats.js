// Fonctions pures d'agrégation (sans DOM). Navigateur (globales) et node (require).
const Stats = (() => {
  const sortDesc = (m) => [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || String(a.label).localeCompare(String(b.label)));
  const countBy = (arr, keyFn) => {
    const m = new Map();
    for (const x of arr) { const k = keyFn(x); if (k !== null && k !== undefined && k !== '') m.set(k, (m.get(k) || 0) + 1); }
    return sortDesc(m);
  };
  const nums = (arr, fn) => arr.map(fn).filter((v) => typeof v === 'number' && !isNaN(v));
  const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);

  const genreDistribution = (artists, n = 15) =>
    countBy(artists.flatMap((a) => a.genres || []), (g) => g).slice(0, n);

  // popularity : null si absente partout (apps récentes)
  const avgPopularity = (items) => mean(nums(items, (i) => i.popularity));

  const decade = (d) => { const y = parseInt(String(d || '').slice(0, 4), 10); return isNaN(y) ? null : Math.floor(y / 10) * 10 + 's'; };
  const decadeDistribution = (tracks) =>
    countBy(tracks, (t) => decade(t.album && t.album.release_date)).sort((a, b) => a.label.localeCompare(b.label));

  const explicitPct = (tracks) => (tracks.length ? (100 * tracks.filter((t) => t.explicit).length) / tracks.length : null);
  const avgDurationMs = (tracks) => mean(nums(tracks, (t) => t.duration_ms));
  const totalDurationMs = (tracks) => nums(tracks, (t) => t.duration_ms).reduce((a, b) => a + b, 0);

  const topArtistsInTracks = (tracks, n = 10) =>
    countBy(tracks.flatMap((t) => (t.artists || []).map((a) => a.name)), (x) => x).slice(0, n);

  // ids présents dans toutes les listes fournies ; lists = [[{id,name}...], ...]
  const stableItems = (lists) => {
    if (!lists.length) return [];
    const sets = lists.map((l) => new Set(l.map((x) => x.id)));
    return lists[0].filter((x) => sets.every((s) => s.has(x.id)));
  };

  // Heures / jours en heure locale ; plays = [{played_at}]
  const byHour = (plays) => {
    const r = Array(24).fill(0);
    for (const p of plays) { const d = new Date(p.played_at); if (!isNaN(d)) r[d.getHours()]++; }
    return r;
  };
  const byWeekday = (plays) => { // lundi en premier
    const r = Array(7).fill(0);
    for (const p of plays) { const d = new Date(p.played_at); if (!isNaN(d)) r[(d.getDay() + 6) % 7]++; }
    return r;
  };

  // saved = [{added_at, track}]
  const likedByYear = (saved) => countBy(saved, (s) => (s.added_at || '').slice(0, 4)).sort((a, b) => a.label.localeCompare(b.label));

  const splitPlaylists = (pls, userId) => {
    const mine = pls.filter((p) => p.owner && p.owner.id === userId).length;
    return { mine, followed: pls.length - mine };
  };

  const fmtDuration = (ms) => {
    const m = Math.round(ms / 60000), h = Math.floor(m / 60);
    if (h >= 48) return Math.floor(h / 24) + ' j ' + (h % 24) + ' h';
    return h ? h + ' h ' + (m % 60) + ' min' : m + ' min';
  };

  return { countBy, genreDistribution, avgPopularity, decadeDistribution, explicitPct, avgDurationMs, totalDurationMs, topArtistsInTracks, stableItems, byHour, byWeekday, likedByYear, splitPlaylists, fmtDuration };
})();
if (typeof module !== 'undefined') module.exports = Stats;
