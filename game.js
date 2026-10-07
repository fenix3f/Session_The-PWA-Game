(() => {
'use strict';

// ---------- настройки ----------
const MAP = 2400;          // размер карты (px)
const SESSION = 300;       // сколько секунд нужно продержаться (5 минут)
const CS = 80;             // размер ячейки сетки для столкновений
const GN = Math.ceil(MAP / CS);
const MAXE = 350;          // максимум врагов одновременно
const TAU = Math.PI * 2;
const EF = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const KEY = 'sessiya_v1';
const BUILD = '0.3a';
const BOSS_T = 150;        // на какой секунде приходит первый босс (2:30)
const INS_SPD = 200;       // скорость оскорблений препода
const INS_TURN = 0.6;      // как быстро они доворачивают к игроку (рад/с)
const INS_TURN_MAX = 1.0;  // и на сколько всего могут довернуть (рад, около 57°), чтобы только чуть скашивались

const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const ui = document.getElementById('ui');
const pauseBtn = document.getElementById('pause');

let W = 0, H = 0, DPR = 1, SC = 1, SAFE = 0;

// ---------- сохранение ----------
const DEF_SAVE = { best: 0, kills: 0, side: 'left', wins: 0 };
function loadSave() {
  try { return Object.assign({}, DEF_SAVE, JSON.parse(localStorage.getItem(KEY) || '{}')); }
  catch (e) { return Object.assign({}, DEF_SAVE); }
}
function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {} }
const save = loadSave();

// ---------- утилиты ----------
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rnd = (a, b) => a + Math.random() * (b - a);
function mmss(s) {
  s = Math.max(0, Math.floor(s));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
function compact(a, keep) {
  let j = 0;
  for (let i = 0; i < a.length; i++) { const o = a[i]; if (keep(o)) a[j++] = o; }
  a.length = j;
}

function readSafe() {
  try {
    const p = document.createElement('div');
    p.style.cssText = 'position:fixed;top:0;left:0;visibility:hidden;padding-top:env(safe-area-inset-top,0px)';
    document.body.appendChild(p);
    const v = parseFloat(getComputedStyle(p).paddingTop) || 0;
    document.body.removeChild(p);
    return v;
  } catch (e) { return 0; }
}

function resize() {
  W = window.innerWidth; H = window.innerHeight;
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.floor(W * DPR); cv.height = Math.floor(H * DPR);
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  SC = Math.max(1, Math.min(W, H) / 520);
  SAFE = readSafe();
}

// ---------- спрайты (эмодзи -> offscreen canvas) ----------
function emojiSprite(ch, px) {
  const s = Math.round(px * 2);
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = Math.round(s * 0.8) + 'px ' + EF;
  g.fillText(ch, s / 2, s / 2 + s * 0.04);
  return { c, w: px, h: px };
}
let SPR = null;
function makeSprites() {
  SPR = {
    player: emojiSprite('🧑‍🎓', 38),
    enemy: emojiSprite('📕', 30),
    ref: emojiSprite('📄', 24),
    lab: emojiSprite('🧪', 30),
    boss: emojiSprite('📚', 48),
    gem: emojiSprite('✅', 16),
    sheet: emojiSprite('📜', 28),
    google: emojiSprite('🔍', 26),
    teacher: emojiSprite('👩‍🏫', 72)
  };
  loadImgSprite('boss.png', 76, 'teacher');
}
function drawSpr(s, x, y) { ctx.drawImage(s.c, x - s.w / 2, y - s.h / 2, s.w, s.h); }
function drawSprK(s, x, y, k) { ctx.drawImage(s.c, x - s.w * k / 2, y - s.h * k / 2, s.w * k, s.h * k); }
// картинка из файла -> спрайт (пока грузится, остаётся запасной эмодзи)
function loadImgSprite(src, px, key) {
  try {
    if (typeof Image === 'undefined') return;
    const im = new Image();
    im.onload = () => {
      const s = Math.round(px * 2), c = document.createElement('canvas');
      c.width = c.height = s;
      c.getContext('2d').drawImage(im, 0, 0, s, s);
      SPR[key] = { c, w: px, h: px };
    };
    im.src = src;
  } catch (e) {}
}

// ---------- описания оружия и пассивок ----------
const WDEF = {
  sheet:  { n: 'Шпаргалка', ic: '📜', d: ['Шпаргалки кружат вокруг тебя', '+1 шпаргалка', 'Больше урона и шире круг', '+1 шпаргалка', 'Ещё +1 и быстрее вращение'] },
  google: { n: 'Гугл',      ic: '🔍', d: ['Самонаводящийся запрос в ближайшего врага', 'Быстрее и сильнее', 'Два запроса сразу', 'Ещё сильнее', 'Три запроса сразу'] },
  energy: { n: 'Энергетик', ic: '🥤', d: ['Взрывная волна вокруг тебя', 'Шире и чаще', 'Сильнее удар', 'Ещё шире и чаще', 'Максимальный заряд'] },
  pen:    { n: 'Ручка',     ic: '🖊️', d: ['Пробивающий выстрел по ходу движения', 'Две ручки', 'Быстрее и сильнее', 'Три ручки', 'Четыре ручки, пробивают больше'] }
};
const PDEF = {
  speed:  { n: 'Кроссовки', ic: '👟', d: '+10% к скорости' },
  magnet: { n: 'Магнит',    ic: '🧲', d: '+35% радиус сбора баллов' },
  hp:     { n: 'Бутерброд', ic: '🥪', d: '+20 макс. HP и лечение' },
  dmg:    { n: 'Конспект',  ic: '📓', d: '+12% к урону' },
  cd:     { n: 'Кофе',      ic: '☕', d: '-8% к перезарядке' }
};
const ST = {
  sheet: [
    { n: 2, dmg: 8,  R: 46, spd: 2.6 }, { n: 3, dmg: 9,  R: 50, spd: 2.8 },
    { n: 3, dmg: 12, R: 56, spd: 2.8 }, { n: 4, dmg: 12, R: 60, spd: 3.2 },
    { n: 5, dmg: 16, R: 66, spd: 3.5 }
  ],
  google: [
    { cd: 1.3, n: 1, dmg: 14 }, { cd: 1.1, n: 1, dmg: 18 }, { cd: 1.0, n: 2, dmg: 18 },
    { cd: 0.9, n: 2, dmg: 24 }, { cd: 0.8, n: 3, dmg: 28 }
  ],
  energy: [
    { cd: 3.2, rad: 100, dmg: 18 }, { cd: 2.8, rad: 115, dmg: 22 }, { cd: 2.8, rad: 115, dmg: 32 },
    { cd: 2.4, rad: 140, dmg: 36 }, { cd: 2.0, rad: 165, dmg: 48 }
  ],
  pen: [
    { cd: 1.0, n: 1, dmg: 11, pierce: 2 }, { cd: 0.9, n: 2, dmg: 12, pierce: 2 },
    { cd: 0.75, n: 2, dmg: 15, pierce: 3 }, { cd: 0.7, n: 3, dmg: 16, pierce: 3 },
    { cd: 0.6, n: 4, dmg: 20, pierce: 5 }
  ]
};
const needXp = l => 4 + l * 3;

// ---------- типы врагов ----------
// hp: множитель здоровья, spd: множитель скорости, dmg: множитель урона при касании,
// xp: сколько баллов падает, kb: насколько сильно отбрасывает
const ET = {
  c: { name: 'Курсовая',        spr: 'enemy', r: 13, hp: 1,    spd: 1,    dmg: 1,   xp: 1,  kb: 1 },
  r: { name: 'Реферат',         spr: 'ref',   r: 10, hp: 0.45, spd: 1.55, dmg: 0.6, xp: 1,  kb: 1.3 },
  l: { name: 'Лабораторная',    spr: 'lab',   r: 13, hp: 1.2,  spd: 0.7,  dmg: 1,   xp: 2,  kb: 1, ranged: true, keep: 240 },
  a: { name: 'Автомат отменён', spr: 'boss',  r: 21, hp: 8,    spd: 0.8,  dmg: 2,   xp: 14, kb: 0.25, elite: true },
  b: { name: 'Препод',          spr: 'teacher', r: 34, hp: 25,  spd: 0.75, dmg: 1.5, xp: 0,  kb: 0.05, elite: true, boss: true, keep: 230 }
};
// оскорбления препода: фраза и значок, который летит по полю
const INS = [
  { t: 'Твой мозг бесконечно дифференцируем', s: 'd/dx' },
  { t: 'Когда тебя спроецировали, получился ноль', s: '0' },
  { t: 'Ты — константа в конце интеграла.', s: '+C' },
  { t: 'Ваш уровень культуры впечатляет. К сожалению, со знаком минус', s: '−' },
  { t: 'У тебя кругозор как у точки', s: '•' },
  { t: 'Поделю тебя на ноль', s: '÷0' }
];
// когда приходят элитные враги: [секунда, сколько]
const ELITE = [{ t: 95, n: 1 }, { t: 185, n: 2 }, { t: 255, n: 3 }];
const MAXLAB = 10;         // максимум стрелков одновременно

// ---------- ввод ----------
const joy = { active: false, id: -1, ox: 0, oy: 0, px: 0, py: 0, x: 0, y: 0 };
const JR = 55; // радиус круга управления
const kd = { l: false, r: false, u: false, d: false };

function joyReset() { joy.active = false; joy.id = -1; joy.x = 0; joy.y = 0; }

cv.addEventListener('pointerdown', e => {
  if (state !== 'play' || joy.active) return;
  const inZone = e.pointerType === 'mouse' || (save.side === 'left' ? e.clientX < W / 2 : e.clientX >= W / 2);
  if (!inZone) return;
  joy.active = true; joy.id = e.pointerId;
  joy.ox = joy.px = e.clientX; joy.oy = joy.py = e.clientY;
  joy.x = joy.y = 0;
  try { cv.setPointerCapture(e.pointerId); } catch (_) {}
  e.preventDefault();
});
cv.addEventListener('pointermove', e => {
  if (!joy.active || e.pointerId !== joy.id) return;
  let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy;
  const len = Math.hypot(dx, dy);
  if (len > JR) { // круг "плывёт" за пальцем
    joy.ox += dx / len * (len - JR); joy.oy += dy / len * (len - JR);
    dx = e.clientX - joy.ox; dy = e.clientY - joy.oy;
  }
  joy.px = e.clientX; joy.py = e.clientY;
  const l = Math.hypot(dx, dy) / JR;
  if (l < 0.12) { joy.x = 0; joy.y = 0; }
  else { const k = Math.min(1, l) / Math.hypot(dx, dy); joy.x = dx * k; joy.y = dy * k; }
  e.preventDefault();
});
function joyUp(e) { if (joy.active && e.pointerId === joy.id) joyReset(); }
cv.addEventListener('pointerup', joyUp);
cv.addEventListener('pointercancel', joyUp);
cv.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('contextmenu', e => e.preventDefault());

const KMAP = { ArrowLeft: 'l', a: 'l', A: 'l', ArrowRight: 'r', d: 'r', D: 'r', ArrowUp: 'u', w: 'u', W: 'u', ArrowDown: 'd', s: 'd', S: 'd' };
window.addEventListener('keydown', e => {
  if (KMAP[e.key]) { kd[KMAP[e.key]] = true; e.preventDefault(); }
  if ((e.key === 'Escape' || e.key === 'p') && state === 'play') pauseGame();
});
window.addEventListener('keyup', e => { if (KMAP[e.key]) kd[KMAP[e.key]] = false; });

// ---------- состояние ----------
let state = 'menu';
let G = null;

function makeDecor() {
  const d = [];
  const ok = (x, y) => Math.hypot(x - MAP / 2, y - MAP / 2) > 160;
  for (let i = 0; i < 46; i++) {
    let x, y; do { x = rnd(150, MAP - 250); y = rnd(100, MAP - 150); } while (!ok(x, y));
    d.push({ k: 0, x, y, w: 96, h: 54 });
  }
  for (let i = 0; i < 34; i++) d.push({ k: 1, x: rnd(60, MAP - 60), y: rnd(60, MAP - 60), r: rnd(14, 40) });
  return d;
}

function newGame(startWeapon) {
  G = {
    t: 0, kills: 0, level: 1, xp: 0, need: needXp(1),
    p: { x: MAP / 2, y: MAP / 2, hp: 100, max: 100, inv: 0, fx: 0, fy: 1, r: 12 },
    w: {}, ps: {}, wt: {},
    en: [], gems: [], pr: [], fx: [], ep: [],
    spawn: 0.5, swarm: 20, eliteI: 0, nLab: 0, msg: null,
    bossDone: false, qHits: 0, boost: 0, ft: [], shout: null, quiz: null, boss: null,
    orbA: 0, shake: 0, over: false, win: false,
    decor: makeDecor(),
    grid: Array.from({ length: GN * GN }, () => [])
  };
  G.w[startWeapon] = 1; G.wt[startWeapon] = 0.4;
  for (let i = 0; i < 5; i++) spawnEnemy();
  joyReset();
}

// ---------- враги ----------
const sp = { x: 0, y: 0 };
function spawnPos() {
  const p = G.p;
  const R = Math.hypot(W, H) / 2 / SC + 50;
  for (let tries = 0; tries < 8; tries++) {
    const a = Math.random() * TAU, r = R + Math.random() * 40;
    const x = clamp(p.x + Math.cos(a) * r, 20, MAP - 20);
    const y = clamp(p.y + Math.sin(a) * r, 20, MAP - 20);
    sp.x = x; sp.y = y;
    if (Math.hypot(x - p.x, y - p.y) > R * 0.85) return;
  }
}
function addEnemy(type, x, y) {
  const T = ET[type];
  const hp = (10 + G.t * 0.12) * T.hp;
  G.en.push({ type, T, r: T.r, x, y, hp, mh: hp, kx: 0, ky: 0, ob: 0, fl: 0, sh: 1 + Math.random() * 2, dead: false });
}
function spawnEnemy(type) {
  spawnPos();
  addEnemy(type || 'c', sp.x, sp.y);
}
// обычный спавн: курсовые, а со второй минуты ещё и лабораторные
function pickType() {
  const t = G.t;
  if (t > 60 && G.nLab < MAXLAB && Math.random() < Math.min(0.2, 0.06 + (t - 60) / 1500)) return 'l';
  return 'c';
}
// рой рефератов: стая налетает с одной стороны
function spawnSwarm() {
  const n = Math.min(18, 6 + Math.floor(G.t / 25));
  spawnPos();
  const bx = sp.x, by = sp.y;
  for (let i = 0; i < n && G.en.length < MAXE; i++) {
    addEnemy('r', clamp(bx + rnd(-45, 45), 20, MAP - 20), clamp(by + rnd(-45, 45), 20, MAP - 20));
  }
}
function hurtPlayer(n) {
  const g = G, p = g.p;
  p.hp -= n; p.inv = 0.7; g.shake = 6;
  try { if (navigator.vibrate) navigator.vibrate(25); } catch (_) {}
  if (p.hp <= 0) { p.hp = 0; finish(false); return true; }
  return false;
}

// ---------- босс-препод: оскорбления и викторина ----------
function fireInsults(e) {
  const g = G;
  const k = Math.floor(Math.random() * INS.length);
  g.shout = { text: INS[k].t, e, t: 0, d: 3 };
  g.volley = (g.volley || 0) + 1;
  const n = 9 + Math.min(4, Math.floor(g.volley / 3));
  // кольцо ориентировано так, чтобы один луч смотрел примерно на игрока, остальные расходятся в стороны
  const base = Math.atan2(g.p.y - e.y, g.p.x - e.x) + rnd(-0.25, 0.25);
  for (let i = 0; i < n && g.ep.length < 90; i++) {
    const a = base + i * TAU / n;
    g.ep.push({ q: true, ph: k, x: e.x, y: e.y, vx: Math.cos(a) * INS_SPD, vy: Math.sin(a) * INS_SPD, life: 9, r: 13, turn: 0 });
  }
}
const GLITCH = '%&$#*!@?§¤~^';
function glitchStr(n) {
  let s = '';
  for (let i = 0; i < n; i++) s += GLITCH[Math.floor(Math.random() * GLITCH.length)];
  return s;
}
const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
function makeQuiz(hard) {
  let text, opts, ans;
  if (!hard) {
    // нормальный пример: сложение, вычитание или умножение
    const k = ri(0, 2); let a, b, c;
    if (k === 0) { a = ri(1, 19); b = ri(1, 19); c = a + b; text = a + ' + ' + b; }
    else if (k === 1) { a = ri(5, 24); b = ri(1, a - 1); c = a - b; text = a + ' − ' + b; }
    else { a = ri(2, 9); b = ri(2, 9); c = a * b; text = a + ' × ' + b; }
    const pool = [];
    for (let v = Math.max(0, c - 12); v <= c + 12; v++) if (v !== c) pool.push(v);
    shuffle(pool);
    opts = shuffle(pool.slice(0, 9).concat([c]));
    ans = c;
  } else {
    // «битый» пример: решить нельзя, один из 10 вариантов правильный наугад
    text = ri(1, 9) + '+' + glitchStr(ri(6, 9)) + ri(100, 9999);
    const set = new Set();
    while (set.size < 10) set.add(ri(1, 999));
    opts = shuffle(Array.from(set));
    ans = opts[ri(0, 9)];
  }
  return { text, opts, ans, hard };
}
function openQuiz(ph) {
  const g = G;
  g.qHits++;
  g.quiz = Object.assign(makeQuiz(g.qHits > 1), { ph });
  setState('quiz');
}
function answerQuiz(i) {
  const g = G, q = g.quiz, p = g.p;
  if (!q) return;
  const ok = q.opts[i] === q.ans;
  g.quiz = null;
  if (ok) {
    g.ft.push({ text: 'молодец! ↑', fill: '#e0a82e', line: 'rgba(60,40,0,0.9)', t: 0, d: 1.5 });
    g.boost = 0.5;
  } else {
    g.ft.push({ text: 'Бездарность! ↓', fill: '#4b2f9e', line: 'rgba(255,255,255,0.95)', t: 0, d: 1.5 });
    if (hurtPlayer(15)) return;
  }
  p.inv = Math.max(p.inv, 1.2); // после ответа несколько секунд неуязвимости
  setState('play');
}
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// ---------- сетка для быстрых запросов ----------
const nb = [];
function buildGrid() {
  const grid = G.grid;
  for (let i = 0; i < grid.length; i++) grid[i].length = 0;
  for (const e of G.en) {
    if (e.dead) continue;
    const cx = clamp(Math.floor(e.x / CS), 0, GN - 1), cy = clamp(Math.floor(e.y / CS), 0, GN - 1);
    grid[cy * GN + cx].push(e);
  }
}
function near(x, y, r) {
  nb.length = 0;
  const grid = G.grid;
  const x0 = clamp(Math.floor((x - r) / CS), 0, GN - 1), x1 = clamp(Math.floor((x + r) / CS), 0, GN - 1);
  const y0 = clamp(Math.floor((y - r) / CS), 0, GN - 1), y1 = clamp(Math.floor((y + r) / CS), 0, GN - 1);
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    const a = grid[cy * GN + cx];
    for (let k = 0; k < a.length; k++) nb.push(a[k]);
  }
  return nb;
}
function separate() {
  const grid = G.grid;
  for (const e of G.en) {
    if (e.dead) continue;
    const cx = clamp(Math.floor(e.x / CS), 0, GN - 1), cy = clamp(Math.floor(e.y / CS), 0, GN - 1);
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const gx = cx + ox, gy = cy + oy;
      if (gx < 0 || gy < 0 || gx >= GN || gy >= GN) continue;
      const a = grid[gy * GN + gx];
      for (let k = 0; k < a.length; k++) {
        const o = a[k];
        if (o === e) continue;
        const dx = e.x - o.x, dy = e.y - o.y, d2 = dx * dx + dy * dy;
        const MIN = (e.r + o.r) * 0.85;
        if (d2 < MIN * MIN && d2 > 0.01) {
          const d = Math.sqrt(d2), push = (MIN - d) * 0.5;
          e.x += dx / d * push; e.y += dy / d * push;
        }
      }
    }
  }
}

