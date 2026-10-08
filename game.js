(() => {
'use strict';

// ---------- настройки ----------
const MAP = 2400;          // размер карты (px)
const BOSS_EVERY = 300;    // босс приходит каждые 5 минут
const BOSS_K = 1.7;        // урон боссов относительно обычных
const BOSS_HPK = 3.5;      // HP боссов относительно обычных (+25% за каждого убитого босса)
const hyp = (a, b) => Math.sqrt(a * a + b * b);   // Math.hypot заметно медленнее
// бесконечный режим: все монстры (и боссы) растут вместе с уровнем игрока
function hpK() { const g = G; return g && g.endless ? 1.25 + 0.05 * (g.level - g.eLv) : 1; }
function dmK() { const g = G; return g && g.endless ? 1.15 + 0.03 * (g.level - g.eLv) : 1; }
const CS = 80;             // размер ячейки сетки для столкновений
const GN = Math.ceil(MAP / CS);
const MAXE = 350;          // максимум врагов одновременно
const TAU = Math.PI * 2;
const EF = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const KEY = 'sessiya_v1';
const BUILD = '0.5b01';
const INS_SPD = 200;       // скорость оскорблений препода
const INS_TURN = 0.6;      // как быстро они доворачивают к игроку (рад/с)
const INS_TURN_MAX = 1.0;  // и на сколько всего могут довернуть (рад, около 57°), чтобы только чуть скашивались

const cv = document.getElementById('c');
const ctx = cv.getContext('2d', { alpha: false });
const ui = document.getElementById('ui');
const pauseBtn = document.getElementById('pause');
const cheatBtn = document.getElementById('cheat');

let W = 0, H = 0, DPR = 1, SC = 1, SAFE = 0;

// ---------- сохранение ----------
const DEF_SAVE = { best: 0, kills: 0, side: 'left', wins: 0, lvl: 0, bosses: 0 };
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
  DPR = Math.min(window.devicePixelRatio || 1, 1.5);   // меньше пикселей -> быстрее на телефонах
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
// геометрические фигуры «цвета призмы» для атак Мастера проектов
function shapeSprite(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  try {
    const gr = g.createLinearGradient(0, 0, 64, 64);
    ['#ff4d6d', '#ffb703', '#70e000', '#00b4d8', '#7b2cbf'].forEach((col, i) => gr.addColorStop(i / 4, col));
    g.fillStyle = gr;
    if (kind === 'tri') {
      g.beginPath(); g.moveTo(58, 32); g.lineTo(8, 6); g.lineTo(8, 58); g.closePath(); g.fill();
      g.lineWidth = 4; g.strokeStyle = '#24113f'; g.stroke();
    } else {
      g.beginPath(); g.arc(28, 32, 24, 0, Math.PI * 2); g.fill();
      g.globalCompositeOperation = 'destination-out';
      g.beginPath(); g.arc(42, 32, 20, 0, Math.PI * 2); g.fill();
    }
  } catch (e) {}
  return { c, w: 36, h: 36 };
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
    teacher: emojiSprite('👩‍🏫', 72),
    boy: emojiSprite('👦', 38),
    girl: emojiSprite('👧', 38),
    medal: emojiSprite('🏅', 24),
    phone: emojiSprite('📱', 22),
    i_shield: emojiSprite('🌯', 28),
    i_cig: emojiSprite('🚬', 26),
    i_clock: emojiSprite('⏰', 28),
    mk: emojiSprite('😊', 76),
    ma: emojiSprite('😠', 76),
    bakery: emojiSprite('🏭', 96),
    bread: emojiSprite('🍞', 22),
    tri: shapeSprite('tri'),
    cres: shapeSprite('cres')
  };
  loadImgSprite('boss.png', 76, 'teacher');
  loadImgSprite('boss_kind.png', 76, 'mk');
  loadImgSprite('boss_angry.png', 76, 'ma');
  loadImgSprite('bakery.png', 96, 'bakery');
  loadImgSprite('bread.png', 22, 'bread');
}
// круглые снаряды рисуются готовыми спрайтами (кэш по цвету), а не тремя вызовами path на каждый
const bulCache = new Map();
function bulSpr(col, r) {
  const key = col + r;
  let s = bulCache.get(key);
  if (!s) {
    const sz = Math.ceil((r + 2) * 2 * 2), c = document.createElement('canvas');
    c.width = c.height = sz;
    const g = c.getContext('2d');
    g.fillStyle = col; g.strokeStyle = '#fff'; g.lineWidth = 4;
    g.beginPath(); g.arc(sz / 2, sz / 2, r * 2, 0, TAU); g.fill(); g.stroke();
    s = { c, w: sz / 2, h: sz / 2 };
    if (bulCache.size > 400) bulCache.clear();
    bulCache.set(key, s);
  }
  return s;
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
  pen:    { n: 'Ручка',     ic: '🖊️', d: ['Пробивающий выстрел по ходу движения', 'Две ручки', 'Быстрее и сильнее', 'Три ручки', 'Четыре ручки, пробивают больше'] },
  lip:    { n: 'Помада',    ic: '💄', d: ['Оставляет за тобой красный след, он жжёт врагов', 'След шире', 'Сильнее и держится дольше', 'Ещё шире', 'Алая дорожка, максимум'] },
  medal:  { n: 'Медаль',    ic: '🏅', d: ['Отлетает в случайную сторону и взрывается', 'Взрыв сильнее', 'Две медали сразу', 'Шире и мощнее взрыв', 'Три медали сразу'] },
  phone:  { n: 'Телефон',   ic: '📱', d: ['Щит в ту сторону, куда смотришь. Не бьёт, только защищает', 'Щит шире', 'Ещё шире', 'Шире и шире', 'Огромный щит'] }
};
// классы: стартовое оружие и особенность; характеристики растут с уровнем
const CLS = {
  boy:  { n: 'Мальчик', ic: '👦', spr: 'boy',  w: 'pen', hp: 130, spd: 1,    hpL: 8, spL: 0.004, d: 'Старт: Ручка. Больше HP, с уровнем растёт ещё' },
  girl: { n: 'Девочка', ic: '👧', spr: 'girl', w: 'lip', hp: 100, spd: 1.15, hpL: 3, spL: 0.015, d: 'Старт: Помада. Быстрее, с уровнем ещё быстрее' }
};
const PICK = {
  cig:   { n: 'Сигарета', max: 5, w: 5 },
  shield:{ n: 'Щит',      max: 2, w: 2 },
  clock: { n: 'Часы',     max: 2, w: 2 }
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
  ],
  lip: [
    { dmg: 4,  r: 13, life: 1.2 }, { dmg: 5,  r: 15, life: 1.4 }, { dmg: 7,  r: 15, life: 1.6 },
    { dmg: 8,  r: 18, life: 1.8 }, { dmg: 10, r: 21, life: 2.0 }
  ],
  medal: [
    { cd: 2.6, n: 1, rad: 70,  dmg: 24 }, { cd: 2.4, n: 1, rad: 80,  dmg: 32 }, { cd: 2.2, n: 2, rad: 80,  dmg: 32 },
    { cd: 2.0, n: 2, rad: 95,  dmg: 42 }, { cd: 1.8, n: 3, rad: 105, dmg: 50 }
  ],
  phone: [
    { arc: 0.8 }, { arc: 0.95 }, { arc: 1.1 }, { arc: 1.25 }, { arc: 1.4 }
  ]
};
const SR = 36; // радиус щита-телефона
const needXp = l => 4 + l * 3;
const ENDP = { dmg: 1, speed: 1, cd: 1 };   // в бесконечном режиме растут только урон, скорость и перезарядка
function stl(id) { return ST[id][Math.min(5, G.w[id]) - 1]; }
function wx(id) { return 1 + 0.15 * Math.max(0, (G.w[id] || 0) - 5); }
function cx(id) { return Math.max(0.35, 1 - 0.05 * Math.max(0, (G.w[id] || 0) - 5)); }

