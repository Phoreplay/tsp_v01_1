/* TPS v0 · flow/bot.js
   Бот играет по тем же правилам, что игрок: нанимает, сливает, делает Reroll, расставляет и выбирает карты.
   В игре между действиями человеческие паузы, в прогоне без графики всё сразу.
   weak: первый матч, бот только нанимает и сливает пары. */
(function (root) {
  'use strict';
  var TPS = root.TPS = root.TPS || {};

  // одно следующее действие или null, если бот готов
  function nextAction(M, s, o) {
    o = o || {};
    var S = M.sides[s], B = o.bal || TPS.BAL, R = o.rng || Math.random;
    if (S.ready) return null;
    if (!o.weak) { var tr = M.triples(s); if (tr.length) return { kind: 'triple', cell: tr[0][0] }; }
    var us = M.units(s), pair = null;
    for (var i = 0; i < us.length && !pair; i++) for (var j = 0; j < us.length && !pair; j++) {
      var a = us[i], b = us[j];
      if (i !== j && M.canMerge(a.u, b.u)) {
        var nearKeg = TPS.SIM.nb(b.cell).some(function (n) { return S.grid[n] && S.grid[n].keg; });
        if (!o.weak && !nearKeg) { var alt = TPS.SIM.nb(a.cell).some(function (n) { return S.grid[n] && S.grid[n].keg; }); if (alt) { pair = { from: b.cell, to: a.cell }; break; } }
        pair = { from: a.cell, to: b.cell };
      }
    }
    if (pair) return { kind: 'move', from: pair.from, to: pair.to };
    var limit = o.weak && M.round === 1 ? 3 : 99;
    if (S.coins >= S.price && M.free(s).length && S.hires < limit) return { kind: 'hire' };
    if (!o.weak && S.coins >= B.reroll.rank1 && R() < 0.3) {
      var lone = us.filter(function (x) { return x.u.rank === 1 && us.filter(function (y) { return y.u.type === x.u.type && y.u.rank === 1; }).length === 1; });
      if (lone.length && !M.free(s).length) return { kind: 'reroll', cell: lone[0].cell };
    }
    if (!o.weak) {   // канониров к пушкам: крайние ряды, стрелков в середину
      for (var k = 0; k < us.length; k++) {
        var x = us[k], row = Math.floor(x.cell / 4);
        if (x.u.type === 'gunner' && row === 1) {
          var tgt = [0, 1, 2, 3, 8, 9, 10, 11].filter(function (c) { var v = S.grid[c]; return !v || (!v.keg && v.type !== 'gunner'); })[0];
          if (tgt != null && !(S.grid[tgt] && S.grid[tgt].keg)) return { kind: 'move', from: x.cell, to: tgt };
        }
      }
    }
    return { kind: 'ready' };
  }
  function apply(M, s, act) {
    if (!act) return;
    if (act.kind === 'hire') M.hire(s);
    else if (act.kind === 'move') M.move(s, act.from, act.to);
    else if (act.kind === 'triple') M.mergeTriple(s, act.cell);
    else if (act.kind === 'reroll') M.reroll(s, act.cell);
    else if (act.kind === 'ready') M.ready(s, M.round === 1 && M.crew(s) < (TPS.BAL.match.autoCrewR1 || 3));   // бот в 1-м раунде добирает команду до трёх
  }
  // карта: сначала по редкости, при равной по составу команды
  function pickCard(M, s) {
    var o = M.offer[s], best = 0;
    for (var i = 1; i < o.length; i++) if (o[i].rarity > o[best].rarity) best = i;
    var ties = o.map(function (c, i) { return i; }).filter(function (i) { return o[i].rarity === o[best].rarity; });
    if (ties.length > 1) {
      var us = M.units(s), n = function (t) { return us.filter(function (x) { return x.u.type === t; }).length; };
      var hurt = us.some(function (x) { return x.u.hp < x.u.max * 0.7; }), foes = M.crew(1 - s);
      // любимая карта под состав: много стрелков бьют часто, абордажники держат удар, против толпы взрыв и молния
      var score = { curse: n('shooter') * 2 + 1, storm: foes >= 5 ? 4 : 1, healer: hurt ? 4 : n('boarder'), powder: foes >= 5 ? 3 : 1, rum: n('boarder') * 1.5 + 1, bubble: n('gunner') + 1 };
      ties.forEach(function (i) { if (score[o[i].type] > score[o[best].type]) best = i; });
    }
    return best;
  }
  // целиком сыграть подготовку (для прогона без графики)
  function playPrep(M, s, o) { var g = 0, a; while ((a = nextAction(M, s, o)) && g++ < 60) { apply(M, s, a); if (a.kind === 'ready') break; } if (!M.sides[s].ready) M.ready(s, true); }

  // матч бот против бота без графики
  function runMatch(seed, bal) {
    var M = TPS.SIM.create({ seed: seed, bal: bal }), R = TPS.SIM.rng(seed * 7 + 3), st = { seed: seed };
    M.startMatch();
    for (var r = 1; r <= 2; r++) {
      M.startPrep(r); playPrep(M, 0, { rng: R, bal: bal }); playPrep(M, 1, { rng: R, bal: bal });
      var f = M.fight(r);
      if (r === 1) { st.k1 = [M.sides[0].kills, M.sides[1].kills]; }
      if (f.end) { st.end = f.end; st.round = r; break; }
    }
    if (!st.end) {
      st.hullAfter2 = [M.sides[0].hull / M.sides[0].hullMax, M.sides[1].hull / M.sides[1].hullMax];
      M.offerCards(); [0, 1].forEach(function (s) { M.pick(s, pickCard(M, s)); });
      st.cards = [M.sides[0].card, M.sides[1].card];
      M.startPrep(3); playPrep(M, 0, { rng: R, bal: bal }); playPrep(M, 1, { rng: R, bal: bal });
      var b = M.board(); st.end = b.end; st.round = 3; st.boardSec = b.end.t;
    }
    st.res = [M.result(0), M.result(1)];
    st.ult = { gunner: 0, shooter: 0, boarder: 0 }; M.log.forEach(function (e) { if (e.type === 'ult') st.ult[e.kind]++; });
    st.leakSink = st.end.outcome === 'sink' && M.log.some(function (e) { return e.type === 'impact' && e.leak && e.hp <= 0; });
    return st;
  }
  function runMany(n, bal, seed0) {
    var out = { n: n, sink: 0, wipe: 0, board: 0, win0: 0, hull2: 0, hull2n: 0, len: 0, cards: {}, snow: { lead: 0, leadWin: 0 }, boardSec: 0,
      loot: { win: 0, loss: 0 }, gold: { win: 0, loss: 0 }, ult: { gunner: 0, shooter: 0, boarder: 0, any: 0 }, leakSink: 0, sinkR: [0, 0] };
    var B = bal || TPS.BAL, prep = B.match.rounds[0].prep + B.match.rounds[1].prep + B.match.rounds[2].prep + B.cards.pickSec, fightT = (B.pass.sec * 2 + B.hull.turnSec);
    for (var i = 0; i < n; i++) {
      var st = runMatch((seed0 || 1000) + i, bal);
      out[st.end.outcome]++; if (st.end.winner === 0) out.win0++;
      ['gunner', 'shooter', 'boarder'].forEach(function (k) { out.ult[k] += st.ult[k]; }); if (st.ult.gunner + st.ult.shooter + st.ult.boarder) out.ult.any++;
      if (st.leakSink) out.leakSink++; if (st.end.outcome === 'sink') out.sinkR[st.round - 1]++;
      if (st.hullAfter2) { out.hull2 += (st.hullAfter2[0] + st.hullAfter2[1]) / 2; out.hull2n++; }
      if (st.k1 && st.k1[0] !== st.k1[1]) { out.snow.lead++; if (st.end.winner === (st.k1[0] > st.k1[1] ? 0 : 1)) out.snow.leadWin++; }
      if (st.cards) st.cards.forEach(function (c, s) { var k = c.type; out.cards[k] = out.cards[k] || { n: 0, win: 0 }; out.cards[k].n++; if (st.end.winner === s) out.cards[k].win++; });
      // добыча и итоговое золото победителя и проигравшего: по ним калибруется база награды
      st.res.forEach(function (r) { var k = r.win ? 'win' : 'loss'; out.loot[k] += r.loot; out.gold[k] += r.gold + r.bonus + r.loot; });
      if (st.round === 3) { out.boardSec += st.boardSec; out.len += prep + 2 * fightT + st.boardSec; }
      else out.len += st.round * (fightT + 30) + (st.end.t || 0);
    }
    ['loot', 'gold'].forEach(function (k) { out[k].win /= n; out[k].loss /= n; });
    out.hull2 = out.hull2n ? out.hull2 / out.hull2n : 0; out.len /= n; out.boardSec = out.board ? out.boardSec / out.board : 0;
    return out;
  }
  TPS.BOT = { nextAction: nextAction, apply: apply, pickCard: pickCard, playPrep: playPrep, runMatch: runMatch, runMany: runMany };
})(typeof window !== 'undefined' ? window : globalThis);
