// The session seed. Every session gets its own seed, and Math.random is replaced by a seeded
// generator (mulberry32), so a session is internally coherent and, when the simulation is stepped
// with a fixed time step (window.__step), reproducible. For debugging, ?seed=1234 in the URL picks
// the seed; ordinary sessions get a fresh one. Imported first by main.js.
const params = new URLSearchParams(location.search);
const fromUrl = params.get('seed');
export const SESSION_SEED = fromUrl !== null && fromUrl !== '' ? (parseInt(fromUrl, 10) >>> 0) : ((Date.now() ^ (performance.now() * 1000)) >>> 0);

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
Math.random = mulberry32(SESSION_SEED);
// development-only overrides, e.g. ?ending=walker or ?event=admin (see director.js); they only
// work on the dev server (npm run dev), never in the built game
const dev = !!import.meta.env?.DEV;
export const DEV = { ending: dev ? params.get('ending') : null, event: dev ? params.get('event') : null };
