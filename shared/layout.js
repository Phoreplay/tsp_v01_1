/* TPS v0 · shared/layout.js
   Общая раскладка в pt. На каждый экран лупа одна функция, на выходе список прямоугольников
   в координатах экрана. Вайрфрейм и игра читают один и тот же код, поэтому разойтись не могут.
   1 pt = 1 CSS px на iPhone.

   Экран делится на три полосы одной ширины 375 pt: HUD прижат к верху, управление к низу,
   поле фиксированной высоты стоит по центру между ними. Лишняя высота уходит в море вокруг поля.
   Если экран меньше блока, всё уменьшается одним масштабом s, вверх не растягивается. */
(function (root) {
  'use strict';
  var TPS = root.TPS = root.TPS || {};

  var C = {
    W: 375,              // ширина блока
    TOUCH: 44,           // минимальная цель касания
    GAP: 6,              // минимальный зазор между полосами
    TOP_H: 56, FIELD_H: 434, BOT_H: 108,       // игровые экраны
    META_TOP_H: 52, META_BOT_H: 156,            // главный, поиск, итоги, возврат
    CELL_PREP: 56, CELL_BATTLE: 48, ENEMY_PREP: 0.85,
    TILT: 45,            // наклон камеры от вертикали, градусы
    WATER_PREP: 14,      // вода между стволами в подготовке (ГДД 12-16)
    SEA_BATTLE: 28,      // море между корпусами в бою (ГДД 24-32)
    SEA_BOARD: 8,        // абордаж: борта стянуты кошками
    BADGE: 19,           // бейдж ранга, одинаковый у обоих кораблей
    SHIP: {              // базовый фрегат v0, всё в долях клетки
      cols: 4, rows: 3, perBoard: 3,
      gun: 0.32,         // полоса лафетов между сеткой и бортом
      barrel: 0.5,       // вынос ствола за борт, как на эталоне
      stern: 1.0,        // тупая скруглённая корма с низким ютом
      bow: 1.85          // длинный заострённый нос; по центру экрана стоит сетка, нос и корма могут уходить за край
    }
  };
  C.GAME_H = C.TOP_H + C.FIELD_H + C.BOT_H + 2 * C.GAP;   // 610

  var DEVICES = [
    { id: 'se',  name: 'iPhone SE',          w: 375, h: 667, top: 20, bottom: 0 },
    { id: 'i15', name: 'iPhone 15',          w: 393, h: 852, top: 59, bottom: 34 },
    { id: 'max', name: 'iPhone 15 Pro Max',  w: 430, h: 932, top: 59, bottom: 34 },
    { id: 'and', name: 'Android 360×800',    w: 360, h: 800, top: 24, bottom: 16 }
  ];

  // ---------- кадр и полосы ----------

  function frame(vp) {
    var avail = vp.h - vp.top - vp.bottom;
    var s = Math.min(1, vp.w / C.W, avail / C.GAME_H);
    return { vp: vp, s: s, x0: (vp.w - C.W * s) / 2, avail: avail, spare: avail / s - C.GAME_H };
  }

  function bands(f, mode) {
    var vp = f.vp, s = f.s, meta = mode === 'meta';
    var th = meta ? C.META_TOP_H : C.TOP_H, bh = meta ? C.META_BOT_H : C.BOT_H;
    var top = { name: 'top', x: f.x0, y: vp.top, w: C.W, h: th, s: s };
    var bot = { name: 'bot', x: f.x0, y: vp.h - vp.bottom - bh * s, w: C.W, h: bh, s: s };
    var y1 = top.y + th * s, space = bot.y - y1;
    var fh = meta ? Math.max(0, space / s - 2 * C.GAP) : C.FIELD_H;
    var field = { name: 'field', x: f.x0, y: y1 + (space - fh * s) / 2, w: C.W, h: fh, s: s };
    return { top: top, field: field, bot: bot };
  }

  function Scene(f, mode) {
    var B = bands(f, mode), els = [];
    function add(bn, id, kind, x, y, w, h, o) {
      var b = B[bn];
      var e = { id: id, kind: kind, band: bn, l: { x: x, y: y, w: w, h: h },
        x: b.x + x * b.s, y: b.y + y * b.s, w: w * b.s, h: h * b.s };
      if (o) for (var k in o) if (o[k] !== undefined) e[k] = o[k];
      if (e.hit) e.hit = { x: b.x + e.hit[0] * b.s, y: b.y + e.hit[1] * b.s, w: e.hit[2] * b.s, h: e.hit[3] * b.s };
      els.push(e);
      return e;
    }
    function abs(id, kind, x, y, w, h, o) {
      var e = { id: id, kind: kind, band: 'abs', x: x, y: y, w: w, h: h };
      if (o) for (var k in o) if (o[k] !== undefined) e[k] = o[k];
      els.push(e);
      return e;
    }
    function pt(bn, x, y) { var b = B[bn]; return [b.x + x * b.s, b.y + y * b.s]; }
    function arrow(id, p1, p2, o) {
      var e = { id: id, kind: 'arrow', band: 'abs', x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1] };
      if (o) for (var k in o) e[k] = o[k];
      els.push(e);
      return e;
    }
    return { B: B, els: els, f: f, s: f.s, mode: mode, add: add, abs: abs, pt: pt, arrow: arrow };
  }

  // ---------- корабль ----------
  // nose: 1 нос вправо, -1 влево. face: -1 борт 0 сверху (игрок), 1 борт 0 снизу (соперник).
  // Соперник это корабль игрока, повёрнутый на 180°, поэтому индексы клеток у обоих одинаковые.
  // units: { cell: { t: 'g' | 's' | 'b', r: 1..3, hp: 0..1, dead } }, kegs: [cell], guns: ['cul' | 'car'] на слот,
  // cannons: состояния на 6 пушек ('ok' | 'smoking' | 'broken'), board0: 'retract' прячет обращённые стволы.

  function ship(S, bn, o) {
    // вертикаль сжата наклоном камеры: схема сверху совпадает по высоте с 3D-экраном
    var G = C.SHIP, c = o.cell, b = S.B[bn], ky = Math.cos((C.TILT || 0) * Math.PI / 180), cv = c * ky;
    var gun = G.gun * cv, bar = G.barrel * cv, st = G.stern * c, bow = G.bow * c;
    var right = o.nose > 0;
    // o.cx это центр сетки: корпус несимметричен, нос длиннее кормы
    var gw = G.cols * c, gh = G.rows * cv, gx = o.cx - gw / 2, gy = o.cy - gh / 2;
    var hx = right ? gx - st : gx - bow, hy = gy - gun, hw = gw + st + bow, hh = gh + 2 * gun;
    var r = 0.15 * c;

    function P(x, y) { return (b.x + x * b.s).toFixed(1) + ' ' + (b.y + y * b.s).toFixed(1); }
    var sx = right ? hx : hx + hw, ex = right ? gx + gw : gx, dir = right ? 1 : -1, tip = ex + dir * bow;
    var d = 'M' + P(sx + dir * r, hy) + ' L' + P(ex, hy) +
      ' C' + P(ex + dir * bow * 0.5, hy) + ' ' + P(ex + dir * bow * 0.92, hy + hh * 0.4) + ' ' + P(tip, hy + hh / 2) +
      ' C' + P(ex + dir * bow * 0.92, hy + hh * 0.6) + ' ' + P(ex + dir * bow * 0.5, hy + hh) + ' ' + P(ex, hy + hh) +
      ' L' + P(sx + dir * r, hy + hh) + ' Q' + P(sx, hy + hh) + ' ' + P(sx, hy + hh - r) +
      ' L' + P(sx, hy + r) + ' Q' + P(sx, hy) + ' ' + P(sx + dir * r, hy) + ' Z';

    var ghost = !!o.ghost, state = o.state;
    S.add(bn, o.id + '.hull', 'hull', hx, hy, hw, hh, { path: d, side: o.side, ghost: ghost, state: state, label: o.label });

    function vis(i) {   // индекс клетки -> видимые ряд и колонка
      var rr = Math.floor(i / G.cols), k = i % G.cols;
      return { r: o.face < 0 ? rr : G.rows - 1 - rr, k: right ? k : G.cols - 1 - k };
    }
    function cellL(i) { var v = vis(i); return { x: gx + v.k * c, y: gy + v.r * cv }; }
    function cellC(i) { var p = cellL(i); return S.pt(bn, p.x + c / 2, p.y + cv / 2); }

    var out = { id: o.id, c: c, gx: gx, gy: gy, gw: gw, gh: gh, hx: hx, hy: hy, hw: hw, hh: hh, bar: bar, cellC: cellC, cannonC: null };
    if (o.hullOnly) return out;

    for (var i = 0; i < G.cols * G.rows; i++) {
      var p = cellL(i), v = vis(i);
      S.add(bn, o.id + '.c' + i, 'cell', p.x, p.y, c, cv, {
        side: o.side, alt: (v.r + v.k) % 2, tap: o.tap, group: o.id + '.cells', state: state,
        label: i === 0 ? o.gridLabel : undefined
      });
    }

    var cann = {};
    for (var bd = 0; bd < 2; bd++) for (var j = 0; j < G.perBoard; j++) {
      var up = (bd === 0) === (o.face < 0);
      var t = (j + 1) / (G.perBoard + 1);
      var x = right ? gx + gw * t : gx + gw * (1 - t);
      var sc = up ? hy + gun / 2 : hy + hh - gun / 2;
      var kind = (o.guns && o.guns[j]) || (j === 1 ? 'car' : 'cul');
      var cst = (o.cannons && o.cannons[bd * G.perBoard + j]) || 'ok';
      var out1 = kind === 'car' ? bar * 0.6 : bar, thick = (kind === 'car' ? 0.22 : 0.13) * c;
      if (bd === 0 && o.board0 === 'retract') out1 = -gun * 0.15;
      var y1 = up ? hy - out1 : sc, y2 = up ? sc : hy + hh + out1;
      S.add(bn, o.id + '.m' + bd + j, 'muzzle', x - thick / 2, y1, thick, y2 - y1, { state: cst, side: o.side, ghost: ghost });
      S.add(bn, o.id + '.g' + bd + j, 'cannon', x - 0.21 * c, sc - 0.12 * cv, 0.42 * c, 0.24 * cv, {
        state: cst, gun: kind, side: o.side, label: (bd === 0 && j === 0) ? o.gunLabel : undefined
      });
      cann[bd + '' + j] = S.pt(bn, x, up ? hy - out1 : hy + hh + out1);
    }
    out.cannonC = function (bd, j) { return cann[bd + '' + j]; };

    var BG = C.BADGE;
    (o.kegs || []).forEach(function (ci) {
      var q = cellL(ci);
      S.add(bn, o.id + '.k' + ci, 'keg', q.x + 0.16 * c, q.y + 0.14 * cv, 0.66 * c, 0.66 * cv, { state: state });
      S.add(bn, o.id + '.kb' + ci, 'kegBadge', q.x + c - BG * 1.6 - 1, q.y + cv - BG - 1, BG * 1.6, BG, { text: '+10', state: state });
    });
    Object.keys(o.units || {}).forEach(function (key) {
      var u = o.units[key], ci = +key, q = cellL(ci), pad = 0.1 * c;
      if (u.dead) {
        S.add(bn, o.id + '.d' + ci, 'deadMark', q.x + 0.25 * c, q.y + 0.25 * cv, 0.5 * c, 0.5 * cv, {});
        return;
      }
      S.add(bn, o.id + '.u' + ci, 'unit', q.x + pad, q.y + pad * ky, c - 2 * pad, cv - 2 * pad * ky, { side: o.side, utype: u.t, rank: u.r, state: state });
      S.add(bn, o.id + '.b' + ci, 'badge', q.x + c - BG - 1, q.y + cv - BG - 1, BG, BG, { side: o.side, rank: u.r, state: state });
      if (o.hpbars) S.add(bn, o.id + '.hp' + ci, 'hp', q.x + 0.18 * c, q.y + 1, 0.64 * c, 4, { side: o.side, value: u.hp == null ? 1 : u.hp });
    });
    return out;
  }

  function ext(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; if (b) for (k in b) o[k] = b[k]; return o; }

  function prepFrame(S, oe, op) {
    var G = C.SHIP, k = (G.rows + 2 * G.gun + 2 * G.barrel) * Math.cos((C.TILT || 0) * Math.PI / 180);
    var ce = C.CELL_PREP * C.ENEMY_PREP, cp = C.CELL_PREP;
    var eT = k * ce, pT = k * cp, y0 = (C.FIELD_H - eT - C.WATER_PREP - pT) / 2;
    var e = ship(S, 'field', ext({ id: 'e', side: 1, cell: ce, cx: 187.5, cy: y0 + eT / 2, nose: -1, face: 1, tap: 'hold',
      gridLabel: 'соперник 85%: клетка ' + ce.toFixed(1) }, oe));
    var p = ship(S, 'field', ext({ id: 'p', side: 0, cell: cp, cx: 187.5, cy: y0 + eT + C.WATER_PREP + pT / 2, nose: 1, face: -1, tap: 'drag',
      gridLabel: 'фрегат 4×3, клетка 56', gunLabel: 'пушки на границах колонок' }, op));
    return { e: e, p: p, gapY: y0 + eT + C.WATER_PREP / 2 };
  }

  function battleFrame(S, sea, oe, op) {
    var G = C.SHIP, c = C.CELL_BATTLE, ky = Math.cos((C.TILT || 0) * Math.PI / 180), hullH = (G.rows + 2 * G.gun) * c * ky, bar = G.barrel * c * ky;
    var y0 = (C.FIELD_H - (2 * bar + 2 * hullH + sea)) / 2;
    var eCy = y0 + bar + hullH / 2, pCy = eCy + hullH + sea;
    var e = ship(S, 'field', ext({ id: 'e', side: 1, cell: c, cx: 187.5, cy: eCy, nose: -1, face: 1, hpbars: true }, oe));
    var p = ship(S, 'field', ext({ id: 'p', side: 0, cell: c, cx: 187.5, cy: pCy, nose: 1, face: -1, hpbars: true,
      gridLabel: 'бой: клетка 48, море ' + sea }, op));
    return { e: e, p: p, gapY: eCy + hullH / 2 + sea / 2 };
  }

  // ---------- общие куски ----------

  function hud(S, o) {
    var st = o.state;
    S.add('top', 'p.avatar', 'avatar', 8, 6, 44, 44, { side: 0, tap: 'hold', hit: [0, 0, 56, 56], text: 'Я', state: st, label: 'удержание: карта' });
    S.add('top', 'p.bar', 'bar', 58, 9, 104, 16, { side: 0, value: o.pHull, state: st, label: 'корпус' });
    S.add('top', 'p.crew', 'crew', 58, 30, 56, 18, { side: 0, text: String(o.pCrew), state: st });
    S.add('top', 'vs', 'vs', 163.5, 4, 48, 26, { text: 'VS', state: st });
    S.add('top', 'roundN', 'caption', 137.5, 32, 100, 18, { text: 'Round ' + o.round + '/3', state: st });
    S.add('top', 'e.avatar', 'avatar', 323, 6, 44, 44, { side: 1, tap: 'hold', hit: [319, 0, 56, 56], text: 'Б', state: st });
    S.add('top', 'e.bar', 'bar', 213, 9, 104, 16, { side: 1, value: o.eHull, mirror: true, state: st });
    S.add('top', 'e.crew', 'crew', 261, 30, 56, 18, { side: 1, text: String(o.eCrew), mirror: true, state: st });
    if (o.eReady) S.add('top', 'e.ready', 'check', 351, 0, 20, 20, {});
    if (o.cards) {
      S.add('top', 'p.card', 'cardIcon', 38, 36, 18, 18, { rarity: 1 });
      S.add('top', 'e.card', 'cardIcon', 319, 36, 18, 18, { rarity: 0 });
    }
  }

  function controls(S, o) {
    var fight = o.phase === 'battle', cards = o.phase === 'cards', st = o.state;
    S.add('bot', 'coins', 'coins', 127.5, 2, 120, 28, { text: String(o.coins), state: st, label: 'дублоны' });
    S.add('bot', 'income', 'tag', 251.5, 5, 46, 22, { text: '+' + o.income, state: o.incomeHot ? 'hot' : st, label: '«+X»' });
    S.add('bot', 'hire', 'button', 117.5, 38, 140, 64, {
      text: 'Hire', sub: String(o.price), tap: 'tap', state: (fight || cards) ? 'off' : st, label: fight || cards ? 'Hire неактивна' : 'Hire, при драге Reroll'
    });
    S.add('bot', 'ring', 'ring', 286, 33, 74, 74, { value: o.ring, state: o.ringState || st });
    S.add('bot', 'ready', 'roundBtn', 291, 38, 64, 64, {
      text: fight ? 'x2' : cards ? '10' : o.readyText, tap: cards ? undefined : 'tap', state: cards ? 'off' : (o.readyState || st),
      label: fight ? 'x2 + кольцо' : cards ? 'таймер карт' : 'Ready + кольцо таймера'
    });
  }

  function cta(S, text, o) {
    S.add('bot', 'cta', 'button', 77.5, 0, 220, 72, ext({ text: text, tap: 'tap', big: true, label: '«В бой» = «Продолжить»' }, o));
  }

  function tabbar(S, o) {
    var b = S.B.bot, vp = S.f.vp, y = b.y + 92 * b.s;
    S.abs('tabbar', 'tabbar', 0, y, vp.w, vp.h - y, { state: o && o.state });
    for (var i = 0; i < 5; i++) {
      S.add('bot', 'tab' + i, 'tab', i * 75, 92, 75, 64, { tap: 'tap', locked: i !== 2, text: i === 2 ? 'бой' : '?', state: o && o.state, group: 'tabs',
        label: i === 2 ? 'таб-бар 5 × 75' : undefined });
    }
  }

  // сплеш на весь экран с обрезкой по cover, низ затемняется под текст, логотип справа сверху
  var LOGO = { w: 140, h: 138, pad: 10 };   // art/cut/logo.png 426×420
  // полоса под полноэкранный арт: на телефоне весь экран, на широком окне колонка игры чуть шире 375 pt;
  // за её пределами лежит размытая копия того же арта
  function artBand(f) { var vp = f.vp, w = Math.min(vp.w, C.W * f.s * 1.25); return { x: (vp.w - w) / 2, y: 0, w: w, h: vp.h }; }
  function splash(S) {
    var vp = S.f.vp, y = S.B.bot.y - 80 * S.s, ab = artBand(S.f);
    S.abs('splash', 'art', ab.x, ab.y, ab.w, ab.h, { src: 'art/cut/splash.jpg' });
    S.abs('scrim', 'scrim', 0, y, vp.w, vp.h - y, {});
    S.add('top', 'logo', 'art', C.W - LOGO.pad - LOGO.w, 4, LOGO.w, LOGO.h, { src: 'art/cut/logo.png', label: 'логотип' });
  }

  var UNITS = [{ t: 'g', name: 'Канонир' }, { t: 's', name: 'Стрелок' }, { t: 'b', name: 'Абордажник' }];
  var CARD = { w: 72, h: 100, gap: 8, y: 104 };   // y в поле: центр карточек на центре парусов на SE

  // главный: арт art/cut/main_bg.jpg (1080×1920) по cover, поверх паруса три карточки юнитов.
  // Парус в арте не по центру: если арт шире экрана, сдвигаем его, чтобы парус встал по центру.
  var MAIN_ART = { w: 1080, h: 1920, sail: { cx: 585, cy: 890, w: 350, h: 360 } };
  function mainArtRect(f) {
    var A = MAIN_ART, ab = artBand(f), sc = Math.max(ab.w / A.w, ab.h / A.h), w = A.w * sc, h = A.h * sc;
    var x = Math.max(ab.x + ab.w - w, Math.min(ab.x, ab.x + ab.w / 2 - A.sail.cx * sc)), y = (ab.h - h) / 2;
    return { x: x, y: y, w: w, h: h, sc: sc, sx: x + A.sail.cx * sc, sy: y + A.sail.cy * sc };
  }
  function mainScreen(S, o) {
    o = o || {};
    var vp = S.f.vp, A = mainArtRect(S.f); void vp;
    S.abs('mainArt', 'art', A.x, A.y, A.w, A.h, { src: 'art/cut/main_bg.jpg', label: 'арт главного' });
    S.abs('sails', 'zone', A.sx - MAIN_ART.sail.w * A.sc / 2, A.sy - MAIN_ART.sail.h * A.sc / 2, MAIN_ART.sail.w * A.sc, MAIN_ART.sail.h * A.sc, { label: 'парус' });
    var cw = CARD.w * S.s, ch = CARD.h * S.s, gp = CARD.gap * S.s, cx0 = A.sx - (3 * cw + 2 * gp) / 2;
    UNITS.forEach(function (u, i) {
      S.abs('card.' + u.t, 'unitCard', cx0 + i * (cw + gp), A.sy - ch / 2, cw, ch, {
        utype: u.t, text: u.name, tap: 'tap', group: 'unitCards', state: o.cardState,
        label: i === 0 ? 'карточки 72×100 по центру паруса' : undefined
      });
    });
    S.add('top', 'gold', 'counter', 12, 8, 128, 36, { icon: 'gold', text: o.gold || '1 250', state: o.topState, label: 'золото' });
    S.add('top', 'trophies', 'counter', 235, 8, 128, 36, { icon: 'trophy', text: o.trophies || '320', state: o.topState, label: 'кубки' });
    cta(S, 'В бой', { state: o.ctaState });
    tabbar(S, { state: o.state });
  }

  // ---------- вход в уровень: таймлайн ----------
  var ENTER = { ms: 3400, still: 1100, cloudsEnd: 900, zoomFrom: 0.3, zoomStart: 300, zoomEnd: 2300,
    travel: 320, travelEnd: 2300, hudFrom: 1900, hudTo: 2500, bannerFrom: 2500, bannerTo: 3400 };
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function easeInOut(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function easeOut(x) { return 1 - Math.pow(1 - x, 3); }
  var CLOUDS = [[0.5, 0.45, 1.1], [0.2, 0.25, 0.8], [0.82, 0.3, 0.85], [0.15, 0.7, 0.9], [0.85, 0.72, 0.8], [0.5, 0.12, 0.7], [0.5, 0.88, 0.75]];

  function enterScene(S, t) {
    var E = ENTER, vp = S.f.vp, s = S.s;
    var k = E.zoomFrom + (1 - E.zoomFrom) * easeInOut(clamp01((t - E.zoomStart) / (E.zoomEnd - E.zoomStart)));
    var dx = E.travel * (1 - easeOut(clamp01(t / E.travelEnd)));
    var ui = clamp01((t - E.hudFrom) / (E.hudTo - E.hudFrom));
    var live = t >= E.zoomEnd;

    hud(S, { round: 1, pHull: 1, eHull: 1, pCrew: 0, eCrew: 0 });
    controls(S, { phase: 'prep', coins: 45, income: 50, price: 10, readyText: '0/1', ring: 1 });
    S.els.forEach(function (e) { e.fade = ui; if (!live) e.tap = undefined; });

    var G = C.SHIP, kk = (G.rows + 2 * G.gun + 2 * G.barrel) * Math.cos((C.TILT || 0) * Math.PI / 180), ce = C.CELL_PREP * C.ENEMY_PREP, cp = C.CELL_PREP;
    var eT = kk * ce, pT = kk * cp, y0 = (C.FIELD_H - eT - C.WATER_PREP - pT) / 2, fc = C.FIELD_H / 2;
    var eCy = y0 + eT / 2, pCy = y0 + eT + C.WATER_PREP + pT / 2;
    function cam(x, y) { return [187.5 + (x - 187.5) * k, fc + (y - fc) * k]; }
    var n0 = S.els.length;
    if (k < 0.999) {
      var tl = cam(0, 0), br = cam(375, C.FIELD_H);
      S.add('field', 'camFrame', 'camframe', tl[0], tl[1], br[0] - tl[0], br[1] - tl[1], { label: 'кадр подготовки, камера ' + k.toFixed(2) });
    }
    var ec = cam(187.5 + dx, eCy), pc = cam(187.5 - dx, pCy);
    var e = ship(S, 'field', { id: 'e', side: 1, cell: ce * k, cx: ec[0], cy: ec[1], nose: -1, face: 1, tap: live ? 'hold' : undefined, kegs: [2, 5, 8, 11] });
    var p = ship(S, 'field', { id: 'p', side: 0, cell: cp * k, cx: pc[0], cy: pc[1], nose: 1, face: -1, tap: live ? 'drag' : undefined, kegs: [2, 5, 8, 11],
      gridLabel: dx > 1 ? 'плывут навстречу' : undefined });
    S.els.slice(n0).forEach(function (el) { if (el.kind === 'kegBadge') el.fade = ui; });
    if (dx > 4) {
      S.arrow('eMove', S.pt('field', e.hx - 4, e.gy + e.gh / 2), S.pt('field', e.hx - 4 - 40 * k, e.gy + e.gh / 2), {});
      S.arrow('pMove', S.pt('field', p.hx + p.hw + 4, p.gy + p.gh / 2), S.pt('field', p.hx + p.hw + 4 + 40 * k, p.gy + p.gh / 2), {});
      S.arrow('eWake', S.pt('field', e.hx + e.hw + 2, e.gy + e.gh / 2), S.pt('field', e.hx + e.hw + 2 + 60 * k, e.gy + e.gh / 2), { coin: true, label: 'след' });
      S.arrow('pWake', S.pt('field', p.hx - 2, p.gy + p.gh / 2), S.pt('field', p.hx - 2 - 60 * k, p.gy + p.gh / 2), { coin: true });
    }

    var pc1 = clamp01(t / E.cloudsEnd);
    if (pc1 < 1) {
      S.abs('fog', 'fog', 0, 0, vp.w, vp.h, { fade: clamp01(1 - pc1 * 2.2) });
      var spread = 1 + 1.8 * pc1 * pc1, grow = 1 + 1.4 * pc1;
      CLOUDS.forEach(function (c, i) {
        var cx = vp.w / 2 + (c[0] - 0.5) * vp.w * spread, cy = vp.h / 2 + (c[1] - 0.5) * vp.h * spread;
        var w = 300 * c[2] * grow * s, h = 190 * c[2] * grow * s;
        S.abs('cloud' + i, 'cloud', cx - w / 2, cy - h / 2, w, h, { fade: 1 - pc1 * pc1, label: i === 0 ? 'пролёт сквозь облака' : undefined });
      });
    }
    if (t >= E.bannerFrom) {
      var gapY = y0 + eT + C.WATER_PREP / 2;
      S.add('field', 'banner', 'banner', 0, gapY - 30, 375, 60, { text: 'Раунд 1/3', label: 'баннер 0,9 с', fade: clamp01((t - E.bannerFrom) / 150) });
    }
  }

  // ---------- экраны лупа (таблица из ГДД) ----------

  var SAMPLE_P = { 0: { t: 'g', r: 1, hp: 0.9 }, 6: { t: 'g', r: 1, hp: 0.6 }, 9: { t: 'b', r: 1, hp: 1 } };
  var SAMPLE_E = { 1: { t: 's', r: 2, hp: 0.8 }, 4: { t: 'b', r: 1, hp: 0.5 }, 10: { t: 'g', r: 1, hp: 1 } };

  var SCREENS = [
    { id: 'load', name: 'Загрузка', mode: 'meta', dur: 'до конца загрузки', pre: true,
      gdd: 'Сплеш на весь экран при запуске игры. Это вне лупа, в таблице экранов ГДД его нет.',
      notes: 'Логотип справа сверху на всех трёх экранах со сплешем: загрузка, поиск, «Противник найден». Полоска загрузки внизу, там же, где потом текст поиска.',
      build: function (S) {
        splash(S);
        S.add('bot', 'loadText', 'caption', 37.5, 4, 300, 22, { text: 'Загрузка' });
        S.add('bot', 'loadBar', 'progress', 67.5, 36, 240, 10, { value: 0.45 });
      } },

    { id: 'main', name: 'Главный', mode: 'meta', dur: 'до нажатия',
      gdd: 'Арт корабля, поверх парусов фронтально три карточки юнитов с портретом и именем. Сверху счётчики золота и кубков, внизу «В бой» и таб-бар из 5 табов: активен центральный, на остальных замки с «?».',
      notes: 'Фон это арт art/cut/main_bg.jpg по cover. Карточки 72×100 по центру паруса; парус уже трёх карточек, поэтому карточки выходят за него по бокам. Если арт шире экрана, он сдвинут так, чтобы парус стоял по центру. Без уровней и цифр: у команды меты нет. CTA 220×72 там же, где «Продолжить» на итогах.',
      build: function (S) { mainScreen(S); } },

    { id: 'search', name: 'Поиск', mode: 'meta', dur: '2-3 с',
      gdd: 'Сплеш на весь экран, внизу «Поиск противника», время идёт вверх, кнопка «Отмена». Арт ничем не закрыт.',
      notes: 'Текст и «Отмена» в нижней полосе поверх тёмного градиента. «Отмена» ниже места «В бой» и с ним не пересекается, плюс 0,4 с блокировки ввода: двойной тап по «В бой» не отменит поиск.',
      build: function (S) {
        splash(S);
        S.add('bot', 'searchTitle', 'caption', 37.5, 0, 300, 26, { text: 'Поиск противника', big: true, label: 'поверх низа арта' });
        S.add('bot', 'searchTime', 'timer', 37.5, 30, 300, 44, { text: '0:02' });
        S.add('bot', 'cancel', 'button', 107.5, 96, 160, 52, { text: 'Отмена', tap: 'tap', secondary: true, label: 'ниже места «В бой»' });
      } },

    { id: 'vs', name: 'Противник найден', mode: 'meta', dur: '1,5 с',
      gdd: 'Тот же сплеш, внизу только надпись «Противник найден». Имени, кубков, VS и полоски загрузки нет.',
      notes: 'Надпись встаёт на место текста поиска, таймер и «Отмена» уходят. Через 1,5 с вход в уровень.',
      build: function (S) {
        splash(S);
        S.add('bot', 'foundTitle', 'caption', 37.5, 14, 300, 40, { text: 'Противник найден', huge: true, label: 'на месте текста поиска' });
      } },

    { id: 'enter', name: 'Вход в уровень', mode: 'game', dur: '2,5 с и 0,9 с', anim: ENTER,
      gdd: 'Камера пролетает сквозь облака. Под ними оба корабля мелкие и далеко друг от друга, камера приближается, а корабли сами плывут навстречу и встают на места. Затем баннер «Раунд 1/3».',
      notes: '0-0,9 с облака разлетаются от центра. 0,3-2,3 с камера приближается с 0,3 до 1. 0-2,3 с корабли сходятся: соперник справа налево, игрок слева направо, оба носом вперёд, быстро в начале и мягко в конце. 1,9-2,5 с проявляются HUD, кнопки и бейджи бочек: на мелком масштабе бейджи были бы крупнее самих бочек. Касания включаются с 2,3 с, под баннером ввод открыт.',
      build: function (S, t) { enterScene(S, t == null ? ENTER.still : t); } },

    { id: 'prep', name: 'Подготовка', mode: 'game', dur: '30 или 25 с',
      gdd: 'Найм, мерж, Reroll, кольцо таймера на Ready, подсказка мержа.',
      notes: 'Сетка по центру экрана, нос торчит вправо. Пушки на границах колонок: каждая касается двух клеток крайнего ряда. Бейджи 19 pt у обоих кораблей. Слева от Hire пусто.',
      build: function (S) {
        hud(S, { round: 1, pHull: 1, eHull: 1, pCrew: 3, eCrew: 3, eReady: true });
        var F = prepFrame(S,
          { units: { 1: { t: 's', r: 2 }, 4: { t: 'b', r: 1 }, 10: { t: 'g', r: 1 } }, kegs: [2, 7, 11] },
          { units: { 0: { t: 'g', r: 1 }, 6: { t: 'g', r: 1 }, 9: { t: 'b', r: 1 } }, kegs: [3, 5, 10] });
        var e = F.e, pad = 4;
        S.add('field', 'e.readyFrame', 'readyFrame', e.hx - pad, e.hy - e.bar - pad, e.hw + 2 * pad, e.hh + 2 * e.bar + 2 * pad, { label: 'рамка готовности' });
        S.arrow('hint', F.p.cellC(6), F.p.cellC(0), { hand: true, label: 'подсказка мержа' });
        controls(S, { phase: 'prep', coins: 10, income: 50, price: 25, readyText: '✓', ring: 0.55 });
      } },

    { id: 'battle', name: 'Бой', mode: 'game', dur: '0,7 с и 20 с',
      gdd: 'Камера переходит к кадру боя, баннер «Бой!», появляется x2.',
      notes: 'Клетка 48, море между корпусами 28. Центр сетки игрока почти там же, где в подготовке: камера в основном меняет масштаб. Hire серая, на месте Ready стоит x2.',
      build: function (S) {
        hud(S, { round: 1, pHull: 0.82, eHull: 0.64, pCrew: 3, eCrew: 3 });
        var F = battleFrame(S, C.SEA_BATTLE,
          { units: SAMPLE_E, kegs: [2, 7, 11], cannons: ['ok', 'smoking', 'broken', 'ok', 'ok', 'ok'] },
          { units: SAMPLE_P, kegs: [3, 5, 10] });
        S.arrow('shot', F.p.cannonC(0, 0), S.pt('field', F.e.gx + F.e.gw * 0.7, F.e.gy + F.e.gh * 0.85), { shot: true, label: 'ядро' });
        S.arrow('eMove', S.pt('field', F.e.hx - 4, F.e.gy + 8), S.pt('field', F.e.hx - 30, F.e.gy + 8), {});
        S.arrow('pMove', S.pt('field', F.p.hx + F.p.hw + 4, F.p.gy + F.p.gh - 8), S.pt('field', F.p.hx + F.p.hw + 30, F.p.gy + F.p.gh - 8), {});
        S.add('field', 'banner', 'banner', 0, F.gapY - 30, 375, 60, { text: 'Бой!', label: 'баннер 0,7 с' });
        controls(S, { phase: 'battle', coins: 10, income: 50, price: 10, ring: 0.7 });
      } },

    { id: 'roundEnd', name: 'Конец раунда', mode: 'game', dur: 'до 1,5 с и 0,9 с',
      gdd: 'Монеты улетают, баннер следующего раунда, камера возвращается к подготовке. Шаги 5-7 идут дважды.',
      notes: 'Монеты летят в то число, которое меняют: игроку в счётчик дублонов, сопернику в аватар. Метка «+X» подсвечена.',
      build: function (S) {
        hud(S, { round: 1, pHull: 0.71, eHull: 0.52, pCrew: 2, eCrew: 2 });
        var F = battleFrame(S, C.SEA_BATTLE,
          { units: { 1: { t: 's', r: 2, hp: 0.4 }, 4: { dead: true }, 10: { t: 'g', r: 1, hp: 0.7 } }, kegs: [2, 7, 11], cannons: ['ok', 'smoking', 'broken', 'ok', 'ok', 'ok'] },
          { units: { 0: { dead: true }, 6: { t: 'g', r: 1, hp: 0.3 }, 9: { t: 'b', r: 1, hp: 0.8 } }, kegs: [3, 5, 10] });
        var ec = F.e.cellC(4), pc = F.p.cellC(0), s = S.s;
        S.abs('coinsE', 'coinPile', ec[0] - 14 * s, ec[1] + 6 * s, 28 * s, 10 * s, {});
        S.abs('coinsP', 'coinPile', pc[0] - 14 * s, pc[1] + 6 * s, 28 * s, 10 * s, {});
        S.add('field', 'banner', 'banner', 0, F.gapY - 30, 375, 60, { text: 'Раунд 2/3', label: 'баннер следующего раунда' });
        controls(S, { phase: 'battle', coins: 18, income: 58, incomeHot: true, price: 10, ring: 0 });
        var coins = S.els.filter(function (e) { return e.id === 'coins'; })[0];
        var ea = S.els.filter(function (e) { return e.id === 'e.avatar'; })[0];
        S.arrow('coinFly', [ec[0], ec[1] + 10 * s], [coins.x + coins.w / 2, coins.y], { coin: true, label: 'монеты в счётчик' });
        S.arrow('coinFlyE', [pc[0], pc[1] + 6 * s], [ea.x + ea.w / 2, ea.y + ea.h], { coin: true, label: 'сопернику в аватар' });
      } },

    { id: 'cards', name: 'Карты', mode: 'game', dur: '10 с и 25 с',
      gdd: 'Выбор усиления перед абордажем, потом подготовка 3-го раунда.',
      notes: 'Таймер выбора живёт в том же кольце справа, кнопка неактивна. Карты 108×156, порядок типов фиксирован: Сундук, Ром, Перевязки.',
      build: function (S) {
        hud(S, { round: 3, pHull: 0.71, eHull: 0.52, pCrew: 2, eCrew: 2 });
        var F = prepFrame(S,
          { units: { 1: { t: 's', r: 2 }, 10: { t: 'g', r: 1 } }, kegs: [2, 7, 11], cannons: ['ok', 'smoking', 'broken', 'ok', 'ok', 'ok'], tap: undefined },
          { units: { 6: { t: 'g', r: 1 }, 9: { t: 'b', r: 1 } }, kegs: [3, 5, 10], tap: undefined });
        var fb = S.B.field;
        S.abs('dim', 'dim', 0, fb.y - 6 * S.s, S.f.vp.w, fb.h * S.s + 12 * S.s, {});
        S.add('field', 'cardsTitle', 'caption', 37.5, F.gapY - 118, 300, 28, { text: 'Усиление перед абордажем', big: true, light: true });
        var cards = [['Сундук', '+25', 'дублонов', 0], ['Ром', '+20%', 'урон в абордаже', 1], ['Перевязки', '25%', 'лечение', 0]];
        for (var i = 0; i < 3; i++) {
          S.add('field', 'card' + i, 'card', 15.5 + i * 118, F.gapY - 78, 108, 156, {
            text: cards[i][0], sub: cards[i][1], sub2: cards[i][2], rarity: cards[i][3], tap: 'tap', group: 'cards', label: i === 0 ? 'карта 108×156' : undefined
          });
        }
        controls(S, { phase: 'cards', coins: 68, income: 50, price: 10, ring: 0.8 });
      } },

    { id: 'boarding', name: 'Абордаж', mode: 'game', dur: '1,5 с и до конца',
      gdd: 'Заставка: летят кошки, корабли стягиваются бортами, перетягивается полоска силы команд. Потом бой до последнего.',
      notes: 'Борта стянуты, между корпусами 8 pt, обращённые пушки откачены. Полоска силы 300×28 на шве, только в заставке. Иконки карт у аватаров.',
      build: function (S) {
        hud(S, { round: 3, pHull: 0.71, eHull: 0.52, pCrew: 4, eCrew: 3, cards: true });
        var F = battleFrame(S, C.SEA_BOARD,
          { units: { 1: { t: 's', r: 2, hp: 0.9 }, 4: { t: 'g', r: 1, hp: 1 }, 10: { t: 'g', r: 1, hp: 0.6 } }, kegs: [], board0: 'retract', cannons: ['ok', 'smoking', 'broken', 'ok', 'ok', 'ok'] },
          { units: { 1: { t: 'b', r: 2, hp: 1 }, 2: { t: 'b', r: 1, hp: 1 }, 6: { t: 'g', r: 2, hp: 0.8 }, 9: { t: 's', r: 1, hp: 1 } }, kegs: [], board0: 'retract' });
        [0.2, 0.5, 0.8].forEach(function (t, i) {
          var x = F.p.gx + F.p.gw * t;
          S.arrow('hook' + i, S.pt('field', x, F.p.hy - 2), S.pt('field', x, F.e.hy + F.e.hh - 4), { hook: true, label: i === 0 ? 'кошки' : undefined });
        });
        S.add('field', 'power', 'power', 37.5, F.gapY - 14, 300, 28, { value: 0.56, text: '56 : 44', label: 'сила команд, 1,5 с' });
        S.arrow('run', F.p.cellC(1), F.e.cellC(1), { label: 'атакует сильнейший, бой на палубе защитника' });
        controls(S, { phase: 'battle', coins: 43, income: 0, price: 10, ring: 0.4 });
      } },

    { id: 'results', name: 'Итоги', mode: 'meta', dur: '1,2 с, потом до нажатия',
      gdd: 'Победа: фанфары, конфетти, награда с разбивкой. Поражение: награда меньше. В обоих случаях строка причины и подсказка. «Продолжить» появляется после докрутки награды там же, где на главном «В бой».',
      notes: 'Счётчики сверху скрыты, чтобы на возврате золото прилетело в них заметно. Разбивка награды строками, причина одной строкой.',
      build: function (S) {
        var cy = S.B.field.h / 2;
        S.add('field', 'victory', 'banner', 37.5, cy - 204, 300, 104, { text: 'Победа', big: true, label: 'плашка по пропорциям спрайта 256×124' });
        S.add('field', 'reward', 'reward', 37.5, cy - 92, 300, 124, {
          lines: [['Добыча', '+18'], ['За победу', '+45'], ['Досрочная победа', '+23'], ['Кубки', '+24']], label: 'награда с разбивкой, золото слитками'
        });
        S.add('field', 'reason', 'caption', 27.5, cy + 44, 320, 28, { text: 'Потопили корабль во 2-м раунде', label: 'причина' });
        S.add('field', 'hint', 'note', 27.5, cy + 80, 320, 48, { text: 'Канонир рядом с пушкой ускоряет её на 30% за ранг', label: 'подсказка' });
        cta(S, 'Продолжить');
      } },

    { id: 'return', name: 'Возврат', mode: 'meta', dur: 'около 1 с',
      gdd: 'Золото летит в счётчик главного, кубки докручиваются.',
      notes: 'Тот же главный экран. Золото летит из центра, где была награда, кубки докручиваются на месте.',
      build: function (S) {
        mainScreen(S, { gold: '1 370', trophies: '344', topState: 'hot', ctaState: 'dim' });
        var g = S.els.filter(function (e) { return e.id === 'gold'; })[0];
        var t = S.els.filter(function (e) { return e.id === 'trophies'; })[0];
        var from = S.pt('field', 187.5, S.B.field.h / 2 - 40);
        S.arrow('goldFly', from, [g.x + g.w / 2, g.y + g.h], { coin: true, label: 'золото +120' });
        S.arrow('trophyFly', [from[0] + 20, from[1]], [t.x + t.w / 2, t.y + t.h], { coin: true, label: 'кубки +24' });
      } }
  ];
  var BY_ID = {};
  var PRE = SCREENS.filter(function (d) { return d.pre; }).length;
  SCREENS.forEach(function (d, i) { d.n = i + 1 - PRE; BY_ID[d.id] = d; });
  var LOOP = SCREENS.length - PRE;

  // ---------- проверки ----------

  function touchCheck(els) {
    var t = els.filter(function (e) { return e.tap && e.state !== 'off' && e.state !== 'hidden' && !e.ghost && e.fade !== 0; });
    var out = t.map(function (e) {
      var r = e.hit || e;
      return { id: e.id, group: e.group, w: r.w, h: r.h, ok: r.w >= C.TOUCH - 0.05 && r.h >= C.TOUCH - 0.05, overlap: [] };
    });
    for (var i = 0; i < t.length; i++) for (var j = i + 1; j < t.length; j++) {
      var a = t[i].hit || t[i], b = t[j].hit || t[j];
      var ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 0.5 && oy > 0.5) { out[i].overlap.push(t[j].id); out[j].overlap.push(t[i].id); }
    }
    return out;
  }

  function build(id, vp, t) {
    var def = BY_ID[id], f = frame(vp), S = Scene(f, def.mode);
    def.build(S, t);
    return { id: id, def: def, f: f, bands: S.B, els: S.els, touch: touchCheck(S.els) };
  }

  TPS.LAYOUT = { C: C, DEVICES: DEVICES, SCREENS: SCREENS, LOOP: LOOP, frame: frame, bands: bands, build: build, touchCheck: touchCheck };
})(typeof window !== 'undefined' ? window : globalThis);
