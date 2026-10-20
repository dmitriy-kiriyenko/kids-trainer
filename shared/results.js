// Result tiers and where records live, shared by the games (quiz.js) and the home page.
// Each tier has a message for the result screen and a medal for the home page, ordered from the best.
// Classic script on purpose: ES modules don't load from file://.
const RESULTS = [
  { min: 100, medal: 'diamond', emoji: '🏆', msg: 'идеально! Ни одной ошибки!' },
  { min: 80, medal: 'laurel', emoji: '🚀', msg: 'отлично! Почти без ошибок!' },
  { min: 60, medal: 'gold', emoji: '👍', msg: 'хорошо! Ещё чуть-чуть — и будет отлично.' },
  { min: 40, medal: 'silver', emoji: '🙂', msg: 'неплохо, но правило стоит повторить.' },
  { min: 0, medal: 'bronze', emoji: '💪', msg: 'не сдавайся! Повтори правило и попробуй ещё раз.' },
];

const resultFor = score => RESULTS.find(r => score >= r.min);
// Records are stored best first, so the best result of a game is records[0].
const recordsKey = gameId => `${gameId}-records-v2`;

// Stopwatch time as m:ss,d, tenths cut rather than rounded so the display never runs ahead.
function formatTime(ms) {
  const tenths = Math.floor(Math.max(0, ms) / 100);
  const s = Math.floor(tenths / 10);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')},${tenths % 10}`;
}

// ---------- Medals ----------
// SVG in a 100×120 box: ribbon on top, disc centred at (50, 76).
const MEDAL_CX = 50, MEDAL_CY = 76;

const MEDAL_STYLES = {
  bronze: { disc: ['#f0b27a', '#b4673a', '#7a3d1c'], ribbon: ['#5b6b8c', '#3e4a66'] },
  silver: { disc: ['#ffffff', '#c3cad6', '#7d8796'], ribbon: ['#3d8bff', '#2160c4'], star: true },
  gold: { disc: ['#fff3a8', '#ffc928', '#b8860b'], ribbon: ['#ff4d6d', '#c92a48'], star: true },
  laurel: { disc: ['#fff3a8', '#ffc928', '#b8860b'], ribbon: ['#9b5cff', '#6a2fd6'], stripe: '#ffd23f', star: true, laurel: '#5dff8f', rays: '#ffd23f' },
  diamond: { disc: ['#ffffff', '#bdf4ff', '#7b5cff'], ribbon: ['#ff3ea5', '#c21d7a'], stripe: '#22e3ff', laurel: '#ffd23f', rays: '#22e3ff', gem: true },
};

const pts = list => list.map(p => p.map(n => +n.toFixed(2)).join(',')).join(' ');
const polar = (r, deg) => [MEDAL_CX + r * Math.sin(deg * Math.PI / 180), MEDAL_CY - r * Math.cos(deg * Math.PI / 180)];

function starPoints(outer, inner) {
  return pts(Array.from({ length: 10 }, (_, i) => polar(i % 2 ? inner : outer, i * 36)));
}

function raysSvg(color) {
  const spikes = Array.from({ length: 16 }, (_, i) => `<polygon points="${pts([polar(30, i * 22.5 - 7), polar(44, i * 22.5), polar(30, i * 22.5 + 7)])}"/>`);
  return `<g class="medal-rays" fill="${color}" opacity=".55">${spikes.join('')}</g>`;
}

// Leaves along both sides of the disc, from the bottom up to about ten and two o'clock.
function laurelSvg(color) {
  const leaves = [];
  for (const side of [-1, 1]) {
    for (let deg = 165; deg >= 55; deg -= 22) {
      const [x, y] = polar(33, side * deg);
      leaves.push(`<ellipse cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" rx="3.2" ry="7" transform="rotate(${side * deg + side * 25} ${x.toFixed(2)} ${y.toFixed(2)})"/>`);
    }
  }
  return `<g fill="${color}" stroke="rgba(0,0,0,.35)" stroke-width=".8">${leaves.join('')}</g>`;
}

