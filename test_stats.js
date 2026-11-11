const assert = require('assert');
const S = require('./stats.js');

assert.deepStrictEqual(S.countBy(['a', 'b', 'a', '', null], (x) => x), [{ label: 'a', count: 2 }, { label: 'b', count: 1 }]);
assert.deepStrictEqual(S.genreDistribution([{ genres: ['rock', 'pop'] }, { genres: ['rock'] }, {}]), [{ label: 'rock', count: 2 }, { label: 'pop', count: 1 }]);
assert.deepStrictEqual(S.genreDistribution([{ genres: [] }, {}]), []);
assert.strictEqual(S.avgPopularity([{ popularity: 50 }, { popularity: 70 }, {}]), 60);
assert.strictEqual(S.avgPopularity([{}, {}]), null);
const tr = [
  { explicit: true, duration_ms: 60000, album: { release_date: '1995-03-01' }, artists: [{ name: 'A' }, { name: 'B' }] },
  { explicit: false, duration_ms: 180000, album: { release_date: '1999' }, artists: [{ name: 'A' }] },
  { explicit: false, duration_ms: 120000, album: { release_date: '2021-01-01' }, artists: [{ name: 'C' }] },
  { explicit: false, album: {}, artists: [] },
];
assert.deepStrictEqual(S.decadeDistribution(tr), [{ label: '1990s', count: 2 }, { label: '2020s', count: 1 }]);
assert.strictEqual(S.explicitPct(tr), 25);
assert.strictEqual(S.explicitPct([]), null);
assert.strictEqual(S.avgDurationMs(tr), 120000);
assert.strictEqual(S.totalDurationMs(tr), 360000);
assert.deepStrictEqual(S.topArtistsInTracks(tr, 1), [{ label: 'A', count: 2 }]);
assert.deepStrictEqual(S.stableItems([[{ id: 1 }, { id: 2 }, { id: 3 }], [{ id: 3 }, { id: 1 }], [{ id: 1 }, { id: 3 }, { id: 9 }]]), [{ id: 1 }, { id: 3 }]);
assert.deepStrictEqual(S.stableItems([]), []);
// dates locales : lundi 2024-01-01 08:30 et dimanche 2024-01-07 23:10
const plays = [{ played_at: new Date(2024, 0, 1, 8, 30).toISOString() }, { played_at: new Date(2024, 0, 7, 23, 10).toISOString() }, { played_at: new Date(2024, 0, 1, 8, 5).toISOString() }];
const h = S.byHour(plays); assert.strictEqual(h.length, 24); assert.strictEqual(h[8], 2); assert.strictEqual(h[23], 1);
const w = S.byWeekday(plays); assert.strictEqual(w[0], 2); assert.strictEqual(w[6], 1);
assert.deepStrictEqual(S.likedByYear([{ added_at: '2022-05-01T00:00:00Z' }, { added_at: '2020-01-01T00:00:00Z' }, { added_at: '2022-09-01T00:00:00Z' }]), [{ label: '2020', count: 1 }, { label: '2022', count: 2 }]);
assert.deepStrictEqual(S.splitPlaylists([{ owner: { id: 'me' } }, { owner: { id: 'x' } }, { owner: { id: 'me' } }], 'me'), { mine: 2, followed: 1 });
assert.strictEqual(S.fmtDuration(90 * 60000), '1 h 30 min');
assert.strictEqual(S.fmtDuration(30 * 60000), '30 min');
assert.strictEqual(S.fmtDuration(50 * 3600000), '2 j 2 h');
console.log('OK : tous les tests de stats.js passent');