// ---------- типы врагов ----------
// hp: множитель здоровья, spd: множитель скорости, dmg: множитель урона при касании,
// xp: сколько баллов падает, kb: насколько сильно отбрасывает
const ET = {
  c: { name: 'Курсовая',        spr: 'enemy', r: 13, hp: 1,    spd: 1,    dmg: 1,   xp: 1,  kb: 1 },
  r: { name: 'Реферат',         spr: 'ref',   r: 10, hp: 0.45, spd: 1.55, dmg: 0.6, xp: 1,  kb: 1.3 },
  l: { name: 'Лабораторная',    spr: 'lab',   r: 13, hp: 1.2,  spd: 0.7,  dmg: 1,   xp: 2,  kb: 1, ranged: true, keep: 240 },
  a: { name: 'Автомат отменён', spr: 'boss',  r: 21, hp: 8,    spd: 0.8,  dmg: 2,   xp: 14, kb: 0.25, elite: true },
  b: { name: 'Препод',          short: 'ПРЕПОД', spr: 'teacher', r: 34, hp: 25,  spd: 0.75, dmg: 1.5, xp: 0,  kb: 0.05, elite: true, boss: true, keep: 230 },
  m: { name: 'Мастер проектов', short: 'МАСТЕР', spr: 'mk',      r: 34, hp: 30,  spd: 0.85, dmg: 1.5, xp: 0,  kb: 0.05, elite: true, boss: true, mboss: true },
  f: { name: 'Хлебозавод',      spr: 'bakery',  r: 38, hp: 14,  spd: 0,    dmg: 0,   xp: 6,  kb: 0,    elite: true, fac: true }
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
// элитные «автоматы» приходят каждые 5 уровней
const MAXLAB = 10;         // максимум стрелков одновременно

// ---------- ввод ----------
const joy = { active: false, id: -1, ox: 0, oy: 0, px: 0, py: 0, x: 0, y: 0 };
const JR = 55; // радиус круга управления
const kd = { l: false, r: false, u: false, d: false };

function joyReset() { joy.active = false; joy.id = -1; joy.x = 0; joy.y = 0; }

cv.addEventListener('pointerdown', e => {
  if (state !== 'play' || joy.active) return;
  joy.active = true; joy.id = e.pointerId;
  joy.ox = joy.px = e.clientX; joy.oy = joy.py = e.clientY;
  joy.x = joy.y = 0;
  try { cv.setPointerCapture(e.pointerId); } catch (_) {}
  e.preventDefault();
});
cv.addEventListener('pointermove', e => {
  if (!joy.active || e.pointerId !== joy.id) return;
  let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy;
  const len = hyp(dx, dy);
  if (len > JR) { // круг "плывёт" за пальцем
    joy.ox += dx / len * (len - JR); joy.oy += dy / len * (len - JR);
    dx = e.clientX - joy.ox; dy = e.clientY - joy.oy;
  }
  joy.px = e.clientX; joy.py = e.clientY;
  const l = hyp(dx, dy) / JR;
  if (l < 0.12) { joy.x = 0; joy.y = 0; }
  else { const k = Math.min(1, l) / hyp(dx, dy); joy.x = dx * k; joy.y = dy * k; }
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
  const ok = (x, y) => hyp(x - MAP / 2, y - MAP / 2) > 160;
  for (let i = 0; i < 46; i++) {
    let x, y; do { x = rnd(150, MAP - 250); y = rnd(100, MAP - 150); } while (!ok(x, y));
    d.push({ k: 0, x, y, w: 96, h: 54 });
  }
  for (let i = 0; i < 34; i++) d.push({ k: 1, x: rnd(60, MAP - 60), y: rnd(60, MAP - 60), r: rnd(14, 40) });
  return d;
}

function newGame(cls) {
  const C = CLS[cls] || CLS.boy;
  G = {
    t: 0, kills: 0, level: 1, xp: 0, need: needXp(1), cls: cls in CLS ? cls : 'boy',
    bossT: BOSS_EVERY, nBoss: 0, hz: [], bread: [], mb: null, facLeft: 0, pslow: 0, endless: false, eLv: 0, slow: 0, shield: 0, items: [], pickedAt: [], itemT: 6, lip: [], md: [], lipX: 0, lipY: 0,
    p: { x: MAP / 2, y: MAP / 2, hp: C.hp, max: C.hp, inv: 0, fx: 0, fy: 1, r: 12 },
    w: {}, ps: {}, wt: {},
    en: [], gems: [], pr: [], fx: [], ep: [],
    spawn: 0.5, swarm: 20, nextElite: 5, nLab: 0, msg: null,
    qHits: 0, boost: 0, ft: [], shout: null, quiz: null, boss: null,
    orbA: 0, shake: 0, over: false, win: false,
    decor: makeDecor(),
    grid: Array.from({ length: GN * GN }, () => [])
  };
  G.w[C.w] = 1; G.wt[C.w] = 0.4;
  G.lipX = G.p.x; G.lipY = G.p.y;
  for (let i = 0; i < 5; i++) spawnEnemy();
  for (const k of ['cig', 'cig', 'cig', 'shield', 'clock']) spawnItem(k);
  joyReset();
}

// ---------- враги ----------
const sp = { x: 0, y: 0 };
function spawnPos() {
  const p = G.p;
  const R = hyp(W, H) / 2 / SC + 50;
  for (let tries = 0; tries < 8; tries++) {
    const a = Math.random() * TAU, r = R + Math.random() * 40;
    const x = clamp(p.x + Math.cos(a) * r, 20, MAP - 20);
    const y = clamp(p.y + Math.sin(a) * r, 20, MAP - 20);
    sp.x = x; sp.y = y;
    if (hyp(x - p.x, y - p.y) > R * 0.85) return;
  }
}
function addEnemy(type, x, y) {
  const T = ET[type];
  const hp = (10 + (G.level - 1) * 3) * T.hp * hpK() * (T.boss ? BOSS_HPK * (1 + 0.25 * (G.nBoss || 0)) : 1);
  G.en.push({ type, T, r: T.r, x, y, hp, mh: hp, kx: 0, ky: 0, ob: 0, fl: 0, sh: 1 + Math.random() * 2, dead: false });
}
function spawnEnemy(type) {
  spawnPos();
  addEnemy(type || 'c', sp.x, sp.y);
}
// обычный спавн: курсовые, а со второй минуты ещё и лабораторные
function pickType() {
  const L = G.level;
  if (L >= 4 && G.nLab < MAXLAB && Math.random() < Math.min(0.2, 0.06 + (L - 4) * 0.012)) return 'l';
  return 'c';
}
// рой рефератов: стая налетает с одной стороны
function spawnSwarm() {
  const n = Math.min(18, 5 + G.level);
  spawnPos();
  const bx = sp.x, by = sp.y;
  for (let i = 0; i < n && G.en.length < MAXE; i++) {
    addEnemy('r', clamp(bx + rnd(-45, 45), 20, MAP - 20), clamp(by + rnd(-45, 45), 20, MAP - 20));
  }
}
function hurtPlayer(n) {
  const g = G, p = g.p;
  if (g.shield > 0) { // щит-предмет гасит удар
    g.shield--; p.inv = 0.6; g.shake = 3;
    addFx({ k: 'ring', x: p.x, y: p.y, max: 40, t: 0, d: 0.3, col: '58,123,213' });
    return false;
  }
  p.hp -= n; p.inv = 0.7; g.shake = 6;
  try { if (navigator.vibrate) navigator.vibrate(25); } catch (_) {}
  if (p.hp <= 0) { p.hp = 0; finish(false); return true; }
  return false;
}

// ---------- предметы на карте ----------
function spawnItem(k) {
  // из нескольких случайных точек берём ту, что дальше всего от других предметов и от недавних мест подбора
  const p = G.p;
  let bx = MAP / 2, by = MAP / 2, bd = -1;
  for (let i = 0; i < 12; i++) {
    const x = rnd(90, MAP - 90), y = rnd(90, MAP - 90);
    if (hyp(x - p.x, y - p.y) < 180) continue;
    let md = 1e9;
    for (const it of G.items) md = Math.min(md, hyp(x - it.x, y - it.y));
    for (const o of G.pickedAt) md = Math.min(md, hyp(x - o.x, y - o.y));
    if (md > bd) { bd = md; bx = x; by = y; }
  }
  G.items.push({ k, x: bx, y: by, ph: Math.random() * TAU });
}
function itemCount(k) { let n = 0; for (const it of G.items) if (it.k === k) n++; return n; }
function pickItem(it) {
  const g = G, p = g.p;
  g.pickedAt.push({ x: it.x, y: it.y }); if (g.pickedAt.length > 4) g.pickedAt.shift();
  if (it.k === 'cig') {
    p.hp = Math.min(p.max, p.hp + 15);
    g.ft.push({ text: '+15 HP', fill: '#2f9e44', line: 'rgba(255,255,255,0.95)', t: 0, d: 1.2 });
  } else if (it.k === 'shield') {
    g.shield = 3;
    g.ft.push({ text: 'Щит ×3', fill: '#2b6bd0', line: 'rgba(255,255,255,0.95)', t: 0, d: 1.4 });
  } else {
    g.slow = 6;
    g.ft.push({ text: 'Время замедлилось!', fill: '#7a4bd0', line: 'rgba(255,255,255,0.95)', t: 0, d: 1.6 });
  }
}

// ---------- боссы: появление ----------
function spawnBoss(kind) {
  const g = G, p = g.p;
  spawnPos(); addEnemy(kind, sp.x, sp.y);
  const b = g.en[g.en.length - 1];
  b.hp = b.mh = b.hp * (1 + 0.5 * g.nBoss);
  g.boss = b; g.qHits = 0; g.volley = 0; g.bossT = BOSS_EVERY;
  if (kind === 'm') {
    g.mb = { ph: 1, shA: 1, base: b.r, hole: 0, dmgK: 1, eaten: 0, fed: 0, baked: 0, stopHp: 0, atkT: 3, atkI: 0, pend: null, suck2: false, t: 0 };
    // по заводу у каждого края карты, на дальней от игрока половине стороны
    const M = 160, fy = p.y < MAP / 2 ? MAP * 0.78 : MAP * 0.22, fx = p.x < MAP / 2 ? MAP * 0.78 : MAP * 0.22;
    for (const q of [[M, fy], [MAP - M, fy], [fx, M], [fx, MAP - M]]) { addEnemy('f', q[0], q[1]); g.facLeft++; }
    g.msg = { text: 'Мастер проектов! Разрушь заводы', t: 3.5 };
  } else g.msg = { text: 'Препод принимает зачёт!', t: 3 };
}
function clearBossStuff() {
  const g = G;
  g.hz.length = 0; g.bread.length = 0; g.mb = null; g.facLeft = 0;
  for (const o of g.en) if (o.T.fac) o.dead = true;
  for (const b of g.ep) if (b.q || b.c) b.life = 0;
}
function bossShout(e, text, d) { G.shout = { text, e, t: 0, d: d || 3 }; }

// ---------- босс «Мастер проектов» ----------
const HOLE_R = 190;          // радиус чёрной воронки
const BAKE_EVERY = 3.2;      // как часто завод печёт хлеб
const BREAD_MAX = 150;       // максимум буханок на карте (старые исчезают первыми)
const ATK_TXT = ['Условно офисы', 'Условно коммутатор', 'Условно проводка'];
function prismColor(t) { return 'hsl(' + Math.floor((t * 160) % 360) + ',90%,60%)'; }
function mbossUpdate(e, dt, dtE, L) {
  const g = G, mb = g.mb;
  if (mb.ph === 1) {
    // хлеб от заводов медленно едет к боссу; съеденный раздувает его
    for (const b of g.bread) {
      const dx = e.x - b.x, dy = e.y - b.y, d = hyp(dx, dy) || 1;
      if (d < e.r + 4) { b.dead = true; e.r = Math.min(mb.base * 2.1, e.r + 0.8); mb.fed++; e.mh += 3; e.hp += 3; }
      else { b.x += dx / d * 42 * dtE; b.y += dy / d * 42 * dtE; }
    }
    compact(g.bread, o => !o.dead);
    if (g.facLeft <= 0) {
      mb.ph = 2; mb.t = 0; mb.stopHp = e.hp - 0.2 * e.mh;
      mb.inhale = true;   // весь оставшийся хлеб засасывается в босса
      bossShout(e, 'ГДЕ МОЙ ХЛЕЕЕБ?!?!', 3);
    }
  } else if (mb.ph === 2 || mb.ph === 4) {
    mb.t += dt;
    if (mb.inhale) {
      for (const b of g.bread) {
        const dx = e.x - b.x, dy = e.y - b.y, d = hyp(dx, dy) || 1;
        if (d < e.r + 8) { b.dead = true; mb.fed++; mb.dmgK = Math.min(3, mb.dmgK + 0.01); e.mh += 3; e.hp += 3; e.r = Math.min(mb.base * 2.1, e.r + 0.8); }
        else { const v = 420 * dtE; b.x += dx / d * v; b.y += dy / d * v; }
      }
      compact(g.bread, o => !o.dead);
      if (!g.bread.length) mb.inhale = false;
    }
    if (mb.ph === 2) mb.shA = Math.max(0, mb.shA - dt / 1.5);       // щит сползает
    e.r += (mb.base - e.r) * Math.min(1, dt * 1.3);                   // размер возвращается
    mb.hole = Math.min(1, mb.hole + dt / 1.5);
    if (e.hp <= mb.stopHp) {
      mb.ph = 3; mb.atkT = 3.5; mb.pend = null;
      bossShout(e, 'Я ВЫЗОВУ ТВОИХ РОДИТЕЛЕЙ!', 3);
    }
    // воронка затягивает врагов: каждый даёт боссу +1 HP и немного урона
    if (mb.hole > 0.4) {
      for (const o of g.en) {
        if (o.dead || o === e || o.T.boss || o.T.fac) continue;
        const dx = e.x - o.x, dy = e.y - o.y, d = hyp(dx, dy) || 1;
        if (d > HOLE_R) continue;
        if (d < e.r + 10) {
          o.dead = true; mb.eaten++;
          mb.dmgK = Math.min(3, mb.dmgK + 0.015);
          e.hp = Math.min(e.mh, e.hp + 1);
          addFx({ k: 'pop', x: o.x, y: o.y, t: 0, d: 0.25, big: 1 });
        } else {
          const pull = 150 * dtE * (1 + (HOLE_R - d) / HOLE_R);
          o.x += dx / d * pull; o.y += dy / d * pull;
        }
      }
    }
    { // воронка тянет и игрока: убежать можно, но медленнее
      const pdx = e.x - g.p.x, pdy = e.y - g.p.y, pd = hyp(pdx, pdy) || 1;
      if (mb.hole > 0.4 && pd < HOLE_R && pd > e.r + 6) {
        const pl = 70 * (1 + (HOLE_R - pd) / HOLE_R) * dtE * mb.hole;
        g.p.x = clamp(g.p.x + pdx / pd * pl, g.p.r, MAP - g.p.r); g.p.y = clamp(g.p.y + pdy / pd * pl, g.p.r, MAP - g.p.r);
      }
    }
  } else { // фаза 3: фигуры
    mb.hole = Math.max(0, mb.hole - dt);
    if (mb.pend2) { mb.pend2.t -= dtE; if (mb.pend2.t <= 0) { launchAttack(e, mb.pend2.i); mb.pend2 = null; } }
    if (e.hp < 0.5 * e.mh && !mb.suck2 && !mb.pend) {
      mb.suck2 = true; mb.ph = 4; mb.t = 0; mb.stopHp = e.hp - 0.2 * e.mh;
      bossShout(e, 'ГДЕ МОЙ ХЛЕЕЕБ?!?!', 3);
    } else if (mb.pend) {
      mb.pend.t -= dtE;
      if (mb.pend.t <= 0) { const pi = mb.pend.i; launchAttack(e, pi); mb.pend = null; if (mb.suck2) mb.pend2 = { i: (pi + 1 + (Math.random() < 0.5 ? 0 : 1)) % 3, t: 1.0 }; } // ниже половины HP атаки идут парами
    } else {
      mb.atkT -= dtE;
      if (mb.atkT <= 0) {
        const i = mb.atkI++ % 3;
        mb.pend = { i, t: 0.9 }; mb.atkT = 3.2; e.cast = rnd(1, 2);
        bossShout(e, ATK_TXT[i], 2.2);
      }
    }
  }
}
function launchAttack(e, i) {
  const g = G, p = g.p;
  const a = Math.atan2(p.y - e.y, p.x - e.x);
  g.shake = Math.max(g.shake, 6);
  if (i === 0) { // три треугольника веером, у каждого пять кружащихся кругов, которые потом взрываются дождём мелких
    for (const da of [-0.5, 0, 0.5]) {
      const b = a + da;
      g.hz.push({ k: 'tri', x: e.x, y: e.y, a: b, vx: Math.cos(b) * 200, vy: Math.sin(b) * 200, t: 0, life: 1.7, ob: Math.random() * TAU, no: 5, orR: 34, nd: 8 });
    }
  } else if (i === 1) { // два лазерных квадрата подряд; в каждом брешь, во втором с другой стороны от игрока
    const dx = p.x - e.x, dy = p.y - e.y;
    const side = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : 2) : (dy > 0 ? 1 : 3);
    const coord = side % 2 === 0 ? dy : dx, sg = Math.random() < 0.5 ? -1 : 1;
    g.hz.push({ k: 'sq', x: e.x, y: e.y, h: e.r + 8, hmax: 620, side, gc: coord + sg * 90, gap: 75, t: 0, delay: 0 });
    g.hz.push({ k: 'sq', x: e.x, y: e.y, h: e.r + 8, hmax: 620, side, gc: coord - sg * 90, gap: 85, t: 0, delay: 1.0 });
  } else { // три пары полумесяцев веером, лазер между ними, расходятся широко
    for (const da of [-0.6, 0, 0.6]) {
      g.hz.push({ k: 'cres', x0: e.x, y0: e.y, a: a + da, t: 0, life: 4.8, tick: 0, A: { x: e.x, y: e.y }, B: { x: e.x, y: e.y } });
    }
  }
}

// ---------- босс-препод: оскорбления и викторина ----------
function fireInsults(e) {
  const g = G;
  const k = Math.floor(Math.random() * INS.length);
  g.shout = { text: INS[k].t, e, t: 0, d: 3 };
  g.volley = (g.volley || 0) + 1;
  const n = 12 + Math.min(6, Math.floor(g.volley / 2));
  // кольцо ориентировано так, чтобы один луч смотрел примерно на игрока, остальные расходятся в стороны
  const base = Math.atan2(g.p.y - e.y, g.p.x - e.x) + rnd(-0.25, 0.25);
  const rings = e.hp < 0.5 * e.mh ? 2 : 1;      // ниже половины HP кольца идут парами
  for (let rr = 0; rr < rings; rr++) for (let i = 0; i < n && g.ep.length < 240; i++) {
    const a = base + i * TAU / n + rr * TAU / n / 2, sp2 = INS_SPD * (rr ? 0.8 : 1);
    g.ep.push({ q: true, ph: k, x: e.x, y: e.y, vx: Math.cos(a) * sp2, vy: Math.sin(a) * sp2, life: 9, r: 13, turn: 0 });
  }
  g.shake = Math.max(g.shake, 5);
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
    if (hurtPlayer(Math.round(15 * BOSS_K * dmK()))) return;
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
function separate(k) {
  const grid = G.grid, p = G.p;
  const vx = W / SC / 2 + 140, vy = H / SC / 2 + 140;   // за пределами экрана враги не расталкиваются
  for (const e of G.en) {
    if (e.dead || e.T.fac) continue;
    if (e.x < p.x - vx || e.x > p.x + vx || e.y < p.y - vy || e.y > p.y + vy) continue;
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
          const d = Math.sqrt(d2), push = (MIN - d) * k;
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
  if (e.T.mboss && G.mb && G.mb.ph === 1) { e.hp = Math.max(1, e.hp - 1); e.fl = 0.08; return; } // пока заводы живы: максимум 1 HP
  e.hp -= dmg; e.fl = 0.08;
  const kb = e.T.kb;
  e.kx = clamp(e.kx + kx * kb, -320, 320); e.ky = clamp(e.ky + ky * kb, -320, 320);
  if (e.hp <= 0) killEnemy(e);
}
function killEnemy(e) {
  e.dead = true; G.kills++;
  if (e.T.fac) G.facLeft--;
  if (e.T.boss) { // препод побеждён: куча баллов, оскорбления исчезают
    if (e.T.mboss && !G.endless) G.pendBoss = true;
    G.boss = null; G.nBoss++; G.bossT = BOSS_EVERY; G.bosses = (G.bosses || 0) + 1;
    G.msg = { text: e.T.mboss ? 'Мастер проектов побеждён!' : 'Препод побеждён!', t: 3, icon: '🎓' };
    if (e.T.mboss) clearBossStuff();
    for (let i = 0; i < (e.T.mboss ? 12 : 8); i++) G.gems.push({ x: e.x + rnd(-40, 40), y: e.y + rnd(-40, 40), v: 6, mg: false, dead: false });
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
  if (g.pendBoss) { g.pendBoss = false; setState('bossend'); return; }
  g.t += dt;
  const L = g.level - 1;                       // сложность считается по уровню, а не по времени
  g.slow = Math.max(0, g.slow - dt);
  g.pslow = Math.max(0, g.pslow - dt);
  const sk = g.slow > 0 ? 0.4 : 1;             // «Часы»: враги и их снаряды медленнее
  const dtE = dt * sk;

  // движение игрока
  let ix = joy.x, iy = joy.y;
  if (kd.l || kd.r || kd.u || kd.d) {
    ix = (kd.r ? 1 : 0) - (kd.l ? 1 : 0); iy = (kd.d ? 1 : 0) - (kd.u ? 1 : 0);
    const l = hyp(ix, iy); if (l > 1) { ix /= l; iy /= l; }
  }
  g.boost = Math.max(0, g.boost - dt);
  const CL = CLS[g.cls];
  const pspd = 150 * CL.spd * (1 + CL.spL * L) * (1 + 0.1 * (ps.speed || 0)) * (g.boost > 0 ? 1.5 : 1) * (g.pslow > 0 ? 0.45 : 1);
  const pBase = pspd / (g.pslow > 0 ? 0.45 : 1);   // скорость игрока без замедления воронкой: от неё считается скорость боссов
  p.x = clamp(p.x + ix * pspd * dt, p.r, MAP - p.r);
  p.y = clamp(p.y + iy * pspd * dt, p.r, MAP - p.r);
  const ml = hyp(ix, iy);
  if (ml > 0.05) { p.fx = ix / ml; p.fy = iy / ml; }
  p.inv = Math.max(0, p.inv - dt);
  g.shake = Math.max(0, g.shake - 40 * dt);

  const mulDmg = (1 + 0.12 * (ps.dmg || 0)) * (1 + 0.015 * L);
  const mulCd = Math.max(g.endless ? 0.2 : 0.4, 1 - 0.08 * (ps.cd || 0));

  // спавн врагов
  g.spawn -= dt;
  if (g.spawn <= 0) {
    g.spawn += Math.max(0.25, 0.9 - L * 0.035);
    const batch = 1 + Math.floor(L / 6);
    for (let i = 0; i < batch && g.en.length < MAXE; i++) spawnEnemy(pickType());
  }
  // рои рефератов
  g.swarm -= dt;
  if (g.swarm <= 0) {
    g.swarm = Math.max(7, 16 - L * 0.8);
    spawnSwarm();
  }
  // элитные «автоматы отменены»: каждые 5 уровней, с каждым разом больше
  if (g.level >= g.nextElite) {
    const n = Math.min(6, Math.floor(g.nextElite / 5));
    g.nextElite += 5;
    for (let i = 0; i < n; i++) spawnEnemy('a');
    g.msg = { text: 'Автомат отменён!', t: 2.5 };
  }
  // босс: таймер идёт, пока босса нет
  if (!g.boss) {
    g.bossT -= dt;
    if (g.bossT <= 0) spawnBoss(g.nBoss % 2 === 0 ? 'b' : 'm');   // препод, Мастер проектов, препод, ...
  }
  if (g.boss && g.mb && !g.boss.dead) mbossUpdate(g.boss, dt, dtE, L);
  // предметы на карте
  g.itemT -= dt;
  if (g.itemT <= 0) {
    g.itemT = 7;
    let tot = 0; for (const k in PICK) tot += PICK[k].w;
    let r = Math.random() * tot, kk = 'cig';
    for (const k in PICK) { r -= PICK[k].w; if (r <= 0) { kk = k; break; } }
    if (itemCount(kk) < PICK[kk].max) spawnItem(kk);
  }
  for (const it of g.items) {
    const dx = p.x - it.x, dy = p.y - it.y;
    if (dx * dx + dy * dy < 26 * 26) { pickItem(it); it.dead = true; }
  }
  if (g.msg) { g.msg.t -= dt; if (g.msg.t <= 0) g.msg = null; }
  if (g.shout) { g.shout.t += dt; if (g.shout.t >= g.shout.d || g.shout.e.dead) g.shout = null; }

  buildGrid();
  g.sepF = !g.sepF;
  if (g.sepF) separate(0.65);               // расталкивание через кадр (вдвое дешевле)

  // враги: движение и контакт
  const far = hyp(W, H) / SC * 0.5 + 420;
  const esp = (52 + Math.min(L * 0.9, 30)) * sk;
  const dmgIn = (8 + Math.floor(L / 3) * 2) * dmK();
  const phone = g.w.phone ? stl('phone') : null, fa = Math.atan2(p.fy, p.fx);
  const kdec = Math.exp(-7 * dt);
  let labs = 0;
  for (const e of g.en) {
    if (e.dead) continue;
    const T = e.T;
    const dx = p.x - e.x, dy = p.y - e.y, d = hyp(dx, dy) || 1;
    if (d > far && !T.boss && !T.fac) { spawnPos(); e.x = sp.x; e.y = sp.y; continue; }
    if (T.fac) { // хлебозавод стоит на месте и печёт хлеб, пока жив босс
      e.ob -= dt; if (e.fl > 0) e.fl -= dt;
      e.sh -= dtE;
      e.sp2 = (e.sp2 === undefined ? 5 : e.sp2) - dtE;      // заводы выпускают курсовые, чтобы игрок не сидел спокойно
      if (e.sp2 <= 0 && g.mb && g.mb.ph === 1) { e.sp2 = 6; for (let k = 0; k < 2 && g.en.length < MAXE; k++) addEnemy(pickType(), clamp(e.x + rnd(-30, 30), 20, MAP - 20), clamp(e.y + rnd(-30, 30), 20, MAP - 20)); }
      if (e.sh <= 0) {
        e.sh = BAKE_EVERY;
        if (g.mb && g.mb.ph === 1 && g.boss && !g.boss.dead) {
          if (g.bread.length >= BREAD_MAX) g.bread.shift();
          g.bread.push({ x: e.x, y: e.y, dead: false });
          g.mb.baked++;
        }
      }
      continue;
    }
    let mx = dx / d, my = dy / d, sm = T.spd, bv = -1;   // bv >= 0: босс идёт с заданной скоростью (доля от скорости игрока)
    if (e.cast > 0) e.cast -= dt;
    if (T.mboss && g.mb) {
      const mph = g.mb.ph, fat = clamp((e.r - g.mb.base) / (g.mb.base * 1.1), 0, 1);
      if (mph === 1) bv = pBase * (0.75 - 0.15 * fat);   // чем толще, тем медленнее: 0.75 -> 0.6
      else if (mph === 3) bv = pBase * (e.cast > 0 ? 0.2 : 0.75);   // фигуры: как у препода, наседает, но на касте почти встаёт
      else bv = pBase * 0.4;                                       // воронка: босс медленный, можно выбраться
    } else if (T.boss) {
      bv = pBase * (e.cast > 0 ? 0.2 : 0.75);
      e.sh -= dtE;
      if (e.sh <= 0) { e.sh = 2.8; e.cast = rnd(1, 2); fireInsults(e); }
    }
    if (g.mb && (g.mb.ph === 2 || g.mb.ph === 4) && g.boss && !g.boss.dead && !T.boss) {   // воронка: все монстры тянутся к Мастеру, медленнее
      const bx = g.boss.x - e.x, by = g.boss.y - e.y, bd = hyp(bx, by) || 1;
      mx = bx / bd; my = by / bd; sm = T.spd * 0.5;
    }
    if (T.ranged) {
      labs++;
      if (d < T.keep - 40) { mx = -mx; my = -my; sm = T.spd * 0.8; } // отступает, если подошёл близко
      else if (d < T.keep + 20) sm = 0;                              // держит дистанцию
      e.sh -= dtE;
      if (e.sh <= 0 && d < 420) {                                    // стреляет задачей
        e.sh = 2.6 + Math.random() * 0.8;
        g.ep.push({ x: e.x, y: e.y, vx: dx / d * 150, vy: dy / d * 150, life: 3.5, r: 6 });
      }
    }
    e.kx *= kdec; e.ky *= kdec;
    const mv = bv >= 0 ? bv * sk : esp * sm;
    e.x = clamp(e.x + (mx * mv + e.kx) * dt, 12, MAP - 12);
    e.y = clamp(e.y + (my * mv + e.ky) * dt, 12, MAP - 12);
    e.ob -= dt; if (e.fl > 0) e.fl -= dt;
    if (phone && !T.elite && d < e.r + SR) {   // элитные и боссы проходят сквозь щит
      // щит-телефон: враг в секторе упирается в него
      let da = Math.atan2(-dy, -dx) - fa; da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) < phone.arc) {
        const nd = e.r + SR;
        e.x = p.x - dx / d * nd; e.y = p.y - dy / d * nd;
        continue;
      }
    }
    if (d < e.r + 14 && p.inv <= 0) {
      if (hurtPlayer(Math.round(dmgIn * T.dmg * (T.boss ? BOSS_K : 1) * (T.mboss && g.mb ? g.mb.dmgK * (g.mb.ph === 1 ? 1 + 0.05 * g.mb.fed : 1) : 1)))) return;
    }
  }
  g.nLab = labs;

  // снаряды врагов (задачи от лабораторных)
  for (const b of g.ep) {
    if (b.q) { // оскорбление чуть-чуть скашивается в сторону игрока
      let da = Math.atan2(p.y - b.y, p.x - b.x) - Math.atan2(b.vy, b.vx);
      da = Math.atan2(Math.sin(da), Math.cos(da));
      const step = clamp(da, -INS_TURN * dtE, INS_TURN * dtE);
      if (b.turn + Math.abs(step) <= INS_TURN_MAX) {
        const c = Math.cos(step), s = Math.sin(step), vx = b.vx;
        b.vx = vx * c - b.vy * s; b.vy = vx * s + b.vy * c; b.turn += Math.abs(step);
      }
    }
    b.x += b.vx * dtE; b.y += b.vy * dtE; b.life -= dtE;
    if (b.x < -50 || b.y < -50 || b.x > MAP + 50 || b.y > MAP + 50) b.life = 0;
    if (b.life > 0 && p.inv <= 0) {
      const dx = p.x - b.x, dy = p.y - b.y, rr = b.r + p.r;
      if (dx * dx + dy * dy < rr * rr) {
        b.life = 0;
        if (b.q) {                               // оскорбление препода: пауза и пример
          openQuiz(b.ph); return;
        }
        if (hurtPlayer(b.d || Math.round((8 + Math.floor(L / 3)) * dmK()))) return;
      }
    }
  }

  // фигуры Мастера проектов: треугольники, лазерные квадраты, полумесяцы
  if (g.hz.length) {
    const hzD = Math.round((9 + Math.floor(L / 3)) * BOSS_K * dmK());
    for (const h of g.hz) {
      if (h.delay > 0) { h.delay -= dtE; continue; }
      h.t += dtE;
      if (h.k === 'tri') {
        h.x += h.vx * dtE; h.y += h.vy * dtE; h.ob += dtE * 5;
        const boom = h.t >= h.life || h.x < 30 || h.y < 30 || h.x > MAP - 30 || h.y > MAP - 30;
        if (p.inv <= 0) {
          let hit = hyp(p.x - h.x, p.y - h.y) < 18 + p.r * 0.5;
          for (let i = 0; i < h.no && !hit; i++) {
            const oa = h.ob + i * TAU / h.no;
            hit = hyp(p.x - (h.x + Math.cos(oa) * h.orR), p.y - (h.y + Math.sin(oa) * h.orR)) < 9 + p.r * 0.5;
          }
          if (hit && hurtPlayer(hzD)) return;
        }
        if (boom) {
          h.dead = true; g.shake = Math.max(g.shake, 4);
          for (let i = 0; i < h.no; i++) {
            const oa = h.ob + i * TAU / h.no, ox = h.x + Math.cos(oa) * h.orR, oy = h.y + Math.sin(oa) * h.orR;
            const r0 = Math.random() * TAU;
            for (let j = 0; j < h.nd && g.ep.length < 320; j++) {
              const a = r0 + j * TAU / h.nd, v = 130 + (j % 2) * 50;
              g.ep.push({ x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 2.6, r: 6, c: prismColor(i * 0.7 + j * 0.25), d: Math.max(6, hzD - 3) });
            }
          }
          addFx({ k: 'ring', x: h.x, y: h.y, max: 70, t: 0, d: 0.3, col: '123,44,191' });
        }
      } else if (h.k === 'sq') {
        h.h += 230 * dtE;
        if (h.h >= h.hmax) h.dead = true;
        else if (p.inv <= 0) {
          const dx = p.x - h.x, dy = p.y - h.y, m = Math.max(Math.abs(dx), Math.abs(dy));
          if (Math.abs(m - h.h) < 7 + p.r * 0.6) {
            const sd = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : 2) : (dy > 0 ? 1 : 3);
            const co = sd % 2 === 0 ? dy : dx;
            if (!(sd === h.side && Math.abs(co - h.gc) < h.gap) && hurtPlayer(Math.round(hzD * 1.2))) return;
          }
        }
      } else { // полумесяцы
        const c = 180 * h.t, sep = Math.min(430, 40 + 95 * h.t);
        const cx = h.x0 + Math.cos(h.a) * c, cy = h.y0 + Math.sin(h.a) * c;
        const nx = -Math.sin(h.a), ny = Math.cos(h.a);
        h.A.x = cx + nx * sep / 2; h.A.y = cy + ny * sep / 2; h.B.x = cx - nx * sep / 2; h.B.y = cy - ny * sep / 2;
        if (h.t >= h.life || cx < -60 || cy < -60 || cx > MAP + 60 || cy > MAP + 60) h.dead = true;
        else {
          if (p.inv <= 0 && (hyp(p.x - h.A.x, p.y - h.A.y) < 14 + p.r * 0.5 || hyp(p.x - h.B.x, p.y - h.B.y) < 14 + p.r * 0.5) && hurtPlayer(hzD)) return;
          const abx = h.B.x - h.A.x, aby = h.B.y - h.A.y;
          let u = ((p.x - h.A.x) * abx + (p.y - h.A.y) * aby) / (abx * abx + aby * aby || 1);
          u = clamp(u, 0, 1);
          const qx = h.A.x + abx * u - p.x, qy = h.A.y + aby * u - p.y;
          h.tick -= dtE;
          if (qx * qx + qy * qy < (9 + p.r) * (9 + p.r)) { // лазер между полумесяцами: замедляет и жжёт
            g.pslow = 0.6;
            if (h.tick <= 0) { h.tick = 0.4; if (p.inv <= 0 && hurtPlayer(Math.round((4 + Math.floor(L / 4)) * BOSS_K * dmK()))) return; }
          }
        }
      }
    }
    compact(g.hz, o => !o.dead);
  }

  // --- шпаргалка (орбита) ---
  if (w.sheet) {
    const s = stl('sheet');
    g.orbA += dt * s.spd * (1 + 0.06 * Math.max(0, w.sheet - 5));
    for (let i = 0; i < s.n; i++) {
      const a = g.orbA + i * TAU / s.n;
      const ox = p.x + Math.cos(a) * s.R, oy = p.y + Math.sin(a) * s.R;
      const list = near(ox, oy, 40);
      for (let k = 0; k < list.length; k++) {
        const e = list[k];
        if (e.dead || e.ob > 0) continue;
        const dx = e.x - ox, dy = e.y - oy, hr = 14 + e.r;
        if (dx * dx + dy * dy < hr * hr) {
          const ax = e.x - p.x, ay = e.y - p.y, al = hyp(ax, ay) || 1;
          hitEnemy(e, s.dmg * wx('sheet') * mulDmg, ax / al * 90, ay / al * 90);
          e.ob = 0.35;
        }
      }
    }
  }

  // --- гугл (самонаводящийся) ---
  if (w.google) {
    g.wt.google -= dt;
    if (g.wt.google <= 0) {
      const s = stl('google');
      const list = near(p.x, p.y, 480).filter(e => !e.dead);
      if (list.length) {
        g.wt.google = s.cd * mulCd * cx('google');
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
            dmg: s.dmg * wx('google'), life: 3, r: 10, tg: best, hit: null, pierce: 0 });
        }
      } else g.wt.google = 0.25;
    }
  }

  // --- ручка (по ходу движения) ---
  if (w.pen) {
    g.wt.pen -= dt;
    if (g.wt.pen <= 0) {
      const s = stl('pen');
      g.wt.pen = s.cd * mulCd * cx('pen');
      const base = Math.atan2(p.fy, p.fx);
      for (let i = 0; i < s.n; i++) {
        const a = base + (i - (s.n - 1) / 2) * 0.16;
        g.pr.push({ type: 'p', x: p.x, y: p.y, vx: Math.cos(a) * 430, vy: Math.sin(a) * 430,
          dmg: s.dmg * wx('pen'), life: 0.9, r: 7, tg: null, hit: [], pierce: s.pierce });
      }
    }
  }

  // --- энергетик (волна) ---
  if (w.energy) {
    g.wt.energy -= dt;
    if (g.wt.energy <= 0) {
      const s = stl('energy');
      g.wt.energy = s.cd * mulCd * cx('energy');
      const list = near(p.x, p.y, s.rad + 26);
      for (let k = 0; k < list.length; k++) {
        const e = list[k];
        if (e.dead) continue;
        const dx = e.x - p.x, dy = e.y - p.y, d = hyp(dx, dy) || 1;
        if (d < s.rad + e.r) hitEnemy(e, s.dmg * wx('energy') * mulDmg, dx / d * 260, dy / d * 260);
      }
      addFx({ k: 'ring', x: p.x, y: p.y, max: s.rad, t: 0, d: 0.35 });
      g.shake = Math.max(g.shake, 3);
    }
  }

  // --- помада (красный след) ---
  if (w.lip) {
    const s = stl('lip');
    if (hyp(p.x - g.lipX, p.y - g.lipY) > 14) {
      g.lip.push({ x: p.x, y: p.y, t: s.life, m: s.life });
      g.lipX = p.x; g.lipY = p.y;
      if (g.lip.length > 70) g.lip.shift();
    }
    for (const pt of g.lip) {
      pt.t -= dt;
      const list = near(pt.x, pt.y, s.r + 26);
      for (let k = 0; k < list.length; k++) {
        const e = list[k];
        if (e.dead || (e.lp || 0) > g.t) continue;
        const dx = e.x - pt.x, dy = e.y - pt.y, hr = s.r + e.r * 0.6;
        if (dx * dx + dy * dy < hr * hr) { hitEnemy(e, s.dmg * wx('lip') * mulDmg, 0, 0); e.lp = g.t + 0.5; }
      }
    }
    compact(g.lip, o => o.t > 0);
  }

  // --- медаль (летит в случайную сторону и взрывается) ---
  if (w.medal) {
    g.wt.medal -= dt;
    if (g.wt.medal <= 0) {
      const s = stl('medal');
      if (near(p.x, p.y, 420).length) {
        g.wt.medal = s.cd * mulCd * cx('medal');
        for (let i = 0; i < s.n; i++) {
          const a = Math.random() * TAU;
          g.md.push({ x: p.x, y: p.y, vx: Math.cos(a) * 250, vy: Math.sin(a) * 250, fuse: rnd(0.5, 0.8), s, a: 0 });
        }
      } else g.wt.medal = 0.3;
    }
  }
  for (const m of g.md) {
    m.x += m.vx * dt; m.y += m.vy * dt; m.fuse -= dt; m.a += dt * 12;
    let boom = m.fuse <= 0;
    if (!boom) {
      const list = near(m.x, m.y, 40);
      for (let k = 0; k < list.length; k++) { const e = list[k]; if (!e.dead && hyp(e.x - m.x, e.y - m.y) < e.r + 12) { boom = true; break; } }
    }
    if (boom) {
      m.dead = true;
      const s = m.s, list = near(m.x, m.y, s.rad + 26);
      for (let k = 0; k < list.length; k++) {
        const e = list[k]; if (e.dead) continue;
        const dx = e.x - m.x, dy = e.y - m.y, d = hyp(dx, dy) || 1;
        if (d < s.rad + e.r) hitEnemy(e, s.dmg * wx('medal') * mulDmg, dx / d * 240, dy / d * 240);
      }
      addFx({ k: 'ring', x: m.x, y: m.y, max: s.rad, t: 0, d: 0.35, col: '230,170,30' });
      g.shake = Math.max(g.shake, 2);
    }
  }
  compact(g.md, o => !o.dead);

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
        const dx = pr.tg.x - pr.x, dy = pr.tg.y - pr.y, d = hyp(dx, dy) || 1;
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
      const vl = hyp(pr.vx, pr.vy) || 1;
      hitEnemy(e, pr.dmg * mulDmg, pr.vx / vl * 70, pr.vy / vl * 70);
      if (pr.type === 'g') { pr.life = 0; break; }
      pr.hit.push(e);
      if (--pr.pierce < 0) { pr.life = 0; break; }
    }
  }

  // баллы (опыт)
  const magR = 70 * (1 + 0.35 * (ps.magnet || 0));
  for (const gm of g.gems) {
    const dx = p.x - gm.x, dy = p.y - gm.y, d = hyp(dx, dy) || 1;
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
  compact(g.items, o => !o.dead);
  compact(g.fx, o => o.t < o.d);
  compact(g.ft, o => o.t < o.d);

  // повышение уровня
  if (g.xp >= g.need) {
    g.xp -= g.need; g.level++; g.need = needXp(g.level);
    { const C = CLS[g.cls]; p.max += C.hpL; p.hp = Math.min(p.max, p.hp + C.hpL); }
    openLevelUp();
  }
}