function gemSvg(id) {
  const y = MEDAL_CY;
  return `
    <g class="medal-gem">
      <polygon points="38,${y - 9} 62,${y - 9} 70,${y - 1} 50,${y + 17} 30,${y - 1}" fill="url(#${id}-gem)" stroke="#ffffff" stroke-width="1.2" stroke-linejoin="round"/>
      <polyline points="30,${y - 1} 70,${y - 1}" stroke="#ffffff" stroke-width=".9" fill="none" opacity=".8"/>
      <polyline points="38,${y - 9} 44,${y - 1} 50,${y - 9} 56,${y - 1} 62,${y - 9}" stroke="#ffffff" stroke-width=".9" fill="none" opacity=".8"/>
      <polyline points="44,${y - 1} 50,${y + 17} 56,${y - 1}" stroke="#ffffff" stroke-width=".9" fill="none" opacity=".6"/>
      <polygon points="44,${y - 1} 50,${y - 9} 56,${y - 1}" fill="#ffffff" opacity=".55"/>
      <polygon points="30,${y - 1} 38,${y - 9} 44,${y - 1}" fill="#ffffff" opacity=".25"/>
    </g>
    <g class="medal-sparkles" fill="#ffffff">
      <path d="M14 34 l2 -6 l2 6 l6 2 l-6 2 l-2 6 l-2 -6 l-6 -2 z"/>
      <path d="M84 48 l1.5 -4.5 l1.5 4.5 l4.5 1.5 l-4.5 1.5 l-1.5 4.5 l-1.5 -4.5 l-4.5 -1.5 z"/>
      <path d="M80 104 l1.2 -3.6 l1.2 3.6 l3.6 1.2 l-3.6 1.2 l-1.2 3.6 l-1.2 -3.6 l-3.6 -1.2 z"/>
    </g>`;
}

/** The medal for a score as an SVG string. */
function medalSvg(score) {
  const tier = resultFor(score).medal;
  const s = MEDAL_STYLES[tier];
  const id = `medal-${tier}`;
  const [light, mid, dark] = s.disc;
  const strap = (points, stripe) => `
    <polygon points="${points}" fill="url(#${id}-ribbon)"/>
    ${s.stripe ? `<polyline points="${stripe}" stroke="${s.stripe}" stroke-width="3" fill="none"/>` : ''}`;

  return `
  <svg class="medal medal-${tier}" viewBox="0 0 100 120" aria-hidden="true">
    <defs>
      <linearGradient id="${id}-ribbon" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.ribbon[0]}"/><stop offset="1" stop-color="${s.ribbon[1]}"/></linearGradient>
      <radialGradient id="${id}-disc" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="${light}"/><stop offset=".55" stop-color="${mid}"/><stop offset="1" stop-color="${dark}"/></radialGradient>
      ${s.gem ? `<linearGradient id="${id}-gem" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9fdff"/><stop offset=".45" stop-color="#22e3ff"/><stop offset="1" stop-color="#3b5bff"/></linearGradient>` : ''}
    </defs>
    ${strap('18,0 40,0 60,50 44,56', '29,0 52,53')}
    ${strap('82,0 60,0 40,50 56,56', '71,0 48,53')}
    ${s.rays ? raysSvg(s.rays) : ''}
    ${s.laurel ? laurelSvg(s.laurel) : ''}
    <circle cx="${MEDAL_CX}" cy="${MEDAL_CY}" r="27" fill="url(#${id}-disc)" stroke="${dark}" stroke-width="2"/>
    <circle cx="${MEDAL_CX}" cy="${MEDAL_CY}" r="21" fill="none" stroke="${light}" stroke-width="1.5" opacity=".7"/>
    ${s.star ? `<polygon points="${starPoints(13, 5.5)}" fill="${light}" stroke="${dark}" stroke-width="1.2" stroke-linejoin="round"/>` : ''}
    ${s.gem ? gemSvg(id) : ''}
  </svg>`;
}
