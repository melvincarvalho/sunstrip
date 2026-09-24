// SUNSTRIP art — palettes and procedural sprites. Every pixel from code.
// Sprites draw in a local unit space (ground contact at y=0, ~ -400 tall)
// and are scaled by the caller from road width.

// ---------------------------------------------------------------------------
// palettes — the real OutRun register: sunset, sea, asphalt, chrome.
// The light moves through a single day: noon at the coast, night at the end.
export const PAL = {
  coast: {
    sky: ['#4fa9e4', '#a3d9f0', '#ffe8b8'], sun: '#fff4c8', sunGlow: '#ffd98c',
    sea: ['#4ea2c8', '#80c4dc'], far: '#9cc6dc', hills: ['#6fb0cc', '#58a266'],
    grass: ['#57a05e', '#4f9857'], road: ['#6a6b71', '#636469'],
    rumble: ['#f0f0f0', '#d84840'], lane: '#f4f4f4', fog: '#cfe8f2', cloud: '#f4f9fc',
  },
  palms: {
    sky: ['#3f9fdc', '#94d0ea', '#ffdca4'], sun: '#fff8d8', sunGlow: '#ffe0a0',
    sea: ['#4497c0', '#72b8d4'], far: '#90bed6', hills: ['#62a6c2', '#4c9658'],
    grass: ['#519c5a', '#4a9453'], road: ['#66676d', '#606166'],
    rumble: ['#f0f0f0', '#d84840'], lane: '#f4f4f4', fog: '#c8e4f0', cloud: '#eef5f9',
  },
  canyon: {
    sky: ['#ff9a5a', '#ffc686', '#ffedc0'], sun: '#fff0b0', sunGlow: '#ffb870',
    far: '#d89a78', hills: ['#b05838', '#94462c'], mesa: true,
    grass: ['#c07a4a', '#b87346'], road: ['#6e665e', '#68615a'],
    rumble: ['#f4e8d0', '#b84028'], lane: '#f4ead0', fog: '#ffd8a8', cloud: '#fbe8c6',
  },
  pines: {
    sky: ['#6fb4d8', '#bfe0e8', '#f0f4d8'], sun: '#fffce0', sunGlow: '#e8f0c0',
    far: '#9ab8c4', hills: ['#5a8a70', '#2f6444'], peaks: true, treeline: '#28573a', fogK: 0.5,
    grass: ['#3f7d4a', '#3a7645'], road: ['#63646a', '#5d5e64'],
    rumble: ['#e8e8e8', '#c84838'], lane: '#ececec', fog: '#b8ccd6', cloud: '#f2f6f4',
  },
  dusk: {
    sky: ['#241f52', '#68387c', '#e8586e'], sun: '#ffb058', sunGlow: '#ff7a5c',
    far: '#3a2a5e', hills: ['#2c2250', '#1e1838'], city: true, night: 0.5,
    grass: ['#1c1e30', '#191b2c'], road: ['#72748a', '#6c6e84'],
    rumble: ['#c8c8d8', '#a83848'], lane: '#d8d8e4', fog: '#4c3868', cloud: '#7a5288',
  },
  desert: {
    sky: ['#e89c48', '#ffd98c', '#ffedbe'], sun: '#fff8e0', sunGlow: '#ffd98c',
    far: '#e4b882', hills: ['#c8a468', '#b88f55'], mesa: true,
    grass: ['#c9a15e', '#c29a58'], road: ['#71695f', '#6b635a'],
    rumble: ['#f8f0d8', '#c05030'], lane: '#f8f2dc', fog: '#f4e0b0', cloud: '#fbecca',
  },
  autumn: {
    sky: ['#5f9ccc', '#f0c890', '#ffe0a8'], sun: '#fff0c0', sunGlow: '#ffc27a',
    far: '#a898a8', hills: ['#b8743c', '#8c4a26'], peaks: true, treeline: '#7a3a1c',
    grass: ['#9a8a3c', '#928238'], road: ['#646268', '#5e5c62'],
    rumble: ['#f0ece0', '#c04a2c'], lane: '#f2eee2', fog: '#f0d6b0', cloud: '#fbeede',
  },
  harbor: {
    sky: ['#1d2a5a', '#5a4a86', '#f08a6a'], sun: '#ffc070', sunGlow: '#ff8a60',
    sea: ['#2a3a6a', '#4a5a8a'], far: '#34305e', hills: ['#2a2a54', '#1c2240'], night: 0.6,
    grass: ['#26363a', '#1a2629'], road: ['#6a6c78', '#646672'],
    rumble: ['#d0d0dc', '#b04040'], lane: '#e0e0e8', fog: '#4a4470', cloud: '#8a6a8a',
  },
  fields: {
    sky: ['#6aa4d4', '#f8d69a', '#ffe8b0'], sun: '#fff4c0', sunGlow: '#ffcf80',
    far: '#b0b8a0', hills: ['#a8b060', '#8a9a48'], treeline: '#5f7a34',
    grass: ['#d8b456', '#d0ac50'], road: ['#6c6a66', '#666460'],
    rumble: ['#f6f0dc', '#c85a34'], lane: '#f6f2e0', fog: '#f8e4b8', cloud: '#fdf2da',
  },
  volcano: {
    sky: ['#2a1418', '#7a2a1c', '#e8743a'], sun: '#ffb050', sunGlow: '#ff6a2a',
    far: '#4a2420', hills: ['#3a1c1a', '#241212'], volcano: true, weather: 'ash', night: 0.3,
    grass: ['#2a211e', '#251d1a'], road: ['#5a5454', '#534e4e'],
    rumble: ['#d8c8b8', '#c83820'], lane: '#e0d4c4', fog: '#6a3a2a', cloud: '#5a3a34',
  },
  snow: {
    sky: ['#5c8cc8', '#b8d4ec', '#f4e6dc'], sun: '#fff6e8', sunGlow: '#ffd8b8',
    far: '#c8d8ec', hills: ['#dce8f4', '#b8cce0'], peaks: true, snowcaps: true, treeline: '#3a5a50', weather: 'snow',
    grass: ['#eef3f8', '#e2eaf2'], road: ['#5e6068', '#585a62'],
    rumble: ['#ffffff', '#d04040'], lane: '#fafaff', fog: '#e8eef6', cloud: '#ffffff',
  },
  bay: {
    sky: ['#3a4a8c', '#e07a6a', '#ffc27a'], sun: '#ffd890', sunGlow: '#ff9a5a',
    sea: ['#3a5a8a', '#7a7aa0'], far: '#5a5a8a', hills: ['#4a4a78', '#355a4a'],
    grass: ['#4a7a4e', '#46744a'], road: ['#5e5e66', '#585860'],
    rumble: ['#f0e8e0', '#c84838'], lane: '#f4ece4', fog: '#c89a9a', cloud: '#f8b89a',
  },
  metro: {
    sky: ['#070a1c', '#1a1a44', '#4a2a5a'], sun: '#ff8a50', sunGlow: '#c04a60',
    far: '#16163a', hills: ['#141434', '#0c0c22'], city: true, night: 1, stars: true,
    grass: ['#141726', '#0c0e17'], road: ['#4c4e64', '#474960'],
    rumble: ['#d8d8f0', '#c04060'], lane: '#e0e0f4', fog: '#1e1e44', cloud: '#2a2a50', fogK: 0.8,
  },
  savanna: {
    sky: ['#d8783a', '#ffb05a', '#ffe0a0'], sun: '#fff0c0', sunGlow: '#ffa04a',
    far: '#c88a58', hills: ['#a8703c', '#8a5a2e'], treeline: '#6a4a24',
    grass: ['#c8943e', '#c08c3a'], road: ['#6a625a', '#645c55'],
    rumble: ['#f6ead4', '#b84a2a'], lane: '#f6eedc', fog: '#f0c088', cloud: '#fcd8a8',
  },
  lastlight: {
    sky: ['#2a1848', '#b83a5a', '#ff9a4a'], sun: '#ffcf70', sunGlow: '#ff6a3a',
    sea: ['#4a2a5a', '#a04a5a'], far: '#5a2a50', hills: ['#3a1c3a', '#2a2238'], night: 0.35,
    grass: ['#3a3040', '#352c3b'], road: ['#565260', '#504c5a'],
    rumble: ['#f0e0d8', '#d04050'], lane: '#f4e8e0', fog: '#8a4a6a', cloud: '#e07a7a',
  },
};