// ---------- урон и дроп ----------
function addFx(o) { if (G.fx.length < 80) G.fx.push(o); }
function hitEnemy(e, dmg, kx, ky) {
  if (e.dead) return;
  e.hp -= dmg; e.fl = 0.08;
  const kb = e.T.kb;
  e.kx = clamp(e.kx + kx * kb, -320, 320); e.ky = clamp(e.ky + ky * kb, -320, 320);
  if (e.hp <= 0) killEnemy(e);
}
function killEnemy(e) {
  e.dead = true; G.kills++;
  if (e.T.boss) { // препод побеждён: куча баллов, оскорбления исчезают
    G.bossDone = true;
    G.msg = { text: 'Препод побеждён!', t: 3, icon: '🎓' };
    for (let i = 0; i < 8; i++) G.gems.push({ x: e.x + rnd(-40, 40), y: e.y + rnd(-40, 40), v: 6, mg: false, dead: false });
    for (const b of G.ep) if (b.q) b.life = 0;
    addFx({ k: 'pop', x: e.x, y: e.y, t: 0, d: 0.7, big: 5 });
    return;
  }
  const v = e.T.xp;
  if (G.gems.length < 500) G.gems.push({ x: e.x, y: e.y, v, mg: false, dead: false });
  else G.xp += v;
  addFx({ k: 'pop', x: e.x, y: e.y, t: 0, d: e.T.elite ? 0.45 : 0.25, big: e.T.elite ? 3 : 1 });
}