// ---------- конец игры ----------
function finish(win) {
  const g = G;
  g.over = true; g.win = win;
  save.best = Math.max(save.best, Math.floor(g.t));
  save.kills = Math.max(save.kills, g.kills);
  save.lvl = Math.max(save.lvl || 0, g.level);
  save.bosses = Math.max(save.bosses || 0, g.bosses || 0);
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
  if (x1 > MAP / 2 - 330 && x0 < MAP / 2 + 330 && y1 > MAP / 2 - 340 && y0 < MAP / 2 - 180) {
    ctx.fillStyle = 'rgba(43,58,143,0.06)'; ctx.font = 'bold 130px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('СЕССИЯ', MAP / 2, MAP / 2 - 260);
  }
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
  // предметы на карте
  for (const it of g.items) {
    if (it.x < x0 || it.x > x1 || it.y < y0 || it.y > y1) continue;
    const bob = Math.sin(g.t * 3 + it.ph) * 3;
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath(); ctx.ellipse(it.x, it.y + 14, 10, 4, 0, 0, TAU); ctx.fill();
    drawSpr(SPR['i_' + it.k], it.x, it.y + bob);
  }
  // красный след помады
  if (g.lip.length && g.w.lip) {
    const s = stl('lip');
    for (const pt of g.lip) {
      ctx.fillStyle = 'rgba(214,40,90,' + (0.55 * Math.min(1, pt.t / 0.5)) + ')';
      ctx.beginPath(); ctx.arc(pt.x, pt.y, s.r, 0, TAU); ctx.fill();
    }
  }
  // хлеб едет к боссу
  for (const b of g.bread) { if (b.x < x0 || b.x > x1 || b.y < y0 || b.y > y1) continue; drawSpr(SPR.bread, b.x, b.y); }
  // чёрная воронка вокруг босса
  if (g.mb && g.mb.hole > 0 && g.boss && !g.boss.dead) {
    const e = g.boss, h = g.mb.hole, R = HOLE_R * (0.5 + 0.5 * h);
    for (let i = 0; i < 6; i++) { ctx.fillStyle = 'rgba(15,0,30,' + (0.11 * h) + ')'; ctx.beginPath(); ctx.arc(e.x, e.y, R * (1 - i * 0.14), 0, TAU); ctx.fill(); }
    ctx.strokeStyle = 'rgba(150,80,220,' + (0.55 * h) + ')'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const a0 = g.t * 2.2 + i * TAU / 4;
      ctx.beginPath(); ctx.arc(e.x, e.y, R * 0.72, a0, a0 + 1.1); ctx.stroke();
      ctx.beginPath(); ctx.arc(e.x, e.y, R * 0.4, a0 + 2, a0 + 3.1); ctx.stroke();
    }
  }
  // враги
  for (const e of g.en) {
    if (e.x < x0 || e.x > x1 || e.y < y0 || e.y > y1) continue;
    const T = e.T;
    if (T.elite) { // красная аура у элитных
      ctx.fillStyle = 'rgba(217,66,58,0.22)'; ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 8, 0, TAU); ctx.fill();
    }
    if (T.mboss) drawSprK(SPR[g.mb && g.mb.ph === 1 ? 'mk' : 'ma'], e.x, e.y, e.r / 34); else drawSpr(SPR[T.spr], e.x, e.y);
    if (e.fl > 0) { ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, TAU); ctx.fill(); }
    if (T.elite) { // полоска здоровья
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(e.x - 22, e.y - e.r - 14, 44, 5);
      ctx.fillStyle = '#d9423a'; ctx.fillRect(e.x - 22, e.y - e.r - 14, 44 * Math.max(0, e.hp / e.mh), 5);
    }
  }
  // щит босса (пока живы заводы), потом сползает вниз
  if (g.mb && g.boss && !g.boss.dead && g.mb.shA > 0) {
    const e = g.boss, a = g.mb.shA, off = (1 - a) * e.r * 1.3;
    ctx.globalAlpha = a; ctx.fillStyle = 'rgba(90,170,255,0.2)'; ctx.strokeStyle = 'rgba(60,140,255,0.9)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(e.x, e.y + off, e.r + 14, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 1;
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
    drawSpr(bulSpr(b.c || '#d9423a', b.r), b.x, b.y);
  }
  // фигуры Мастера проектов
  for (const h of g.hz) {
    if (h.delay > 0) continue;
    if (h.k === 'tri') {
      for (let i = 0; i < h.no; i++) {
        const oa = h.ob + i * TAU / h.no;
        ctx.fillStyle = prismColor(h.t * 2 + i * 0.5); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(h.x + Math.cos(oa) * h.orR, h.y + Math.sin(oa) * h.orR, 9, 0, TAU); ctx.fill(); ctx.stroke();
      }
      ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(h.a); ctx.drawImage(SPR.tri.c, -26, -26, 52, 52); ctx.restore();
    } else if (h.k === 'sq') {
      const hh = h.h, gap = h.gap;
      const side = (sd, from, to) => {
        const a = Math.max(from, -hh), b = Math.min(to, hh);
        if (b <= a) return;
        if (sd === 0) { ctx.moveTo(h.x + hh, h.y + a); ctx.lineTo(h.x + hh, h.y + b); }
        else if (sd === 2) { ctx.moveTo(h.x - hh, h.y + a); ctx.lineTo(h.x - hh, h.y + b); }
        else if (sd === 1) { ctx.moveTo(h.x + a, h.y + hh); ctx.lineTo(h.x + b, h.y + hh); }
        else { ctx.moveTo(h.x + a, h.y - hh); ctx.lineTo(h.x + b, h.y - hh); }
      };
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = pass === 0 ? 'rgba(255,60,120,0.35)' : prismColor(h.t); ctx.lineWidth = pass === 0 ? 20 : 8; ctx.lineCap = 'round';
        ctx.beginPath();
        for (let sd = 0; sd < 4; sd++) {
          if (sd === h.side) { side(sd, -hh, h.gc - gap); side(sd, h.gc + gap, hh); } else side(sd, -hh, hh);
        }
        ctx.stroke();
      }
    } else {
      ctx.strokeStyle = 'rgba(255,60,120,0.35)'; ctx.lineWidth = 16; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(h.A.x, h.A.y); ctx.lineTo(h.B.x, h.B.y); ctx.stroke();
      ctx.strokeStyle = prismColor(h.t); ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(h.A.x, h.A.y); ctx.lineTo(h.B.x, h.B.y); ctx.stroke();
      for (const q of [h.A, h.B]) { ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(h.a); ctx.drawImage(SPR.cres.c, -28, -28, 56, 56); ctx.restore(); }
    }
  }
  // предупреждение перед атакой босса
  if (g.mb && g.mb.pend && g.boss && !g.boss.dead) {
    const e = g.boss, k = 1 - g.mb.pend.t / 0.9;
    ctx.strokeStyle = 'rgba(255,60,120,' + (0.9 - 0.5 * k) + ')'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 14 + k * 50, 0, TAU); ctx.stroke();
  }
  // игрок
  ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 14, 13, 5, 0, 0, TAU); ctx.fill();
  const blink = p.inv > 0 && Math.floor(g.t * 20) % 2 === 0;
  if (blink) ctx.globalAlpha = 0.4;
  drawSpr(SPR[CLS[g.cls].spr], p.x, p.y);
  ctx.globalAlpha = 1;
  // полоска HP над игроком
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(p.x - 16, p.y + 22, 32, 4);
  ctx.fillStyle = '#d9423a'; ctx.fillRect(p.x - 16, p.y + 22, 32 * (p.hp / p.max), 4);

  // щит-предмет вокруг игрока
  if (g.shield > 0) {
    ctx.strokeStyle = 'rgba(58,123,213,0.75)'; ctx.fillStyle = 'rgba(58,123,213,0.12)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.x, p.y, 24, 0, TAU); ctx.fill(); ctx.stroke();
  }
  // щит-телефон
  if (g.w.phone) {
    const ph = stl('phone'), fa = Math.atan2(p.fy, p.fx);
    ctx.strokeStyle = 'rgba(58,123,213,0.85)'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(p.x, p.y, SR - 3, fa - ph.arc, fa + ph.arc); ctx.stroke();
    drawSpr(SPR.phone, p.x + Math.cos(fa) * (SR + 2), p.y + Math.sin(fa) * (SR + 2));  }
  // медали в полёте
  for (const m of g.md) {
    ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(m.a);
    ctx.drawImage(SPR.medal.c, -SPR.medal.w / 2, -SPR.medal.h / 2, SPR.medal.w, SPR.medal.h);
    ctx.restore();
  }
  // шпаргалки
  if (g.w.sheet) {
    const s = stl('sheet');
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
      const l = hyp(pr.vx, pr.vy) || 1;
      ctx.strokeStyle = '#1f3fbf'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(pr.x, pr.y); ctx.lineTo(pr.x - pr.vx / l * 16, pr.y - pr.vy / l * 16); ctx.stroke();
    }
  }
  // эффекты
  for (const f of g.fx) {
    const k = f.t / f.d;
    if (f.k === 'ring') {
      const r = f.max * (1 - (1 - k) * (1 - k));
      const col = f.col || '255,138,0';
      ctx.fillStyle = 'rgba(' + col + ',' + (0.15 * (1 - k)) + ')';
      ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(' + col + ',' + (1 - k) + ')'; ctx.lineWidth = 6;
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

  if (g.slow > 0) { ctx.fillStyle = 'rgba(120,150,255,0.10)'; ctx.fillRect(0, 0, W, H); }
  drawHud();
  if (joy.active) drawJoy();
}

function drawJoy() {
  ctx.fillStyle = 'rgba(43,58,143,0.12)'; ctx.strokeStyle = 'rgba(43,58,143,0.45)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(joy.ox, joy.oy, JR, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(43,58,143,0.5)';
  ctx.beginPath(); ctx.arc(joy.ox + joy.x * JR, joy.oy + joy.y * JR, 22, 0, TAU); ctx.fill();
}

function hudText(t, x, y) {   // текст с светлой обводкой, чтобы читался и на фоне за картой
  ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(251,248,238,0.92)';
  ctx.strokeText(t, x, y); ctx.fillText(t, x, y);
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
  hudText('Ур. ' + g.level + '  ·  убито ' + g.kills, 10, SAFE + 44);
  // состояния: щит и замедление врагов
  let sx2 = 10;
  if (g.shield > 0) { ctx.fillText('🛡×' + g.shield, sx2, SAFE + 168); sx2 += 44; }
  if (g.slow > 0) ctx.fillText('⏰ ' + g.slow.toFixed(1), sx2, SAFE + 168);
  // таймер до босса
  ctx.textAlign = 'center'; ctx.font = 'bold 24px sans-serif';
  const nextM = g.nBoss % 2 === 1;                 // у каждого босса свой цвет таймера
  if (g.boss && !g.boss.dead) { ctx.fillStyle = g.boss.T.mboss ? '#8a4a16' : '#7a1f2b'; hudText(g.boss.T.short + '!', W / 2, SAFE + 30); }
  else { ctx.fillStyle = nextM ? '#c0651a' : '#2b3a8f'; hudText(mmss(g.bossT), W / 2, SAFE + 30); }
  ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = nextM ? '#8a4a16' : '#4a5575';
  hudText(g.boss && !g.boss.dead ? 'победи его' : (nextM ? 'до Мастера проектов' : 'до препода'), W / 2, SAFE + 48);
  // миникарта
  const s = 78, mx = 10, my = SAFE + 58, k = s / MAP;
  ctx.fillStyle = 'rgba(251,248,238,0.85)'; ctx.fillRect(mx, my, s, s);
  ctx.strokeStyle = '#2b3a8f'; ctx.lineWidth = 2; ctx.strokeRect(mx, my, s, s);
  ctx.fillStyle = '#d9423a';
  for (const e of g.en) if (!e.T.elite) ctx.fillRect(mx + e.x * k - 1, my + e.y * k - 1, 2, 2);
  ctx.fillStyle = '#7a0f0f';
  for (const e of g.en) if (e.T.elite) ctx.fillRect(mx + e.x * k - 2.5, my + e.y * k - 2.5, 5, 5);
  for (const it of g.items) { ctx.fillStyle = it.k === 'cig' ? '#2f9e44' : it.k === 'shield' ? '#3a7bd5' : '#7a4bd0'; ctx.fillRect(mx + it.x * k - 1.5, my + it.y * k - 1.5, 3, 3); }
  ctx.fillStyle = '#2b3a8f'; ctx.beginPath(); ctx.arc(mx + p.x * k, my + p.y * k, 3.5, 0, TAU); ctx.fill();
  // полоска здоровья босса
  if (g.boss && !g.boss.dead) {
    const bw = Math.min(240, W - 190), bx = W / 2 - bw / 2, by = SAFE + 56;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(bx, by, bw, 10);
    ctx.fillStyle = g.mb && g.mb.ph === 1 ? '#5a7fb5' : '#7a1f2b'; ctx.fillRect(bx, by, bw * Math.max(0, g.boss.hp / g.boss.mh), 10);
    ctx.strokeStyle = '#1b1210'; ctx.lineWidth = 2; ctx.strokeRect(bx, by, bw, 10);
    ctx.fillStyle = '#7a1f2b'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(g.boss.T.name.toUpperCase() + (g.mb && g.mb.ph === 1 ? '  ·  щит, заводов: ' + g.facLeft + '  ·  🍞 ' + g.mb.baked : ''), W / 2, by + 20);
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
// принудительное обновление: сносим кэш и service worker и грузим всё заново
function hardRefresh() {
  const done = () => location.reload();
  try {
    Promise.all([
      window.caches ? caches.keys().then(ks => Promise.all(ks.map(k => caches.delete(k)))) : null,
      navigator.serviceWorker ? navigator.serviceWorker.getRegistrations().then(rs => Promise.all(rs.map(r => r.unregister()))) : null
    ]).then(done, done);
  } catch (e) { done(); }
}
let menuNote = '';
function screenMenu() {
  const note = menuNote; menuNote = '';
  return '<div class="panel"><h1>СЕССИЯ</h1>' +
    (note ? '<p class="sub" style="font-weight:700;color:#2f7d3a">' + note + '</p>' : '') +
    '<p class="sub">Прокачивайся, отбивайся от курсовых и каждые 5 минут побеждай препода.</p>' +
    '<button class="btn" data-act="start">Начать</button>' +
    '<p class="hint">Рекорд: уровень ' + (save.lvl || 0) + ' · боссов: ' + (save.bosses || 0) + ' · макс. убито: ' + save.kills + ' · сдано сессий: ' + (save.wins || 0) + '</p>' +
    '<p class="hint">Тяни палец по любому месту экрана, появится круг. Оружие бьёт само.</p>' +
    (isStandalone() ? '' : '<p class="hint">Совет: «Поделиться» → «На экран Домой», и это будет как приложение.</p>') +
    '<button class="link" data-act="refresh">Обновить игру</button>' +
    '</div><div class="ver">Build ' + BUILD + '</div>';
}
function screenPick() {
  let h = '<div class="panel"><h2>Кто ты?</h2>';
  for (const id in CLS) h += card('pick', id, CLS[id].ic, CLS[id].n, '', CLS[id].d);
  return h + '<button class="btn alt" data-act="menu">Назад</button></div>';
}
function screenLevel() {
  let h = '<div class="panel"><h2>Новый уровень: ' + G.level + '</h2>';
  for (const o of G.opts) {
    if (o.k === 'w') h += card('up', o.k + ':' + o.id, WDEF[o.id].ic, WDEF[o.id].n, o.l === 1 ? 'НОВОЕ' : 'уровень ' + o.l, o.l > 5 ? '∞ +15% урона и быстрее перезарядка' : WDEF[o.id].d[o.l - 1]);
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
    '<p class="sub">Уровень ' + g.level + ' · боссов побеждено ' + (g.bosses || 0) + ' · убито ' + g.kills + ' · ' + mmss(g.t) + '</p>' +
    '<button class="btn" data-act="start">Ещё раз</button>' +
    '<button class="btn alt" data-act="menu">В меню</button>' +
    '<p class="hint">Рекорд: уровень ' + (save.lvl || 0) + ' · боссов ' + (save.bosses || 0) + '</p></div>';
}

function screenBossEnd() {
  return '<div class="panel"><h1>Препод побеждён! 🎓</h1>' +
    '<p class="sub">Зачёт у тебя в кармане. Заканчиваем сессию или идём дальше, в бесконечную кампанию? Следующий босс будет злее.</p>' +
    '<button class="btn" data-act="goon">Продолжить</button>' +
    '<button class="btn alt" data-act="endrun">Закончить</button></div>';
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
  cheatBtn.style.display = s === 'play' ? 'block' : 'none';
  if (s === 'play') { ui.className = ''; ui.innerHTML = ''; return; }
  const view = { menu: screenMenu, pick: screenPick, levelup: screenLevel, quiz: screenQuiz, bossend: screenBossEnd, pause: screenPause, over: screenOver }[s];
  ui.innerHTML = view();
  ui.className = 'show';
}

function pauseGame() { if (state === 'play') setState('pause'); }

// ---------- прокачка ----------
function openLevelUp() {
  const g = G, opts = [];
  const wc = Object.keys(g.w).length, pc = Object.keys(g.ps).length;
  for (const id in WDEF) {
    if (id === 'lip' && g.cls !== 'girl') continue;   // помада только у девочки
    const l = g.w[id] || 0;
    if (l === 0 && wc < 4) opts.push({ k: 'w', id, l: 1 });
    else if (l > 0 && l < (g.endless ? 99 : 5)) opts.push({ k: 'w', id, l: l + 1 });
  }
  for (const id in PDEF) {
    const l = g.ps[id] || 0;
    if (l === 0 && pc < 4) opts.push({ k: 'p', id, l: 1 });
    else if (l > 0 && l < (g.endless && ENDP[id] ? 99 : 5)) opts.push({ k: 'p', id, l: l + 1 });
  }
  shuffle(opts);
  g.opts = opts.slice(0, 3);
  if (!g.opts.length) {   // всё прокачано: «обед» срабатывает сам, без экрана выбора
    const p = g.p, gain = Math.max(0, Math.min(p.max, p.hp + 30) - p.hp);
    p.hp += gain;
    g.ft.push({ text: 'обед, +' + Math.round(gain) + ' HP', fill: '#2f9e44', line: 'rgba(255,255,255,0.95)', t: 0, d: 1.5 });
    return;
  }
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
  else if (act === 'goon') { G.endless = true; G.eLv = G.level; G.msg = { text: 'Бесконечный режим: монстры растут с уровнем', t: 3.5 }; setState('play'); }
  else if (act === 'endrun') {
    const g = G; g.win = true; g.over = true;
    save.best = Math.max(save.best, Math.floor(g.t)); save.kills = Math.max(save.kills, g.kills);
    save.lvl = Math.max(save.lvl || 0, g.level); save.bosses = Math.max(save.bosses || 0, g.bosses || 0); save.wins++;
    persist();
    menuNote = 'Сессия сдана! 🎓 Уровень ' + g.level + ', боссов побеждено ' + (g.bosses || 0) + ', убито ' + g.kills;
    G = null; setState('menu');
  }
  else if (act === 'menu') { G = null; setState('menu'); }
  else if (act === 'refresh') hardRefresh();
});
pauseBtn.addEventListener('click', pauseGame);
// тестовая красная кнопка: всё на максимум и сразу босс
function cheat() {
  const g = G, p = g.p;
  if (state !== 'play' || !g) return;
  for (const id in WDEF) { if (!g.w[id]) g.wt[id] = 0.4; g.w[id] = 5; }
  for (const id in PDEF) g.ps[id] = 5;
  const hpGain = 100; p.max = Math.max(p.max, CLS[g.cls].hp + hpGain + 20 * 5); p.hp = p.max;
  if (g.level < 20) { g.level = 20; g.xp = 0; g.need = needXp(20); g.nextElite = Math.max(g.nextElite, 25); }
  g.bossT = BOSS_EVERY;
  if (g.boss) { g.boss.dead = true; clearBossStuff(); g.boss = null; g.nBoss++; }   // повторное нажатие: сменить босса
  spawnBoss(g.nBoss % 2 === 0 ? 'b' : 'm');
}
cheatBtn.addEventListener('click', cheat);
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
  window.addEventListener('load', () => {
    const hadController = !!navigator.serviceWorker.controller;
    // когда подъехал новый service worker, а ты в меню, перезагружаем страницу, чтобы сразу была свежая версия
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController && (state === 'menu' || state === 'over')) location.reload();
    });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
  });
}

if (location.hash === '#debug') window.__dbg = { spawnBoss, clearBossStuff, newGame, update, render, setState, applyOption, finish, get G() { return G; }, get state() { return state; } };
})();