// ---------------------------------------------------------------------------
// colour helpers
export function rgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
export function mix(a, b, t) {
  const A = rgb(a), B = rgb(b);
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`;
}
export function mixHex(a, b, t) {
  const A = rgb(a), B = rgb(b);
  return '#' + [0, 1, 2].map((i) => Math.round(A[i] + (B[i] - A[i]) * t).toString(16).padStart(2, '0')).join('');
}

// fog lookup tables so the road pass never parses a colour string per row
export const FOG_STEPS = 48;
const lutCache = new Map();
export function fogLUT(key) {
  if (lutCache.has(key)) return lutCache.get(key);
  const p = PAL[key];
  const ramp = (c) => Array.from({ length: FOG_STEPS + 1 }, (_, i) => mix(c, p.fog, i / FOG_STEPS));
  const L = {
    grass: [ramp(p.grass[0]), ramp(p.grass[1])],
    road: [ramp(p.road[0]), ramp(p.road[1])],
    rumble: [ramp(p.rumble[0]), ramp(p.rumble[1])],
    lane: ramp(p.lane),
    island: ramp(p.grass[0]),
  };
  lutCache.set(key, L);
  return L;
}

// ---------------------------------------------------------------------------
// sprites
function poly(ctx, pts, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath(); ctx.fill();
}
function shadow(ctx, w, a = 0.22) {
  ctx.fillStyle = `rgba(10,14,24,${a})`;
  ctx.beginPath(); ctx.ellipse(0, 0, w, w * 0.16, 0, 0, Math.PI * 2); ctx.fill();
}
// a leaf-cut frond: tapered blade from base to tip with a bowed spine
function frond(ctx, x0, y0, x1, y1, bow, width, col) {
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 - bow;
  const nx = -(y1 - y0), ny = x1 - x0, nl = Math.hypot(nx, ny) || 1;
  const ox = nx / nl * width, oy = ny / nl * width;
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(mx + ox, my + oy, x1, y1);
  ctx.quadraticCurveTo(mx - ox * 0.4, my - oy * 0.4, x0, y0);
  ctx.fill();
}

const ADS = ['SUNSTRIP', 'TIDEHOLM', 'NEONOID', 'MAGPIE AIR', 'BUBBLE KEEP', 'SUN FM 86'];
const AD_COLS = ['#c9694a', '#b8845a', '#a05c48', '#c99a4a', '#8a6a52', '#7c8a5c'];

// kind, screen x/y of ground contact, scale, variant 0..1, side (-1/1), pal, t (seconds)
export function drawSprite(ctx, kind, x, y, s, v, side, pal, t, extra) {
  if (s <= 0.003) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  const night = pal.night || 0;
  switch (kind) {
    case 'palm': {
      const lean = side < 0 ? 1 : -1;           // lean over the road
      const sc = 0.85 + v * 0.4;
      shadow(ctx, 90);
      ctx.scale(sc * lean, sc);
      ctx.strokeStyle = night > 0.4 ? '#3a2a24' : '#6a4a34'; ctx.lineWidth = 28; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(30, -230, 78, -420); ctx.stroke();
      ctx.strokeStyle = night > 0.4 ? '#2a1e1a' : '#553a28'; ctx.lineWidth = 6;
      for (let i = 1; i < 7; i++) {
        const q = i / 7;
        const nx = 2 * (1 - q) * q * 30 + q * q * 78, ny = -(2 * (1 - q) * q * 230 + q * q * 420);
        ctx.beginPath(); ctx.moveTo(nx - 13, ny); ctx.lineTo(nx + 13, ny + 4); ctx.stroke();
      }
      const dark = night > 0.4 ? '#123422' : '#1c6232', lite = night > 0.4 ? '#1f4a30' : '#3a9e50';
      const sway = Math.sin(t * 1.3 + v * 9) * 8;
      for (const [col, w, dy] of [[dark, 26, 10], [lite, 18, 0]]) {
        for (let i = 0; i < 8; i++) {
          const a = Math.PI * (0.02 + (i / 7) * 0.96);
          const fx = Math.cos(a) * (170 + (i % 2) * 30), fy = -Math.sin(a) * 90;
          frond(ctx, 78, -420 + dy, 78 + fx + sway, -420 + fy + 110 + dy, 70 + (i % 3) * 14, w, col);
        }
      }
      ctx.fillStyle = '#5a3a1a';
      ctx.beginPath(); ctx.arc(70, -412, 14, 0, 6.3); ctx.arc(88, -408, 12, 0, 6.3); ctx.fill();
      ctx.lineCap = 'butt';
      break;
    }
    case 'pine': case 'snowpine': {
      const sc = 0.85 + v * 0.35;
      shadow(ctx, 120);
      ctx.scale(sc, sc);
      ctx.fillStyle = '#4a3428'; ctx.fillRect(-14, -90, 28, 90);
      const cols = kind === 'snowpine' ? ['#2c5446', '#335e4f', '#3a6a58'] : ['#285c3c', '#2e6a44', '#367a4e'];
      const tiers = [[-130, -70, -250], [-110, -160, -340], [-86, -250, -420], [-60, -330, -480]];
      tiers.forEach(([hw, by, ty], i) => {
        poly(ctx, [[hw, by], [-hw, by], [0, ty]], cols[Math.min(2, i)]);
        poly(ctx, [[0, by], [-hw, by], [0, ty]], 'rgba(0,0,0,0.14)');
        if (kind === 'snowpine') {
          poly(ctx, [[hw * 0.55, by - (by - ty) * 0.45], [-hw * 0.55, by - (by - ty) * 0.45], [0, ty]], '#f4f8fc');
          poly(ctx, [[hw, by], [hw * 0.4, by - 16], [-hw * 0.2, by - 6], [-hw, by]], '#e8eef6');
        }
      });
      break;
    }
    case 'cactus': {
      const sc = 0.8 + v * 0.45;
      shadow(ctx, 70);
      ctx.scale(sc, sc);
      ctx.fillStyle = '#3e7c3a'; ctx.strokeStyle = '#3e7c3a'; ctx.lineCap = 'round';
      ctx.lineWidth = 46;
      ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(0, -250); ctx.stroke();
      ctx.lineWidth = 30;
      ctx.beginPath(); ctx.moveTo(0, -120); ctx.lineTo(-62, -120); ctx.lineTo(-62, -200); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -150); ctx.lineTo(56, -150); ctx.lineTo(56, -230); ctx.stroke();
      ctx.strokeStyle = '#5a9a50'; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(10, -20); ctx.lineTo(10, -250); ctx.stroke();
      ctx.strokeStyle = '#2c5c2a'; ctx.lineWidth = 3;
      for (const xx of [-10, 0]) { ctx.beginPath(); ctx.moveTo(xx, -20); ctx.lineTo(xx, -255); ctx.stroke(); }
      ctx.lineCap = 'butt';
      break;
    }
    case 'rock': case 'lavarock': {
      const sc = 0.7 + v * 0.6;
      shadow(ctx, 130);
      ctx.scale(sc, sc);
      const lava = kind === 'lavarock';
      poly(ctx, [[-120, 0], [-70, -95], [10, -130], [90, -70], [120, 0]], lava ? '#2e2624' : '#8a7462');
      poly(ctx, [[-50, 0], [-16, -80], [60, -95], [95, 0]], lava ? '#3c322e' : '#a08a74');
      poly(ctx, [[-70, -95], [10, -130], [40, -110], [-30, -80]], lava ? '#4a3e38' : '#c0a888');
      if (lava) {
        ctx.strokeStyle = `rgba(255,${120 + Math.sin(t * 3 + v * 7) * 40 | 0},40,0.9)`; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(-60, -20); ctx.lineTo(-20, -60); ctx.lineTo(30, -40); ctx.lineTo(70, -80); ctx.stroke();
      }
      break;
    }
    case 'mesa': {
      poly(ctx, [[-260, 0], [-200, -240], [200, -240], [260, 0]], '#b06040');
      poly(ctx, [[-200, -240], [200, -240], [180, -280], [-180, -280]], '#c87856');
      poly(ctx, [[180, -280], [200, -240], [260, 0], [230, 0]], '#8a4830');
      ctx.fillStyle = 'rgba(90,30,20,0.25)';
      for (let i = 0; i < 4; i++) ctx.fillRect(-240 + i * 8, -180 + i * 50, 480 - i * 16, 8);
      break;
    }
    case 'bush': {
      const sc = 0.7 + v * 0.6;
      ctx.scale(sc, sc);
      shadow(ctx, 110);
      ctx.fillStyle = night > 0.4 ? '#1e3a2c' : '#3a7c46';
      ctx.beginPath();
      ctx.arc(-45, -35, 48, 0, Math.PI * 2); ctx.arc(20, -50, 56, 0, Math.PI * 2);
      ctx.arc(70, -30, 40, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = night > 0.4 ? '#2a4a38' : '#4f9558';
      ctx.beginPath(); ctx.arc(10, -66, 30, 0, Math.PI * 2); ctx.arc(-40, -52, 22, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'maple': {
      const sc = 0.8 + v * 0.45;
      shadow(ctx, 120);
      ctx.scale(sc, sc);
      ctx.fillStyle = '#4a3024'; ctx.fillRect(-14, -200, 28, 200);
      const hues = ['#c8481c', '#e07a24', '#d85a1e', '#f0a030'];
      const c1 = hues[Math.floor(v * 4) % 4], c2 = hues[(Math.floor(v * 4) + 1) % 4];
      ctx.fillStyle = mixHex(c1, '#401808', 0.25);
      ctx.beginPath(); ctx.arc(-60, -230, 90, 0, 6.3); ctx.arc(60, -240, 95, 0, 6.3); ctx.arc(0, -320, 110, 0, 6.3); ctx.fill();
      ctx.fillStyle = c1;
      ctx.beginPath(); ctx.arc(-40, -250, 70, 0, 6.3); ctx.arc(50, -270, 70, 0, 6.3); ctx.arc(0, -340, 85, 0, 6.3); ctx.fill();
      ctx.fillStyle = c2;
      ctx.beginPath(); ctx.arc(30, -360, 45, 0, 6.3); ctx.arc(-50, -290, 30, 0, 6.3); ctx.fill();
      break;
    }
    case 'poplar': {
      const sc = 0.85 + v * 0.35;
      shadow(ctx, 60);
      ctx.scale(sc, sc);
      ctx.fillStyle = '#4a3a28'; ctx.fillRect(-8, -80, 16, 80);
      ctx.fillStyle = pal.treeline ? mixHex(pal.treeline, '#000000', 0.1) : '#3c6a30';
      ctx.beginPath(); ctx.ellipse(0, -280, 60, 220, 0, 0, 6.3); ctx.fill();
      ctx.fillStyle = pal.treeline ? mixHex(pal.treeline, '#ffe8a0', 0.25) : '#5a8a40';
      ctx.beginPath(); ctx.ellipse(18, -300, 30, 180, 0, 0, 6.3); ctx.fill();
      break;
    }
    case 'deadtree': {
      ctx.strokeStyle = '#1e1614'; ctx.lineCap = 'round';
      ctx.lineWidth = 20; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(8, -260); ctx.stroke();
      ctx.lineWidth = 10;
      ctx.beginPath(); ctx.moveTo(4, -150); ctx.lineTo(-70, -230); ctx.moveTo(6, -200); ctx.lineTo(80, -290);
      ctx.moveTo(-40, -196); ctx.lineTo(-50, -270); ctx.stroke();
      ctx.lineCap = 'butt';
      break;
    }
    case 'fence': {
      ctx.fillStyle = '#e8e0d0';
      for (let i = -2; i <= 2; i++) ctx.fillRect(i * 80 - 8, -110, 16, 110);
      ctx.fillRect(-180, -96, 360, 14); ctx.fillRect(-180, -56, 360, 14);
      break;
    }
    case 'bale': {
      shadow(ctx, 110);
      ctx.fillStyle = '#c89a3a';
      ctx.beginPath(); ctx.ellipse(0, -80, 110, 80, 0, 0, 6.3); ctx.fill();
      ctx.fillStyle = '#e0b858';
      ctx.beginPath(); ctx.ellipse(-30, -80, 58, 70, 0, 0, 6.3); ctx.fill();
      ctx.strokeStyle = '#a87a28'; ctx.lineWidth = 5;
      for (let r = 14; r < 60; r += 14) { ctx.beginPath(); ctx.ellipse(-30, -80, r, r * 1.2, 0, 0, 6.3); ctx.stroke(); }
      break;
    }
    case 'windmill': {
      shadow(ctx, 90);
      poly(ctx, [[-50, 0], [50, 0], [26, -360], [-26, -360]], '#eae4dc');
      poly(ctx, [[10, 0], [50, 0], [26, -360], [8, -360]], '#c8c0b8');
      ctx.save(); ctx.translate(0, -360); ctx.rotate(t * 1.2 + v * 6);
      ctx.fillStyle = '#f4f0ea';
      for (let i = 0; i < 3; i++) { ctx.rotate(Math.PI * 2 / 3); ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(0, -230); ctx.lineTo(14, -220); ctx.lineTo(8, 0); ctx.fill(); }
      ctx.restore();
      ctx.fillStyle = '#b0a8a0'; ctx.beginPath(); ctx.arc(0, -360, 14, 0, 6.3); ctx.fill();
      break;
    }
    case 'acacia': {
      const sc = 0.85 + v * 0.4;
      shadow(ctx, 140);
      ctx.scale(sc, sc);
      ctx.strokeStyle = '#3a2618'; ctx.lineCap = 'round'; ctx.lineWidth = 18;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(4, -170); ctx.lineTo(-70, -270); ctx.moveTo(4, -170); ctx.lineTo(80, -280); ctx.stroke();
      ctx.fillStyle = '#4a5a24';
      ctx.beginPath(); ctx.ellipse(0, -290, 200, 40, 0, 0, 6.3); ctx.fill();
      ctx.fillStyle = '#62742e';
      ctx.beginPath(); ctx.ellipse(-20, -306, 150, 26, 0, 0, 6.3); ctx.fill();
      ctx.lineCap = 'butt';
      break;
    }
    case 'building': {
      const hgt = 1100 + v * 1000;
      const bw = 170 + (v * 7 % 1) * 120;
      const base = pal.hills ? mixHex(pal.hills[1], '#000000', 0.1) : '#262a52';
      const face = mixHex(base, pal.sky[2], 0.12);
      shadow(ctx, bw * 1.5, 0.4);
      ctx.fillStyle = mixHex(base, '#000000', 0.3); ctx.fillRect(-bw - 40, -26, bw * 2 + 80, 26);   // plaza
      ctx.fillStyle = face; ctx.fillRect(-bw, -hgt, bw * 2, hgt);
      ctx.fillStyle = mixHex(mixHex(face, pal.sky[0], 0.3), '#000000', 0.55); ctx.fillRect(bw - bw * 0.36, -hgt, bw * 0.36, hgt); // shaded side face
      ctx.fillStyle = mixHex(face, '#000000', 0.6); ctx.fillRect(bw - bw * 0.36, -hgt, 3, hgt);          // corner line
      ctx.fillStyle = mixHex(face, pal.sky[2], 0.25); ctx.fillRect(-bw, -hgt, 22, hgt);            // lit edge
      ctx.fillStyle = mixHex(face, '#ffffff', 0.4); ctx.fillRect(-bw - 8, -hgt - 16, bw * 2 + 16, 16); // lit cornice
      // a regular grid of floors; each floor lit or dark as a band, a few gaps
      let r = Math.floor(v * 9973) | 1;
      for (let fy = 90; fy < hgt - 40; fy += 52) {
        r = (r * 16807) % 2147483647;
        const floorLit = r % 100 < (night > 0.5 ? 70 : 40);
        for (let fx = -bw + 34; fx < bw - bw * 0.36 - 24; fx += 38) {
          r = (r * 16807) % 2147483647;
          ctx.fillStyle = floorLit && r % 100 < 85 ? '#ffd870' : mixHex(face, '#000000', 0.25);
          ctx.fillRect(fx, -fy - 30, 24, 30);
        }
      }
      ctx.fillStyle = '#ffe6a0'; ctx.fillRect(-bw * 0.45, -70, bw * 0.9, 44);                    // lobby
      if (night > 0.8) { ctx.fillStyle = '#ff4a6a'; ctx.fillRect(-6, -hgt - 40, 12, 24); }
      break;
    }
    case 'lamp': {
      const arm = side < 0 ? 90 : -90;          // lean over the road
      ctx.strokeStyle = '#c8ccd8'; ctx.lineWidth = 12;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -360);
      ctx.quadraticCurveTo(0, -430, arm, -430); ctx.stroke();
      if (night > 0.2) {
        const lp = ctx.createRadialGradient(arm, -430, 6, arm, -430, 150);
        lp.addColorStop(0, `rgba(255,240,176,${0.8 * night})`); lp.addColorStop(1, 'rgba(255,240,176,0)');
        ctx.fillStyle = lp; ctx.fillRect(arm - 150, -580, 300, 300);
        ctx.fillStyle = `rgba(255,240,176,${0.12 * night})`;
        ctx.beginPath(); ctx.ellipse(arm * 1.4, -4, 160, 34, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = night > 0.2 ? '#fff0b0' : '#e8e8ee';
      ctx.beginPath(); ctx.ellipse(arm, -426, 26, 12, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'bollard': {
      ctx.fillStyle = '#2a2a30'; ctx.fillRect(-18, -90, 36, 90);
      ctx.fillStyle = '#e8c040'; ctx.fillRect(-18, -80, 36, 14);
      ctx.fillStyle = `rgba(255,200,90,${0.5 + 0.5 * Math.sin(t * 4 + v * 10)})`;
      ctx.beginPath(); ctx.arc(0, -100, 12, 0, 6.3); ctx.fill();
      break;
    }
    case 'lighthouse': {
      shadow(ctx, 120);
      poly(ctx, [[-70, 0], [70, 0], [44, -480], [-44, -480]], '#f2ece4');
      for (let i = 0; i < 3; i++) {
        const y0 = -80 - i * 140, y1 = y0 - 60;
        const w0 = 70 - (26 * (-y0)) / 480, w1 = 70 - (26 * (-y1)) / 480;
        poly(ctx, [[-w0, y0], [w0, y0], [w1, y1], [-w1, y1]], '#c83a34');
      }
      ctx.fillStyle = '#2a2a34'; ctx.fillRect(-54, -520, 108, 44);
      ctx.fillStyle = '#fff4c0'; ctx.fillRect(-40, -514, 80, 30);
      poly(ctx, [[-60, -520], [60, -520], [0, -570]], '#2a2a34');
      if (night > 0.2 || pal.sea) {
        const a = Math.sin(t * 1.6 + v * 5);
        ctx.fillStyle = `rgba(255,244,200,${0.25 + 0.2 * Math.abs(a)})`;
        ctx.beginPath(); ctx.moveTo(0, -500); ctx.lineTo(a * 900, -640); ctx.lineTo(a * 900, -420); ctx.fill();
      }
      break;
    }
    case 'sign': {
      // curve warnings point the way the road bends; plain posts otherwise
      const dir = extra || 0;
      ctx.fillStyle = '#d0d4dc'; ctx.fillRect(-10, -220, 20, 220);
      if (dir) {
        ctx.fillStyle = '#f0c020'; ctx.fillRect(-110, -330, 220, 120);
        ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 8; ctx.strokeRect(-104, -324, 208, 108);
        ctx.fillStyle = '#1a1a1a';
        for (let i = -1; i <= 1; i++) {
          const cx = i * 58;
          poly(ctx, [[cx - 20 * dir, -300], [cx + 22 * dir, -270], [cx - 20 * dir, -240], [cx - 6 * dir, -270]], '#1a1a1a');
        }
      } else {
        ctx.fillStyle = '#20489c'; ctx.fillRect(-100, -320, 200, 100);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 8; ctx.strokeRect(-90, -310, 180, 80);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 54px system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(String(extra2Km(v)), 0, -250);
      }
      break;
    }
    case 'billboard': {
      const nAd = (extra || 0) % ADS.length;
      shadow(ctx, 220, 0.18);
      ctx.fillStyle = '#6a5e52'; ctx.fillRect(-160, -140, 20, 140); ctx.fillRect(140, -140, 20, 140);
      ctx.fillStyle = night > 0.5 ? '#d8d0c0' : '#f5e9d2'; ctx.fillRect(-200, -320, 400, 190);
      ctx.strokeStyle = AD_COLS[nAd]; ctx.lineWidth = 14; ctx.strokeRect(-200, -320, 400, 190);
      ctx.fillStyle = AD_COLS[nAd]; ctx.font = 'italic 900 52px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(ADS[nAd], 0, -208, 360);
      if (night > 0.5) { ctx.fillStyle = 'rgba(255,240,200,0.12)'; ctx.fillRect(-200, -320, 400, 190); }
      break;
    }
    case 'gantry': {
      const L = extra && extra.L || '', R = extra && extra.R || '';
      ctx.fillStyle = '#6a7484';
      ctx.fillRect(-2350, -1250, 90, 1250); ctx.fillRect(2260, -1250, 90, 1250);
      ctx.fillStyle = '#a8b0bc';
      ctx.fillRect(-2350, -1250, 4700, 100);
      ctx.fillStyle = '#8890a0';
      for (let i = -2300; i < 2300; i += 200) ctx.fillRect(i, -1150, 20, 30);
      for (const [x0, txt, arrow] of [[-2140, L, -1], [180, R, 1]]) {
        ctx.fillStyle = '#0f7c3c'; ctx.fillRect(x0, -1110, 1960, 440);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 26; ctx.strokeRect(x0 + 30, -1080, 1900, 380);
        ctx.fillStyle = '#fff'; ctx.font = "italic 900 200px 'Arial Black', 'Segoe UI Black', system-ui, sans-serif"; ctx.textAlign = 'center';
        ctx.fillText(arrow < 0 ? '◄ ' + txt : txt + ' ►', x0 + 980, -810, 1800);
      }
      break;
    }
    case 'goalarch': {
      ctx.fillStyle = '#e8e8f0';
      ctx.fillRect(-2350, -1300, 110, 1300); ctx.fillRect(2240, -1300, 110, 1300);
      // chequered banner
      const cw = 150;
      for (let i = 0; i < 31; i++) for (let j = 0; j < 3; j++) {
        ctx.fillStyle = (i + j) % 2 ? '#101018' : '#f4f4f8';
        ctx.fillRect(-2325 + i * cw, -1300 + j * cw, cw, cw);
      }
      ctx.fillStyle = '#d83a30'; ctx.fillRect(-1100, -1480, 2200, 190);
      ctx.fillStyle = '#fff'; ctx.font = 'italic 900 170px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('GOAL', 0, -1330);
      break;
    }
    case 'divider': {
      poly(ctx, [[-30, 0], [30, 0], [0, -170]], '#e8b028');
      ctx.fillStyle = '#332'; ctx.fillRect(-8, -110, 16, 60);
      break;
    }
    case 'chevron': {
      // crash-board capping the fork island tip
      ctx.fillStyle = '#e8c838'; ctx.fillRect(-160, -260, 320, 260);
      for (let i = 0; i < 3; i++) {
        poly(ctx, [[-160, -60 - i * 80], [0, -130 - i * 80], [160, -60 - i * 80],
                   [160, -26 - i * 80], [0, -96 - i * 80], [-160, -26 - i * 80]], '#1a1a20');
      }
      break;
    }
  }
  ctx.restore();
}
function extra2Km(v) { return (Math.floor(v * 90) + 10) + ''; }

// ---------------------------------------------------------------------------
// traffic, rear view. kind 0 sedan, 1 coupe, 2 hatch, 3 truck.
const CAR_COLS = [['#2a5cc8', '#1a3c88'], ['#d0d2d8', '#9aa0ac'], ['#e8a020', '#b87818'], ['#e8e4dc', '#b8b4ac'], ['#f0d020', '#b89810']];
export function drawTrafficCar(ctx, x, y, s, c, t, night) {
  if (s <= 0.003) return;
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  const [c1, c2] = CAR_COLS[c.kind % 5];
  const moving = c.lane !== undefined && c.laneIdx !== c.target;
  const blinkDir = c.blink > 0 || moving ? Math.sign((c.target - c.laneIdx) || 0) : 0;
  const blinkOn = blinkDir && Math.floor(t * 5) % 2 === 0;
  ctx.fillStyle = 'rgba(12,16,24,0.5)';
  ctx.beginPath(); ctx.ellipse(0, 10, c.truck ? 300 : 250, 34, 0, 0, Math.PI * 2); ctx.fill();
  if (c.truck) {
    ctx.fillStyle = '#14141a'; ctx.fillRect(-250, -70, 80, 76); ctx.fillRect(170, -70, 80, 76);
    poly(ctx, [[-270, -60], [270, -60], [270, -560], [-270, -560]], c1);
    poly(ctx, [[-270, -560], [270, -560], [270, -530], [-270, -530]], c2);
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(-4, -540, 8, 470);
    ctx.fillStyle = '#9a4a2a'; ctx.font = 'italic 900 70px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('CARGO', 0, -300);
    ctx.fillStyle = '#303038'; ctx.fillRect(-270, -80, 540, 22);
    ctx.fillStyle = night ? '#ff5040' : '#c83028';
    ctx.fillRect(-260, -130, 50, 40); ctx.fillRect(210, -130, 50, 40);
    if (night) { ctx.fillStyle = 'rgba(255,60,40,0.25)'; ctx.fillRect(-290, -150, 110, 80); ctx.fillRect(180, -150, 110, 80); }
    if (blinkOn) { ctx.fillStyle = '#ffb020'; ctx.fillRect(blinkDir < 0 ? -260 : 210, -180, 50, 30); }
    ctx.restore();
    return;
  }
  ctx.fillStyle = '#14141a';
  ctx.beginPath();
  ctx.roundRect(-196, -66, 66, 74, 10); ctx.roundRect(130, -66, 66, 74, 10);
  ctx.fill();
  const low = c.kind === 1 || c.kind === 4;
  const roof = low ? 190 : 240, cab = low ? 100 : 120;
  poly(ctx, [[-180, -40], [180, -40], [165, -150], [-165, -150]], c1);
  poly(ctx, [[-165, -150], [165, -150], [cab, -roof], [-cab, -roof]], c2);
  ctx.fillStyle = '#101820ee'; ctx.fillRect(-cab + 10, -roof + 12, (cab - 10) * 2, (roof - 162));
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(-165, -150, 330, 5);
  ctx.fillStyle = '#26262e'; ctx.fillRect(-150, -62, 300, 18);
  ctx.fillStyle = '#e8e0c8'; ctx.fillRect(-40, -84, 80, 20);
  const tl = night ? '#ff4a38' : '#d83030';
  ctx.fillStyle = tl;
  ctx.fillRect(-172, -120, 60, 26); ctx.fillRect(112, -120, 60, 26);
  if (night) {
    ctx.fillStyle = 'rgba(255,60,40,0.28)';
    ctx.beginPath(); ctx.ellipse(-142, -107, 70, 34, 0, 0, 6.3); ctx.ellipse(142, -107, 70, 34, 0, 0, 6.3); ctx.fill();
  }
  if (blinkOn) {
    ctx.fillStyle = '#ffb020';
    const bx = blinkDir < 0 ? -172 : 142;
    ctx.fillRect(bx, -94, 30, 16);
    ctx.fillStyle = 'rgba(255,176,32,0.35)';
    ctx.beginPath(); ctx.arc(bx + 15, -86, 40, 0, 6.3); ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// the player's car — low red coupe. pose: steer -1..1, drift, braking, spin,
// wreck (0..1 progress of the tumble), wheel phase for tread animation.
const bodyGrad = new WeakMap();
export function drawPlayerCar(ctx, x, y, s, o) {
  const { steer = 0, braking = false, spin = 0, wreck = 0, frac = 0, night = 0, wheel = 0, drift = 0 } = o;
  ctx.save(); ctx.translate(x, y);
  let lift = 0, rot = 0;
  if (wreck > 0 || spin > 0) {
    // spins render as a box turning on its vertical axis: the rear (or nose)
    // face and the side face, each foreshortened — true three-quarter views
    let yaw, side = o.side || 1;
    if (wreck > 0) {
      const p = wreck;
      lift = Math.sin(Math.min(1, p * 1.5) * Math.PI) * 120 + (p > 0.66 ? Math.abs(Math.sin((p - 0.66) * 20)) * 24 * (1 - p) : 0);
      const e = Math.min(1, p / 0.8);
      yaw = (1 - (1 - e) * (1 - e)) * Math.PI * 3 * side;
    } else {
      const m = o.spinMax || 1.1, p = 1 - spin / m;
      side = steer >= 0 ? 1 : -1;
      const turns = m > 0.5 ? 1 : 0.12;           // a crash spins right round; a bump just twitches
      yaw = Math.sin(p * Math.PI * 0.5) * Math.PI * 2 * turns * side;
    }
    const sh2 = 1 - Math.min(0.5, lift / 260);
    ctx.save(); ctx.scale(s, s);
    ctx.fillStyle = `rgba(12,16,24,${0.5 * sh2})`;
    ctx.beginPath(); ctx.ellipse(0, 14, 300 * sh2, 40 * sh2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.translate(0, -lift * s);
    ctx.scale(s, s);
    drawCarMesh(ctx, yaw, wreck > 0 ? Math.sin(wreck * Math.PI) * 0.2 * side : 0);
    ctx.restore();
    return;
  } else {
    rot = steer * 0.03 + drift * 0.2;
  }
  // ground shadow stays on the tarmac and shrinks as the car flies
  ctx.save(); ctx.scale(s, s);
  const sh = 1 - Math.min(0.5, lift / 300);
  ctx.fillStyle = `rgba(12,16,24,${0.5 * sh})`;
  ctx.beginPath(); ctx.ellipse(steer * 8, 14, 300 * sh, 40 * sh, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  ctx.translate(0, -lift * s);
  ctx.scale(s, s);
  if (rot) { ctx.translate(0, -130); ctx.rotate(rot); ctx.translate(0, 130); }
  drawCarRear(ctx, steer * 18 + drift * 34, braking, night, wheel, false, frac);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// the car as a tiny low-poly mesh, for spins and wrecks: rotate on the vertical
// axis, project with a slight top-down oblique, painter-sort, lambert-shade.
// Any yaw reads as one solid car — true three-quarter views, no sprite swaps.
// units: x lateral (±), y up (negative is up, like the sprites), z length
// (negative = rear, toward the camera at yaw 0).
const CAR_MESH = (() => {
  const F = [];
  let group = 0;                              // 0 wheels, 1 body, 2 cabin, 3 lamps
  const quad = (pts, col, kind) => F.push({ pts, col, kind, group });
  const box = (x0, x1, y0, y1, z0, z1, col, skip = {}) => {
    const v = (x, y, z) => [x, y, z];
    if (!skip.rear) quad([v(x0, y0, z0), v(x1, y0, z0), v(x1, y1, z0), v(x0, y1, z0)], col, 'rear');
    if (!skip.front) quad([v(x1, y0, z1), v(x0, y0, z1), v(x0, y1, z1), v(x1, y1, z1)], col, 'front');
    quad([v(x0, y0, z1), v(x0, y0, z0), v(x0, y1, z0), v(x0, y1, z1)], col, 'left');
    quad([v(x1, y0, z0), v(x1, y0, z1), v(x1, y1, z1), v(x1, y1, z0)], col, 'right');
    if (!skip.top) quad([v(x0, y1, z0), v(x1, y1, z0), v(x1, y1, z1), v(x0, y1, z1)], col, 'top');
  };
  const RED = '#c8322c', GLASS = '#1c2434', TYRE = '#101016';
  // wheels first (they sit partly inside the body)
  // wheels: octagonal prisms tucked under the body
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    const ring = [];
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; ring.push([Math.sin(a) * 48, -40 + Math.cos(a) * 40]); }
    const xi = x * 196, xo = x * 244;
    for (let i = 0; i < 8; i++) {
      const [z0, y0] = ring[i], [z1, y1] = ring[(i + 1) % 8];
      const q = [[xo, y0, z * 235 + z0], [xo, y1, z * 235 + z1], [xi, y1, z * 235 + z1], [xi, y0, z * 235 + z0]];
      quad(x > 0 ? q : q.reverse(), TYRE, 'tread');
    }
    const cap = ring.map(([zz, yy]) => [xo, yy, z * 235 + zz]);
    quad(x > 0 ? cap.reverse() : cap, '#2a2a34', 'hub');
    const rim = ring.map(([zz, yy]) => [xo + x, -40 + (yy + 40) * 0.5, z * 235 + zz * 0.5]);
    quad(x > 0 ? rim.reverse() : rim, '#9098a8', 'rim');
  }
  // lower body: a wedge, taller at the rear, hood falling to the nose
  group = 1;
  const bx = 232, sill = -16;
  quad([[-bx, sill, -340], [bx, sill, -340], [bx, -150, -340], [-bx, -150, -340]], RED, 'rear');
  quad([[bx, sill, 360], [-bx, sill, 360], [-bx, -96, 360], [bx, -96, 360]], RED, 'front');
  quad([[-bx, sill, 360], [-bx, sill, -340], [-bx, -150, -340], [-bx, -150, 150], [-bx, -110, 360]], RED, 'left');
  quad([[bx, sill, -340], [bx, sill, 360], [bx, -110, 360], [bx, -150, 150], [bx, -150, -340]], RED, 'right');
  // dark sills and arches: the wheels read as tucked under the body
  quad([[-bx - 1, sill, 360], [-bx - 1, sill, -340], [-bx - 1, -44, -340], [-bx - 1, -44, 360]], '#5a1512', 'left');
  quad([[bx + 1, sill, -340], [bx + 1, sill, 360], [bx + 1, -44, 360], [bx + 1, -44, -340]], '#5a1512', 'right');
  quad([[-bx, -150, -340], [bx, -150, -340], [bx, -150, 150], [-bx, -150, 150]], RED, 'top');
  quad([[-bx, -150, 150], [bx, -150, 150], [bx, -96, 360], [-bx, -96, 360]], RED, 'top');
  // cabin: glass all round, red roof
  group = 2;
  const c0 = [-208, -150], c1 = [-140, -252];
  quad([[c0[0], c0[1], -250], [-c0[0], c0[1], -250], [-c1[0], c1[1], -190], [c1[0], c1[1], -190]], GLASS, 'rear');
  quad([[-c0[0], c0[1], 140], [c0[0], c0[1], 140], [c1[0], c1[1], 50], [-c1[0], c1[1], 50]], GLASS, 'front');
  quad([[c0[0], c0[1], 140], [c0[0], c0[1], -250], [c1[0], c1[1], -190], [c1[0], c1[1], 50]], GLASS, 'left');
  quad([[-c0[0], c0[1], -250], [-c0[0], c0[1], 140], [-c1[0], c1[1], 50], [-c1[0], c1[1], -190]], GLASS, 'right');
  quad([[c1[0], c1[1], -190], [-c1[0], c1[1], -190], [-c1[0], c1[1], 50], [c1[0], c1[1], 50]], RED, 'top');
  group = 3;
  // the sprite's cream roof edge, as thin strips around the roof
  quad([[c1[0] - 6, c1[1] - 1, -196], [-c1[0] + 6, c1[1] - 1, -196], [-c1[0] + 6, c1[1] - 1, -178], [c1[0] - 6, c1[1] - 1, -178]], '#ffdca8', 'top');
  quad([[c1[0] - 6, c1[1] - 1, -196], [c1[0] + 10, c1[1] - 1, -196], [c1[0] + 10, c1[1] - 1, 56], [c1[0] - 6, c1[1] - 1, 56]], '#ffdca8', 'top');
  quad([[-c1[0] - 10, c1[1] - 1, -196], [-c1[0] + 6, c1[1] - 1, -196], [-c1[0] + 6, c1[1] - 1, 56], [-c1[0] - 10, c1[1] - 1, 56]], '#ffdca8', 'top');
  group = 2;
  // lamps as thin decals just proud of the faces
  group = 3;
  quad([[-196, -72, -342], [196, -72, -342], [196, -98, -342], [-196, -98, -342]], '#ff3a2c', 'rear');
  quad([[-232, -30, -341], [232, -30, -341], [232, -62, -341], [-232, -62, -341]], '#801a18', 'rear');
  quad([[-44, -40, -343], [44, -40, -343], [44, -64, -343], [-44, -64, -343]], '#f0ece0', 'rear');
  quad([[196, -58, 362], [120, -58, 362], [120, -80, 362], [196, -80, 362]], '#fff4d0', 'front');
  quad([[-120, -58, 362], [-196, -58, 362], [-196, -80, 362], [-120, -80, 362]], '#fff4d0', 'front');
  return F;
})();
const LIGHT = (() => { const l = [0.45, -0.75, -0.5]; const n = Math.hypot(...l); return l.map((v) => v / n); })();
function shadeHex(hex, k) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.min(255, r * k) | 0},${Math.min(255, g * k) | 0},${Math.min(255, b * k) | 0})`;
}
export function drawCarMesh(ctx, yaw, roll = 0) {
  ctx.save(); ctx.scale(0.86, 0.86);          // match the rear sprite's footprint at the swap
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cr = Math.cos(roll), sr = Math.sin(roll);
  const TILT = 0.16;                           // camera above and behind: far parts sit higher
  const out = [];
  for (const f of CAR_MESH) {
    const P = f.pts.map(([x, y, z]) => {
      // roll about the length axis (tumbles), then yaw about the vertical
      const y1 = y * cr - x * sr, x1 = x * cr + y * sr;
      const xr = x1 * cy + z * sy, zr = -x1 * sy + z * cy;
      return [xr, y1 - zr * TILT, zr];
    });
    // back-face cull with the projected winding, shade with the rotated normal
    let area = 0;
    for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; area += a[0] * b[1] - b[0] * a[1]; }
    if (area <= 0) continue;
    const [a, b, c] = f.pts.map(([x, y, z]) => { const y1 = y * cr - x * sr, x1 = x * cr + y * sr; return [x1 * cy + z * sy, y1, -x1 * sy + z * cy]; });
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const nl = Math.hypot(...n) || 1;
    const lam = Math.max(0, -(n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]) / nl);
    const depth = P.reduce((s, p) => s + p[2], 0) / P.length;
    out.push({ P, col: shadeHex(f.col, 0.55 + lam * 0.7), depth, group: f.group + (f.kind === 'top' ? 0.5 : 0) });
  }
  // wheels, then body, then cabin, then lamps; far-to-near within each group.
  // Parts are convex and stacked, so group order resolves what depth can't.
  out.sort((p, q) => p.group - q.group || q.depth - p.depth);
  for (const f of out) {
    ctx.fillStyle = f.col;
    ctx.beginPath();
    ctx.moveTo(f.P[0][0], f.P[0][1]);
    for (let i = 1; i < f.P.length; i++) ctx.lineTo(f.P[i][0], f.P[i][1]);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// side profile (kept for reference art)
function drawCarSide(ctx, dir) {
  ctx.save(); ctx.scale(dir * 0.97, 1.18);
  const bg = ctx.createLinearGradient(0, -210, 0, -30);
  bg.addColorStop(0, '#f05048'); bg.addColorStop(1, '#801a18');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(-330, -40); ctx.lineTo(330, -40); ctx.lineTo(340, -100); ctx.lineTo(160, -120);
  ctx.lineTo(60, -196); ctx.lineTo(-150, -200); ctx.lineTo(-280, -130); ctx.lineTo(-330, -118);
  ctx.closePath(); ctx.fill();
  poly(ctx, [[50, -186], [-140, -190], [-120, -130], [140, -126]], '#161c2a');
  ctx.fillStyle = '#7a1210';
  for (let i = 0; i < 4; i++) ctx.fillRect(-60 + i * 50, -104, 36, 8);
  ctx.fillStyle = '#0e0e14';
  for (const wx of [-210, 210]) { ctx.beginPath(); ctx.arc(wx, -34, 58, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#9098a8';
  for (const wx of [-210, 210]) { ctx.beginPath(); ctx.arc(wx, -34, 26, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#ff4a38'; ctx.fillRect(-336, -110, 14, 30);
  ctx.fillStyle = '#fff4d0'; ctx.fillRect(322, -94, 16, 20);
  ctx.restore();
}

function drawCarRear(ctx, sk, braking, night, wheel, nose, frac = 0) {
  const wreck = 0;
  // tires with animated tread
  const tread = (xx) => {
    ctx.fillStyle = '#0e0e14';
    ctx.beginPath(); ctx.roundRect(xx, -72, 86, 88, 14); ctx.fill();
    ctx.fillStyle = '#26262e';
    const ph = (wheel % 1) * 22;
    for (let yy = -64 + ph; yy < 10; yy += 22) ctx.fillRect(xx + 8, yy, 70, 6);
  };
  tread(-242 - sk * 0.25); tread(156 - sk * 0.25);

  // body: vertical gradient, roof light to rocker dark
  let bg = bodyGrad.get(ctx);
  if (!bg) {
    bg = ctx.createLinearGradient(0, -260, 0, -30);
    bg.addColorStop(0, '#f05048'); bg.addColorStop(0.45, '#c82824'); bg.addColorStop(1, '#801a18');
    bodyGrad.set(ctx, bg);
  }
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(-232, -36); ctx.lineTo(232, -36); ctx.lineTo(210 + sk, -160);
  ctx.lineTo(140 + sk, -252); ctx.lineTo(-140 + sk, -252); ctx.lineTo(-210 + sk, -160);
  ctx.closePath(); ctx.fill();
  // lower valance and diffuser
  ctx.fillStyle = '#1a1a22';
  ctx.beginPath(); ctx.moveTo(-232, -36); ctx.lineTo(232, -36); ctx.lineTo(214, -6); ctx.lineTo(-214, -6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2c2c36';
  for (let i = -3; i <= 3; i++) ctx.fillRect(i * 44 - 3, -32, 6, 24);
  // exhaust tips
  ctx.fillStyle = '#9098a8';
  ctx.beginPath(); ctx.ellipse(-150, -20, 20, 11, 0, 0, 6.3); ctx.ellipse(150, -20, 20, 11, 0, 0, 6.3); ctx.fill();
  ctx.fillStyle = '#2a2a30';
  ctx.beginPath(); ctx.ellipse(-150, -20, 13, 7, 0, 0, 6.3); ctx.ellipse(150, -20, 13, 7, 0, 0, 6.3); ctx.fill();

  // shoulder crease highlight + rim light on the sun-facing edges
  ctx.strokeStyle = 'rgba(255,190,170,0.55)'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(-222, -104); ctx.lineTo(222, -104); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,221,170,0.8)'; ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(-140 + sk, -252); ctx.lineTo(140 + sk, -252);
  ctx.moveTo(-210 + sk, -160); ctx.lineTo(-140 + sk, -252);
  ctx.moveTo(210 + sk, -160); ctx.lineTo(140 + sk, -252);
  ctx.stroke();

  // rear window with a sky reflection band
  poly(ctx, [[-126 + sk, -244], [126 + sk, -244], [102 + sk, -178], [-102 + sk, -178]], '#161c2a');
  ctx.save();
  ctx.beginPath(); ctx.moveTo(-126 + sk, -244); ctx.lineTo(126 + sk, -244); ctx.lineTo(102 + sk, -178); ctx.lineTo(-102 + sk, -178); ctx.clip();
  ctx.fillStyle = 'rgba(160,200,240,0.22)';
  ctx.beginPath(); ctx.moveTo(-60 + sk, -244); ctx.lineTo(10 + sk, -244); ctx.lineTo(-30 + sk, -178); ctx.lineTo(-100 + sk, -178); ctx.fill();
  ctx.restore();
  // side strakes
  ctx.fillStyle = '#7a1210';
  for (let i = 0; i < 5; i++) ctx.fillRect(-150 + i * 66 + sk * 0.5, -144, 40, 8);
  // tail light bar
  ctx.fillStyle = '#26262e';
  ctx.fillRect(-206, -72, 412, 18);
  const lit = braking || night > 0.3;
  ctx.fillStyle = braking ? '#ff6050' : (lit ? '#ff4a38' : '#d83a30');
  ctx.fillRect(-196, -96, 392, 24);
  ctx.fillStyle = '#1a1a20';
  for (let i = 1; i < 6; i++) ctx.fillRect(-196 + i * 65, -94, 6, 24);
  if (braking || night > 0.3) {
    const g = braking ? 0.5 : 0.3;
    for (const lx of [-140, 140]) {
      const rg = ctx.createRadialGradient(lx, -84, 4, lx, -84, 90);
      rg.addColorStop(0, `rgba(255,80,60,${g})`); rg.addColorStop(1, 'rgba(255,80,60,0)');
      ctx.fillStyle = rg; ctx.fillRect(lx - 90, -174, 180, 180);
    }
  }
  // licence plate
  ctx.fillStyle = '#f0ece0'; ctx.fillRect(-44, -66, 88, 26);
  ctx.fillStyle = '#20202a'; ctx.font = 'bold 20px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('SUN 86', 0, -46);
  // exhaust heat at speed
  if (frac > 0.5 && !wreck) {
    ctx.fillStyle = `rgba(230,232,240,${(0.05 + frac * 0.06).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(-150 - sk * 0.2, 4, 24 + frac * 14, 9, 0, 0, Math.PI * 2);
    ctx.ellipse(150 - sk * 0.2, 4, 24 + frac * 14, 9, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // seen nose-first mid-spin: headlamps instead of the tail bar
  if (nose) {
    ctx.fillStyle = '#c82824'; ctx.fillRect(-206, -100, 412, 34);
    ctx.fillStyle = '#fff4d0'; ctx.fillRect(-190, -94, 90, 20); ctx.fillRect(100, -94, 90, 20);
  }
}
