/* TPS v0 · flow/sim.js
   Детерминированная симуляция матча: состояние, решения подготовки и seed дают поток событий.
   Рендер и UI только проигрывают события (контракт в shared/events.js). Синхрон потом гонит по сети
   только решения подготовки. Стороны 0 и 1: в матче с ботом 0 это игрок.
   Клетка i = ряд * 4 + колонка; ряд 0 у борта 0, который в начале раунда смотрит на соперника. */
(function (root) {
  'use strict';
  var TPS = root.TPS = root.TPS || {};
  var TYPES = ['gunner', 'shooter', 'boarder'];

  function rng(seed) {
    var a = seed >>> 0;
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function nb(i) { var r = Math.floor(i / 4), k = i % 4, o = []; if (k > 0) o.push(i - 1); if (k < 3) o.push(i + 1); if (r > 0) o.push(i - 4); if (r < 2) o.push(i + 4); return o; }

  function create(opt) {
    opt = opt || {};
    var B = opt.bal || TPS.BAL, R = rng(opt.seed == null ? 1 : opt.seed), uid = 1, listeners = [];
    var M = { seed: opt.seed, R: R, round: 0, phase: 'idle', t: 0, first: !!opt.firstMatch, log: [] };
    function emit(ev) { ev.t = ev.t == null ? M.t : ev.t; M.log.length < 4000 && M.log.push(ev); for (var i = 0; i < listeners.length; i++) listeners[i](ev); return ev; }
    M.on = function (fn) { listeners.push(fn); };

    function newSide(s) {
      var guns = ['cul', 'car', 'cul'], cn = [];
      for (var b = 0; b < 2; b++) for (var j = 0; j < 3; j++) { var k = guns[j] === 'car' ? 'carronade' : 'culverin'; cn.push({ b: b, j: j, kind: guns[j], hp: B.cannons[k].hp, max: B.cannons[k].hp, state: 'ok' }); }
      return { side: s, coins: 0, hires: 0, price: B.hire.base, grid: new Array(12).fill(null), hull: B.hull.hp, hullMax: B.hull.hp, cannons: cn,
        ready: false, income: 0, kills: 0, miss: { gunner: 0, shooter: 0, boarder: 0 }, card: null, totalHires: 0 };
    }
    M.sides = [newSide(0), newSide(1)];
    M.mult = function (r) { return Math.pow(B.crew.rankMult, r - 1); };
    M.units = function (s) { var g = M.sides[s].grid, o = []; for (var i = 0; i < 12; i++) if (g[i] && !g[i].keg) o.push({ cell: i, u: g[i] }); return o; };
    M.free = function (s) { var g = M.sides[s].grid, o = []; for (var i = 0; i < 12; i++) if (!g[i]) o.push(i); return o; };
    M.crew = function (s) { return M.units(s).length; };
    M.power = function (s) { var p = 0; M.units(s).forEach(function (x) { if (x.u.hp > 0) p += B.crew[x.u.type].power * M.mult(x.u.rank); }); return p; };

    function makeUnit(type, rank) { var hp = B.crew[type].hp * M.mult(rank); return { id: 'u' + (uid++), type: type, rank: rank, hp: hp, max: hp }; }
    function coins(s, delta, src) { var S = M.sides[s]; S.coins += delta; emit({ type: 'coins', side: s, delta: delta, total: S.coins, src: src }); }

    // ---------- найм ----------
    M.weights = function (s) {
      var S = M.sides[s], W = B.hire.weights, w = {};
      TYPES.forEach(function (t) {
        var n1 = M.units(s).filter(function (x) { return x.u.type === t && x.u.rank === 1; }).length;
        w[t] = W.base + (B.flags.hireWeights ? W.loneRank1 * (n1 % 2) + S.miss[t] : 0);
      });
      if (B.flags.hireWeights && M.idleCannons(s) > 0) w.gunner += W.gunnerPerIdleCannon;
      return w;
    };
    M.idleCannons = function (s) {
      var S = M.sides[s], n = 0;
      S.cannons.forEach(function (c) { if (c.state === 'broken') return; if (!M.boost(s, c)) n++; });
      return n;
    };
    M.boost = function (s, c) {
      var g = M.sides[s].grid, row = c.b === 0 ? 0 : 2, b = 0;
      [c.j, c.j + 1].forEach(function (k) { var u = g[row * 4 + k]; if (u && !u.keg && u.type === 'gunner' && u.hp > 0) b += B.crew.gunner.cannonSpeedPerRank * u.rank; });
      return b;
    };
    function rollType(s, exclude) {
      var w = M.weights(s), tot = 0, keys = TYPES.filter(function (t) { return t !== exclude; });
      keys.forEach(function (t) { tot += w[t]; });
      var x = R() * tot;
      for (var i = 0; i < keys.length; i++) { x -= w[keys[i]]; if (x <= 0) return keys[i]; }
      return keys[keys.length - 1];
    }
    M.hire = function (s, forceType) {
      var S = M.sides[s];
      if (S.ready) return emit({ type: 'deny', side: s, action: 'hire', reason: 'ready_locked' }) && null;
      if (S.coins < S.price) return emit({ type: 'deny', side: s, action: 'hire', reason: 'no_money' }) && null;
      var fr = M.free(s); if (!fr.length) return emit({ type: 'deny', side: s, action: 'hire', reason: 'board_full' }) && null;
      var type = forceType || rollType(s);
      if (!forceType && M.first && s === 0 && S.totalHires === 2) {   // первый матч: среди первых трёх найма гарантирована пара
        var have = M.units(s).filter(function (x) { return x.u.rank === 1; }).map(function (x) { return x.u.type; });
        var pair = TYPES.some(function (t) { return have.filter(function (h) { return h === t; }).length >= 2; });
        if (!pair && have.length) type = have[0];
      }
      TYPES.forEach(function (t) { if (t === type) S.miss[t] = 0; else S.miss[t] += B.hire.weights.missBonus; });
      var cell = fr[Math.floor(R() * fr.length)], u = makeUnit(type, 1), price = S.price;
      S.grid[cell] = u; S.hires++; S.totalHires++;
      coins(s, -price, 'hire'); S.price = B.hire.base + B.hire.step * S.hires;
      emit({ type: 'hire', side: s, unit: { id: u.id, type: type, rank: 1 }, cell: cell, price: price, next: S.price });
      return { cell: cell, unit: u };
    };

    // ---------- перестановка и мерж ----------
    function breakKegsNear(s, cell) {
      var S = M.sides[s];
      nb(cell).forEach(function (n) { if (S.grid[n] && S.grid[n].keg) { S.grid[n] = null; coins(s, B.economy.barrel, 'barrel'); emit({ type: 'barrel', side: s, cell: n, coins: B.economy.barrel }); } });
    }
    M.canMerge = function (a, b) { return a && b && !a.keg && !b.keg && a.type === b.type && a.rank === b.rank && a.rank < B.crew.rankCap; };
    M.move = function (s, from, to) {
      var S = M.sides[s], a = S.grid[from], b = S.grid[to];
      if (!a || a.keg || from === to || S.ready) return null;
      if (b && b.keg) return emit({ type: 'deny', side: s, action: 'move', reason: 'keg' }) && null;
      if (M.canMerge(a, b)) {
        S.grid[from] = null; b.rank += 1; var hpN = B.crew[b.type].hp * M.mult(b.rank); b.max = hpN; b.hp = hpN;
        emit({ type: 'merge', side: s, ids: [a.id, b.id], unit: { id: b.id, type: b.type, rank: b.rank }, cell: to, n: 2 });
        breakKegsNear(s, to); return { merged: true, cell: to };
      }
      S.grid[from] = b || null; S.grid[to] = a;
      emit({ type: 'move', side: s, id: a.id, from: from, to: to, swap: b ? b.id : null });
      return { moved: true };
    };
    // тройки: связная группа из трёх и больше одинаковых соседей
    M.triples = function (s) {
      var g = M.sides[s].grid, seen = {}, out = [];
      for (var i = 0; i < 12; i++) {
        var u = g[i]; if (!u || u.keg || seen[i] || u.rank >= B.crew.rankCap) continue;
        var grp = [], st = [i]; seen[i] = 1;
        while (st.length) { var c = st.pop(); grp.push(c); nb(c).forEach(function (n) { var v = g[n]; if (!seen[n] && v && !v.keg && v.type === u.type && v.rank === u.rank) { seen[n] = 1; st.push(n); } }); }
        if (grp.length >= 3) out.push(grp);
      }
      return out;
    };
    M.mergeTriple = function (s, cell) {
      var S = M.sides[s], grp = M.triples(s).filter(function (g) { return g.indexOf(cell) >= 0; })[0];
      if (!grp || S.ready) return null;
      var keep = grp.slice(0, 3).sort(function (a, b) { return (a === cell ? -1 : 0) - (b === cell ? -1 : 0); });
      if (keep.indexOf(cell) < 0) keep[0] = cell;
      // тройка: из трёх бойцов получаются два ранга выше (третий уходит); их потом можно слить ещё раз отдельным шагом
      var tgt = S.grid[keep[0]], tgt2 = S.grid[keep[1]], ids = keep.map(function (c) { return S.grid[c].id; });
      S.grid[keep[2]] = null;
      [tgt, tgt2].forEach(function (u) { u.rank = Math.min(B.crew.rankCap, u.rank + 1); u.max = u.hp = B.crew[u.type].hp * M.mult(u.rank); });
      emit({ type: 'merge', side: s, ids: ids, unit: { id: tgt.id, type: tgt.type, rank: tgt.rank }, unit2: { id: tgt2.id, rank: tgt2.rank }, cell: keep[0], cell2: keep[1], n: 3, from: [keep[2]] });
      breakKegsNear(s, keep[0]); return { cell: keep[0] };
    };
    M.reroll = function (s, cell) {
      var S = M.sides[s], u = S.grid[cell];
      if (!u || u.keg || S.ready) return null;
      if (u.rank >= 3) return emit({ type: 'deny', side: s, action: 'reroll', reason: 'super_locked' }) && null;
      var price = u.rank === 1 ? B.reroll.rank1 : B.reroll.rank2;
      if (S.coins < price) return emit({ type: 'deny', side: s, action: 'reroll', reason: 'no_money' }) && null;
      var from = u.type; u.type = rollType(s, from); u.max = u.hp = B.crew[u.type].hp * M.mult(u.rank);
      coins(s, -price, 'reroll');
      emit({ type: 'reroll', side: s, id: u.id, from: from, to: u.type, price: price, cell: cell });
      return { to: u.type };
    };
    M.ready = function (s, auto) {
      var S = M.sides[s]; if (S.ready) return;
      var need = B.match.readyMinCrewR1 || 1, fill = B.match.autoCrewR1 || need;
      if (M.round === 1 && !auto && M.crew(s) < need) return emit({ type: 'deny', side: s, action: 'ready', reason: 'need_crew' }) && null;
      if (M.round === 1 && auto) while (M.crew(s) < fill && M.free(s).length) { if (S.coins < S.price) coins(s, S.price - S.coins, 'start'); M.hire(s); }
      S.ready = true; emit({ type: 'ready', side: s, auto: !!auto });
    };

    // ---------- раунды ----------
    M.startMatch = function () {
      M.round = 0;
      [0, 1].forEach(function (s) {
        var S = M.sides[s], cells = []; for (var i = 0; i < 12; i++) cells.push(i);
        for (var k = 0; k < B.hull.barrels; k++) { var j = Math.floor(R() * cells.length); S.grid[cells.splice(j, 1)[0]] = { keg: true }; }
      });
    };
    M.startPrep = function (round) {
      M.round = round; M.phase = 'prep';
      [0, 1].forEach(function (s) {
        var S = M.sides[s]; S.ready = false; S.hires = 0; S.price = B.hire.base;
        var inc = round === 1 ? B.economy.start : B.economy.income[round - 1] + S.kills;
        coins(s, inc, round === 1 ? 'start' : 'income'); S.kills = 0;
        emit({ type: 'income', side: s, value: B.economy.income[Math.min(round, 2)] });
      });
      emit({ type: 'phase', phase: 'prep', round: round, ms: B.match.rounds[round - 1].prep * 1000 });
    };

    // ---------- карты перед абордажем ----------
    M.offerCards = function () {
      var C2 = B.cards, rar = function () { var x = R(); return x < C2.rarity[0].p ? 0 : x < C2.rarity[0].p + C2.rarity[1].p ? 1 : 2; };
      // три разные карты из шести, у каждой своя редкость; оба игрока видят одинаковый набор
      var pool = C2.order.slice(), base = [];
      while (base.length < (C2.offer || 3) && pool.length) { var k = Math.floor(R() * pool.length); base.push({ type: pool.splice(k, 1)[0], rarity: rar() }); }
      var hp = [0, 1].map(function (s) { return M.sides[s].hull / M.sides[s].hullMax; });
      M.offer = [0, 1].map(function (s) {
        var o = base.map(function (c) { return { type: c.type, rarity: c.rarity }; });
        if (C2.catchUp && hp[s] < hp[1 - s]) { var cand = o.filter(function (c) { return c.rarity < 2; }); if (cand.length) cand[Math.floor(R() * cand.length)].rarity++; }
        emit({ type: 'cards', side: s, offer: o });
        return o;
      });
      emit({ type: 'phase', phase: 'cards', round: 3, ms: C2.pickSec * 1000 });
      return M.offer;
    };
    M.autoPick = function (s) { var o = M.offer[s], best = 0; for (var i = 1; i < o.length; i++) if (o[i].rarity > o[best].rarity) best = i; return best; };
    M.pick = function (s, idx, auto) {
      var S = M.sides[s]; if (S.card) return; var c = M.offer[s][idx], C2 = B.cards; S.card = c;
      emit({ type: 'pick', side: s, index: idx, auto: !!auto, card: c });   // эффект карты работает в абордаже, см. M.board
    };

    // ---------- артиллерия: раунд считается сразу, UI проигрывает события по t ----------
    M.fight = function (round) {
      M.phase = 'battle'; var P = B.pass, T = P.sec * 2 + B.hull.turnSec, out = [], end = null;
      function ev(t, e) { e.t = Math.round(t * 1000); out.push(e); return e; }
      ev(0, { type: 'phase', phase: 'battle', round: round, ms: T * 1000 });
      ev(0, { type: 'pass', n: 1, ms: P.sec * 1000 });
      var acts = [];
      [0, 1].forEach(function (s) {
        var S = M.sides[s];
        S.cannons.forEach(function (c, ci) {
          var K = B.cannons[c.kind === 'car' ? 'carronade' : 'culverin'];
          [0, 1].forEach(function (pass) {
            if (c.b !== pass) return;
            var p0 = pass * (P.sec + B.hull.turnSec), w0 = 0, w1 = P.sec;
            if (c.kind === 'car' && B.flags.carronadeMidOnly) { w0 = P.sec * (0.5 - P.carronadeWindow / 2); w1 = P.sec * (0.5 + P.carronadeWindow / 2); }
            acts.push({ t: p0 + w0 + 0.3 + c.j * 0.35 + R() * 0.4, kind: 'cannon', s: s, ci: ci, end: p0 + w1, rel: K.reload });
          });
        });
        M.units(s).forEach(function (x) { if (x.u.type === 'shooter' && B.flags.shooterMusket) acts.push({ t: 1 + R() * 1.5, kind: 'musket', s: s, id: x.u.id, end: T - 0.3, rel: B.crew.shooter.musketReload }); });
      });
      // ульты 3-го ранга: канонир и стрелок по разу за раунд, по заряду; две ульты одной стороны не ближе gapSec
      var SU = B.crew.super || {};
      if (B.flags.ults && SU.chargeSec != null) [0, 1].forEach(function (s) {
        var k = 0;
        M.units(s).filter(function (x) { return x.u.rank >= 3 && (x.u.type === 'gunner' || (x.u.type === 'shooter' && B.flags.shooterMusket)); })
          .sort(function (a, b) { return a.cell - b.cell; })
          .forEach(function (x) { acts.push({ t: SU.chargeSec + k++ * SU.gapSec, kind: 'ult', s: s, id: x.u.id, type: x.u.type, end: T - 0.5 }); });
      });
      // течь: корабль ниже порога теряет корпус каждую секунду боя
      function startLeak(s, t0) { if (!B.flags.leak || M.sides[s].leaking === round) return; M.sides[s].leaking = round; acts.push({ t: t0, kind: 'leak', s: s, end: T }); }
      [0, 1].forEach(function (s) { var S0 = M.sides[s]; if (S0.hull / S0.hullMax < (B.hull.leakBelow || 0)) startLeak(s, 1); });
      function facingRow(s, t) { return t < P.sec + B.hull.turnSec / 2 ? 0 : 2; }
      function cellOf(s, id) { var g = M.sides[s].grid; for (var i = 0; i < 12; i++) if (g[i] && g[i].id === id) return i; return -1; }
      var guard = 0;
      while (acts.length && guard++ < 5000) {
        acts.sort(function (a, b) { return a.t - b.t; });
        var a = acts.shift(); if (a.t > a.end) continue;
        var S = M.sides[a.s], O = M.sides[1 - a.s], o = 1 - a.s;
        if (a.kind === 'cannon') {
          var c = S.cannons[a.ci]; if (c.state === 'broken') continue;
          var K = B.cannons[c.kind === 'car' ? 'carronade' : 'culverin'], hitT = a.t + 0.45, boost = M.boost(a.s, c);
          var hit = R() < K.accuracy, toCannon = hit && R() < B.hull.cannonHitShare;
          ev(a.t, { type: 'fire', side: a.s, cannon: { board: c.b, slot: c.j }, weapon: c.kind === 'car' ? 'carronade' : 'culverin', boost: boost, result: !hit ? 'miss' : toCannon ? 'cannon' : 'hull', dmg: K.dmg });
          if (!hit) ev(hitT, { type: 'impact', side: o, target: 'miss', dmg: 0 });
          else if (toCannon) {
            var cands = O.cannons.filter(function (x) { return x.state !== 'broken' && x.b === (a.t < P.sec + 1 ? 0 : 1); });
            if (!cands.length) cands = O.cannons.filter(function (x) { return x.state !== 'broken'; });
            if (cands.length) {
              var tc = cands[Math.floor(R() * cands.length)]; tc.hp -= K.dmg; tc.state = tc.hp <= 0 ? 'broken' : tc.hp < tc.max * B.cannons.smokingAt ? 'smoking' : 'ok';
              ev(hitT, { type: 'impact', side: o, target: 'cannon', dmg: K.dmg, cannon: { board: tc.b, slot: tc.j }, state: tc.state });
            }
          } else {
            O.hull = Math.max(0, O.hull - K.dmg);
            ev(hitT, { type: 'impact', side: o, target: 'hull', dmg: K.dmg, hp: O.hull, pct: O.hull / O.hullMax });
            if (O.hull <= 0) { end = { t: hitT, winner: a.s, outcome: 'sink' }; ev(hitT + 0.2, { type: 'sink', side: o }); break; }
            if (O.hull / O.hullMax < (B.hull.leakBelow || 0)) startLeak(o, hitT + 1);
          }
          a.t += K.reload / (1 + boost); acts.push(a);
        } else if (a.kind === 'leak') {
          var L = M.sides[a.s], ld = Math.round(L.hullMax * B.hull.leakPerSec);
          L.hull = Math.max(0, L.hull - ld);
          ev(a.t, { type: 'impact', side: a.s, target: 'hull', dmg: ld, hp: L.hull, pct: L.hull / L.hullMax, leak: true });
          if (L.hull <= 0) { end = { t: a.t, winner: 1 - a.s, outcome: 'sink' }; ev(a.t + 0.2, { type: 'sink', side: a.s }); break; }
          a.t += 1; acts.push(a);
        } else if (a.kind === 'ult') {
          var me2 = cellOf(a.s, a.id); if (me2 < 0 || S.grid[me2].hp <= 0) continue;
          if (a.type === 'gunner') {
            // «Ядро-великан»: из пушки борта, который сейчас смотрит на врага, ближайшей к канониру; без промаха
            var pass = a.t < P.sec + B.hull.turnSec / 2 ? 0 : 1, col = me2 % 4;
            var gc = S.cannons.filter(function (x) { return x.state !== 'broken' && x.b === pass; }).sort(function (x, y) { return Math.abs(x.j + 0.5 - col) - Math.abs(y.j + 0.5 - col); })[0];
            if (!gc) continue;
            var gT = a.t + SU.gunner.flightSec;
            ev(a.t, { type: 'ult', side: a.s, kind: 'gunner', id: a.id, cell: me2, cannon: { board: gc.b, slot: gc.j }, flight: SU.gunner.flightSec });
            O.hull = Math.max(0, O.hull - SU.gunner.dmg);
            ev(gT, { type: 'impact', side: o, target: 'hull', dmg: SU.gunner.dmg, hp: O.hull, pct: O.hull / O.hullMax, ult: true });
            if (O.hull <= 0) { end = { t: gT, winner: a.s, outcome: 'sink' }; ev(gT + 0.2, { type: 'sink', side: o }); break; }
            if (O.hull / O.hullMax < (B.hull.leakBelow || 0)) startLeak(o, gT + 1);
          } else {
            // «Сквозной выстрел»: весь ряд врага, который сейчас ближе
            var row2 = facingRow(o, a.t), all = M.units(o).filter(function (x) { return x.u.hp > 0; });
            var rowT = all.filter(function (x) { return Math.floor(x.cell / 4) === row2; }); if (!rowT.length) rowT = all;
            if (!rowT.length) continue;
            var pd = B.crew.shooter.musketDmg * M.mult(S.grid[me2].rank) * SU.shooter.mult;
            ev(a.t, { type: 'ult', side: a.s, kind: 'shooter', id: a.id, cell: me2, targets: rowT.map(function (x) { return { id: x.u.id, cell: x.cell }; }) });
            var wiped = false;
            rowT.forEach(function (tx) {
              if (wiped) return;
              tx.u.hp = Math.max(0, tx.u.hp - pd);
              ev(a.t + 0.35, { type: 'hit', side: o, id: tx.u.id, cell: tx.cell, dmg: pd, hp: tx.u.hp, max: tx.u.max, src: 'ult' });
              if (tx.u.hp <= 0) {
                var rw = B.economy.killByRank[tx.u.rank - 1]; S.kills += rw; O.grid[tx.cell] = null;
                ev(a.t + 0.4, { type: 'death', side: o, id: tx.u.id, cell: tx.cell, coins: rw, rank: tx.u.rank });
                ev(a.t + 0.4, { type: 'income', side: a.s, value: B.economy.income[Math.min(round, 2)] + S.kills });
                if (M.crew(o) === 0) { end = { t: a.t + 0.4, winner: a.s, outcome: 'wipe' }; wiped = true; }
              }
            });
            if (wiped) break;
          }
        } else {
          var me = cellOf(a.s, a.id); if (me < 0 || S.grid[me].hp <= 0) continue;
          var row = facingRow(o, a.t), tg = M.units(o).filter(function (x) { return x.u.hp > 0; });
          var inRow = tg.filter(function (x) { return Math.floor(x.cell / 4) === row; });
          var pool = inRow.length ? inRow : tg;
          if (B.flags.shootersTargetBoarders) { var bo = pool.filter(function (x) { return x.u.type === 'boarder'; }); if (bo.length) pool = bo; }
          if (pool.length) {
            var tx = pool[Math.floor(R() * pool.length)], dmg = B.crew.shooter.musketDmg * M.mult(S.grid[me].rank);
            ev(a.t, { type: 'attack', side: a.s, id: a.id, cell: me, target: tx.u.id, targetCell: tx.cell, weapon: 'musket' });
            tx.u.hp = Math.max(0, tx.u.hp - dmg);
            ev(a.t + 0.25, { type: 'hit', side: o, id: tx.u.id, cell: tx.cell, dmg: dmg, hp: tx.u.hp, max: tx.u.max });
            if (tx.u.hp <= 0) {
              var rew = B.economy.killByRank[tx.u.rank - 1]; S.kills += rew; O.grid[tx.cell] = null;
              ev(a.t + 0.3, { type: 'death', side: o, id: tx.u.id, cell: tx.cell, coins: rew, rank: tx.u.rank });
              ev(a.t + 0.3, { type: 'income', side: a.s, value: B.economy.income[Math.min(round, 2)] + S.kills });
              if (M.crew(o) === 0) { end = { t: a.t + 0.3, winner: a.s, outcome: 'wipe' }; break; }
            }
          }
          a.t += B.crew.shooter.musketReload; acts.push(a);
        }
      }
      ev(P.sec, { type: 'pass', n: 2, ms: B.hull.turnSec * 1000 });
      out.sort(function (x, y) { return x.t - y.t; });
      if (end) out = out.filter(function (e) { return e.t <= Math.round(end.t * 1000) + 400; });
      M.ended = end; M.phase = end ? 'end' : 'roundEnd';
      out.forEach(function (e) { M.log.length < 4000 && M.log.push(e); });
      return { events: out, end: end, ms: end ? Math.round(end.t * 1000) + 1200 : T * 1000 };
    };

    // ---------- абордаж ----------
    M.board = function () {
      var out = [], end = null, t = 0;
      function ev(tt, e) { e.t = Math.round(tt * 1000); out.push(e); return e; }
      var pw = [M.power(0), M.power(1)];
      if (M.crew(0) === 0 || M.crew(1) === 0) { end = { t: 0, winner: M.crew(0) ? 0 : 1, outcome: 'wipe' }; M.ended = end; return { events: out, end: end, ms: 1200 }; }
      var att = pw[0] === pw[1] ? (R() < 0.5 ? 0 : 1) : (pw[0] > pw[1] ? 0 : 1), def = 1 - att;
      ev(0, { type: 'board', attacker: att, defender: def, power: pw });
      var BB = B.boarding, mod = [0, 1].map(function (s) {
        var hs = M.sides[s].hull / M.sides[s].hullMax;
        return (B.flags.hullAffectsBoarding ? BB.hullMod.base + BB.hullMod.k * hs : 1) * (s === def ? 1 + BB.defenderBonus : 1);
      });
      // ---- карты абордажа ----
      var CB = B.cards, card = [0, 1].map(function (s) { return M.sides[s].card; });
      function has(s, type) { return card[s] && card[s].type === type; }
      function val(s, type, key) { var v = CB[type][key]; return Array.isArray(v) ? v[card[s].rarity] : v; }
      var next = {}, lastRamp = 1, stacks = {}, curseUntil = {}, curseSrc = {}, shield = {}, healT = [1.5, 1.5], tickT = 1.5;
      var rageEnd = [0, 1].map(function (s) { return has(s, 'rum') ? 1.5 + CB.rum.sec : 0; });
      [0, 1].forEach(function (s) {
        M.units(s).forEach(function (x) {
          next[x.u.id] = 1.5 + R() * 0.8;
          if (has(s, 'bubble')) { shield[x.u.id] = val(s, 'bubble', 'charges'); ev(1.2, { type: 'status', side: s, id: x.u.id, cell: x.cell, kind: 'bubble', n: shield[x.u.id] }); }
          if (has(s, 'rum')) ev(1.4, { type: 'status', side: s, id: x.u.id, cell: x.cell, kind: 'rage', sec: CB.rum.sec });
        });
      });
      var dead = {}, queue = [];
      // «Прыжок на канате»: абордажники 3-го ранга в начале абордажа бьют передний ряд врага и оглушают его на stunSec
      var SB = (B.crew.super || {}).boarder, boardUlts = [];
      if (B.flags.ults && SB) [att, def].forEach(function (s) {
        var k = 0; M.units(s).filter(function (x) { return x.u.rank >= 3 && x.u.type === 'boarder'; }).sort(function (a, b) { return a.cell - b.cell; })
          .forEach(function (x) { boardUlts.push({ s: s, x: x, t: SB.atSec + k++ * B.crew.super.gapSec }); });
      });
      function alive(s) { return M.units(s).filter(function (y) { return y.u.hp > 0 && !dead[y.u.id]; }); }
      function byId(s, id) { var r = null; M.units(s).forEach(function (y) { if (y.u.id === id) r = y; }); return r; }
      // удар по бойцу: Пузырь может поглотить; возвращает нанесённый урон
      function strike(by, o, y, dmg, tt, extra) {
        if (dead[y.u.id] || y.u.hp <= 0) return 0;
        if (shield[y.u.id] > 0) { shield[y.u.id]--; ev(tt, { type: 'shield', side: o, id: y.u.id, cell: y.cell, left: shield[y.u.id] }); return 0; }
        y.u.hp = Math.max(0, y.u.hp - dmg);
        var e = { type: 'hit', side: o, id: y.u.id, cell: y.cell, dmg: dmg, hp: y.u.hp, max: y.u.max }; if (extra) for (var k in extra) e[k] = extra[k];
        ev(tt, e);
        if (y.u.hp <= 0) { dead[y.u.id] = 1; queue.push({ s: o, x: y, by: by, t: tt }); }
        return dmg;
      }
      boardUlts.sort(function (a, b) { return a.t - b.t; }).forEach(function (bu) {
        var s = bu.s, o = 1 - s, foes = alive(o); if (!foes.length || dead[bu.x.u.id]) return;
        var front = Math.min.apply(null, foes.map(function (y) { return Math.floor(y.cell / 4); }));
        var line = foes.filter(function (y) { return Math.floor(y.cell / 4) === front; }), land = bu.t + SB.flightSec;
        ev(bu.t, { type: 'ult', side: s, kind: 'boarder', id: bu.x.u.id, cell: bu.x.cell, flight: SB.flightSec, targets: line.map(function (y) { return { id: y.u.id, cell: y.cell }; }), stun: SB.stunSec });
        var bd = B.crew.boarder.boardDps * M.mult(bu.x.u.rank) * SB.dmgMult * mod[s];
        line.forEach(function (y) { strike(s, o, y, bd, land + 0.05, { src: 'ult' }); next[y.u.id] = Math.max(next[y.u.id] || 0, land + SB.stunSec); });
      });
      var dt = 0.25, guard = 0;
      for (t = 1.5; guard++ < 2000; t += dt) {
        var ramp = t < BB.rampFromSec ? 1 : 1 + BB.rampStep * Math.floor((t - BB.rampFromSec) / BB.rampEverySec + 1);
        if (ramp !== lastRamp) { lastRamp = ramp; ev(t, { type: 'ramp', mult: ramp }); }
        [att, def].forEach(function (s) {
          var o = 1 - s;
          alive(s).forEach(function (x) {
            if (t < next[x.u.id]) return;
            next[x.u.id] = t + (t < rageEnd[s] ? 1 / (1 + val(s, 'rum', 'haste')) : 1);
            var foes = alive(o); if (!foes.length) return;
            var front = Math.min.apply(null, foes.map(function (y) { return Math.floor(y.cell / 4); }));
            var line = foes.filter(function (y) { return Math.floor(y.cell / 4) === front; });
            var tg = line[Math.floor(R() * line.length)];
            var dmg = B.crew[x.u.type].boardDps * M.mult(x.u.rank) * mod[s] * ramp;
            ev(t, { type: 'attack', side: s, id: x.u.id, cell: x.cell, target: tg.u.id, targetCell: tg.cell, weapon: x.u.type === 'shooter' ? 'musket' : x.u.type === 'gunner' ? 'swab' : 'melee' });
            var dealt = strike(s, o, tg, dmg, t + 0.2);
            if (!dealt) return;
            if (has(s, 'curse') && !dead[tg.u.id]) {
              stacks[tg.u.id] = Math.min(CB.curse.maxStacks, (stacks[tg.u.id] || 0) + 1); curseUntil[tg.u.id] = t + 0.2 + CB.curse.sec; curseSrc[tg.u.id] = s;
              ev(t + 0.22, { type: 'status', side: o, id: tg.u.id, cell: tg.cell, kind: 'curse', stacks: stacks[tg.u.id], sec: CB.curse.sec });
            }
            if (has(s, 'storm')) {
              var from = tg, hitIds = [tg.u.id], to = [];
              for (var j = 0; j < val(s, 'storm', 'jumps'); j++) {
                var cand = null;
                alive(o).forEach(function (y) { if (!cand && hitIds.indexOf(y.u.id) < 0 && TPS.SIM.nb(from.cell).indexOf(y.cell) >= 0) cand = y; });
                if (!cand) break;
                hitIds.push(cand.u.id); to.push(cand.u.id); from = cand;
              }
              if (to.length) {
                ev(t + 0.24, { type: 'chain', side: s, from: tg.u.id, to: to, cells: to.map(function (id) { return byId(o, id).cell; }) });
                to.forEach(function (id, k) { strike(s, o, byId(o, id), dealt * CB.storm.share, t + 0.28 + k * 0.06, { src: 'storm' }); });
              }
            }
          });
        });
        // проклятие жжёт раз в секунду, лечение Знахаря раз в everySec
        if (t >= tickT + 1) {
          tickT = t;
          [0, 1].forEach(function (o) { alive(o).forEach(function (y) {
            var id = y.u.id; if (!stacks[id]) return;
            if (t > curseUntil[id]) { stacks[id] = 0; ev(t, { type: 'status', side: o, id: id, cell: y.cell, kind: 'curse', stacks: 0 }); return; }
            var cs = curseSrc[id], d = val(cs, 'curse', 'dps') * stacks[id];
            y.u.hp = Math.max(0, y.u.hp - d); ev(t, { type: 'tick', side: o, id: id, cell: y.cell, dmg: d, hp: y.u.hp, max: y.u.max, kind: 'curse' });
            if (y.u.hp <= 0) { dead[id] = 1; queue.push({ s: o, x: y, by: cs, t: t }); }
          }); });
        }
        [0, 1].forEach(function (s) {
          if (!has(s, 'healer') || t < healT[s] + CB.healer.everySec) return; healT[s] = t;
          var hurt = alive(s).filter(function (y) { return y.u.hp < y.u.max; }).sort(function (a, b) { return a.u.hp / a.u.max - b.u.hp / b.u.max; })[0];
          if (!hurt) return;
          var h = Math.min(hurt.u.max, hurt.u.hp + hurt.u.max * val(s, 'healer', 'pct')), d = hurt.u.hp - h; hurt.u.hp = h;
          ev(t, { type: 'hit', side: s, id: hurt.u.id, cell: hurt.cell, dmg: d, hp: h, max: hurt.u.max, src: 'healer' });
        });
        // смерти по очереди: Пороховая бочка взрывает погибшего и может зацепить соседей цепочкой
        while (queue.length) {
          var d = queue.shift(), rew = B.economy.killByRank[d.x.u.rank - 1];
          M.sides[d.by].kills += rew; M.sides[d.s].grid[d.x.cell] = null;
          ev(d.t + 0.1, { type: 'death', side: d.s, id: d.x.u.id, cell: d.x.cell, coins: rew, rank: d.x.u.rank });
          var foe = 1 - d.s;
          if (has(foe, 'powder')) {
            var near = alive(d.s).filter(function (y) { return TPS.SIM.nb(d.x.cell).indexOf(y.cell) >= 0; });
            ev(d.t + 0.15, { type: 'blast', side: d.s, cell: d.x.cell, ids: near.map(function (y) { return y.u.id; }) });
            near.forEach(function (y) { strike(foe, d.s, y, val(foe, 'powder', 'dmg'), d.t + 0.2, { src: 'powder' }); });
          }
        }
        var a0 = alive(0).length, a1 = alive(1).length;
        if (!a0 || !a1) { var w = !a0 && !a1 ? def : (a0 ? 0 : 1); end = { t: t + 0.6, winner: w, outcome: 'board' }; break; }
      }
      if (!end) end = { t: t, winner: def, outcome: 'board' };
      M.ended = end; M.phase = 'end';
      out.forEach(function (e) { M.log.length < 4000 && M.log.push(e); });
      return { events: out, end: end, ms: Math.round(end.t * 1000) + 800 };
    };

    M.result = function (side) {
      var e = M.ended, win = e.winner === side, Rw = B.rewards, early = e.outcome !== 'board';
      var gold = win ? Rw.gold.win : Rw.gold.loss, bonus = win && early && B.flags.earlyWinBonus ? Math.round(gold * Rw.earlyWinGold) : 0;
      // добыча: дублоны за убийства в последнем бою; нанимать уже некого, поэтому они переплавляются в золото меты
      var loot = Math.round((M.sides[side].kills || 0) * (Rw.lootRate == null ? 1 : Rw.lootRate));
      var bp = win && e.outcome === 'board' && R() < Rw.blueprintChance;
      var reason = e.outcome === 'sink' ? (win ? 'Потопили корабль' : 'Наш корабль потоплен') : e.outcome === 'wipe' ? (win ? 'Выбили всю команду' : 'Нашу команду выбили') : (win ? 'Взяли абордажем' : 'Проиграли абордаж');
      var res = { win: win, outcome: e.outcome, gold: gold, bonus: bonus, loot: loot, lootCoins: M.sides[side].kills || 0, trophies: win ? Rw.trophies.win : Rw.trophies.loss, blueprint: bp, reason: reason, round: M.round };
      emit({ type: 'end', winner: e.winner, outcome: e.outcome, gold: gold + bonus + loot, trophies: res.trophies, reason: reason, hint: '' });
      return res;
    };
    return M;
  }

  TPS.SIM = { create: create, rng: rng, TYPES: TYPES, nb: nb };
})(typeof window !== 'undefined' ? window : globalThis);