// ---------- обновление ----------
function update(dt) {
  const g = G, p = g.p, w = g.w, ps = g.ps;
  g.t += dt;
  if (g.t >= SESSION) { finish(true); return; }

  // движение игрока
  let ix = joy.x, iy = joy.y;
  if (kd.l || kd.r || kd.u || kd.d) {
    ix = (kd.r ? 1 : 0) - (kd.l ? 1 : 0); iy = (kd.d ? 1 : 0) - (kd.u ? 1 : 0);
    const l = Math.hypot(ix, iy); if (l > 1) { ix /= l; iy /= l; }
  }
  g.boost = Math.max(0, g.boost - dt);
  const pspd = 150 * (1 + 0.1 * (ps.speed || 0)) * (g.boost > 0 ? 1.5 : 1);
  p.x = clamp(p.x + ix * pspd * dt, p.r, MAP - p.r);
  p.y = clamp(p.y + iy * pspd * dt, p.r, MAP - p.r);
  const ml = Math.hypot(ix, iy);
  if (ml > 0.05) { p.fx = ix / ml; p.fy = iy / ml; }
  p.inv = Math.max(0, p.inv - dt);
  g.shake = Math.max(0, g.shake - 40 * dt);

  const mulDmg = 1 + 0.12 * (ps.dmg || 0);
  const mulCd = Math.max(0.4, 1 - 0.08 * (ps.cd || 0));

  // спавн врагов
  g.spawn -= dt;
  if (g.spawn <= 0) {
    g.spawn += Math.max(0.25, 0.9 - g.t * 0.0022);
    const batch = 1 + Math.floor(g.t / 90);
    for (let i = 0; i < batch && g.en.length < MAXE; i++) spawnEnemy(pickType());
  }
  // рои рефератов
  g.swarm -= dt;
  if (g.swarm <= 0) {
    g.swarm = Math.max(7, 16 - g.t / 30);
    spawnSwarm();
  }
  // элитные «автоматы отменены»
  if (g.eliteI < ELITE.length && g.t >= ELITE[g.eliteI].t) {
    const n = ELITE[g.eliteI++].n;
    for (let i = 0; i < n; i++) spawnEnemy('a');
    g.msg = { text: 'Автомат отменён!', t: 2.5 };
  }
  // первый босс: препод
  if (!g.bossDone && !g.boss && g.t >= BOSS_T) {
    spawnPos(); addEnemy('b', sp.x, sp.y);
    g.boss = g.en[g.en.length - 1];
    g.msg = { text: 'Препод принимает зачёт!', t: 3 };
  }
  if (g.msg) { g.msg.t -= dt; if (g.msg.t <= 0) g.msg = null; }
  if (g.shout) { g.shout.t += dt; if (g.shout.t >= g.shout.d || g.shout.e.dead) g.shout = null; }

  buildGrid();
  separate();

  // враги: движение и контакт
  const far = Math.hypot(W, H) / SC * 0.5 + 420;
  const esp = 52 + Math.min(g.t * 0.12, 30);
  const dmgIn = 8 + Math.floor(g.t / 60) * 2;
  const kdec = Math.exp(-7 * dt);
  let labs = 0;
  for (const e of g.en) {
    if (e.dead) continue;
    const T = e.T;
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
    if (d > far && !T.boss) { spawnPos(); e.x = sp.x; e.y = sp.y; continue; }
    let mx = dx / d, my = dy / d, sm = T.spd;
    if (T.boss) {
      if (d < T.keep - 60) { mx = -mx; my = -my; sm = T.spd * 0.7; }  // отходит, если подошёл близко
      else if (d < T.keep + 30) sm = 0;                                // держит дистанцию
      else if (d > 420) sm = 2.2;                                      // догоняет, если убежал
      e.sh -= dt;
      if (e.sh <= 0) { e.sh = 3.4; fireInsults(e); }
    }
    if (T.ranged) {
      labs++;
      if (d < T.keep - 40) { mx = -mx; my = -my; sm = T.spd * 0.8; } // отступает, если подошёл близко
      else if (d < T.keep + 20) sm = 0;                              // держит дистанцию
      e.sh -= dt;
      if (e.sh <= 0 && d < 420) {                                    // стреляет задачей
        e.sh = 2.6 + Math.random() * 0.8;
        g.ep.push({ x: e.x, y: e.y, vx: dx / d * 150, vy: dy / d * 150, life: 3.5, r: 6 });
      }
    }
    e.kx *= kdec; e.ky *= kdec;
    e.x = clamp(e.x + (mx * esp * sm + e.kx) * dt, 12, MAP - 12);
    e.y = clamp(e.y + (my * esp * sm + e.ky) * dt, 12, MAP - 12);
    e.ob -= dt; if (e.fl > 0) e.fl -= dt;
    if (d < e.r + 14 && p.inv <= 0) {
      if (hurtPlayer(Math.round(dmgIn * T.dmg))) return;
    }
  }
  g.nLab = labs;

  // снаряды врагов (задачи от лабораторных)
  for (const b of g.ep) {
    if (b.q) { // оскорбление чуть-чуть скашивается в сторону игрока
      let da = Math.atan2(p.y - b.y, p.x - b.x) - Math.atan2(b.vy, b.vx);
      da = Math.atan2(Math.sin(da), Math.cos(da));
      const step = clamp(da, -INS_TURN * dt, INS_TURN * dt);
      if (b.turn + Math.abs(step) <= INS_TURN_MAX) {
        const c = Math.cos(step), s = Math.sin(step), vx = b.vx;
        b.vx = vx * c - b.vy * s; b.vy = vx * s + b.vy * c; b.turn += Math.abs(step);
      }
    }
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (b.x < -50 || b.y < -50 || b.x > MAP + 50 || b.y > MAP + 50) b.life = 0;
    if (b.life > 0 && p.inv <= 0) {
      const dx = p.x - b.x, dy = p.y - b.y, rr = b.r + p.r;
      if (dx * dx + dy * dy < rr * rr) {
        b.life = 0;
        if (b.q) { openQuiz(b.ph); return; }   // оскорбление препода: пауза и пример
        if (hurtPlayer(8 + Math.floor(g.t / 60))) return;
      }
    }
  }

  // --- шпаргалка (орбита) ---
  if (w.sheet) {
    const s = ST.sheet[w.sheet - 1];
    g.orbA += dt * s.spd;
    for (let i = 0; i < s.n; i++) {
      const a = g.orbA + i * TAU / s.n;
      const ox = p.x + Math.cos(a) * s.R, oy = p.y + Math.sin(a) * s.R;
      const list = near(ox, oy, 40);
      for (let k = 0; k < list.length; k++) {
        const e = list[k];
        if (e.dead || e.ob > 0) continue;
        const dx = e.x - ox, dy = e.y - oy, hr = 14 + e.r;
        if (dx * dx + dy * dy < hr * hr) {
          const ax = e.x - p.x, ay = e.y - p.y, al = Math.hypot(ax, ay) || 1;
          hitEnemy(e, s.dmg * mulDmg, ax / al * 90, ay / al * 90);
          e.ob = 0.35;
        }
      }
    }
  }

  // --- гугл (самонаводящийся) ---
  if (w.google) {
    g.wt.google -= dt;
    if (g.wt.google <= 0) {
      const s = ST.google[w.google - 1];
      const list = near(p.x, p.y, 480).filter(e => !e.dead);
      if (list.length) {
        g.wt.google = s.cd * mulCd;
        const used = [];
        for (let i = 0; i < s.n; i++) {
          let best = null, bd = 1e12;
          for (const e of list) {
            if (used.indexOf(e) >= 0) continue;
            const d2 = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
            if (d2 < bd) { bd = d2; best = e; }
          }
          if (!best) best = list[0];
          used.push(best);
          const a = Math.atan2(best.y - p.y, best.x - p.x) + (i - (s.n - 1) / 2) * 0.35;
          g.pr.push({ type: 'g', x: p.x, y: p.y, vx: Math.cos(a) * 280, vy: Math.sin(a) * 280,
            dmg: s.dmg, life: 3, r: 10, tg: best, hit: null, pierce: 0 });
        }
      } else g.wt.google = 0.25;
    }
  }

  // --- ручка (по ходу движения) ---
  if (w.pen) {
    g.wt.pen -= dt;
    if (g.wt.pen <= 0) {
      const s = ST.pen[w.pen - 1];
      g.wt.pen = s.cd * mulCd;
      const base = Math.atan2(p.fy, p.fx);
      for (let i = 0; i < s.n; i++) {
        const a = base + (i - (s.n - 1) / 2) * 0.16;
        g.pr.push({ type: 'p', x: p.x, y: p.y, vx: Math.cos(a) * 430, vy: Math.sin(a) * 430,
          dmg: s.dmg, life: 0.9, r: 7, tg: null, hit: [], pierce: s.pierce });
      }
    }
  }

  // --- энергетик (волна) ---
  if (w.energy) {
    g.wt.energy -= dt;
    if (g.wt.energy <= 0) {
      const s = ST.energy[w.energy - 1];
      g.wt.energy = s.cd * mulCd;
      const list = near(p.x, p.y, s.rad + 26);
      for (let k = 0; k < list.length; k++) {
        const e = list[k];
        if (e.dead) continue;
        const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
        if (d < s.rad + e.r) hitEnemy(e, s.dmg * mulDmg, dx / d * 260, dy / d * 260);
      }
      addFx({ k: 'ring', x: p.x, y: p.y, max: s.rad, t: 0, d: 0.35 });
      g.shake = Math.max(g.shake, 3);
    }
  }

  // снаряды
  for (const pr of g.pr) {
    if (pr.type === 'g') {
      if (!pr.tg || pr.tg.dead) {
        pr.tg = null;
        const list = near(pr.x, pr.y, 260);
        let bd = 1e12;
        for (let k = 0; k < list.length; k++) {
          const e = list[k]; if (e.dead) continue;
          const d2 = (e.x - pr.x) ** 2 + (e.y - pr.y) ** 2;
          if (d2 < bd) { bd = d2; pr.tg = e; }
        }
      }
      if (pr.tg) {
        const dx = pr.tg.x - pr.x, dy = pr.tg.y - pr.y, d = Math.hypot(dx, dy) || 1;
        const k = Math.min(1, dt * 6);
        pr.vx += (dx / d * 300 - pr.vx) * k; pr.vy += (dy / d * 300 - pr.vy) * k;
      }
    }
    pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.life -= dt;
    if (pr.x < -50 || pr.y < -50 || pr.x > MAP + 50 || pr.y > MAP + 50) pr.life = 0;
    if (pr.life <= 0) continue;
    const list = near(pr.x, pr.y, pr.r + 26);
    for (let k = 0; k < list.length; k++) {
      const e = list[k];
      if (e.dead) continue;
      const dx = e.x - pr.x, dy = e.y - pr.y, rr = (pr.r + e.r) * (pr.r + e.r);
      if (dx * dx + dy * dy > rr) continue;
      if (pr.hit && pr.hit.indexOf(e) >= 0) continue;
      const vl = Math.hypot(pr.vx, pr.vy) || 1;
      hitEnemy(e, pr.dmg * mulDmg, pr.vx / vl * 70, pr.vy / vl * 70);
      if (pr.type === 'g') { pr.life = 0; break; }
      pr.hit.push(e);
      if (--pr.pierce < 0) { pr.life = 0; break; }
    }
  }

  // баллы (опыт)
  const magR = 70 * (1 + 0.35 * (ps.magnet || 0));
  for (const gm of g.gems) {
    const dx = p.x - gm.x, dy = p.y - gm.y, d = Math.hypot(dx, dy) || 1;
    if (!gm.mg && d < magR) gm.mg = true;
    if (gm.mg) { const s = 320 + (magR - Math.min(d, magR)) * 2; gm.x += dx / d * s * dt; gm.y += dy / d * s * dt; }
    if (d < 16) { g.xp += gm.v; gm.dead = true; }
  }

  // эффекты
  for (const f of g.fx) f.t += dt;
  for (const f of g.ft) f.t += dt;

  // уборка
  compact(g.en, e => !e.dead);
  compact(g.pr, o => o.life > 0);
  compact(g.ep, o => o.life > 0);
  compact(g.gems, o => !o.dead);
  compact(g.fx, o => o.t < o.d);
  compact(g.ft, o => o.t < o.d);

  // повышение уровня
  if (g.xp >= g.need) {
    g.xp -= g.need; g.level++; g.need = needXp(g.level);
    openLevelUp();
  }
}

