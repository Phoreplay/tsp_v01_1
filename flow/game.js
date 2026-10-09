/* TPS v0 · flow/game.js
   Флоу лупа целиком: загрузка, главный, поиск, «Противник найден», вход, три раунда, карты, абордаж,
   итоги, возврат. Симуляция в flow/sim.js, бот в flow/bot.js, 3D-поле в ship/field.js.
   UI это DOM поверх поля, прямоугольники берутся из shared/layout.js. */
(function () {
  'use strict';
  var L = TPS.LAYOUT, B = TPS.BAL, SFX = TPS.SFX, THREE = window.THREE;
  var $ = function (id) { return document.getElementById(id); };
  var app = $('app'), stage = $('stage'), ui = $('ui');
  var F = TPS.FIELD.create(stage, {});
  var SIDE = ['p', 'e'];
  // карты абордажа: имя, крупное число, строка эффекта, цвет окна картинки, временная иконка кодом до прихода арта
  function svgUri(svg) { return "url('data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' + svg + '</svg>') + "')"; }
  var CARD_UI = {
    curse:  { name: 'Проклятие', big: function (C, r) { return C.curse.dps[r] + '/с'; }, line: 'удар вешает метку, до трёх', bg: ['#2f8a4e', '#0f2a18'], fx: 0x6dff8e,
      icon: '<path d="M14 40c-6-4-6-14 2-17 1-9 12-13 18-7 7-4 16 1 15 9 7 2 8 12 1 15-2 7-10 9-15 6-6 4-15 2-21-6z" fill="#5BE37A" stroke="#123d22" stroke-width="4" stroke-linejoin="round"/><circle cx="25" cy="33" r="4.5" fill="#123d22"/><circle cx="39" cy="33" r="4.5" fill="#123d22"/><path d="M27 43h10" stroke="#123d22" stroke-width="4" stroke-linecap="round"/>' },
    storm:  { name: 'Шторм', big: function (C, r) { return '×' + C.storm.jumps[r]; }, line: 'молния бьёт соседей цели', bg: ['#3a66c8', '#0e1b3d'], fx: 0x9fdcff,
      icon: '<path d="M36 4 14 36h14l-6 24 28-34H35z" fill="#FFF07A" stroke="#1b2a5a" stroke-width="4" stroke-linejoin="round"/>' },
    healer: { name: 'Знахарь', big: function (C, r) { return Math.round(C.healer.pct[r] * 100) + '%'; }, line: 'лечит раненого раз в 2 с', bg: ['#9be8b0', '#3f9e5e'], fx: 0x7dff9b,
      icon: '<path d="M24 8h16v16h16v16H40v16H24V40H8V24h16z" fill="#6BF08A" stroke="#14532a" stroke-width="4" stroke-linejoin="round"/><path d="M28 13v8" stroke="#fff" stroke-width="4" stroke-linecap="round"/>' },
    powder: { name: 'Порох', big: function (C, r) { return '' + C.powder.dmg[r]; }, line: 'убитый враг взрывается', bg: ['#ffb35a', '#b8461a'], fx: 0xffa040,
      icon: '<path d="M32 2l5 12 12-6-4 13 13 2-11 8 9 9-13-1 1 13-10-9-7 12-3-13-12 6 6-12-12-4 12-6-8-10 13 3z" fill="#FFB23A" stroke="#5a2207" stroke-width="3" stroke-linejoin="round"/><rect x="20" y="24" width="24" height="26" rx="7" fill="#3a2a22" stroke="#120a06" stroke-width="3"/><path d="M20 31h24M20 43h24" stroke="#8a6a4a" stroke-width="3"/>' },
    rum:    { name: 'Ром ярости', big: function (C, r) { return '+' + Math.round(C.rum.haste[r] * 100) + '%'; }, line: 'удары чаще первые 6 с', bg: ['#d8402f', '#4f0d0d'], fx: 0xff6a3a,
      icon: '<path d="M32 4c6 8 14 12 10 22 4-2 6-6 6-6 4 10-2 22-16 24C18 42 14 30 18 22c2 4 4 6 6 6-4-10 4-16 8-24z" fill="#FF6A3A" stroke="#5a1407" stroke-width="3" stroke-linejoin="round"/><path d="M27 30h10v6l4 6v16H23V42l4-6z" fill="#B5652A" stroke="#2a1206" stroke-width="3" stroke-linejoin="round"/>' },
    bubble: { name: 'Пузырь', big: function (C, r) { return '×' + C.bubble.charges[r]; }, line: 'гасит первые удары по бойцу', bg: ['#7fe3f2', '#1f7fa3'], fx: 0xa8eeff,
      icon: '<circle cx="32" cy="32" r="26" fill="rgba(140,230,255,.5)" stroke="#1b5f80" stroke-width="4"/><path d="M18 26a15 15 0 0 1 12-11" stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none"/><circle cx="42" cy="44" r="3" fill="#fff"/>' }
  };
  var RAR_NAME = ['обычная', 'редкая', 'эпическая'];
  // рамки карт art/sprites/card_frame_0..2.png: пропорции и места окна, ленты и нижней панели в долях рамки
  var CARD_FR = [
    { ar: 239 / 360, win: [0.18, 0.09, 0.82, 0.6], rib: [0.13, 0.535, 0.87, 0.65], pan: [0.15, 0.655, 0.85, 0.895] },
    { ar: 235 / 360, win: [0.17, 0.09, 0.83, 0.6], rib: [0.11, 0.536, 0.88, 0.65], pan: [0.14, 0.645, 0.86, 0.9] },
    { ar: 223 / 360, win: [0.18, 0.165, 0.82, 0.63], rib: [0.126, 0.564, 0.87, 0.669], pan: [0.145, 0.67, 0.85, 0.9] }
  ];
  function boxCss(q) { return 'left:' + (q[0] * 100) + '%;top:' + (q[1] * 100) + '%;width:' + ((q[2] - q[0]) * 100) + '%;height:' + ((q[3] - q[1]) * 100) + '%'; }
  // скрещённые сабли для кнопки «В бой»: рисуются кодом, обводка цветом чернил
  var SWORDS = '<svg class="swords" viewBox="0 0 64 64"><g fill="#2A0E05" stroke="#2A0E05" stroke-width="13" stroke-linecap="round"><path d="M10 8 L41 39"/><path d="M34 46 L48 32"/><path d="M42 40 L51 49"/><circle cx="53" cy="51" r="3"/><path d="M54 8 L23 39"/><path d="M30 46 L16 32"/><path d="M22 40 L13 49"/><circle cx="11" cy="51" r="3"/></g>' +
    '<g fill="none" stroke-linecap="round"><path d="M10 8 L41 39" stroke="#F4F7FA" stroke-width="7"/><path d="M34 46 L48 32" stroke="#FFC23A" stroke-width="6"/><path d="M42 40 L51 49" stroke="#9A5526" stroke-width="6"/><circle cx="53" cy="51" r="3" fill="#FFC23A" stroke="none"/><path d="M54 8 L23 39" stroke="#F4F7FA" stroke-width="7"/><path d="M30 46 L16 32" stroke="#FFC23A" stroke-width="6"/><path d="M22 40 L13 49" stroke="#9A5526" stroke-width="6"/><circle cx="11" cy="51" r="3" fill="#FFC23A" stroke="none"/></g></svg>';
  var meta = { gold: 1250, trophies: 320, matches: 0 };
  try { var ms = JSON.parse(localStorage.getItem('tps-meta') || 'null'); if (ms) meta = ms; } catch (e) {}
  function saveMeta() { try { localStorage.setItem('tps-meta', JSON.stringify(meta)); } catch (e) {} }
  // coinTone, finisher, hullStages, volley, celebrate: пункты сочности под тумблерами dev-панели
  var dev = { skipSearch: false, short: false, firstScript: true, seed: null, juice: 1.5, sound: true, time: 'auto', weather: 'auto', coinTone: true, finisher: true, hullStages: true, volley: true, celebrate: true, finisherPlus: true, angry: true };
  try { var ds = JSON.parse(localStorage.getItem('tps-dev2') || 'null'); if (ds) for (var k in ds) dev[k] = ds[k]; } catch (e) {}
  function saveDev() { try { localStorage.setItem('tps-dev2', JSON.stringify(dev)); } catch (e) {} }

  // ---------- DOM-конструктор ----------
  function el(cls, parent, html) { var d = document.createElement('div'); d.className = cls; if (html != null) d.innerHTML = html; (parent || ui).appendChild(d); return d; }
  function img(name, cls, parent) { var i = document.createElement('img'); i.src = 'art/sprites/' + name + (/\.\w+$/.test(name) ? '' : name.indexOf('portrait') === 0 ? '.jpg' : '.png'); i.className = cls || ''; i.draggable = false; (parent || ui).appendChild(i); return i; }
  function vp() { return { w: ui.clientWidth, h: ui.clientHeight, top: 0, bottom: 0 }; }
  var RECTS = {};
  function layout(screen) { var r = L.build(screen, vp()), m = {}; r.els.forEach(function (e) { m[e.id] = e; }); RECTS = m; RECTS._f = r.f; return m; }
  function put(node, r, pad) { if (!r) { node.style.display = 'none'; return; } pad = pad || 0; node.style.display = ''; node.style.left = (r.x - pad) + 'px'; node.style.top = (r.y - pad) + 'px'; node.style.width = (r.w + 2 * pad) + 'px'; node.style.height = (r.h + 2 * pad) + 'px'; }
  function s() { return (RECTS._f && RECTS._f.s) || 1; }
  // подгон шрифта: уменьшаем, пока текст не влезет в свой прямоугольник
  // текст не влезает в свой бокс: кегль уменьшается, пока не влезет. Ширину текста меряем через Range (у nowrap-текста
  // с overflow: visible scrollWidth переполнение не показывает); обводка (text-stroke) рисуется наружу и входит в запас.
  function fit(node, minPx) {
    node.style.fontSize = ''; var fs = parseFloat(getComputedStyle(node).fontSize), min = (minPx || 10) * s(), g = 60, pad = 3 * s(), rg = document.createRange();
    function over() { rg.selectNodeContents(node); return rg.getBoundingClientRect().width + pad > node.clientWidth + 0.5 || node.scrollHeight > node.clientHeight + 1; }
    while (g-- > 0 && fs > min && over()) { fs -= 0.5; node.style.fontSize = fs + 'px'; }
  }
  // подписи карточек: меряем реальную ширину текста (с учётом шрифта и увеличения текста на телефоне) и сжимаем масштабом,
  // один коэффициент на все три, по самой длинной; обводка 4 px входит в запас
  function fitNames() {
    var sps = V.units.map(function (u) { return u.querySelector('.nm span'); }), k = 1;
    sps.forEach(function (sp) { sp.style.transform = 'translateX(-50%)'; });
    sps.forEach(function (sp) { var w = sp.getBoundingClientRect().width + 4 * s(), av = sp.parentNode.clientWidth; if (w > 0 && av > 0) k = Math.min(k, av / w); });
    sps.forEach(function (sp) { sp.style.transform = 'translateX(-50%)' + (k < 1 ? ' scale(' + k.toFixed(3) + ')' : ''); });
  }
  // счётчик: число ужимается, пока плашка не перестанет переполняться
  function fitCounter(box) {
    var n = box.querySelector('.n'); if (!n) return; n.style.fontSize = '';
    var fs = parseFloat(getComputedStyle(n).fontSize), g = 60;
    while (g-- > 0 && fs > 9 * s() && box.scrollWidth > box.clientWidth + 1) { fs -= 0.5; n.style.fontSize = fs + 'px'; }
  }
  // подпись кнопки не должна упираться в борта: ужимаем шрифт, пока текст шире 74% лица кнопки
  function fitLbl(btn, k) {
    var l = btn.querySelector('.lbl'), f = btn.querySelector('.face'); if (!l || !f) return;
    l.style.fontSize = ''; var fs = parseFloat(getComputedStyle(l).fontSize), max = f.getBoundingClientRect().width * (k || 0.74), g = 40;
    while (g-- > 0 && fs > 12 && l.getBoundingClientRect().width > max) { fs -= 0.5; l.style.fontSize = fs + 'px'; }
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, dev.short ? ms / 2 : ms); }); }

  // ---------- элементы игрового HUD ----------
  var H = {};
  function buildHud() {
    H.layer = el('layer hud', ui);
    ['p', 'e'].forEach(function (sd) {
      H[sd + 'Av'] = el('avatar ' + sd, H.layer); img(sd === 'p' ? 'avatar_blue' : 'avatar_red', 'fill', H[sd + 'Av']); img(sd === 'p' ? 'ic_anchor' : 'ic_sabers', 'emb', H[sd + 'Av']);
      H[sd + 'Card'] = el('cardIcon', H[sd + 'Av']); H[sd + 'Card'].hidden = true;
      H[sd + 'Bar'] = el('bar ' + sd, H.layer, '<i class="trail"></i><i class="fill"></i><b>100%</b>');
      H[sd + 'Crew'] = el('crew ' + sd, H.layer); img('ic_crew', 'ic', H[sd + 'Crew']); H[sd + 'CrewN'] = el('n', H[sd + 'Crew'], '0');
    });
    H.eReady = el('readyCheck', H.layer, '✓'); H.eReady.hidden = true;
    H.vs = el('vs', H.layer); img('ic_shield', 'fill', H.vs); el('t', H.vs, 'VS');
    H.round = el('roundN txt', H.layer, 'Round 1/3');
    H.bot = el('layer bottomUi', ui);
    H.coins = el('coins', H.bot); img('ic_doubloon', 'ic', H.coins); H.coinsN = el('n', H.coins, '45');
    H.income = el('income', H.bot, '+50');
    H.hire = el('btn blue hireBtn', H.bot, '<i class="lip"></i><i class="face"></i><span class="lbl">Hire</span><span class="price"><img src="art/sprites/ic_doubloon.png"><b>10</b></span>');
    H.ready = el('roundBtn', H.bot, '<i class="rlip"></i><i class="rface"></i><svg class="ring" viewBox="0 0 100 100"><circle class="trk" cx="50" cy="50" r="46"/><circle class="arc" cx="50" cy="50" r="46" pathLength="100"/></svg><span class="lbl">0/3</span>');
    H.banner = el('banner', ui); H.banner.hidden = true;
    H.power = el('power', ui, '<i class="pf"></i><b>50 : 50</b>'); H.power.hidden = true;
    H.cards = el('layer cardsUi', ui); H.cards.hidden = true;
    H.cardsTitle = el('cardsTitle txt', H.cards, 'Усиление перед абордажем');
    H.cardBtns = [0, 1, 2].map(function (i) { var c = el('pickCard', H.cards); c.dataset.i = i; return c; });
    H.marks = el('layer marks', ui);
  }
  function placeHud(screen) {
    var R = layout(screen);
    ['p', 'e'].forEach(function (sd) { put(H[sd + 'Av'], R[sd + '.avatar']); put(H[sd + 'Bar'], R[sd + '.bar']); put(H[sd + 'Crew'], R[sd + '.crew']); });
    put(H.eReady, R['e.avatar'] ? { x: R['e.avatar'].x + R['e.avatar'].w - 14 * s(), y: R['e.avatar'].y - 6 * s(), w: 20 * s(), h: 20 * s() } : null);
    put(H.vs, R.vs, 4 * s()); put(H.round, R.roundN); put(H.coins, R.coins); put(H.income, R.income); put(H.hire, R.hire); put(H.ready, R.ring);
    if (R.banner) put(H.banner, R.banner); else put(H.banner, { x: 0, y: ui.clientHeight / 2 - 30 * s(), w: ui.clientWidth, h: 60 * s() });
    ui.style.setProperty('--s', s());
  }
  function setBar(sd, v) {
    var b = H[sd + 'Bar']; v = Math.max(0, Math.min(1, v));
    b.querySelector('.fill').style.width = (v * 100) + '%'; b.querySelector('b').textContent = Math.round(v * 100) + '%';
    var tr = b.querySelector('.trail'); clearTimeout(b._t); b._t = setTimeout(function () { tr.style.width = (v * 100) + '%'; }, 450);
    if (v >= 0.999) tr.style.width = '100%';
  }
  var shownCoins = 0, coinAnim = 0;
  function setCoins(v, instant) {
    cancelAnimationFrame(coinAnim);
    if (instant) { shownCoins = v; H.coinsN.textContent = v; return; }
    var a = shownCoins, t0 = performance.now();
    (function step() { var u = Math.min(1, (performance.now() - t0) / 350); shownCoins = Math.round(a + (v - a) * u); H.coinsN.textContent = shownCoins; if (u < 1) coinAnim = requestAnimationFrame(step); })();
  }
  function setRing(v, warn) {
    H.ready.querySelector('.arc').style.strokeDasharray = (v * 100) + ' 100';
    H.ready.classList.toggle('warn', !!warn);
  }
  // акцент кнопки: блик, ореол и искры; разметка добавляется один раз
  function hot(node, on) {
    if (on && !node.querySelector('.shine') && node.classList.contains('btn')) {
      var sh = document.createElement('i'); sh.className = 'shine'; node.insertBefore(sh, node.querySelector('.lbl'));
      for (var i = 0; i < 3; i++) { var k = document.createElement('i'); k.className = 'spk s' + i; node.appendChild(k); }
    }
    node.classList.toggle('hot', !!on);
  }
  function setReadyLbl(t) { var l = H.ready.querySelector('.lbl'); l.classList.remove('word'); l.textContent = t; }
  function wiggle(node) { node.classList.remove('no'); void node.offsetWidth; node.classList.add('no'); }
  // счётчик раундов: в 1-м и 2-м после «/3» сабли, третий раунд это абордаж; в 3-м надпись «Абордаж»
  function setRoundLbl(round) {
    H.round.innerHTML = round < 3 ? 'Round ' + round + '/3 <img class="rsab" src="art/sprites/ic_tab_battle.svg" alt="">' : '<img class="rsab" src="art/sprites/ic_tab_battle.svg" alt=""> Абордаж';
  }
  function banner(text, ms, big) {
    H.banner.hidden = false; H.banner.textContent = text; H.banner.classList.toggle('big', !!big); H.banner.classList.toggle('board', big === 'board');
    H.banner.classList.remove('in'); void H.banner.offsetWidth; H.banner.classList.add('in'); SFX.banner();
    return wait(ms || 900).then(function () { H.banner.hidden = true; });
  }
  function floatAt(text, x, y, cls) {
    var d = el('float ' + (cls || ''), ui, text); d.style.left = x + 'px'; d.style.top = y + 'px';
    setTimeout(function () { d.remove(); }, 900);
  }
  function floatWorld(text, side, cell, cls) { var p = F.toScreen(F.worldOf(side, cell, 0.9)); floatAt(text, p.x, p.y, cls); }
  // Метка «+X» у счётчика дублонов живёт только там, где у неё есть смысл. Появляется в бою 1-го и 2-го раунда с базовым
  // доходом следующей подготовки, растёт, когда в неё влетают монеты за убийства, а в начале следующей подготовки
  // сама улетает в счётчик. В подготовке её нет: там деньги тратят сейчас. После 2-го боя дохода больше не будет, поэтому
  // в 3-м раунде и абордаже её тоже нет.
  var pendingIncome = null, deferIncome = false;
  function setIncome(v) { H.income.textContent = '+' + v; H.income.classList.remove('pop'); void H.income.offsetWidth; H.income.classList.add('pop'); }
  function showIncome(on) { H.income.classList.toggle('off', !on); }
  function flyIncome() {
    if (H.income.classList.contains('off')) return false;
    var a = H.income.getBoundingClientRect(), b = H.coins.getBoundingClientRect(), u = ui.getBoundingClientRect();
    var g = el('income incomeFly', ui, H.income.textContent);
    g.style.left = (a.left - u.left) + 'px'; g.style.top = (a.top - u.top) + 'px'; g.style.width = a.width + 'px'; g.style.height = a.height + 'px';
    showIncome(false);
    var tx = b.left + b.height * 0.5 - (a.left + a.width / 2), ty = b.top + b.height / 2 - (a.top + a.height / 2);
    requestAnimationFrame(function () { requestAnimationFrame(function () { g.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(.45)'; g.style.opacity = '0'; }); });
    setTimeout(function () { g.remove(); }, 480);
    return true;
  }
  // монета влетела в метку «+X»: короткий толчок, сила по сочности
  function bumpIncome() {
    var k = 1 + 0.12 * (F.juice || 0); if (k <= 1 || !H.income.animate) return;
    H.income.animate([{ transform: 'scale(1)' }, { transform: 'scale(' + k + ')' }, { transform: 'scale(1)' }], { duration: 150, easing: 'ease-out' });
  }
  // сбор монет с палуб: каждая монета летит со своего места к убийце, метка дохода растёт по кучам.
  // Тон монет (тумблер coinTone): свои монеты звенят цепочкой, каждая следующая на полтона выше, до октавы; счётчик на один сбор
  function collectCoins() {
    var piles = F.piles.slice(); if (!piles.length) { if (pendingIncome != null) setIncome(pendingIncome); pendingIncome = null; return Promise.resolve(); }
    var base = parseInt(H.income.textContent.replace(/[^0-9]/g, ''), 10) || 0, chain = 0, tone = dev.coinTone !== false;
    return new Promise(function (resolve) {
      var left = piles.length;
      piles.forEach(function (pile, k) {
        setTimeout(function () {
          var pts = F.takePile(pile), mine = pile.killer === 'p', to = mine ? H.income : H.eAv;   // монеты за убийства летят в метку дохода: в кошелёк они придут в начале подготовки
          var r = to.getBoundingClientRect(), u = ui.getBoundingClientRect(), tx = r.left - u.left + r.width / 2, ty = r.top - u.top + r.height / 2;
          pts.forEach(function (pt, i) {
            var c = img('ic_doubloon', 'flyCoin', ui); c.style.left = pt.x + 'px'; c.style.top = pt.y + 'px';
            setTimeout(function () { c.style.transform = 'translate(' + (tx - pt.x) + 'px,' + (ty - pt.y) + 'px) scale(.8)'; }, 30 + i * 45);
            setTimeout(function () {
              c.remove();
              if (mine && tone) { SFX.coinUp(chain++); bumpIncome(); } else SFX.coin();
              if (i === pts.length - 1) {
                if (mine) { base += pile.value; setIncome(base); } else wiggle(H.eAv);
                if (--left === 0) { if (pendingIncome != null) setIncome(pendingIncome); pendingIncome = null; setTimeout(resolve, 250); }
              }
            }, 520 + i * 45);
          });
        }, k * 160 * (dev.short ? 0.5 : 1));
      });
    });
  }
  // золото меты летит слитками: их мало, они тяжёлые, последний бьёт глухо
  function flyIngots(fromXY, toNode, n, cb) {
    var r = toNode.getBoundingClientRect(), u = ui.getBoundingClientRect(), tx = r.left - u.left + r.height / 2, ty = r.top - u.top + r.height / 2;
    n = Math.max(1, Math.min(n, 4));
    for (var i = 0; i < n; i++) (function (i) {
      var c = img('ic_ingot', 'flyIngot', ui); c.style.left = fromXY.x + 'px'; c.style.top = fromXY.y + 'px';
      setTimeout(function () { c.style.transform = 'translate(' + (tx - fromXY.x) + 'px,' + (ty - fromXY.y) + 'px) rotate(' + (i % 2 ? 8 : -8) + 'deg) scale(.7)'; }, 30 + i * 110);
      setTimeout(function () { c.remove(); if (i === n - 1) { SFX.ingot(); if (cb) cb(); } else SFX.ingotTick(); wiggle(toNode); }, 560 + i * 110);
    })(i);
  }

  // ---------- добыча: монеты последнего боя переплавляются в слиток ----------
  // После последнего боя нанимать уже некого, поэтому монеты не летят к Hire. Монеты своих убийств стягиваются
  // в одну точку, переплавляются в слиток, и он ждёт экрана итогов, где ложится в строку «Добыча».
  // Монеты соперника, как и раньше, улетают к его аватару.
  var loot = null;
  function clearLoot() { if (loot && loot.node) loot.node.remove(); loot = null; }
  function lootPoint() { return { x: ui.clientWidth / 2, y: ui.clientHeight * 0.42 }; }
  function collectLoot() {
    clearLoot();
    showIncome(false); pendingIncome = null;   // матч кончился: дохода следующей подготовки не будет
    var piles = F.piles.slice(), mine = piles.filter(function (p) { return p.killer === 'p'; }), theirs = piles.filter(function (p) { return p.killer !== 'p'; });
    var sh = dev.short ? 0.5 : 1, P = lootPoint(), total = 0, chain = 0;
    if (!piles.length) return Promise.resolve();
    return new Promise(function (resolve) {
      theirs.forEach(function (pile, k) {
        setTimeout(function () {
          var pts = F.takePile(pile), r = H.eAv.getBoundingClientRect(), u = ui.getBoundingClientRect(), tx = r.left - u.left + r.width / 2, ty = r.top - u.top + r.height / 2;
          pts.forEach(function (pt, i) {
            var c = img('ic_doubloon', 'flyCoin', ui); c.style.left = pt.x + 'px'; c.style.top = pt.y + 'px';
            setTimeout(function () { c.style.transform = 'translate(' + (tx - pt.x) + 'px,' + (ty - pt.y) + 'px) scale(.8)'; }, 30 + i * 45);
            setTimeout(function () { c.remove(); if (i === pts.length - 1) wiggle(H.eAv); }, 520 + i * 45);
          });
        }, k * 120 * sh);
      });
      if (!mine.length) { setTimeout(resolve, theirs.length ? 650 : 0); return; }
      var heap = el('lootHeap', ui); img('ic_doubloon', 'hc', heap); var hv = el('hv txt', heap, '+0');
      heap.style.left = P.x + 'px'; heap.style.top = P.y + 'px';
      var left = mine.length;
      mine.forEach(function (pile, k) {
        setTimeout(function () {
          var pts = F.takePile(pile);
          pts.forEach(function (pt, i) {
            var c = img('ic_doubloon', 'flyCoin', ui); c.style.left = pt.x + 'px'; c.style.top = pt.y + 'px';
            setTimeout(function () { c.style.transform = 'translate(' + (P.x - pt.x) + 'px,' + (P.y - pt.y) + 'px) scale(.9)'; }, 30 + i * 40);
            setTimeout(function () {
              c.remove(); SFX.coinUp(chain++);
              heap.classList.remove('bump'); void heap.offsetWidth; heap.classList.add('bump');
              if (i === pts.length - 1) { total += pile.value; hv.textContent = '+' + total; if (--left === 0) setTimeout(melt, 220 * sh); }
            }, 520 + i * 40);
          });
        }, k * 150 * sh);
      });
      function melt() {
        SFX.melt(); heap.classList.add('melt');
        setTimeout(function () {
          heap.remove();
          var val = Math.round(total * (B.rewards.lootRate == null ? 1 : B.rewards.lootRate));
          var n = el('lootIngot', ui); n.style.left = P.x + 'px'; n.style.top = P.y + 'px';
          el('lring', n); img('ic_ingot', 'ing', n); el('lv txt', n, '+' + val);
          for (var q = 0; q < 8; q++) { var st = el('lstar', n), a = q / 8 * 6.283 + Math.random() * 0.4, d = (54 + Math.random() * 26) * s(); st.style.setProperty('--dx', Math.cos(a) * d + 'px'); st.style.setProperty('--dy', Math.sin(a) * d * 0.8 + 'px'); st.style.animationDelay = (Math.random() * 0.06) + 's'; }
          SFX.ingot(); F.shake(3);
          loot = { node: n, value: val };
          setTimeout(resolve, 650 * sh);
        }, 340 * sh);
      }
    });
  }

  // ---------- экраны вне матча ----------
  var V = {};
  function buildScreens() {
    // полноэкранный арт: размытая подложка на всё окно и сам арт в полосе игры (на телефоне это весь экран)
    function artImg(parent, src, cls) { var i = document.createElement('img'); i.src = src; i.className = cls; i.draggable = false; parent.appendChild(i); return i; }
    V.splash = el('layer splash', ui); artImg(V.splash, 'art/cut/splash.jpg', 'backdrop'); V.splashBg = artImg(V.splash, 'art/cut/splash.jpg', 'bg');
    el('scrimLow', V.splash);
    V.logo = document.createElement('img'); V.logo.src = 'art/cut/logo.png'; V.logo.className = 'logo'; V.logo.draggable = false; V.splash.appendChild(V.logo);
    V.sTitle = el('txt sTitle', V.splash); V.sTime = el('txt sTime', V.splash); V.sBar = el('loadBar', V.splash, '<i></i>');
    V.cancel = el('btn dark small', V.splash, '<i class="lip"></i><i class="face"></i><span class="lbl">Отмена</span>');
    V.main = el('layer main', ui);
    artImg(V.main, 'art/cut/main_bg.jpg', 'backdrop'); V.mainBg = artImg(V.main, 'art/cut/main_bg.jpg', 'mainBg');
    V.gold = el('counter gold', V.main); img('ic_ingots', 'ic', V.gold); V.goldN = el('n', V.gold);
    V.tro = el('counter', V.main); img('ic_trophy', 'ic', V.tro); V.troN = el('n', V.tro);
    V.units = ['gunner', 'shooter', 'boarder'].map(function (t, i) {
      var c = el('unitCard', V.main); img('unit_card', 'frame', c); img('portrait_' + t, 'por', c); var nm = el('nm', c); var sp = document.createElement('span'); sp.textContent = ['Канонир', 'Стрелок', 'Абордажник'][i]; nm.appendChild(sp); return c;
    });
    V.cta = el('btn gold cta', V.main, '<i class="lip"></i><i class="face"></i><span class="lbl">В бой</span>');
    hot(V.cta, true);   // главная кнопка всегда с бликом
    V.tabs = el('tabbar', V.main);
    V.tabBtns = [0, 1, 2, 3, 4].map(function (i) { var t = el('tab' + (i === 2 ? ' on' : ''), V.tabs); img(i === 2 ? 'ic_tab_battle.svg' : 'ic_lock', 'ic' + (i === 2 ? ' flat' : ''), t); if (i === 2) el('t', t, 'Бой'); return t; });
    V.res = el('layer results', ui);
    V.rays = el('rays', V.res); V.glow = el('resGlow', V.res);
    V.plaque = el('plaque', V.res); V.plaqueImg = img('plaque_victory', 'fill', V.plaque); V.plaqueShine = el('pShine', V.plaque); V.plaqueT = el('t', V.plaque, 'Победа');
    V.stars = [0, 1, 2, 3, 4, 5].map(function (i) { return el('star s' + i, V.res); });
    V.reward = el('reward', V.res); V.reason = el('txt reason', V.res); V.hint = el('hint', V.res);
    V.cont = el('btn gold cta', V.res, '<i class="lip"></i><i class="face"></i><span class="lbl">Продолжить</span>');
    V.conf = document.createElement('canvas'); V.conf.className = 'confetti'; V.res.appendChild(V.conf);
    V.clouds = el('layer clouds', ui); V.fog = el('fog', V.clouds);
    V.cloudImgs = [0, 1, 2, 3, 4, 5].map(function (i) { return img('cloud_' + (i % 3), 'cloud', V.clouds); });
    V.toast = el('toast', ui); V.toast.hidden = true;
  }
  function show(name) {
    V.splash.hidden = !(name === 'load' || name === 'search' || name === 'vs');
    V.main.hidden = !(name === 'main' || name === 'return');
    V.res.hidden = name !== 'results';
    var game = ['enter', 'prep', 'battle', 'roundEnd', 'cards', 'boarding'].indexOf(name) >= 0;
    H.layer.hidden = H.bot.hidden = !game; H.marks.hidden = !game;
    stage.style.visibility = game ? 'visible' : 'hidden';
    V.clouds.hidden = name !== 'enter';
    app.dataset.screen = name;
  }
  function placeMeta(screen) {
    var R = layout(screen);
    put(V.mainBg, R.mainArt); put(V.gold, R.gold); put(V.tro, R.trophies); V.goldN.textContent = fmt(meta.gold); V.troN.textContent = meta.trophies; fitCounter(V.gold); fitCounter(V.tro);
    ['g', 's', 'b'].forEach(function (k, i) { put(V.units[i], R['card.' + k]); });
    fitNames(); setTimeout(fitNames, 300); setTimeout(fitNames, 1500);   // повторы: шрифт на телефоне может догрузиться позже
    put(V.cta, R.cta); fitLbl(V.cta); put(V.tabs, R.tabbar);
    V.tabBtns.forEach(function (t, i) { put(t, { x: R['tab' + i].x - R.tabbar.x, y: R['tab' + i].y - R.tabbar.y, w: R['tab' + i].w, h: R['tab' + i].h }); });
  }
  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function toast(text) { V.toast.textContent = text; V.toast.hidden = false; clearTimeout(V.toast._t); V.toast._t = setTimeout(function () { V.toast.hidden = true; }, 1200); }

  // ---------- матч ----------
  var M = null, botTimer = 0, hurryT0 = 0, phase = 'idle', prepEnd = 0, prepMs = 0, hintShown = false, lastInput = 0, firstMatch = false, prepHired = false;
  function sideOf(i) { return SIDE[i]; }
  function cellOfId(sd, id) { var us = F.units[sd]; for (var c in us) if (us[c].id === id) return +c; return -1; }
  function crewCount(i) { return M ? M.crew(i) : 0; }
  function updateCrew() { H.pCrewN.textContent = crewCount(0); H.eCrewN.textContent = crewCount(1); updateReady(); }
  function updateReady() {
    if (phase !== 'prep') return;
    var need = M.round === 1 ? B.match.readyMinCrewR1 : 0, c = crewCount(0), lbl = H.ready.querySelector('.lbl');
    var ok = c >= need; H.ready.classList.toggle('green', ok && !M.sides[0].ready); H.ready.classList.toggle('done', !!M.sides[0].ready);
    H.ready.classList.toggle('off', !ok && !M.sides[0].ready);
    if (M.sides[0].ready || ok) { if (!lbl.classList.contains('word')) { lbl.textContent = 'Fight'; lbl.classList.add('word'); } } else { lbl.classList.remove('word'); lbl.textContent = c + '/' + need; }
  }
  function updateHire() {
    if (!M) return; var S = M.sides[0];
    H.hire.querySelector('.price b').textContent = S.price; H.hire.classList.toggle('poor', S.coins < S.price);
  }

  // события симуляции -> картинка
  function onEvent(e) {
    var sd = e.side != null ? sideOf(e.side) : null;
    switch (e.type) {
      case 'hire':
        F.placeUnit(sd, e.cell, e.unit.type, 1, { land: true, id: e.unit.id, hp: false });
        setTimeout(function () { F.fx.dust(F.worldOf(sd, e.cell, 0.05), 3); }, 330);
        if (sd === 'p') { SFX.hire(); updateHire(); prepHired = true; if (!meta.hired) { meta.hired = true; saveMeta(); } lastInput = performance.now(); }
        updateCrew(); refreshMarks(); break;
      case 'move': F.moveUnit(sd, e.from, e.to); var mu = F.units[sd][e.to]; if (mu) F.kits[sd].land(mu.S); if (sd === 'p') SFX.land(); refreshMarks(); break;
      case 'merge': {
        var tc = e.cell;
        e.ids.forEach(function (id) { var c = cellOfId(sd, id); if (c >= 0 && c !== tc && c !== e.cell2) { var wp = F.worldOf(sd, c, 0.2); F.removeUnit(sd, c, { silent: true }); F.fx.dust(wp, 2); } });
        F.setRank(sd, tc, e.unit.rank); var tu = F.units[sd][tc]; if (tu) { tu.id = e.unit.id; F.kits[sd].land(tu.S); }
        if (e.cell2 != null) { F.setRank(sd, e.cell2, e.unit2.rank); var tu2 = F.units[sd][e.cell2]; if (tu2) F.kits[sd].land(tu2.S); F.mergeBurst(sd, e.cell2, false); if (sd === 'p') floatWorld('+1', sd, e.cell2, 'gold'); }
        var w = F.worldOf(sd, tc, 0.1), big = e.n === 3 || e.unit.rank >= 3;
        F.fx.sparkle(w, big); F.light(w, { color: 0xffd36a, r: big ? 1.6 : 1.1, life: 0.35, a: 0.7 }); F.mergeBurst(sd, tc, big);
        if (sd === 'p') { SFX.merge(big); F.shake(big ? 5 : 2); F.hitstop(big ? 120 : 60); floatWorld('+1', sd, tc, 'gold'); }
        updateCrew(); refreshMarks(); break; }
      case 'barrel': {
        var bw = F.worldOf(sd, e.cell, 0.2); F.setKeg(sd, e.cell, false); F.fx.splinters(bw); F.fx.coins(bw, 3);
        if (sd === 'p') { SFX.keg(); floatWorld('+' + e.coins, sd, e.cell, 'gold'); }
        refreshMarks(); break; }
      case 'reroll': {
        var rc = e.cell, ru = F.units[sd][rc], rr = ru ? ru.rank : 1, rw = F.worldOf(sd, rc, 0.4);
        F.fx.sparkle(rw, false); F.fx.cloth(rw, sd === 'p' ? 'blue' : 'red');
        setTimeout(function () { F.placeUnit(sd, rc, e.to, rr, { land: true, id: e.id }); refreshMarks(); }, 180);
        if (sd === 'p') SFX.reroll(); break; }
      case 'deny': if (sd === 'p') { SFX.deny(); if (e.action === 'hire') wiggle(H.hire); if (e.action === 'ready') wiggle(H.ready); if (e.reason === 'no_money') wiggle(H.coins); } break;
      case 'ready': if (sd === 'e') { H.eReady.hidden = false; H.eAv.classList.add('isReady'); } else updateReady(); break;
      case 'coins': if (sd === 'p') {
          // доход раунда: счётчик докручивается, когда метка «+X» долетит до него
          if (e.src === 'income' && deferIncome) { deferIncome = false; var tot = e.total; setTimeout(function () { setCoins(tot); updateHire(); wiggle(H.coins); SFX.coin(); }, 430); break; }
          setCoins(e.total); updateHire(); } break;
      case 'income': if (sd === 'p' && phase === 'battle') {
          // в бою метка не меняется сразу: она растёт, когда монеты за убийства долетают до неё; вне боя метку не показываем
          pendingIncome = e.value; } break;
      case 'pick': if (e.card) {
          var ci = H[sd + 'Card'], cu = CARD_UI[e.card.type]; ci.hidden = false; ci.style.borderColor = B.cards.rarity[e.card.rarity].color; ci.style.backgroundImage = svgUri(cu.icon);
          ci.classList.remove('flip'); void ci.offsetWidth; ci.classList.add('flip');
          if (sd === 'e') { var ar = H.eAv.getBoundingClientRect(), ub = ui.getBoundingClientRect(); floatAt(cu.name, ar.left - ub.left + ar.width / 2 - 30 * s(), ar.bottom - ub.top + 14 * s(), 'cardName'); }
        } break;
      // ---- бой ----
      case 'fire': F.fire(sd, e.cannon.board, e.cannon.slot, { miss: e.result === 'miss', shake: 1 + 3 * (e.dmg || 20) / 42, decal: e.result !== 'miss', volley: e._volley || null }); break;
      case 'ult': {
        var uc = cellOfId(sd, e.id); if (uc < 0) uc = e.cell;
        cutIn(sd, e.kind); dropRing(e);
        if (e.kind === 'gunner') F.giantBall(sd, e.cannon.board, e.cannon.slot, e.flight);
        else if (e.kind === 'shooter') F.pierce(sd, uc, e.targets);
        else F.ropeLeap(sd, uc, e.targets, e.flight, function () { var ts2 = sd === 'p' ? 'e' : 'p'; e.targets.forEach(function (t) { var tc2 = cellOfId(ts2, t.id); if (tc2 >= 0) floatWorld('Оглушён', ts2, tc2, 'block'); }); });
        break; }
      case 'impact':
        if (e.leak && Math.random() < 0.5) F.leakFx(sd);
        if (e.target === 'hull') { setBar(sd, e.pct); F.hullStagesOn = dev.hullStages !== false; F.setHullDamage(sd, e.pct); H[sd + 'Bar'].classList.toggle('crit', F.hullStagesOn && e.pct < 0.25); }
        if (e.target === 'cannon') setTimeout(function () { F.cannonState(sd, e.cannon.board, e.cannon.slot, e.state); }, 30);
        break;
      case 'attack': {
        var ac = cellOfId(sd, e.id); if (ac < 0) break; var au = F.units[sd][ac], ts = sd === 'p' ? 'e' : 'p';
        if (e.weapon === 'musket' && e.targetCell != null) { F.musket(sd, ac, ts, e.targetCell); break; }
        if (e.targetCell != null) F.aimUnit(sd, ac, F.worldOf(ts, e.targetCell, 0.3), 0.7);
        F.kits[sd].act(au.S);
        if (e.weapon === 'musket') setTimeout(SFX.musket, 250); else setTimeout(SFX.slash, 250);
        break; }
      case 'hit': {
        var hc = cellOfId(sd, e.id); if (hc < 0) break; var hu = F.units[sd][hc];
        if (e.dmg > 0) { F.kits[sd].hit(hu.S); floatWorld('-' + Math.round(e.dmg), sd, hc, e.src === 'storm' ? 'zap' : e.src === 'powder' || e.src === 'ult' ? 'boom' : 'dmg'); }
        else { floatWorld('+' + Math.round(-e.dmg), sd, hc, 'heal'); if (e.src === 'healer') { F.healAt(sd, hc); SFX.coin(); } }
        F.setHp(sd, hc, e.max ? e.hp / e.max : 1); hu.hpv = e.hp; break; }
      // ---- эффекты карт ----
      case 'status': {
        var sc2 = cellOfId(sd, e.id); if (sc2 < 0) break;
        if (e.kind === 'curse') { F.setCurse(sd, sc2, e.stacks); if (e.stacks === 1) SFX.hook(); }
        if (e.kind === 'bubble') F.setBubble(sd, sc2, e.n);
        if (e.kind === 'rage') F.setRage(sd, sc2, e.sec / speed);
        break; }
      case 'tick': {
        var tc = cellOfId(sd, e.id); if (tc < 0) break;
        floatWorld('-' + Math.round(e.dmg), sd, tc, 'curse'); F.fx.curse(F.worldOf(sd, tc, 0.1), false); F.setHp(sd, tc, e.max ? e.hp / e.max : 1); F.units[sd][tc].hpv = e.hp; break; }
      case 'chain': {
        var os = sd === 'p' ? 'e' : 'p', prev = cellOfId(os, e.from);
        e.to.forEach(function (id, k) { setTimeout(function () { var nc = cellOfId(os, id); if (prev >= 0 && nc >= 0) F.bolt(os, prev, os, nc); prev = nc; SFX.buzz && SFX.buzz(20); SFX.hit(); }, k * 70 / speed); });
        break; }
      case 'blast': F.blastAt(sd, e.cell); SFX.boom(); break;
      case 'shield': { var shc = cellOfId(sd, e.id); if (shc >= 0) { F.popBubble(sd, shc, e.left); floatWorld('Блок', sd, shc, 'block'); SFX.splash(); } break; }
      case 'death': {
        var dc = cellOfId(sd, e.id); if (dc < 0) dc = e.cell; var dw = F.worldOf(sd, dc, 0.1);
        // монеты падают туда, где стоял матрос, и лежат до конца раунда, потом летят к убийце
        if (e.coins) F.dropCoins(sd, dc, Math.round(e.coins / 2) + 1, e.coins).killer = sd === 'p' ? 'e' : 'p'; void dw;
        F.removeUnit(sd, dc, { death: true }); F.shake(3); F.hitstop(50);
        updateCrew(); break; }
      case 'sink': F.ships[sd].sink(); SFX.sink(); F.shake(10); F.hitstop(200);
        for (var i = 0; i < 6; i++) setTimeout(function () { var p = F.ships[sd].root.position.clone(); p.x += (Math.random() - 0.5) * 4; p.z += (Math.random() - 0.5) * 2; p.y = -0.38; F.fx.splash(p); }, i * 220);
        break;
      case 'ramp': floatAt('Урон ×' + e.mult.toFixed(2).replace('.', ','), ui.clientWidth / 2, ui.clientHeight * 0.18, 'ramp'); break;
    }
  }

  // ---------- метки троек и подсказка мержа ----------
  var marks = [], hand = null;
  function refreshMarks() {
    marks.forEach(function (m) { m.n.remove(); }); marks = [];
    if (!M || phase !== 'prep' || M.sides[0].ready) return;
    M.triples(0).forEach(function (g) { g.forEach(function (c, i) { var n = el('tripleMark', H.marks, i === 0 ? '<b>2×</b>' : ''); marks.push({ n: n, c: c }); }); });
  }
  function tickMarks() {
    marks.forEach(function (m) { var p = F.toScreen(F.worldOf('p', m.c, 0.05)), r = 30 * F.ppu / 56; m.n.style.left = p.x + 'px'; m.n.style.top = p.y + 'px'; m.n.style.width = m.n.style.height = 2 * r + 'px'; });
    if (hand) {
      var u = ((performance.now() - hand.t0) % 1400) / 1400, a = F.toScreen(F.worldOf('p', hand.a, 0.3)), b = F.toScreen(F.worldOf('p', hand.b, 0.3));
      var e2 = u < 0.7 ? u / 0.7 : 1; hand.n.style.left = (a.x + (b.x - a.x) * e2) + 'px'; hand.n.style.top = (a.y + (b.y - a.y) * e2) + 'px'; hand.n.style.opacity = u > 0.85 ? (1 - u) / 0.15 : 1;
      if (performance.now() > hand.until) { hand.n.remove(); hand = null; }
    }
  }
  function maybeHint(force) {
    if (!M || phase !== 'prep' || hand || M.sides[0].ready) return;
    if (meta.matches >= 2) return;   // подсказка рукой к мержу только в первых двух матчах
    if (!force && (hintShown || performance.now() - lastInput < 3000)) return;
    var us = M.units(0), pair = null;
    us.forEach(function (a) { us.forEach(function (b) { if (!pair && a.cell !== b.cell && M.canMerge(a.u, b.u)) pair = [a.cell, b.cell]; }); });
    if (!pair) return;
    hintShown = true; hand = { n: img('ic_hand', 'hand', H.marks), a: pair[0], b: pair[1], t0: performance.now(), until: performance.now() + 4200 };
  }

  // ---------- акценты подготовки ----------
  // Первый раз: Hire с бликом и рукой до первого найма. В начале каждой подготовки Hire с бликом без руки, пока игрок не наймёт.
  // Потом при простое 3,5 с:
  // есть пара для мерджа: светятся оба бойца и рука тянет одного к другому; иначе блик на Hire, если есть деньги и место; иначе на «В бой».
  var accent = { kind: null, glows: [], hand: null, pair: null };
  function clearAccent() {
    hot(H.hire, false); hot(H.ready, false);
    accent.glows.forEach(function (g) { g.n.remove(); }); accent.glows = []; if (accent.hand) { accent.hand.remove(); accent.hand = null; }
    accent.kind = null; accent.pair = null;
  }
  function mergePair() {
    var us = M.units(0), pair = null;
    us.forEach(function (a) { us.forEach(function (b) { if (!pair && a.cell !== b.cell && M.canMerge(a.u, b.u)) pair = [a.cell, b.cell]; }); });
    return pair;
  }
  function setAccent(kind) {
    var pair = kind === 'merge' ? mergePair() : null;
    if (accent.kind === kind && (!pair || (accent.pair && accent.pair[0] === pair[0] && accent.pair[1] === pair[1]))) return;
    clearAccent(); accent.kind = kind; if (!kind) return;
    if (kind === 'hireFirst' || kind === 'hire') hot(H.hire, true);
    if (kind === 'hireFirst') { accent.hand = img('ic_hand', 'tapHand', H.marks); }
    if (kind === 'ready') hot(H.ready, true);
    if (kind === 'merge' && pair) {
      accent.pair = pair;   // круги над парой убраны: избыточно, остаётся подсказка рукой
      if (!hand) { hintShown = false; maybeHint(true); }
    }
  }
  function accentTick() {
    if (!M || phase !== 'prep' || M.sides[0].ready || drag) { setAccent(null); return; }
    var S = M.sides[0], idle = performance.now() - lastInput, canHire = S.coins >= S.price && M.free(0).length > 0;
    if (!meta.hired && canHire) setAccent('hireFirst');
    else if (!prepHired && canHire) setAccent('hire');
    else if (idle > 3500) {
      setAccent(mergePair() ? 'merge' : canHire ? 'hire' : 'ready');
      if (accent.kind === 'merge' && !hand && performance.now() - (accent.handT || 0) > 6000) { accent.handT = performance.now(); hintShown = false; maybeHint(true); }
    }
    else setAccent(null);
  }
  function tickAccent() {
    accent.glows.forEach(function (g) { var p = F.toScreen(F.worldOf('p', g.c, 0.02)), w = 0.92 * F.ppu; g.n.style.left = p.x + 'px'; g.n.style.top = p.y + 'px'; g.n.style.width = w + 'px'; g.n.style.height = (w * Math.cos(F.tilt)) + 'px'; });
    if (accent.hand) { var r = H.hire.getBoundingClientRect(), u = ui.getBoundingClientRect(); accent.hand.style.left = (r.left - u.left + r.width * 0.74) + 'px'; accent.hand.style.top = (r.top - u.top + r.height * 0.32) + 'px'; }
  }

  // ---------- подсказки подготовки: клетки канонира у пушек и бочки (мокап утверждён) ----------
  var kegFlash = null, boostLbls = [];
  function nbCells(c) { var r = Math.floor(c / 4), k = c % 4, o = []; if (k > 0) o.push(c - 1); if (k < 3) o.push(c + 1); if (r > 0) o.push(c - 4); if (r < 2) o.push(c + 4); return o; }
  function prepHints() {
    var base = firstMatch ? 'show' : 'hide', h = { kegMode: base, kegHot: [] };
    if (!drag) F.mergeHover('p', -1);
    if (phase !== 'prep' || !M) { F.setPrepHints('p', { kegMode: phase === 'prep' ? base : 'hide' }); F.setPrepHints('e', { kegMode: 'hide' }); setBoostLbls([]); return; }
    if (kegFlash && performance.now() < kegFlash.until) h.kegHot = [kegFlash.c];
    var hot = [];
    if (drag) {
      var u = drag.u, c = drag.moved ? (drag.cell != null ? drag.cell : -1) : -1, t = c >= 0 && c !== drag.from ? F.units.p[c] : null;
      if (h.kegMode !== 'show') h.kegMode = 'dim';
      var merge = t && t.type === u.type && t.rank === u.rank && u.rank < 3;
      if (merge) { h.skip = c; nbCells(c).forEach(function (n) { if (F.ships.p.kegs[n]) h.kegHot.push(n); }); }
      // отклик пары: цель пульсирует с золотым свечением, при входе на неё искры и звук
      if (merge && c !== drag.mergeC) SFX.pair();
      drag.mergeC = merge ? c : -1; F.mergeHover('p', merge ? c : -1);
      if (u.type === 'gunner') {
        h.cannon = true; h.occupied = Object.keys(F.units.p).map(Number).filter(function (x) { return x !== drag.from; });
        if (!merge && c >= 0 && !F.ships.p.kegs[c]) { h.hover = c; hot = F.cannonsForCell('p', c); }
      }
    }
    F.setPrepHints('p', h); F.setPrepHints('e', { kegMode: 'hide' });
    setBoostLbls(hot.length ? hot.map(function (cn) { return { cn: cn, t: '+' + Math.round(B.crew.gunner.cannonSpeedPerRank * drag.u.rank * 100) + '%' }; }) : []);
  }
  function setBoostLbls(list) {
    while (boostLbls.length > list.length) boostLbls.pop().n.remove();
    list.forEach(function (it, i) { if (!boostLbls[i]) { boostLbls[i] = { n: el('cboost', H.marks) }; } boostLbls[i].cn = it.cn; boostLbls[i].n.textContent = it.t; });
  }
  function tickBoostLbls() { boostLbls.forEach(function (b) { var p = F.toScreen(F.muzzleWorld(b.cn)); b.n.style.left = p.x + 'px'; b.n.style.top = (p.y - 22 * s()) + 'px'; }); }

  // ---------- ввод: найм, перетаскивание, Reroll, тройки ----------
  var drag = null;
  function inRect(node, x, y) { var r = node.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; }
  // зона Reroll шире кнопки: по 28 pt с боков, 64 pt сверху и до низа экрана, чтобы бросок «в сторону кнопки» засчитывался
  function rrRect() { var r = H.hire.getBoundingClientRect(), k = s(); return { left: r.left - 28 * k, right: r.right + 28 * k, top: r.top - 64 * k, bottom: Math.max(r.bottom + 24 * k, innerHeight) }; }
  function inReroll(x, y) { var r = rrRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; }
  function placeRrZone(on) {
    if (!H.rrZone) { H.rrZone = el('rrZone', ui, ''); ui.insertBefore(H.rrZone, H.bot); }   // под кнопками, чтобы не тонировать их
    H.rrZone.hidden = !on; if (!on) return;
    var r = rrRect(), u = ui.getBoundingClientRect();
    H.rrZone.style.left = (r.left - u.left) + 'px'; H.rrZone.style.top = (r.top - u.top) + 'px'; H.rrZone.style.width = (r.right - r.left) + 'px'; H.rrZone.style.height = (Math.min(r.bottom, u.bottom) - r.top) + 'px';
  }
  // плавное следование бойца за пальцем и обмен: занятая клетка сдвигает своего бойца навстречу, показывая обмен
  function tickDrag() {
    if (!drag || !drag.moved || drag.tx == null) return;
    var S = drag.u.S; S.x += (drag.tx - S.x) * 0.38; S.z += (drag.tz - S.z) * 0.38;
    if (drag.swapU) { var su = drag.swapU, h = su.home, o = F.ships.p.cellPos(drag.from); su.S.x += (h.x + (o.x - h.x) * 0.35 - su.S.x) * 0.3; su.S.z += (h.z + (o.z - h.z) * 0.35 - su.S.z) * 0.3; }
  }
  function releaseSwap(d) { if (d && d.swapU) { var su = d.swapU; if (F.units.p[su.cell] === su.u) { var h = F.ships.p.cellPos(su.cell); su.S.x = h.x; su.S.z = h.z; } d.swapU = null; } }
  stage.addEventListener('pointerdown', function (e) {
    SFX.init(); lastInput = performance.now(); if (hand) { hand.n.remove(); hand = null; }
    if (!M || phase !== 'prep' || M.sides[0].ready) return;
    var hit = F.pick(e.clientX, e.clientY); if (!hit || hit.side !== 'p') return;
    var u = F.units.p[hit.cell];
    if (marks.some(function (m) { return m.c === hit.cell; })) { M.mergeTriple(0, hit.cell); return; }
    if (!u && F.ships.p.kegs[hit.cell]) { kegFlash = { c: hit.cell, until: performance.now() + 1500 }; toast('Мерж рядом'); SFX.tap(); prepHints(); setTimeout(prepHints, 1550); return; }
    if (!u) return;
    drag = { u: u, from: hit.cell, x0: e.clientX, y0: e.clientY, moved: false }; prepHints();
    try { stage.setPointerCapture(e.pointerId); } catch (er) {}
  });
  stage.addEventListener('pointermove', function (e) {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 8) return;
    var S = drag.u.S;
    if (!drag.moved) { drag.moved = true; S.lift = 0.35; S.root.scale.multiplyScalar(1.15); drag.u.badge.visible = false; SFX.press(); H.hire.classList.add('reroll'); setRerollPrice(); placeRrZone(true); }
    var lp = F.groundAt(e.clientX, e.clientY - 30 * s(), 'p'), c = F.ships.p.cellAt(lp), nx = lp.x, nz = lp.z;
    var armed = inReroll(e.clientX, e.clientY);
    if (armed) c = -1;
    drag.cell = c;
    // клетка под пальцем ловит бойца целиком (раньше только в четверти клетки от центра): боец едет в её центр
    if (c >= 0) { var cp = F.ships.p.cellPos(c); nx = cp.x; nz = cp.z; if (drag.snap !== c) { drag.snap = c; SFX.tap(); SFX.buzz && SFX.buzz(8); } } else drag.snap = -1;
    S.sway = Math.max(-0.5, Math.min(0.5, (nx - S.x) * -2)); drag.tx = nx; drag.tz = nz;
    // обмен: на занятой клетке (не пара для мержа) её боец подаётся навстречу
    var occ = c >= 0 && c !== drag.from ? F.units.p[c] : null, pairM = occ && occ.type === drag.u.type && occ.rank === drag.u.rank && drag.u.rank < 3;
    var swapU = occ && !pairM ? { u: occ, S: occ.S, cell: c, home: F.ships.p.cellPos(c) } : null;
    if (!swapU || !drag.swapU || drag.swapU.u !== swapU.u) { releaseSwap(drag); drag.swapU = swapU; }
    F.dropMark('p', c >= 0 && c !== drag.from && !pairM ? c : -1, c >= 0 && F.ships.p.kegs[c]);
    S.root.scale.setScalar((1 + 0.12 * (drag.u.rank - 1)) * (armed ? 0.85 : 1.15));
    H.hire.classList.toggle('armed', armed); H.rrZone && H.rrZone.classList.toggle('armed', armed); prepHints();
  });
  function setRerollPrice() {
    var u = drag.u, lbl = H.hire.querySelector('.lbl'), pr = H.hire.querySelector('.price b');
    lbl.textContent = 'Reroll'; if (u.rank >= 3) { pr.textContent = '🔒'; H.hire.classList.add('locked'); } else pr.textContent = u.rank === 1 ? B.reroll.rank1 : B.reroll.rank2;
    // цена красная, если на Reroll не хватает (раньше класс оставался от цены найма)
    H.hire.classList.toggle('poor', u.rank < 3 && M.sides[0].coins < (u.rank === 1 ? B.reroll.rank1 : B.reroll.rank2));
  }
  function endDrag(e, cancel) {
    var d = drag; drag = null; if (!d) return; prepHints(); releaseSwap(d); F.dropMark('p', -1); placeRrZone(false);
    H.hire.classList.remove('reroll', 'armed', 'locked'); H.hire.querySelector('.lbl').textContent = 'Hire'; updateHire();
    var u = d.u, S = u.S; S.lift = 0; S.sway = 0; u.badge.visible = true; S.root.scale.setScalar(1 + 0.12 * (u.rank - 1));
    var back = function () { var p = F.ships.p.cellPos(d.from); S.x = p.x; S.z = p.z; };
    if (!d.moved) { F.kits.p.act(S); return; }
    if (cancel) { back(); return; }
    if (inReroll(e.clientX, e.clientY)) { back(); M.reroll(0, d.from); return; }
    var lp = F.groundAt(e.clientX, e.clientY - 30 * s(), 'p'), c = F.ships.p.cellAt(lp);
    if (c < 0 || c === d.from) { back(); return; }
    var r = M.move(0, d.from, c); if (!r) { back(); SFX.deny(); }
  }
  stage.addEventListener('pointerup', function (e) { endDrag(e, false); });
  stage.addEventListener('pointercancel', function (e) { endDrag(e, true); });
  H.hireDown = function () {};

  // ---------- подготовка ----------
  function botLoop() {
    clearTimeout(botTimer);
    if (!M || phase !== 'prep' || M.sides[1].ready) return;
    var hurry = M.sides[0].ready;
    // игрок уже нажал «В бой»: бот доигрывает за доли секунды, потом готов
    if (hurry) { if (!hurryT0) hurryT0 = performance.now(); if (performance.now() - hurryT0 > 450) { TPS.BOT.playPrep(M, 1, { weak: firstMatch, rng: M.R }); return; } }
    var a = TPS.BOT.nextAction(M, 1, { weak: firstMatch, rng: M.R });
    if (a && a.kind === 'ready' && !hurry && performance.now() < prepEnd - 2000 && Math.random() < 0.6) { botTimer = setTimeout(botLoop, 900); return; }
    TPS.BOT.apply(M, 1, a);
    if (M.sides[1].ready) return;
    if (hurry) { botTimer = setTimeout(botLoop, 110); return; }
    botTimer = setTimeout(botLoop, 650 + Math.random() * 900);
  }
  function prep(round) {
    return new Promise(function (resolve) {
      phase = 'prep'; hintShown = false; lastInput = performance.now(); hurryT0 = 0; prepHired = false;
      H.eReady.hidden = true; H.eAv.classList.remove('isReady'); H.ready.classList.remove('done', 'green', 'x2');
      H.hire.classList.remove('off'); setRoundLbl(round);
      deferIncome = flyIncome();   // метка дохода улетает в счётчик, он докрутится по прилёту
      M.startPrep(round); updateHire(); updateCrew(); refreshMarks(); prepHints();
      prepMs = B.match.rounds[round - 1].prep * 1000 * (dev.short ? 0.5 : 1); prepEnd = performance.now() + prepMs;
      botTimer = setTimeout(botLoop, 900);
      if (firstMatch && round === 1) setTimeout(function () { maybeHint(true); }, 400);
      var iv = setInterval(function () {
        var left = prepEnd - performance.now();
        setRing(Math.max(0, left / prepMs), left < 5000);
        if (left < 5000 && left > 0 && !M.sides[0].ready) { var l5 = H.ready.querySelector('.lbl'); l5.classList.remove('word'); l5.textContent = Math.ceil(left / 1000); }
        else updateReady();
        accentTick();
        var done = M.sides[0].ready && M.sides[1].ready;
        if (left <= 0 || done) {
          clearInterval(iv); clearTimeout(botTimer);
          if (!M.sides[0].ready) M.ready(0, true); if (!M.sides[1].ready) M.ready(1, true);
          phase = 'locked'; refreshMarks(); clearAccent(); if (hand) { hand.n.remove(); hand = null; }
          setTimeout(resolve, 200);
        }
      }, 100);
      H.ready.onclick = function () { SFX.init(); if (phase !== 'prep') return; SFX.press(); M.ready(0); updateReady(); if (M.sides[0].ready) { refreshMarks(); botLoop(); } };
      H.hire.onclick = function () { SFX.init(); lastInput = performance.now(); if (phase !== 'prep' || drag) return; M.hire(0); };
    });
  }

  // ---------- бой: проигрывание событий ----------
  var speed = 1;
  // событие добивания: потопление или последняя смерть матча (выбитая команда, абордаж); null, если матч не кончился
  function finalEvent(res) {
    if (!res.end) return null;
    var want = res.end.outcome === 'sink' ? 'sink' : 'death', best = null;
    res.events.forEach(function (e) { if (e.type === want && (!best || e.t >= best.t)) best = e; });
    return best;
  }
  // добивание (тумблер finisher): событие играется как обычно, с хит-стопом и тряской, потом замедление и наезд камеры
  function playFinal(e) {
    var sd = sideOf(e.side), pos;
    if (e.type === 'sink') pos = F.ships[sd].root.position.clone();
    else { var c = cellOfId(sd, e.id); pos = F.worldOf(sd, c >= 0 ? c : e.cell, 0.3); }
    onEvent(e);
    F.finisherPlus = dev.finisherPlus !== false;
    F.finisher(pos, { sink: e.type === 'sink' });
  }
  // залп бортом (тумблер volley): первые выстрелы каждой пушки в начале захода, в пределах 1,4 с, играются одной волной.
  // Симуляция не меняется: время и урон те же, меняется только картинка и звук.
  function markVolleys(res) {
    res.events.forEach(function (e) { if (e.type === 'fire') delete e._volley; });
    if (dev.volley === false) return;
    var P = B.pass, p2 = (P.sec + B.hull.turnSec) * 1000;
    [0, 1].forEach(function (side) { [0, 1].forEach(function (pass) {
      var g = [], seen = {}, t0 = -1;
      res.events.forEach(function (e) {
        if (e.type !== 'fire' || e.side !== side || (pass === 0 ? e.t >= P.sec * 1000 : e.t < p2)) return;
        if (t0 < 0) t0 = e.t; var k = e.cannon.board + ':' + e.cannon.slot;
        if (e.t - t0 <= 1400 && !seen[k]) { seen[k] = 1; g.push(e); }
      });
      if (g.length >= 2) g.forEach(function (e, i) { e._volley = { i: i, n: g.length, last: i === g.length - 1 }; });
    }); });
  }
  // празднование победителей (тумблер celebrate): прыжки команды, салют живыми пушками, «ура»
  function celebrate() {
    if (dev.celebrate === false || !M || !M.ended) return Promise.resolve();
    var sd = sideOf(M.ended.winner), dur = dev.short ? 1.6 : 2.4;
    F.showHp(false); F.celebrate(sd, dur); F.salute(sd); setTimeout(function () { SFX.cheer(); }, sd === 'p' ? 150 : 400);
    return new Promise(function (r) { setTimeout(r, dur * 850); });
  }
  // ---------- ульты 3-го ранга: кат-ин и кольцо заряда ----------
  var ULT_NAME = { gunner: 'Ядро-великан', shooter: 'Сквозной выстрел', boarder: 'Прыжок на канате' }, cutShown = {}, rings = [];
  // полоса с портретом и названием проезжает через экран, мир на 0,6 с замедляется; только первая ульта стороны за бой
  function cutIn(sd, kind) {
    if (cutShown[sd]) return; cutShown[sd] = true; F.ultSlow(0.65, 0.3);
    var c = el('cutin ' + (sd === 'p' ? 'mine' : 'foe'), ui, '<img src="art/sprites/portrait_' + kind + '.jpg" draggable="false"><b>' + ULT_NAME[kind] + '</b>');
    c.style.top = (ui.clientHeight * (sd === 'p' ? 0.58 : 0.3)) + 'px';
    setTimeout(function () { c.remove(); }, 1100); SFX.banner();
  }
  function startRings(res) {
    clearRings();
    res.events.forEach(function (e) { if (e.type === 'ult') rings.push({ e: e, n: el('uring', H.marks) }); });
  }
  function tickRings(simT) {
    rings.forEach(function (r) {
      var sd = sideOf(r.e.side), c = cellOfId(sd, r.e.id); if (c < 0) { r.n.style.display = 'none'; return; }
      var p = F.toScreen(F.worldOf(sd, c, 1.25)); r.n.style.display = ''; r.n.style.left = p.x + 'px'; r.n.style.top = p.y + 'px';
      r.n.style.setProperty('--p', Math.min(1, simT / Math.max(1, r.e.t)) * 360 + 'deg'); r.n.classList.toggle('full', simT >= r.e.t - 250);
    });
  }
  function dropRing(e) { rings = rings.filter(function (r) { if (r.e === e) { r.n.remove(); return false; } return true; }); }
  function clearRings() { rings.forEach(function (r) { r.n.remove(); }); rings = []; }
  function playTimeline(res, kind) {
    return new Promise(function (resolve) {
      var evs = res.events.slice(), simT = 0, P = B.pass, turnAt = P.sec * 1000, last = performance.now(), turned = false;
      var fin = dev.finisher !== false ? finalEvent(res) : null, finAt = 0;
      if (kind === 'battle') markVolleys(res);
      cutShown = {}; startRings(res);
      function travelAt(t) {
        var sec = t / 1000, d = 1.4;
        if (kind !== 'battle') return 0;
        if (sec <= P.sec) return -d + 2 * d * (sec / P.sec);
        if (sec <= P.sec + B.hull.turnSec) return d;
        return d - 2 * d * Math.min(1, (sec - P.sec - B.hull.turnSec) / P.sec);
      }
      (function step() {
        var now = performance.now(), dt = Math.min(100, now - last); last = now;
        if (F.stopT <= 0) simT += dt * speed * F.slowK * F.ultSlowK;   // F.ultSlowK < 1 на кат-ин ульты   // F.slowK < 1 только во время добивания
        while (evs.length && evs[0].t <= simT) { var ev = evs.shift(); if (ev === fin) { playFinal(ev); finAt = now; } else onEvent(ev); }
        // заранее вскинуть мушкетон: атаки стрелков в ближайшие 0,3 с симуляции
        for (var ai = 0; ai < evs.length && evs[ai].t <= simT + 300; ai++) { var ae = evs[ai]; if (ae.type === 'attack' && ae.weapon === 'musket' && !ae._aimed) { ae._aimed = true; var asd = sideOf(ae.side), ac = cellOfId(asd, ae.id); if (ac >= 0) F.aimShooter(asd, ac); } }
        if (kind === 'battle') {
          var tv = travelAt(simT); F.ships.p.travel = tv; F.ships.e.travel = -tv;
          if (!turned && simT >= turnAt) { turned = true; F.ships.p.turn(B.hull.turnSec); F.ships.e.turn(B.hull.turnSec); }
          setRing(Math.max(0, 1 - simT / res.ms), false);
        }
        tickRings(simT);
        if (simT >= res.ms && !evs.length && (!F.finishing() || now - finAt > 4000)) { clearRings(); resolve(); return; }   // камера добивания успевает вернуться
        requestAnimationFrame(step);
      })();
    });
  }
  function setSpeed(x) { speed = x; F.timeScale = x; H.ready.classList.toggle('x2on', x === 2); }

  function syncHp() { [0, 1].forEach(function (i) { M.units(i).forEach(function (x) { F.setHp(sideOf(i), x.cell, x.u.hp / x.u.max); }); }); }

  // ---------- главный цикл матча ----------
  // атмосфера матча: время суток и погода; «авто» выбирает случайно на каждый матч
  function applyAtmo() {
    var t = dev.time === 'day' || dev.time === 'evening' ? dev.time : (Math.random() < 0.5 ? 'day' : 'evening');
    var w = ['calm', 'normal', 'wind'].indexOf(dev.weather) >= 0 ? dev.weather : (function (r) { return r < 0.25 ? 'calm' : r < 0.75 ? 'normal' : 'wind'; })(Math.random());
    F.setAtmo({ time: t, weather: w }); app.dataset.time = t; app.dataset.weather = w;
  }
  async function runMatch() {
    firstMatch = dev.firstScript && meta.matches === 0;
    var seed = dev.seed != null && dev.seed !== '' ? +dev.seed : Math.floor(Math.random() * 1e9);
    M = TPS.SIM.create({ seed: seed, bal: B, firstMatch: firstMatch }); M.on(onEvent); M.lastSeed = seed;
    F.clearSide('p'); F.clearSide('e'); F.clearDecals(); F.showHp(false);
    F.clearPiles(); pendingIncome = null; clearLoot(); F.finisher(null); F.celebrate(null); F.angryOn = dev.angry !== false;
    applyAtmo();
    ['p', 'e'].forEach(function (sd) { F.ships[sd].unsink(); F.ships[sd].travel = 0; F.ships[sd].cannons.forEach(function (cn) { F.ships[sd].setCannon(cn, 'ok'); }); });
    F.ships.p.setYaw(0); F.ships.e.setYaw(Math.PI); H.pCard.hidden = H.eCard.hidden = true;
    M.startMatch();
    [0, 1].forEach(function (i) { M.sides[i].grid.forEach(function (g, c) { if (g && g.keg) F.setKeg(sideOf(i), c, true); }); }); prepHints();
    setBar('p', 1); setBar('e', 1); ['p', 'e'].forEach(function (sd) { F.setHullDamage(sd, 1); H[sd + 'Bar'].classList.remove('crit'); }); setCoins(0, true); showIncome(false);
    // вход в уровень
    show('enter'); placeHud('enter'); F.setFrame('prep', true); H.layer.style.opacity = H.bot.style.opacity = 0;
    await enterAnim();
    H.layer.style.opacity = H.bot.style.opacity = '';
    show('prep'); placeHud('prep'); await banner('Раунд 1/3', 900);
    for (var r = 1; r <= 3; r++) {
      if (r === 3) {
        show('cards'); placeHud('cards'); await cardsPhase(); show('prep');
      }
      show('prep'); placeHud('prep'); await prep(r);
      if (r <= 2) {
        phase = 'battle'; prepHints(); H.eReady.hidden = true; H.eAv.classList.remove('isReady');   /* галочка готовности соперника только в подготовке */ show('battle'); placeHud('battle'); F.setFrame('battle'); F.showHp(true); syncHp(); H.hire.classList.add('off'); H.ready.classList.add('x2');
        setReadyLbl('x2');
        H.ready.onclick = function () { setSpeed(speed === 1 ? 2 : 1); SFX.tap(); };
        pendingIncome = null; setIncome(B.economy.income[r]); showIncome(true);   // доход следующей подготовки, будет расти от убийств
        await banner('Бой!', 700);
        var res = M.fight(r); await playTimeline(res, 'battle');
        setSpeed(1);
        if (res.end) { await Promise.all([collectLoot(), celebrate()]); break; }   // последний бой: монеты в добычу, а не к Hire
        await collectCoins();
        phase = 'roundEnd'; F.ships.p.turn(1); F.ships.e.turn(1); F.ships.p.travel = F.ships.e.travel = 0;
        F.setFrame('prep'); F.showHp(false); H.ready.classList.remove('x2');
        await banner('Раунд ' + (r + 1) + '/3', 900);
      } else {
        phase = 'boarding'; prepHints(); H.eReady.hidden = true; H.eAv.classList.remove('isReady');   /* галочка готовности соперника только в подготовке */ show('boarding'); placeHud('boarding'); setRoundLbl(3); F.setFrame('board'); F.showHp(true); syncHp(); H.hire.classList.add('off'); H.ready.classList.add('x2');
        setReadyLbl('x2'); H.ready.onclick = function () { setSpeed(speed === 1 ? 2 : 1); SFX.tap(); };
        // анонс: корабли сходятся бортами с хрустом, баннер «НА АБОРДАЖ!», наши поднимают оружие и кричат, враги пригибаются
        setTimeout(function () { F.boardCrunch(); }, 600);
        setTimeout(function () { Object.keys(F.units.p).forEach(function (c, i) { setTimeout(function () { var u = F.units.p[c]; if (u) F.kits.p.act(u.S); }, i * 60); });
          Object.keys(F.units.e).forEach(function (c) { var u = F.units.e[c]; if (u) F.kits.e.flinch(u.S); }); SFX.cheer(); }, 750);
        await banner('НА АБОРДАЖ!', 1300, 'board');
        var br = M.board(); await boardIntro(br);
        await playTimeline(br, 'board'); setSpeed(1);
        await Promise.all([collectLoot(), celebrate()]);
      }
    }
    var result = M.result(0);
    phase = 'end'; await wait(loot ? 250 : 700);
    await results(result);
  }

  function enterAnim() {
    return new Promise(function (resolve) {
      var t0 = performance.now(), D = dev.short ? 0.5 : 1;
      V.cloudImgs.forEach(function (c, i) { c.dataset.cx = [0.5, 0.2, 0.82, 0.15, 0.85, 0.5][i]; c.dataset.cy = [0.45, 0.25, 0.3, 0.7, 0.72, 0.12][i]; });
      (function step() {
        var t = (performance.now() - t0) / D, W = ui.clientWidth, Hh = ui.clientHeight;
        var pc = Math.min(1, t / 900), spread = 1 + 1.8 * pc * pc, grow = 1 + 1.4 * pc;
        V.fog.style.opacity = Math.max(0, 1 - pc * 2.2);
        V.cloudImgs.forEach(function (c) { c.style.opacity = 0; });   // облака на входе теперь 3D (F.enterClouds), картинки остаются запасом
        F.enterClouds(Math.min(1, t / 1500));   // облака расходятся дольше тумана: туман уходит к 0,4 с, облака к 1,2 с
        var z = Math.min(1, Math.max(0, (t - 300) / 2000)), e = z < 0.5 ? 4 * z * z * z : 1 - Math.pow(-2 * z + 2, 3) / 2, tr = Math.min(1, t / 2300);
        F.zoom = { k: 0.3 + 0.7 * e, dx: 5.5 * Math.pow(1 - tr, 3), v: tr < 1 ? 1 : 0 };
        var hud = Math.min(1, Math.max(0, (t - 1900) / 600)); H.layer.style.opacity = H.bot.style.opacity = hud;
        if (t < 2500) requestAnimationFrame(step); else { F.zoom = null; V.clouds.hidden = true; F.enterClouds(1); resolve(); }
      })();
    });
  }

  // искра карты: летит по дуге из карты к бойцу, на прилёте вызывает onHit
  function spark(from, to, col, delay, onHit, last) {
    var n = document.createElement('i'); n.className = 'cspark'; n.style.background = col; n.style.boxShadow = '0 0 calc(10px * var(--s)) ' + col; n.style.left = from.x + 'px'; n.style.top = from.y + 'px'; ui.appendChild(n);
    var t0 = performance.now() + delay, dur = 520, mx = (from.x + to.x) / 2 + (Math.random() - 0.5) * 120 * s(), my = Math.min(from.y, to.y) - 60 * s();
    (function st() {
      var u = (performance.now() - t0) / dur; if (u < 0) return requestAnimationFrame(st);
      u = Math.min(1, u); var a = 1 - u, x = a * a * from.x + 2 * a * u * mx + u * u * to.x, y = a * a * from.y + 2 * a * u * my + u * u * to.y;
      n.style.left = x + 'px'; n.style.top = y + 'px'; n.style.transform = 'translate(-50%,-50%) rotate(' + (u * 360) + 'deg) scale(' + (1 - 0.4 * u) + ')';
      if (u < 1) requestAnimationFrame(st); else { n.remove(); if (last && onHit) onHit(); }
    })();
  }
  // показать эффект карты на бойце ещё до абордажа
  function previewFx(type, cell) {
    var w = F.worldOf('p', cell, 0.1);
    if (type === 'curse') F.fx.curse(w, true);
    if (type === 'storm') { var w2 = w.clone(); w2.y += 1.2; F.fx.bolt(w2, F.worldOf('p', cell, 0.5), 0.18); }
    if (type === 'healer') F.fx.heal(w);
    if (type === 'powder') { F.fx.dust(w, 2); F.fx.sparkle(w, false); }
    if (type === 'rum') { F.setRage('p', cell, 1.2); }
    if (type === 'bubble') { F.setBubble('p', cell, 1); setTimeout(function () { F.setBubble('p', cell, 0); }, 900); }
    SFX.tap();
  }
  function cardsPhase() {
    return new Promise(function (resolve) {
      phase = 'cards'; var offer = M.offerCards(), picked = false, R = RECTS;
      H.cards.hidden = false; put(H.cardsTitle, R.cardsTitle); fit(H.cardsTitle, 12);
      H.cardBtns.forEach(function (b, i) {
        var c = offer[0][i], rar = B.cards.rarity[c.rarity], cu = CARD_UI[c.type];
        put(b, R['card' + i]); b.style.setProperty('--rc', rar.color); b.className = 'pickCard r' + c.rarity;
        b.style.setProperty('--bg0', cu.bg[0]); b.style.setProperty('--bg1', cu.bg[1]);
        var fr = CARD_FR[c.rarity], rr = R['card' + i], ch = rr.h, cw = ch * fr.ar; if (cw > rr.w) { cw = rr.w; ch = cw / fr.ar; }
        b.innerHTML = '<div class="cf" style="left:' + (rr.w - cw) / 2 + 'px;top:' + (rr.h - ch) / 2 + 'px;width:' + cw + 'px;height:' + ch + 'px">' +
          '<i class="ill" style="' + boxCss(fr.win) + ';background-image:url(art/sprites/card_' + c.type + '.png)"></i>' +
          '<img class="frm" draggable="false" src="art/sprites/card_frame_' + c.rarity + '.png">' +
          '<b style="' + boxCss(fr.rib) + '">' + cu.name + '</b>' +
          '<div class="pan" style="' + boxCss(fr.pan) + '"><em>' + cu.big(B.cards, c.rarity) + '</em><small>' + cu.line + '</small></div>' +
          (c.rarity === 2 ? '<i class="spk s0"></i><i class="spk s1"></i><i class="spk s2"></i>' : '') + '</div>';
        b.style.animationDelay = (i * 0.14 + (c.rarity === 2 ? 0.2 : 0)) + 's';
        b.onclick = function () { if (picked) return; choose(i, false); };
        fit(b.querySelector('b'), 9); fit(b.querySelector('small'), 7);
      });
      SFX.reroll();
      var ms = B.cards.pickSec * 1000 * (dev.short ? 0.5 : 1), end = performance.now() + ms;
      H.ready.classList.add('x2'); H.hire.classList.add('off');
      var botAt = performance.now() + (2000 + Math.random() * 3000) * (dev.short ? 0.5 : 1), botDone = false;
      var iv = setInterval(function () {
        var left = end - performance.now(); setRing(Math.max(0, left / ms), left < 3000); setReadyLbl(Math.max(0, Math.ceil(left / 1000)));
        if (!botDone && performance.now() > botAt) { botDone = true; M.pick(1, TPS.BOT.pickCard(M, 1)); }
        if (left <= 0 && !picked) choose(M.autoPick(0), true);
      }, 100);
      function choose(i, auto) {
        picked = true; SFX.merge(true); M.pick(0, i, auto);
        H.cardBtns.forEach(function (b, j) { b.classList.add(j === i ? 'chosen' : 'gone'); });
        // выбранная карта рассыпается частицами, они летят на команду, и эффект сразу виден на палубе
        var cb = H.cardBtns[i].getBoundingClientRect(), ub = ui.getBoundingClientRect(), from = { x: cb.left - ub.left + cb.width / 2, y: cb.top - ub.top + cb.height * 0.35 };
        var ct = offer[0][i].type, col = '#' + CARD_UI[ct].fx.toString(16).padStart(6, '0');
        setTimeout(function () { M.units(0).forEach(function (x, k) {
          var to = F.toScreen(F.worldOf('p', x.cell, 0.5));
          for (var q = 0; q < 3; q++) spark(from, to, col, 60 + k * 50 + q * 40, function (cell) { return function () { previewFx(ct, cell); }; }(x.cell), q === 2);
        }); }, 250);
        setTimeout(function () {
          clearInterval(iv); if (!botDone) M.pick(1, TPS.BOT.pickCard(M, 1));
          H.cards.hidden = true; H.ready.classList.remove('x2'); resolve();
        }, 1300);
      }
    });
  }

  function boardIntro(br) {
    return new Promise(function (resolve) {
      var ev = br.events.filter(function (e) { return e.type === 'board'; })[0];
      SFX.hook(); F.ultSlow(0.75, 0.35);   // кошки летят в замедлении
      [0.25, 0.5, 0.75].forEach(function (t, i) { setTimeout(function () {
        var a = F.ships.p.deck.localToWorld(new THREE.Vector3(F.ships.p.gx0 + 4 * t, 0.2, -1.6)), b = F.ships.e.deck.localToWorld(new THREE.Vector3(F.ships.e.gx0 + 4 * t, 0.2, -1.6));
        F.fx.hook(a, b, 0.45);
      }, i * 120); });
      setTimeout(function () { F.shake(4); SFX.land(); }, 700);
      // нападающие перебегают на палубу защитника
      if (ev) setTimeout(function () { F.boardJump(SIDE[ev.attacker], SIDE[ev.defender]);
        // камера: короткий наезд и доворот к палубе защитника
        var Dd = F.ships[SIDE[ev.defender]].root.position, Aa = F.ships[SIDE[ev.attacker]].root.position; F.zoomPulse(0.08); F.nudge((Dd.x - Aa.x) * 0.12, (Dd.z - Aa.z) * 0.12); }, 760 * (dev.short ? 0.6 : 1));
      if (ev) {
        var tot = ev.power[0] + ev.power[1], v = tot ? ev.power[0] / tot : 0.5;
        H.power.hidden = false; put(H.power, RECTS.power); H.power.querySelector('.pf').style.width = '50%'; H.power.querySelector('b').textContent = '';
        setTimeout(function () { H.power.querySelector('.pf').style.width = (v * 100) + '%'; H.power.querySelector('b').textContent = Math.round(v * 100) + ' : ' + Math.round(100 - v * 100); }, 300);
        // под полосой: откуда сила, корпус и карта у обеих сторон
        var note = function (i) { var S2 = M.sides[i], c2 = S2.card ? CARD_UI[S2.card.type].name : 'без карты'; return 'корпус ' + Math.round(S2.hull / S2.hullMax * 100) + '%, ' + c2; };
        var pn = el('powerNote', ui, '<span class="me">Мы: ' + note(0) + '</span><span class="foe">Враг: ' + note(1) + '</span>');
        var pr = RECTS.power; pn.style.left = pr.x + 'px'; pn.style.top = (pr.y + pr.h + 4 * s()) + 'px'; pn.style.width = pr.w + 'px';
        H.power.classList.remove('pop'); void H.power.offsetWidth; H.power.classList.add('pop');
        setTimeout(function () { H.power.hidden = true; pn.remove(); resolve(); }, 2300 * (dev.short ? 0.6 : 1));
      } else setTimeout(resolve, 600);
    });
  }

  // ---------- итоги и возврат ----------
  var HINTS = {
    sink: 'Канонир рядом с пушкой ускоряет её на 30% за ранг',
    wipe: 'Абордажники крепче всех и принимают мушкетный огонь на себя',
    board: 'В абордаже атакует сильнейший, а целый корпус добавляет силы команде'
  };
  // ---------- конфетти и монеты на экране итогов: один canvas поверх слоя ----------
  var CONF = (function () {
    var cv = null, g = null, parts = [], raf = 0, last = 0, rainT = 0, rain = 0, coinImg = new Image(), ingotImg = new Image();
    coinImg.src = 'art/sprites/ic_doubloon.png'; ingotImg.src = 'art/sprites/ic_ingot.png';
    // украшения из простейших форм: четырёхлучевые звёзды и кружки, цвета эталона
    var COLS = ['#FFC93C', '#FFE07A', '#FFFFFF', '#8FDCFF', '#5FB2FF', '#FF8A6B'];
    function rnd(a, b) { return a + Math.random() * (b - a); }
    // coin: true (дублон, крутится ребром), 'ingot' (слиток: тяжелее, кувыркается), иначе звезда или кружок
    function add(x, y, vx, vy, coin, star) {
      star = star != null ? star : !coin && Math.random() < 0.6; var ing = coin === 'ingot';
      parts.push({ x: x, y: y, vx: vx, vy: vy, r: ing ? rnd(-0.4, 0.4) : rnd(0, 6.28), vr: ing ? rnd(-5, 5) : rnd(-3, 3), c: COLS[Math.floor(Math.random() * COLS.length)],
        ph: rnd(0, 6.28), coin: !!coin, ing: ing, star: star, sz: (ing ? rnd(26, 34) : coin ? rnd(18, 26) : star ? rnd(8, 16) : rnd(3, 7)) * s(), life: coin ? 2.6 : rnd(3.5, 6), t: 0 });
    }
    function star4(g, r) {
      var k = r * 0.32; g.beginPath(); g.moveTo(0, -r); g.quadraticCurveTo(k * 0.35, -k * 0.35, r, 0); g.quadraticCurveTo(k * 0.35, k * 0.35, 0, r);
      g.quadraticCurveTo(-k * 0.35, k * 0.35, -r, 0); g.quadraticCurveTo(-k * 0.35, -k * 0.35, 0, -r); g.fill();
    }
    function frame(now) {
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      var W = cv.width, H = cv.height, dpr = cv._dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
      if (rain > 0) { rainT += dt * rain; while (rainT > 1) { rainT -= 1; add(rnd(0, cv._w), -10, rnd(-20, 20), rnd(40, 120)); } }
      for (var i = parts.length - 1; i >= 0; i--) {
        var p = parts[i]; p.t += dt;
        if (p.coin) { p.vy += (p.ing ? 1900 : 1500) * dt; p.vx *= 1 - 0.6 * dt; }
        else { p.vy += 420 * dt; p.vx *= 1 - 1.8 * dt; p.vy = Math.min(p.vy, p.star ? 110 : 80); p.x += Math.sin(p.t * 2.2 + p.ph) * 30 * dt; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
        if (p.y > cv._h + 30 || p.t > p.life) { parts.splice(i, 1); continue; }
        var a = Math.min(1, (p.life - p.t) / 0.5);
        g.save(); g.globalAlpha = a; g.translate(p.x, p.y); g.rotate(p.r);
        if (p.ing) { var ih = p.sz * 144 / 256; g.drawImage(ingotImg, -p.sz / 2, -ih / 2, p.sz, ih); }
        else if (p.coin) { var k = Math.abs(Math.cos(p.t * 9 + p.ph)); g.scale(0.25 + 0.75 * k, 1); g.drawImage(coinImg, -p.sz / 2, -p.sz / 2, p.sz, p.sz); }
        else {
          var tw = 0.55 + 0.45 * Math.sin(p.t * 7 + p.ph);   // мерцание
          g.fillStyle = p.c;
          if (p.star) { g.scale(tw, tw); g.shadowColor = p.c; g.shadowBlur = 8 * s(); star4(g, p.sz); }
          else { g.globalAlpha = a * (0.5 + 0.5 * tw); g.beginPath(); g.arc(0, 0, p.sz, 0, 6.29); g.fill(); g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(-p.sz * 0.3, -p.sz * 0.3, p.sz * 0.35, 0, 6.29); g.fill(); }
        }
        g.restore();
      }
      if (parts.length || rain > 0) raf = requestAnimationFrame(frame); else raf = 0;
    }
    function kick() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
    return {
      attach: function (canvas) {
        cv = canvas; g = cv.getContext('2d'); var dpr = Math.min(2, window.devicePixelRatio || 1), r = ui.getBoundingClientRect();
        cv._dpr = dpr; cv._w = r.width; cv._h = r.height; cv.width = r.width * dpr; cv.height = r.height * dpr;
      },
      // залп из двух нижних углов к центру
      cannons: function (n) {
        var W = cv._w, H = cv._h, j = 0.7 + 0.3 * (dev.juice || 1);
        for (var i = 0; i < n * j; i++) { add(-10, H * 0.78, rnd(260, 520), rnd(-1050, -650)); add(W + 10, H * 0.78, -rnd(260, 520), rnd(-1050, -650)); }
        kick();
      },
      rain: function (perSec) { rain = perSec; kick(); },
      coins: function (x, y, n) { for (var i = 0; i < n; i++) add(x, y, rnd(-220, 220), rnd(-760, -420), true); kick(); },
      ingots: function (x, y, n) { for (var i = 0; i < n; i++) add(x, y, rnd(-200, 200), rnd(-820, -480), 'ingot'); kick(); },
      stars: function (x, y, n) { for (var i = 0; i < n; i++) add(x, y, rnd(-260, 260), rnd(-520, -220), false, true); kick(); },
      stop: function () { rain = 0; parts = []; if (raf) cancelAnimationFrame(raf); raf = 0; if (g) g.clearRect(0, 0, cv.width, cv.height); }
    };
  })();

  function results(res) {
    return new Promise(function (resolve) {
      show('results'); var R = layout('results');
      put(V.plaque, R.victory); put(V.reward, R.reward); put(V.reason, R.reason); put(V.hint, R.hint); put(V.cont, R.cta); fitLbl(V.cont);
      V.plaqueImg.src = 'art/sprites/' + (res.win ? 'plaque_victory' : 'plaque_defeat') + '.png'; V.plaqueT.textContent = res.win ? 'Победа' : 'Поражение';
      res.win ? SFX.win() : SFX.lose();
      // строки награды: золото меты везде слитками; добыча первой, в неё ложится слиток с палубы
      var lootV = res.loot || 0, rows = [];
      if (lootV > 0) rows.push({ k: 'loot', t: 'Добыча', v: '+' + lootV, ic: 'ic_ingot' });
      rows.push({ k: 'gold', t: res.win ? 'За победу' : 'За бой', v: '+' + res.gold, ic: 'ic_ingot' });
      if (res.bonus) rows.push({ k: 'gold', t: 'Досрочная победа', v: '+' + res.bonus, ic: 'ic_ingot' });
      rows.push({ k: 'tro', t: 'Кубки', v: (res.trophies > 0 ? '+' : '') + res.trophies, ic: 'ic_trophy' });
      if (res.blueprint) rows.push({ k: 'bp', t: 'Чертёж пушки', v: '1', ic: 'ic_blueprint' });
      V.reward.innerHTML = rows.map(function (r) { return '<div class="' + r.k + '"><span>' + r.t + '</span><b><img class="ri" draggable="false" src="art/sprites/' + r.ic + '.png"><i class="v">' + r.v + '</i></b></div>'; }).join('');
      V.reason.textContent = res.reason + (res.round <= 2 && res.outcome !== 'board' ? ' в ' + res.round + '-м раунде' : '');
      V.hint.textContent = res.win ? 'Матч занял ' + Math.round((performance.now() - matchT0) / 1000) + ' с. Следующий соперник будет сильнее.' : HINTS[res.outcome];
      var pr = R.victory, pw = Math.min(pr.w, pr.h * 256 / 124); V.plaqueT.style.width = (pw * 0.6) + 'px';
      fit(V.plaqueT, 14); fit(V.reason, 11); fit(V.hint, 10);
      // ---- постановка: плашка с отскоком, лучи и конфетти, строки наград по очереди с докруткой ----
      var win = !!res.win, T = function (ms) { return ms * (dev.short ? 0.6 : 1); }, timers = [], done = false;
      function later(ms, fn) { timers.push(setTimeout(fn, T(ms))); }
      V.res.classList.toggle('win', win); V.res.classList.toggle('lose', !win);
      V.res.classList.remove('go'); void V.res.offsetWidth; V.res.classList.add('go');
      var pc = { x: pr.x + pr.w / 2, y: pr.y + pr.h / 2 }, rs = Math.max(ui.clientWidth, 520 * s()) * 1.25;
      put(V.rays, { x: pc.x - rs / 2, y: pc.y - rs / 2, w: rs, h: rs }); put(V.glow, { x: pc.x - rs * 0.32, y: pc.y - rs * 0.32, w: rs * 0.64, h: rs * 0.64 });
      V.plaqueShine.style.width = pw + 'px';
      V.stars.forEach(function (st, i) { var a = -2.6 + i * 1.05, rr = pw * (0.55 + (i % 2) * 0.12); st.style.left = (pc.x + Math.cos(a) * rr) + 'px'; st.style.top = (pc.y + Math.sin(a) * rr * 0.62) + 'px'; });
      var rowsEl = Array.prototype.slice.call(V.reward.children);
      rowsEl.forEach(function (r) { r.classList.add('pend'); });
      [V.reason, V.hint].forEach(function (n) { n.classList.add('pend'); });
      V.cont.style.visibility = 'hidden'; hot(V.cont, false);
      CONF.attach(V.conf); CONF.stop();
      // слиток с палубы летит в строку «Добыча» и прячется в её иконку, когда строка выезжает
      var lootRow = V.reward.querySelector('.loot');
      if (loot && loot.node && lootRow) {
        var ri0 = lootRow.querySelector('.ri').getBoundingClientRect(), ub0 = ui.getBoundingClientRect(), ln = loot.node, ing = ln.querySelector('.ing');
        var lx = parseFloat(ln.style.left), ly = parseFloat(ln.style.top), tx = ri0.left - ub0.left + ri0.width / 2, ty = ri0.top - ub0.top + ri0.height / 2;
        var k = ri0.width / Math.max(1, ing.getBoundingClientRect().width);
        ln.classList.add('fly'); void ln.offsetWidth;
        ln.style.transform = 'translate(-50%,-50%) translate(' + (tx - lx) + 'px,' + (ty - ly) + 'px) scale(' + k + ')';
      } else clearLoot();
      function dropLoot() { if (loot) { clearLoot(); } }
      if (win) { later(250, function () { CONF.cannons(60); SFX.banner(); F.sfx.buzz && F.sfx.buzz(30); }); later(900, function () { CONF.rain(16); }); later(3600, function () { CONF.rain(5); }); }
      else later(380, function () { SFX.land(); });
      // строки: выезжают по очереди, число докручивается с тиком монет, золото взрывается монетами
      var ri = 0;
      function nextRow() {
        if (done) return;
        if (ri >= rowsEl.length) return finish();
        var r = rowsEl[ri++], b = r.querySelector('b'), vv = r.querySelector('.v'), txt = vv.textContent, m = txt.match(/(-?)(\d+)/), sign = txt.charAt(0) === '+' ? '+' : '', to = m ? +m[2] : 0, neg = m && m[1] === '-';
        var goldRow = r.classList.contains('gold') || r.classList.contains('loot');
        if (r.classList.contains('loot')) dropLoot();
        r.classList.remove('pend'); r.classList.add('in'); b.classList.toggle('neg', neg);
        var t0 = performance.now(), dur = T(Math.min(700, 250 + to * 6)), tick = 0;
        (function st() {
          if (done) return;
          var u = Math.min(1, (performance.now() - t0) / dur), v = Math.round(to * (1 - Math.pow(1 - u, 3)));
          vv.textContent = (neg ? '-' : sign) + v;
          if (performance.now() - tick > (goldRow ? 90 : 70) && u < 1) { tick = performance.now(); goldRow ? SFX.ingotTick() : SFX.tap(); }
          if (u < 1) return requestAnimationFrame(st);
          b.classList.remove('popv'); void b.offsetWidth; b.classList.add('popv');
          if (!neg) {
            var br = b.getBoundingClientRect(), ub = ui.getBoundingClientRect(), bx = br.left - ub.left + br.width / 2, by = br.top - ub.top + br.height / 2;
            if (goldRow) { SFX.ingot(); if (win) CONF.ingots(bx, by, r.classList.contains('loot') ? 7 : 5); }
            else if (win) CONF.stars(bx, by, 8);
          }
          later(160, nextRow);
        })();
      }
      function finish() {
        if (done) return; done = true; timers.forEach(clearTimeout);
        dropLoot();
        rowsEl.forEach(function (r, i) { r.classList.remove('pend'); r.classList.add('in'); r.querySelector('.v').textContent = rows[i].v; });
        [V.reason, V.hint].forEach(function (n, i) { setTimeout(function () { n.classList.remove('pend'); n.classList.add('in'); }, i * 140); });
        setTimeout(function () { V.cont.style.visibility = ''; V.cont.classList.remove('popIn'); void V.cont.offsetWidth; V.cont.classList.add('popIn'); hot(V.cont, true); }, 320);
      }
      later(650, nextRow);
      // тап по экрану до конца постановки сразу показывает всё
      V.res.onclick = function (ev) { if (!done && !V.cont.contains(ev.target)) finish(); };
      V.cont.onclick = function () {
        if (!done) return finish();
        CONF.stop(); hot(V.cont, false);
        SFX.tap(); meta.matches++; var g0 = meta.gold, t0 = meta.trophies;
        meta.gold += res.gold + (res.bonus || 0) + (res.loot || 0); meta.trophies = Math.max(0, meta.trophies + res.trophies); saveMeta();
        show('return'); placeMeta('return'); V.goldN.textContent = fmt(g0); V.troN.textContent = t0;
        var p = { x: ui.clientWidth / 2, y: ui.clientHeight * 0.4 };
        flyIngots(p, V.gold, 1 + Math.min(3, Math.floor((meta.gold - g0) / 25)), function () { countUp(V.goldN, g0, meta.gold, true); countUp(V.troN, t0, meta.trophies, false); });
        setTimeout(function () { show('main'); placeMeta('main'); resolve(); }, 1300);
      };
    });
  }
  function countUp(node, a, b, f) { var t0 = performance.now(); (function st() { var u = Math.min(1, (performance.now() - t0) / 600); var v = Math.round(a + (b - a) * u); node.textContent = f ? fmt(v) : v; if (u < 1) requestAnimationFrame(st); else if (node.parentNode && node.parentNode.classList.contains('counter')) fitCounter(node.parentNode); })(); }

  // ---------- главный, поиск, загрузка ----------
  var matchT0 = 0, searching = false;
  async function toBattle() {
    if (searching) return; searching = true; SFX.init(); SFX.press();
    if (!dev.skipSearch) {
      show('search'); var R = layout('search'); put(V.splashBg, R.splash); put(V.logo, R.logo); put(V.sTitle, R.searchTitle); put(V.sTime, R.searchTime); put(V.cancel, R.cancel); V.sBar.style.display = 'none';
      V.sTitle.textContent = 'Поиск противника'; V.cancel.style.display = ''; V.cancel.style.pointerEvents = 'none';
      setTimeout(function () { V.cancel.style.pointerEvents = ''; }, 400);
      var cancelled = false; V.cancel.onclick = function () { cancelled = true; SFX.tap(); };
      var t0 = performance.now(), dur = 2000 + Math.random() * 1000;
      while (performance.now() - t0 < dur && !cancelled) { V.sTime.textContent = '0:0' + Math.floor((performance.now() - t0) / 1000); await new Promise(function (r) { setTimeout(r, 100); }); }
      if (cancelled) { searching = false; show('main'); placeMeta('main'); return; }
      show('vs'); var R2 = layout('vs'); put(V.splashBg, R2.splash); put(V.logo, R2.logo); V.sTime.textContent = ''; V.cancel.style.display = 'none'; put(V.sTitle, R2.foundTitle); V.sTitle.textContent = 'Противник найден'; V.sTitle.classList.add('found'); V.sTime.style.display = 'none'; fit(V.sTitle, 16);
      await wait(1500); V.sTitle.classList.remove('found'); V.sTitle.style.fontSize = '';
    }
    matchT0 = performance.now();
    try { await runMatch(); } catch (err) { console.error(err); }
    searching = false;
  }
  async function boot() {
    buildHud(); buildScreens(); show('load');
    var R = layout('load'); put(V.splashBg, R.splash); put(V.logo, R.logo); put(V.sTitle, R.loadText); put(V.sBar, R.loadBar); V.sTitle.textContent = 'Загрузка'; V.cancel.style.display = 'none'; V.sTime.textContent = ''; V.sTime.style.display = 'none';
    var t0 = performance.now();
    while (performance.now() - t0 < 1200) { V.sBar.firstChild.style.width = Math.min(100, (performance.now() - t0) / 12) + '%'; await new Promise(function (r) { setTimeout(r, 50); }); }
    show('main'); placeMeta('main');
    V.cta.onclick = toBattle;
    V.units.forEach(function (c, i) { c.onclick = function () { SFX.init(); SFX.tap(); toast(['Канонир ускоряет соседнюю пушку', 'Стрелок бьёт мушкетом по команде врага', 'Абордажник сильнее всех в абордаже'][i]); }; });
    V.tabBtns.forEach(function (t, i) { if (i !== 2) t.onclick = function () { SFX.init(); SFX.deny(); wiggle(t); toast('Скоро'); }; });
  }

  // ---------- кадр ----------
  var last = performance.now(), fpsN = 0, fpsA = 0;
  function loop(now) {
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!stage.style.visibility || stage.style.visibility === 'visible') F.update(dt);
    tickMarks(); tickAccent(); tickBoostLbls(); tickDrag();
    fpsN++; fpsA += dt; if (fpsA > 0.5) { var f = $('fps'); if (f) f.textContent = Math.round(fpsN / fpsA) + ' FPS'; fpsN = 0; fpsA = 0; }
    requestAnimationFrame(loop);
  }
  // шрифт Rubik приходит позже первой раскладки и шире запасного: после загрузки всё раскладываем и подгоняем заново
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { window.dispatchEvent(new Event('resize')); });
  // Rubik может начать грузиться позже ready: перекладываем и после каждой догрузки шрифта, иначе подгонка кегля мерит запасной шрифт
  if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', function () { window.dispatchEvent(new Event('resize')); });
  if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', function () { window.dispatchEvent(new Event('resize')); });
  window.addEventListener('resize', function () {
    F.resize(); var scr = app.dataset.screen;
    if (scr === 'main' || scr === 'return') placeMeta(scr);
    else if (scr === 'load' || scr === 'search' || scr === 'vs') { var Rs = layout(scr); put(V.splashBg, Rs.splash); put(V.logo, Rs.logo); }
    else if (['prep', 'battle', 'boarding', 'cards', 'enter', 'roundEnd'].indexOf(scr) >= 0) placeHud(phase === 'battle' ? 'battle' : phase === 'boarding' ? 'boarding' : 'prep');
  });
  F.setJuice(dev.juice); SFX.set(dev.sound);
  requestAnimationFrame(loop);
  boot();

  // ---------- dev-панель: долгое нажатие 2 с в левом верхнем углу ----------
  // dev: все свои бойцы становятся 3-го ранга (в подготовке; если бойцов меньше трёх типов, нанимаются недостающие бесплатно)
  function cheatRank3() {
    if (!M || phase !== 'prep') return 'только в подготовке';
    var have = {}; M.units(0).forEach(function (x) { have[x.u.type] = 1; });
    ['gunner', 'shooter', 'boarder'].forEach(function (t) {
      if (have[t]) return; var fr = M.free(0); if (!fr.length) return;
      var c = fr.filter(function (x) { return Math.floor(x / 4) !== 1 || t !== 'gunner'; })[0]; if (c == null) c = fr[0];
      var hp = B.crew[t].hp; M.sides[0].grid[c] = { id: 'cheat' + c + t, type: t, rank: 1, hp: hp, max: hp };
      F.placeUnit('p', c, t, 1, { land: true, id: 'cheat' + c + t });
    });
    M.units(0).forEach(function (x) { x.u.rank = 3; x.u.max = x.u.hp = B.crew[x.u.type].hp * M.mult(3); F.setRank('p', x.cell, 3); });
    updateCrew(); refreshMarks(); return 'ok';
  }
  TPS.GAME = { cheatRank3: cheatRank3, F: F, get M() { return M; }, dev: dev, meta: meta, saveDev: saveDev, saveMeta: saveMeta, toBattle: toBattle, setSpeed: setSpeed,
    _test: { results: results, show: show, layout: layout, placeHud: placeHud, collectLoot: collectLoot, collectCoins: collectCoins, finalEvent: finalEvent, applyAtmo: applyAtmo, cards: function () { show('cards'); placeHud('cards'); return cardsPhase(); } } };   // _test: для автопроверки раскладки
})();
