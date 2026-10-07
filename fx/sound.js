/* TPS v0 · fx/sound.js
   Звук синтезируется кодом через WebAudio: файлов нет. Разброс высоты ±5%, в цепочках тон растёт.
   Включается с первого касания (браузер не даёт звук до него). Вибрация 10-20 мс только на Android. */
(function (root) {
  'use strict';
  var TPS = root.TPS = root.TPS || {};
  var ctx = null, master = null, on = true, chain = 0, chainT = 0;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    var AC = root.AudioContext || root.webkitAudioContext; if (!AC) return;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
  }
  function now() { return ctx.currentTime; }
  function vary(f) { return f * (0.95 + Math.random() * 0.1); }
  function tone(type, f0, f1, dur, vol, delay) {
    if (!ctx || !on) return;
    var t = now() + (delay || 0), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(vary(f0), t); if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, vary(f1)), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  var noiseBuf = null;
  function noise(dur, vol, fType, fFreq, delay, fTo) {
    if (!ctx || !on) return;
    if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    var t = now() + (delay || 0), s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = fType || 'lowpass'; f.frequency.setValueAtTime(vary(fFreq || 1200), t);
    if (fTo) f.frequency.exponentialRampToValueAtTime(fTo, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.02);
  }
  function buzz(ms) { try { if (/Android/i.test(navigator.userAgent) && navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }

  var S = {
    init: init,
    set: function (v) { on = v; },
    tap: function () { tone('triangle', 900, 600, 0.05, 0.12); },
    press: function () { tone('square', 220, 180, 0.04, 0.05); },
    deny: function () { tone('square', 140, 110, 0.18, 0.12); buzz(15); },
    roll: function () { for (var i = 0; i < 4; i++) tone('triangle', 500 + i * 120, 0, 0.04, 0.06, i * 0.055); },
    hire: function () { noise(0.25, 0.12, 'bandpass', 600, 0, 2400); tone('sine', 300, 700, 0.22, 0.08); },
    land: function () { tone('sine', 160, 60, 0.14, 0.3); noise(0.08, 0.08, 'lowpass', 900); buzz(10); },
    pair: function () { tone('sine', 1320, 0, 0.12, 0.08); },
    merge: function (triple) {
      var t = performance.now(); chain = (t - chainT < 1500) ? chain + 1 : 0; chainT = t;
      var k = Math.pow(1.122, Math.min(chain, 6));
      [523, 659, 784].forEach(function (f, i) { tone('triangle', f * k, 0, 0.22, 0.12, i * 0.05); });
      if (triple) [1047, 1319].forEach(function (f, i) { tone('sine', f * k, 0, 0.35, 0.1, 0.16 + i * 0.07); });
      buzz(triple ? 20 : 12);
    },
    keg: function () { noise(0.15, 0.2, 'bandpass', 500); tone('sine', 1500, 0, 0.08, 0.08, 0.05); tone('sine', 1900, 0, 0.08, 0.08, 0.1); },
    reroll: function () { noise(0.3, 0.12, 'bandpass', 2000, 0, 500); tone('triangle', 400, 900, 0.25, 0.08); },
    boom: function () { noise(0.5, 0.35, 'lowpass', 900, 0, 120); tone('sine', 90, 40, 0.35, 0.4); },
    hit: function () { noise(0.18, 0.25, 'lowpass', 1600, 0, 300); tone('square', 120, 60, 0.1, 0.1); buzz(12); },
    splash: function () { noise(0.4, 0.18, 'highpass', 900, 0, 3000); },
    musket: function () { noise(0.12, 0.25, 'highpass', 1200); tone('square', 300, 120, 0.06, 0.08); },
    slash: function () { noise(0.12, 0.15, 'bandpass', 3000, 0, 6000); },
    death: function () { tone('triangle', 500, 120, 0.3, 0.12); noise(0.2, 0.1, 'bandpass', 800); },
    coin: function () { tone('sine', 1760, 0, 0.07, 0.07); tone('sine', 2350, 0, 0.09, 0.07, 0.05); },
    // монета в цепочке сбора: каждая следующая на полтона выше, до октавы
    coinUp: function (i) { var k = Math.pow(1.0595, Math.min(i || 0, 12)); tone('sine', 1320 * k, 0, 0.06, 0.06); tone('sine', 1760 * k, 0, 0.08, 0.06, 0.04); },
    // переплавка: шипение и нарастающий гул
    melt: function () { noise(0.45, 0.14, 'bandpass', 900, 0, 3200); tone('sawtooth', 110, 330, 0.4, 0.05); },
    // слиток: тяжёлый глухой удар и короткий металлический отзвук, без звона монет
    ingot: function () { tone('sine', 140, 55, 0.22, 0.38); noise(0.07, 0.16, 'lowpass', 700); tone('triangle', 620, 560, 0.18, 0.05, 0.01); tone('triangle', 935, 0, 0.14, 0.03, 0.01); buzz(18); },
    ingotTick: function () { tone('triangle', 520, 470, 0.05, 0.06); tone('sine', 180, 120, 0.05, 0.08); },
    // залп бортом: глубокий раскат после серии выстрелов
    broadside: function () { noise(1.1, 0.32, 'lowpass', 700, 0, 60); tone('sine', 70, 32, 0.9, 0.45); tone('sine', 110, 45, 0.5, 0.2, 0.05); buzz(25); },
    // «ура» команды: короткие выкрики из шума с тоном, каждый выше
    cheer: function () {
      [0, 0.22, 0.44].forEach(function (d, i) { noise(0.2, 0.09, 'bandpass', 900 + i * 150, d, 1500 + i * 200); tone('sawtooth', 210 + i * 30, 300 + i * 40, 0.18, 0.035, d); tone('sawtooth', 262 + i * 30, 370 + i * 40, 0.18, 0.03, d + 0.01); });
    },
    // салют: холостой выстрел глуше обычного
    salute: function () { noise(0.35, 0.2, 'lowpass', 1100, 0, 200); tone('sine', 120, 50, 0.25, 0.22); },
    banner: function () { noise(0.3, 0.1, 'bandpass', 400, 0, 1400); },
    sink: function () { noise(1.4, 0.3, 'lowpass', 600, 0, 80); tone('sine', 120, 40, 1.2, 0.3); },
    hook: function () { tone('triangle', 900, 300, 0.2, 0.08); },
    win: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone('triangle', f, 0, 0.3, 0.13, i * 0.11); }); },
    lose: function () { [392, 330, 262].forEach(function (f, i) { tone('triangle', f, 0, 0.35, 0.12, i * 0.16); }); },
    buzz: buzz
  };
  TPS.SFX = S;
})(typeof window !== 'undefined' ? window : globalThis);