// ---------- конец игры ----------
function finish(win) {
  const g = G;
  g.over = true; g.win = win;
  save.best = Math.max(save.best, Math.floor(g.t));
  save.kills = Math.max(save.kills, g.kills);
  if (win) save.wins++;
  persist();
  joyReset();
  setState('over');
}

// ---------- отрисовка ----------
function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (!G) { ctx.clearRect(0, 0, W, H); return; }
  const g = G, p = g.p;
  const sx = g.shake ? (Math.random() - 0.5) * g.shake : 0, sy = g.shake ? (Math.random() - 0.5) * g.shake : 0;
  const cx = p.x + sx, cy = p.y + sy;
  const vw = W / SC / 2 + 60, vh = H / SC / 2 + 60;
  const x0 = cx - vw, x1 = cx + vw, y0 = cy - vh, y1 = cy + vh;

  ctx.save();
  ctx.translate(W / 2, H / 2); ctx.scale(SC, SC); ctx.translate(-cx, -cy);

  // пол за картой
  ctx.fillStyle = '#5a4636'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  // лист тетради
  const px0 = Math.max(0, x0), px1 = Math.min(MAP, x1), py0 = Math.max(0, y0), py1 = Math.min(MAP, y1);
  if (px1 > px0 && py1 > py0) {
    ctx.fillStyle = '#fbf8ee'; ctx.fillRect(px0, py0, px1 - px0, py1 - py0);
    ctx.strokeStyle = '#d7e6f5'; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = Math.ceil(px0 / 40) * 40; x <= px1; x += 40) { ctx.moveTo(x, py0); ctx.lineTo(x, py1); }
    for (let y = Math.ceil(py0 / 40) * 40; y <= py1; y += 40) { ctx.moveTo(px0, y); ctx.lineTo(px1, y); }
    ctx.stroke();
    // красное поле тетради
    if (px0 < 130) {
      ctx.strokeStyle = '#e8a8a8'; ctx.lineWidth = 2; ctx.beginPath();
      ctx.moveTo(110, py0); ctx.lineTo(110, py1); ctx.moveTo(116, py0); ctx.lineTo(116, py1); ctx.stroke();
    }
  }
  // надпись на полу
  ctx.fillStyle = 'rgba(43,58,143,0.06)'; ctx.font = 'bold 130px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('СЕССИЯ', MAP / 2, MAP / 2 - 260);
  // декор
  for (const d of g.decor) {
    if (d.k === 0) {
      if (d.x > x1 || d.x + d.w < x0 || d.y > y1 || d.y + d.h < y0) continue;
      ctx.fillStyle = '#d8b77a'; ctx.fillRect(d.x, d.y, d.w, d.h);
      ctx.strokeStyle = '#a07d45'; ctx.lineWidth = 3; ctx.strokeRect(d.x, d.y, d.w, d.h);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.strokeRect(d.x + 6, d.y + 6, d.w - 12, d.h - 12);
    } else {
      if (d.x + d.r < x0 || d.x - d.r > x1 || d.y + d.r < y0 || d.y - d.r > y1) continue;
      ctx.fillStyle = 'rgba(120,80,40,0.12)'; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.fill();
    }
  }
  // граница карты
  ctx.strokeStyle = '#2b3a8f'; ctx.lineWidth = 14; ctx.strokeRect(0, 0, MAP, MAP);

  // баллы
  for (const gm of g.gems) {
    if (gm.x < x0 || gm.x > x1 || gm.y < y0 || gm.y > y1) continue;
    if (gm.v > 1) drawSprK(SPR.gem, gm.x, gm.y, gm.v >= 10 ? 2 : 1.5);
    else drawSpr(SPR.gem, gm.x, gm.y);
  }
  // враги
  for (const e of g.en) {
    if (e.x < x0 || e.x > x1 || e.y < y0 || e.y > y1) continue;
    const T = e.T;
    if (T.elite) { // красная аура у элитных
      ctx.fillStyle = 'rgba(217,66,58,0.22)'; ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 8, 0, TAU); ctx.fill();
    }
    drawSpr(SPR[T.spr], e.x, e.y);
    if (e.fl > 0) { ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, TAU); ctx.fill(); }
    if (T.elite) { // полоска здоровья
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(e.x - 22, e.y - e.r - 14, 44, 5);
      ctx.fillStyle = '#d9423a'; ctx.fillRect(e.x - 22, e.y - e.r - 14, 44 * Math.max(0, e.hp / e.mh), 5);
    }
  }
  // задачи от лабораторных
  for (const b of g.ep) {
    if (b.x < x0 || b.x > x1 || b.y < y0 || b.y > y1) continue;
    if (b.q) { // оскорбление препода: белый пузырь с символом
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#5b3a9a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 2, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#5b3a9a'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(INS[b.ph].s, b.x, b.y + 1);
      continue;
    }
    ctx.fillStyle = '#d9423a'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill(); ctx.stroke();
  }
  // игрок
  ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 14, 13, 5, 0, 0, TAU); ctx.fill();
  const blink = p.inv > 0 && Math.floor(g.t * 20) % 2 === 0;
  if (blink) ctx.globalAlpha = 0.4;
  drawSpr(SPR.player, p.x, p.y);
  ctx.globalAlpha = 1;
  // полоска HP над игроком
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(p.x - 16, p.y + 22, 32, 4);
  ctx.fillStyle = '#d9423a'; ctx.fillRect(p.x - 16, p.y + 22, 32 * (p.hp / p.max), 4);

  // шпаргалки
  if (g.w.sheet) {
    const s = ST.sheet[g.w.sheet - 1];
    for (let i = 0; i < s.n; i++) {
      const a = g.orbA + i * TAU / s.n;
      drawSpr(SPR.sheet, p.x + Math.cos(a) * s.R, p.y + Math.sin(a) * s.R);
    }
  }
  // снаряды
  ctx.lineCap = 'round';
  for (const pr of g.pr) {
    if (pr.type === 'g') drawSpr(SPR.google, pr.x, pr.y);
    else {
      const l = Math.hypot(pr.vx, pr.vy) || 1;
      ctx.strokeStyle = '#1f3fbf'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(pr.x, pr.y); ctx.lineTo(pr.x - pr.vx / l * 16, pr.y - pr.vy / l * 16); ctx.stroke();
    }
  }
  // эффекты
  for (const f of g.fx) {
    const k = f.t / f.d;
    if (f.k === 'ring') {
      const r = f.max * (1 - (1 - k) * (1 - k));
      ctx.fillStyle = 'rgba(255,138,0,' + (0.15 * (1 - k)) + ')';
      ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,138,0,' + (1 - k) + ')'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, TAU); ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(90,90,90,' + (0.7 * (1 - k)) + ')'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(f.x, f.y, (4 + 12 * k) * (f.big || 1), 0, TAU); ctx.stroke();
    }
  }
  // облачко с фразой препода
  if (g.shout && !g.shout.e.dead) {
    const e = g.shout.e, a = Math.min(1, (g.shout.d - g.shout.t) / 0.4, g.shout.t / 0.15 + 0.2);
    ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const words = g.shout.text.split(' '), lines = []; let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (cur && ctx.measureText(t).width > 190) { lines.push(cur); cur = w; } else cur = t;
    }
    lines.push(cur);
    let bw = 0; for (const l of lines) bw = Math.max(bw, ctx.measureText(l).width);
    bw += 18;
    const bh = lines.length * 16 + 12, by = e.y - e.r - 20 - bh;
    const hx = W / SC / 2 - 6;                                  // облачко не вылезает за край экрана
    const bx = clamp(e.x - bw / 2, cx - hx, Math.max(cx - hx, cx + hx - bw));
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#5b3a9a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, bw, bh, 10) : ctx.rect(bx, by, bw, bh); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(e.x - 7, by + bh); ctx.lineTo(e.x, by + bh + 11); ctx.lineTo(e.x + 7, by + bh); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#5b3a9a';
    for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], bx + bw / 2, by + 6 + 8 + i * 16);
    ctx.globalAlpha = 1;
  }
  // всплывающие надписи над игроком: снизу вверх
  for (const f of g.ft) {
    const k = f.t / f.d;
    ctx.globalAlpha = k < 0.7 ? 1 : Math.max(0, 1 - (k - 0.7) / 0.3);
    ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const fy = p.y + 14 - 70 * k;
    ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.strokeStyle = f.line; ctx.strokeText(f.text, p.x, fy);
    ctx.fillStyle = f.fill; ctx.fillText(f.text, p.x, fy);
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  drawHud();
  if (joy.active) drawJoy();
}

function drawJoy() {
  ctx.fillStyle = 'rgba(43,58,143,0.12)'; ctx.strokeStyle = 'rgba(43,58,143,0.45)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(joy.ox, joy.oy, JR, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(43,58,143,0.5)';
  ctx.beginPath(); ctx.arc(joy.ox + joy.x * JR, joy.oy + joy.y * JR, 22, 0, TAU); ctx.fill();
}

function drawHud() {
  const g = G, p = g.p;
  // полоса опыта
  ctx.fillStyle = 'rgba(43,58,143,0.2)'; ctx.fillRect(0, SAFE, W, 8);
  ctx.fillStyle = '#3a7bd5'; ctx.fillRect(0, SAFE, W * Math.min(1, g.xp / g.need), 8);
  // HP
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(10, SAFE + 16, 130, 14);
  ctx.fillStyle = '#d9423a'; ctx.fillRect(10, SAFE + 16, 130 * (p.hp / p.max), 14);
  ctx.strokeStyle = '#2b3a8f'; ctx.lineWidth = 2; ctx.strokeRect(10, SAFE + 16, 130, 14);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(Math.ceil(p.hp) + ' / ' + p.max, 75, SAFE + 24);
  // текст
  ctx.fillStyle = '#1d2433'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('Ур. ' + g.level + '  ·  убито ' + g.kills, 10, SAFE + 44);
  // таймер
  ctx.textAlign = 'center'; ctx.font = 'bold 24px sans-serif'; ctx.fillStyle = '#2b3a8f';
  ctx.fillText(mmss(SESSION - g.t), W / 2, SAFE + 30);
  ctx.font = '11px sans-serif'; ctx.fillStyle = '#6a7596';
  ctx.fillText('до конца сессии', W / 2, SAFE + 48);
  // миникарта
  const s = 78, mx = 10, my = SAFE + 58, k = s / MAP;
  ctx.fillStyle = 'rgba(251,248,238,0.85)'; ctx.fillRect(mx, my, s, s);
  ctx.strokeStyle = '#2b3a8f'; ctx.lineWidth = 2; ctx.strokeRect(mx, my, s, s);
  ctx.fillStyle = '#d9423a';
  for (const e of g.en) if (!e.T.elite) ctx.fillRect(mx + e.x * k - 1, my + e.y * k - 1, 2, 2);
  ctx.fillStyle = '#7a0f0f';
  for (const e of g.en) if (e.T.elite) ctx.fillRect(mx + e.x * k - 2.5, my + e.y * k - 2.5, 5, 5);
  ctx.fillStyle = '#2b3a8f'; ctx.beginPath(); ctx.arc(mx + p.x * k, my + p.y * k, 3.5, 0, TAU); ctx.fill();
  // полоска здоровья босса
  if (g.boss && !g.boss.dead) {
    const bw = Math.min(240, W - 190), bx = W / 2 - bw / 2, by = SAFE + 56;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(bx, by, bw, 10);
    ctx.fillStyle = '#7a1f2b'; ctx.fillRect(bx, by, bw * Math.max(0, g.boss.hp / g.boss.mh), 10);
    ctx.strokeStyle = '#1b1210'; ctx.lineWidth = 2; ctx.strokeRect(bx, by, bw, 10);
    ctx.fillStyle = '#7a1f2b'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('ПРЕПОД', W / 2, by + 20);
  }
  // баннер появления элитных
  if (g.msg) {
    const a = Math.min(1, g.msg.t / 0.5);
    ctx.globalAlpha = a;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 22px sans-serif';
    const mt = (g.msg.icon || '⚠') + ' ' + g.msg.text;
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(251,248,238,0.95)'; ctx.strokeText(mt, W / 2, SAFE + 110);
    ctx.fillStyle = g.msg.icon ? '#2f7d3a' : '#c0392b'; ctx.fillText(mt, W / 2, SAFE + 110);
    ctx.globalAlpha = 1;
  }
}

// ---------- экраны ----------
function card(act, id, ic, name, tag, desc) {
  return '<button class="card" data-act="' + act + '" data-id="' + id + '"><span class="ic">' + ic +
    '</span><span><b>' + name + '</b>' + (tag ? '<small>' + tag + '</small>' : '') + '<em>' + desc + '</em></span></button>';
}
function isStandalone() {
  try { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
  catch (e) { return false; }
}
function screenMenu() {
  return '<div class="panel"><h1>СЕССИЯ</h1>' +
    '<p class="sub">Продержись до конца сессии. Отбивайся от курсовых, собирай зачёты, прокачивайся.</p>' +
    '<button class="btn" data-act="start">Начать</button>' +
    '<button class="btn alt" data-act="side">Круг управления: ' + (save.side === 'left' ? 'слева' : 'справа') + '</button>' +
    '<p class="hint">Рекорд: ' + mmss(save.best) + ' · макс. убито: ' + save.kills + ' · сдано сессий: ' + save.wins + '</p>' +
    '<p class="hint">Тяни палец по ' + (save.side === 'left' ? 'левой' : 'правой') + ' половине экрана, появится круг. Оружие бьёт само.</p>' +
    (isStandalone() ? '' : '<p class="hint">Совет: «Поделиться» → «На экран Домой», и это будет как приложение.</p>') +
    '</div><div class="ver">Build ' + BUILD + '</div>';
}
function screenPick() {
  let h = '<div class="panel"><h2>Выбери оружие</h2>';
  for (const id in WDEF) h += card('pick', id, WDEF[id].ic, WDEF[id].n, '', WDEF[id].d[0]);
  return h + '<button class="btn alt" data-act="menu">Назад</button></div>';
}
function screenLevel() {
  let h = '<div class="panel"><h2>Новый уровень: ' + G.level + '</h2>';
  for (const o of G.opts) {
    if (o.k === 'w') h += card('up', o.k + ':' + o.id, WDEF[o.id].ic, WDEF[o.id].n, o.l === 1 ? 'НОВОЕ' : 'уровень ' + o.l, WDEF[o.id].d[o.l - 1]);
    else if (o.k === 'p') h += card('up', o.k + ':' + o.id, PDEF[o.id].ic, PDEF[o.id].n, o.l === 1 ? 'НОВОЕ' : 'уровень ' + o.l, PDEF[o.id].d);
    else h += card('up', 'h:heal', '🍜', 'Обед', '', 'Восстановить 30 HP');
  }
  return h + '</div>';
}
function screenPause() {
  return '<div class="panel"><h2>Пауза</h2><button class="btn" data-act="resume">Продолжить</button>' +
    '<button class="btn alt" data-act="menu">В меню</button></div>';
}
function screenOver() {
  const g = G;
  return '<div class="panel"><h1>' + (g.win ? 'Сессия сдана! 🎓' : 'Улетел на пересдачу 😵') + '</h1>' +
    '<p class="sub">Продержался ' + mmss(g.t) + ' · убито ' + g.kills + ' · уровень ' + g.level + '</p>' +
    '<button class="btn" data-act="start">Ещё раз</button>' +
    '<button class="btn alt" data-act="menu">В меню</button>' +
    '<p class="hint">Рекорд: ' + mmss(save.best) + '</p></div>';
}

function screenQuiz() {
  const q = G.quiz;
  let h = '<div class="panel"><div class="who">👩‍🏫 Препод</div><p class="phrase">«' + esc(INS[q.ph].t) + '»</p>' +
    '<div class="qprob' + (q.hard ? ' glitch' : '') + '">' + esc(q.text) + ' = ?</div>' +
    '<p class="hint" style="margin:0 0 10px">Выбери правильный ответ</p><div class="qgrid">';
  for (let i = 0; i < q.opts.length; i++) h += '<button class="qbtn" data-act="ans" data-id="' + i + '">' + q.opts[i] + '</button>';
  return h + '</div></div>';
}

function setState(s) {
  state = s;
  if (s !== 'play') joyReset();
  pauseBtn.style.display = s === 'play' ? 'block' : 'none';
  if (s === 'play') { ui.className = ''; ui.innerHTML = ''; return; }
  const view = { menu: screenMenu, pick: screenPick, levelup: screenLevel, quiz: screenQuiz, pause: screenPause, over: screenOver }[s];
  ui.innerHTML = view();
  ui.className = 'show';
}

function pauseGame() { if (state === 'play') setState('pause'); }

// ---------- прокачка ----------
function openLevelUp() {
  const g = G, opts = [];
  const wc = Object.keys(g.w).length, pc = Object.keys(g.ps).length;
  for (const id in WDEF) {
    const l = g.w[id] || 0;
    if (l === 0 && wc < 4) opts.push({ k: 'w', id, l: 1 });
    else if (l > 0 && l < 5) opts.push({ k: 'w', id, l: l + 1 });
  }
  for (const id in PDEF) {
    const l = g.ps[id] || 0;
    if (l === 0 && pc < 4) opts.push({ k: 'p', id, l: 1 });
    else if (l > 0 && l < 5) opts.push({ k: 'p', id, l: l + 1 });
  }
  shuffle(opts);
  g.opts = opts.slice(0, 3);
  if (!g.opts.length) g.opts = [{ k: 'h', id: 'heal', l: 0 }];
  setState('levelup');
}
function applyOption(key) {
  const g = G, p = g.p, parts = key.split(':'), k = parts[0], id = parts[1];
  const o = g.opts.find(x => x.k === k && x.id === id);
  if (!o) return;
  if (k === 'w') { if (!g.w[id]) g.wt[id] = 0.4; g.w[id] = o.l; }
  else if (k === 'p') {
    g.ps[id] = o.l;
    if (id === 'hp') { p.max += 20; p.hp = Math.min(p.max, p.hp + 20); }
  } else p.hp = Math.min(p.max, p.hp + 30);
  g.opts = null;
  setState('play');
}

ui.addEventListener('click', e => {
  const b = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
  if (!b) return;
  const act = b.dataset.act, id = b.dataset.id;
  if (act === 'start') setState('pick');
  else if (act === 'pick') { newGame(id); setState('play'); }
  else if (act === 'up') applyOption(id);
  else if (act === 'ans') answerQuiz(+id);
  else if (act === 'resume') setState('play');
  else if (act === 'menu') { G = null; setState('menu'); }
  else if (act === 'side') { save.side = save.side === 'left' ? 'right' : 'left'; persist(); setState('menu'); }
});
pauseBtn.addEventListener('click', pauseGame);
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);

// ---------- цикл ----------
let last = 0;
function frame(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000 || 0);
  last = ts;
  if (state === 'play') update(dt);
  render();
  requestAnimationFrame(frame);
}

resize();
makeSprites();
setState('menu');
requestAnimationFrame(frame);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}

if (location.hash === '#debug') window.__dbg = { newGame, update, render, setState, applyOption, finish, get G() { return G; }, get state() { return state; } };
})();
