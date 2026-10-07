/* TPS v0 · fx/fx.js
   Частицы на спрайтах из art/sprites (нарезка листов 3 и 4) и art/cut (пена).
   Все частицы живут в пространстве сцены, качка кораблей их не трогает.
   Сочность juice 0..1,5 масштабирует число частиц, размер и длительность. */
(function (root) {
  'use strict';
  var TPS = root.TPS = root.TPS || {};

  function create(THREE, scene, opt) {
    opt = opt || {};
    var base = opt.base || '';
    var loader = new THREE.TextureLoader(), tex = {};
    function T(name) {
      if (!tex[name]) {
        var path = name.indexOf('/') >= 0 ? name : 'art/sprites/' + name + '.png';
        tex[name] = loader.load(base + path);
      }
      return tex[name];
    }
    var glow = (function () {
      var c = document.createElement('canvas'); c.width = c.height = 64; var g = c.getContext('2d');
      var gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,248,220,1)'); gr.addColorStop(0.4, 'rgba(255,200,90,.7)'); gr.addColorStop(1, 'rgba(255,140,20,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
    })();

    var live = [], pool = [], meshes = [];
    var api = { juice: 1, wind: 0 };   // wind: снос дыма вправо, клеток в секунду

    function sprite(map, additive) {
      var s = pool.pop();
      if (!s) { s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false })); }
      s.material.map = map; s.material.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending; s.material.color.setHex(0xffffff);
      s.material.opacity = 1; s.material.rotation = 0; s.material.needsUpdate = true; s.visible = true; s.renderOrder = 0;
      scene.add(s); return s;
    }
    // p: { map, pos, vel, grav, life, size, sizeTo, alpha, alphaTo, spin, add, delay, aspect, drag }
    function emit(p) {
      var j = api.juice;
      var s = sprite(p.map, p.add); if (p.color != null) s.material.color.set(p.color);
      s.position.copy(p.pos);
      var o = { s: s, t: -(p.delay || 0), life: (p.life || 0.6) * (0.6 + 0.4 * j), vel: p.vel ? p.vel.clone() : new THREE.Vector3(),
        grav: p.grav || 0, drag: p.drag || 0, size: (p.size || 0.5) * (0.75 + 0.25 * j), sizeTo: (p.sizeTo == null ? p.size || 0.5 : p.sizeTo) * (0.75 + 0.25 * j),
        alpha: p.alpha == null ? 1 : p.alpha, alphaTo: p.alphaTo == null ? 0 : p.alphaTo, spin: p.spin || 0, aspect: p.aspect || 1, rot: p.rot || 0, floor: p.floor };
      s.visible = o.t >= 0;
      s.scale.set(o.size * o.aspect, o.size, 1);
      live.push(o); return o;
    }
    function rnd(a, b) { return a + Math.random() * (b - a); }
    function count(n) { return Math.max(1, Math.round(n * api.juice)); }
    function V(x, y, z) { return new THREE.Vector3(x, y, z); }

    // ---------- пресеты ----------
    api.smoke = function (pos, dir) {
      dir = dir || V(0, 0, -1);
      for (var i = 0; i < count(3); i++) emit({ map: T('smoke_' + (i % 3)), pos: pos.clone().add(dir.clone().multiplyScalar(0.1 * i)),
        vel: dir.clone().multiplyScalar(rnd(0.3, 0.7)).add(V(rnd(-0.2, 0.3) + api.wind * 1.6, rnd(0.3, 0.6), rnd(-0.1, 0.1))), drag: 1.5 - api.wind,
        life: rnd(0.8, 1.2), size: 0.28, sizeTo: rnd(0.7, 0.95), alpha: 0.95, spin: rnd(-1, 1), delay: i * 0.04 });
    };
    api.flash = function (pos, dir) {
      emit({ map: T('flash_' + Math.floor(Math.random() * 3)), pos: pos.clone(), life: 0.12, size: 0.55, sizeTo: 0.75, alpha: 1, alphaTo: 0.2, rot: rnd(0, 6) });
      emit({ map: glow, add: true, pos: pos.clone(), life: 0.18, size: 0.9, sizeTo: 1.3, alpha: 0.9 });
      api.smoke(pos, dir);
    };
    api.splash = function (pos) {
      emit({ map: T('splash_' + Math.floor(Math.random() * 2)), pos: pos.clone().add(V(0, 0.15, 0)), life: 0.55, size: 0.35, sizeTo: 0.85, alpha: 1 });
      for (var i = 0; i < count(5); i++) emit({ map: T('art/cut/foam_' + (i % 5) + '.png'),
        pos: pos.clone(), vel: V(rnd(-0.8, 0.8), 0, rnd(-0.6, 0.6)), drag: 2, life: rnd(0.6, 1), size: 0.18, sizeTo: 0.3, alpha: 0.9 });
    };
    api.splinters = function (pos, dir) {
      dir = dir || V(0, 0, 1);
      for (var i = 0; i < count(4); i++) emit({ map: T('splinter_' + (i % 3)), pos: pos.clone(),
        vel: dir.clone().multiplyScalar(rnd(0.6, 1.4)).add(V(rnd(-1, 1), rnd(1.2, 2.2), rnd(-0.6, 0.6))), grav: -6,
        life: rnd(0.5, 0.75), size: rnd(0.16, 0.24), sizeTo: 0.14, alpha: 1, alphaTo: 0.6, spin: rnd(-8, 8) });
      api.dust(pos, 2);
    };
    api.dust = function (pos, n) {
      for (var i = 0; i < count(n || 3); i++) {
        var a = Math.random() * 6.28;
        emit({ map: T('dust_' + (i % 2)), pos: pos.clone(), vel: V(Math.cos(a) * rnd(0.4, 0.8), rnd(0.05, 0.25), Math.sin(a) * rnd(0.3, 0.6)), drag: 3,
          life: rnd(0.4, 0.6), size: 0.14, sizeTo: rnd(0.3, 0.42), alpha: 0.9 });
      }
    };
    api.cloth = function (pos, team) {
      emit({ map: T(team === 'red' ? 'cloth_0' : 'cloth_1'), pos: pos.clone(), vel: V(rnd(-0.5, 0.5), 2, rnd(-0.3, 0.3)), grav: -5,
        life: 0.8, size: 0.22, sizeTo: 0.2, alpha: 1, alphaTo: 0, spin: rnd(-6, 6) });
    };
    api.puff = function (pos) {
      for (var i = 0; i < count(4); i++) emit({ map: T('smoke_' + (i % 3)), pos: pos.clone().add(V(rnd(-0.1, 0.1), 0.3, rnd(-0.1, 0.1))),
        vel: V(rnd(-0.5, 0.5), rnd(0.4, 0.8), rnd(-0.3, 0.3)), drag: 3, life: 0.5, size: 0.2, sizeTo: 0.55, alpha: 1 });
    };
    api.skull = function (pos, onDone) {
      var o = emit({ map: T('ic_skull'), pos: pos.clone().add(V(0, 0.5, 0)), vel: V(0, 1.4, 0), drag: 1.2, life: 0.8, size: 0.3, sizeTo: 0.4, alpha: 1, alphaTo: 0 });
      if (onDone) o.done = onDone;
    };
    api.coins = function (pos, n) {
      var out = [];
      for (var i = 0; i < Math.min(n || 3, 8); i++) {
        var a = Math.random() * 6.28;
        out.push(emit({ map: T('ic_doubloon'), pos: pos.clone().add(V(0, 0.3, 0)), vel: V(Math.cos(a) * rnd(0.4, 0.9), rnd(1.6, 2.4), Math.sin(a) * rnd(0.3, 0.7)), grav: -7,
          life: 0.55, size: 0.17, sizeTo: 0.17, alpha: 1, alphaTo: 1, floor: pos.y + 0.05 }));
      }
      return out;
    };
    api.sparkle = function (pos, gold) {
      for (var i = 0; i < count(gold ? 10 : 6); i++) {
        var a = Math.random() * 6.28;
        emit({ map: glow, add: true, pos: pos.clone().add(V(0, 0.4, 0)), vel: V(Math.cos(a) * rnd(0.8, 1.6), rnd(0.6, 1.6), Math.sin(a) * rnd(0.6, 1.2)), drag: 2.5,
          life: rnd(0.35, 0.6), size: rnd(0.12, 0.2), sizeTo: 0.02, alpha: 1 });
      }
      emit({ map: glow, add: true, pos: pos.clone().add(V(0, 0.4, 0)), life: 0.25, size: 0.4, sizeTo: gold ? 1.6 : 1.1, alpha: 0.9 });
    };
    // блик на лежащей монете: маленькая звёздочка
    api.glint = function (pos) {
      emit({ map: glow, add: true, pos: pos.clone().add(V(0.03, 0.06, 0)), life: 0.3, size: 0.05, sizeTo: 0.28 * (0.8 + 0.2 * api.juice), alpha: 1, alphaTo: 0, rot: rnd(0, 1) });
    };
    // брызги у носа на свежем ветру: белый всплеск и пара капель
    api.spray = function (pos) {
      emit({ map: T('splash_' + Math.floor(Math.random() * 2)), pos: pos.clone().add(V(0, 0.12, 0)), life: 0.45, size: 0.2, sizeTo: 0.5, alpha: 0.95 });
      for (var i = 0; i < count(3); i++) emit({ map: glow, pos: pos.clone().add(V(0, 0.1, 0)), vel: V(rnd(-0.4, 0.6) + api.wind, rnd(1, 1.8), rnd(-0.4, 0.4)), grav: -6, life: rnd(0.35, 0.55), size: 0.07, sizeTo: 0.03, alpha: 0.9, color: 0xeaffff });
    };
    // залп бортом: плотная завеса из крупных клубов вдоль борта, висит около 2 с и сносится ветром
    api.smokeBank = function (pos, dir) {
      for (var i = 0; i < count(3); i++) emit({ map: T('smoke_' + (i % 3)), pos: pos.clone().add(dir.clone().multiplyScalar(rnd(0.15, 0.55))).add(V(rnd(-0.25, 0.25), rnd(0.05, 0.3), rnd(-0.15, 0.15))),
        vel: dir.clone().multiplyScalar(rnd(0.15, 0.35)).add(V(api.wind * 1.2 + rnd(-0.08, 0.08), rnd(0.12, 0.25), 0)), drag: 0.9,
        life: rnd(1.8, 2.5), size: 0.5, sizeTo: rnd(1.5, 1.9), alpha: 0.85, alphaTo: 0, spin: rnd(-0.4, 0.4), delay: i * 0.05 });
    };
    // толчок воды от залпа: плоская пена разбегается от борта
    api.blastRing = function (pos, dir) {
      for (var i = 0; i < count(4); i++) { var a = (i / 4 - 0.5) * 1.6;
        var d = V(dir.x * Math.cos(a) - dir.z * Math.sin(a), 0, dir.x * Math.sin(a) + dir.z * Math.cos(a));
        emit({ map: T('art/cut/foam_' + (i % 5) + '.png'), pos: pos.clone().add(d.clone().multiplyScalar(0.25)), vel: d.multiplyScalar(rnd(1.2, 1.8)), drag: 2.2, life: rnd(0.7, 1), size: 0.2, sizeTo: 0.45, alpha: 0.9 }); }
    };
    // салют победителей: цветное конфетти из белого прямоугольника, тонированного цветом, кувыркается и опадает
    var confTex = (function () {
      var c = document.createElement('canvas'); c.width = 16; c.height = 24; var g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(1, 1, 14, 22); return new THREE.CanvasTexture(c);
    })();
    api.cheer = function (pos) {
      var cols = [0xffd84a, 0xff5a4a, 0x4ac8ff, 0x7aff6a, 0xff8ae0];
      for (var i = 0; i < count(8); i++) { var a = Math.random() * 6.28;
        emit({ map: confTex, pos: pos.clone().add(V(0, 0.55, 0)), vel: V(Math.cos(a) * rnd(0.5, 1.1), rnd(2.4, 3.4), Math.sin(a) * rnd(0.4, 0.8)), grav: -5, drag: 1.2,
          life: rnd(1, 1.3), size: rnd(0.12, 0.15), sizeTo: 0.11, aspect: 0.66, alpha: 1, alphaTo: 0.6, spin: rnd(-9, 9), color: cols[i % cols.length] }); }
    };
    // промах: столб воды (гейзер) и кольцо пены
    api.geyser = function (pos) {
      for (var i = 0; i < 3; i++) emit({ map: T('splash_' + (i % 2)), pos: pos.clone().add(V(rnd(-0.06, 0.06), 0.1 + i * 0.12, 0)), vel: V(0, rnd(1.6, 2.4) - i * 0.4, 0), grav: -5, life: 0.7, size: 0.3 - i * 0.04, sizeTo: 0.75 - i * 0.12, alpha: 1, delay: i * 0.03 });
      for (var k = 0; k < count(6); k++) { var a = Math.random() * 6.28; emit({ map: glow, pos: pos.clone().add(V(0, 0.3, 0)), vel: V(Math.cos(a) * rnd(0.4, 0.9), rnd(1.8, 2.8), Math.sin(a) * rnd(0.3, 0.6)), grav: -7, life: rnd(0.5, 0.7), size: 0.07, sizeTo: 0.03, alpha: 0.95, color: 0xeaffff }); }
      for (var f = 0; f < count(6); f++) { var b2 = (f / 6) * 6.28; emit({ map: T('art/cut/foam_' + (f % 5) + '.png'), pos: pos.clone(), vel: V(Math.cos(b2) * 0.9, 0, Math.sin(b2) * 0.7), drag: 2.2, life: rnd(0.8, 1.1), size: 0.18, sizeTo: 0.4, alpha: 0.9 }); }
    };
    // мерж: столб света вверх
    var beamTex = (function () { var c = document.createElement('canvas'); c.width = 32; c.height = 128; var g = c.getContext('2d'), gr = g.createLinearGradient(0, 128, 0, 0);
      gr.addColorStop(0, 'rgba(255,240,180,1)'); gr.addColorStop(0.5, 'rgba(255,215,100,.6)'); gr.addColorStop(1, 'rgba(255,200,80,0)'); g.fillStyle = gr;
      var gx = g.createLinearGradient(0, 0, 32, 0); g.fillRect(0, 0, 32, 128); g.globalCompositeOperation = 'destination-in'; gx.addColorStop(0, 'rgba(0,0,0,0)'); gx.addColorStop(0.5, 'rgba(0,0,0,1)'); gx.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gx; g.fillRect(0, 0, 32, 128);
      return new THREE.CanvasTexture(c); })();
    api.pillar = function (pos, big) {
      var h = big ? 2.6 : 1.8;
      emit({ map: beamTex, add: true, pos: pos.clone().add(V(0, h / 2, 0)), life: big ? 0.75 : 0.55, size: h, sizeTo: h * 1.1, aspect: big ? 0.32 : 0.24, alpha: 1, alphaTo: 0 });
      for (var i = 0; i < count(big ? 10 : 5); i++) emit({ map: glow, add: true, pos: pos.clone().add(V(rnd(-0.15, 0.15), rnd(0.1, 0.6), rnd(-0.1, 0.1))), vel: V(0, rnd(1.2, 2.4), 0), drag: 1, life: rnd(0.5, 0.8), size: 0.09, sizeTo: 0.02, alpha: 1 });
    };
    api.foam = function (pos, size, life) {
      emit({ map: T('art/cut/foam_' + Math.floor(Math.random() * 5) + '.png'), pos: pos.clone(), vel: V(rnd(-0.05, 0.05), 0, rnd(-0.05, 0.05)),
        life: life || 1.2, size: size || 0.25, sizeTo: (size || 0.25) * 1.6, alpha: 0.85 });
    };
    api.hook = function (from, to, dur) {
      var o = emit({ map: T('hook'), pos: from.clone(), life: dur || 0.5, size: 0.3, sizeTo: 0.3, alpha: 1, alphaTo: 1, spin: 10 });
      o.path = { from: from.clone(), to: to.clone(), arc: 0.8 }; return o;
    };
    // трассер мушкета: светящийся штрих летит от ствола к цели, повёрнут по экранному направлению
    var streak = (function () {
      var c = document.createElement('canvas'); c.width = 128; c.height = 24; var g = c.getContext('2d');
      var gr = g.createLinearGradient(0, 0, 128, 0); gr.addColorStop(0, 'rgba(255,150,40,0)'); gr.addColorStop(0.55, 'rgba(255,170,50,.9)'); gr.addColorStop(1, 'rgba(255,190,70,1)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(0, 12); g.lineTo(116, 3); g.quadraticCurveTo(128, 12, 116, 21); g.closePath(); g.fill();
      var gr2 = g.createLinearGradient(0, 0, 128, 0); gr2.addColorStop(0, 'rgba(255,250,200,0)'); gr2.addColorStop(0.6, 'rgba(255,250,210,1)'); gr2.addColorStop(1, '#ffffff');
      g.fillStyle = gr2; g.beginPath(); g.moveTo(10, 12); g.lineTo(116, 8); g.quadraticCurveTo(122, 12, 116, 16); g.closePath(); g.fill();
      return new THREE.CanvasTexture(c);
    })();
    var _a = new THREE.Vector3(), _b = new THREE.Vector3();
    api.tracer = function (from, to, dur) {
      dur = dur || 0.1;
      var ang = 0, full = from.distanceTo(to), c = api.cam;
      if (c) {
        _a.copy(from).project(c); _b.copy(to).project(c);
        var wx = (_b.x - _a.x) * (c.right - c.left) / 2, wy = (_b.y - _a.y) * (c.top - c.bottom) / 2;
        ang = Math.atan2(wy, wx); full = Math.hypot(wx, wy);
      }
      // заметнее (утверждено): голова вдвое толще и длиннее, белое ядро с оранжевой каймой, след гаснет за 0,15 с после пролёта,
      // у ствола вспышка крупнее и клуб дыма на полсекунды
      var j = 0.8 + 0.2 * api.juice, hw = 0.32 * j, len = Math.min(1.5, full * 0.6) * j;
      var o = emit({ map: streak, pos: from.clone(), life: dur, size: hw, sizeTo: hw, aspect: len / hw, alpha: 1, alphaTo: 1, rot: ang });
      o.path = { from: from.clone(), to: to.clone(), arc: 0 }; o.life = dur; o.s.renderOrder = 7;
      var mid = from.clone().add(to).multiplyScalar(0.5);
      var tr = emit({ map: streak, pos: mid, life: dur * 0.5 + 0.15, delay: dur * 0.5, size: 0.15 * j, sizeTo: 0.05, aspect: full / (0.15 * j), alpha: 0.9, alphaTo: 0, rot: ang }); tr.s.renderOrder = 7;
      emit({ map: glow, add: true, pos: from.clone(), life: 0.16, size: 0.6, sizeTo: 1.05, alpha: 1 });
      emit({ map: T('smoke_' + Math.floor(Math.random() * 3)), pos: from.clone(), vel: V(api.wind * 0.8, 0.35, 0), drag: 2, life: 0.5, size: 0.14, sizeTo: 0.4, alpha: 0.85 });
      return o;
    };
    // искры попадания: вспышка и разлёт мелких светящихся точек
    api.spark = function (pos, n) {
      emit({ map: glow, add: true, pos: pos.clone(), life: 0.16, size: 0.25, sizeTo: 0.7, alpha: 1 });
      for (var i = 0; i < count(n || 6); i++) {
        var a = Math.random() * 6.28;
        emit({ map: glow, add: true, pos: pos.clone(), vel: V(Math.cos(a) * rnd(1, 2.4), rnd(0.6, 2), Math.sin(a) * rnd(0.8, 1.8)), grav: -6, drag: 1.5,
          life: rnd(0.2, 0.38), size: rnd(0.07, 0.12), sizeTo: 0.02, alpha: 1 });
      }
    };
    // ---------- эффекты карт абордажа ----------
    function canvasTex(w, h, draw) { var c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return new THREE.CanvasTexture(c); }
    var plusTex = canvasTex(64, 64, function (g) {
      g.lineJoin = 'round'; g.beginPath(); var P = [[24, 6], [40, 6], [40, 24], [58, 24], [58, 40], [40, 40], [40, 58], [24, 58], [24, 40], [6, 40], [6, 24], [24, 24]];
      P.forEach(function (q, i) { i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.closePath();
      g.lineWidth = 7; g.strokeStyle = '#0d4a22'; g.stroke(); g.fillStyle = '#6BF08A'; g.fill(); g.fillStyle = 'rgba(255,255,255,.75)'; g.fillRect(27, 10, 6, 10);
    });
    var ringTex = canvasTex(128, 128, function (g) { var gr = g.createRadialGradient(64, 64, 40, 64, 64, 62); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.75, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
    var bubbleTex = canvasTex(128, 128, function (g) {
      var gr = g.createRadialGradient(64, 64, 36, 64, 64, 62); gr.addColorStop(0, 'rgba(120,220,255,0)'); gr.addColorStop(0.75, 'rgba(90,200,255,.22)'); gr.addColorStop(0.93, 'rgba(170,240,255,.85)'); gr.addColorStop(1, 'rgba(170,240,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath(); g.arc(64, 64, 44, 3.6, 4.4); g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.arc(88, 86, 5, 0, 7); g.fill();
    });
    var boltTex = canvasTex(128, 32, function (g) {
      var gr = g.createLinearGradient(0, 0, 0, 32); gr.addColorStop(0, 'rgba(120,200,255,0)'); gr.addColorStop(0.35, 'rgba(120,200,255,.8)'); gr.addColorStop(0.5, '#ffffff'); gr.addColorStop(0.65, 'rgba(120,200,255,.8)'); gr.addColorStop(1, 'rgba(120,200,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 32);
    });
    api.tex = { plus: plusTex, ring: ringTex, bubble: bubbleTex };
    function screenAng(a, b) {
      var c = api.cam; if (!c) return { ang: 0, len: a.distanceTo(b) };
      _a.copy(a).project(c); _b.copy(b).project(c);
      var wx = (_b.x - _a.x) * (c.right - c.left) / 2, wy = (_b.y - _a.y) * (c.top - c.bottom) / 2; return { ang: Math.atan2(wy, wx), len: Math.hypot(wx, wy) };
    }
    // молния: ломаная из светящихся отрезков, мигает и гаснет
    api.bolt = function (from, to, life) {
      life = life || 0.2; var n = 6, pts = [from.clone()], d = to.clone().sub(from);
      for (var i = 1; i < n; i++) { var p = from.clone().addScaledVector(d, i / n); p.x += rnd(-0.18, 0.18); p.y += rnd(-0.08, 0.2); p.z += rnd(-0.18, 0.18); pts.push(p); }
      pts.push(to.clone());
      for (var k = 0; k < 2; k++) for (var j = 0; j < n; j++) {
        var A = pts[j], Bp = pts[j + 1], q = screenAng(A, Bp), mid = A.clone().add(Bp).multiplyScalar(0.5), w = k ? 0.05 : 0.13;
        emit({ map: boltTex, add: true, pos: mid, life: life, delay: k * 0.03, size: w, sizeTo: w * 0.5, aspect: Math.max(0.3, q.len) / w * 1.08, alpha: 1, alphaTo: 0, rot: q.ang, color: k ? 0xffffff : 0x9fdcff });
      }
      emit({ map: glow, add: true, pos: to.clone(), life: 0.22, size: 0.3, sizeTo: 0.8, alpha: 1, color: 0x9fdcff });
      for (var m = 0; m < count(5); m++) { var a2 = Math.random() * 6.28; emit({ map: glow, add: true, pos: to.clone(), vel: V(Math.cos(a2) * rnd(1, 2.2), rnd(0.5, 1.8), Math.sin(a2) * rnd(0.8, 1.6)), grav: -5, drag: 2, life: rnd(0.2, 0.35), size: 0.09, sizeTo: 0.02, alpha: 1, color: 0xbfe8ff }); }
    };
    // лечение: зелёное кольцо и плюсики вверх
    api.heal = function (pos) {
      emit({ map: ringTex, pos: pos.clone().add(V(0, 0.1, 0)), life: 0.55, size: 0.3, sizeTo: 1.2, alpha: 1, color: 0x3ee86a });
      for (var i = 0; i < count(6); i++) emit({ map: plusTex, pos: pos.clone().add(V(rnd(-0.3, 0.3), rnd(0.2, 0.6), rnd(-0.2, 0.2))), vel: V(rnd(-0.15, 0.15), rnd(0.8, 1.4), 0), drag: 1.2, delay: i * 0.05, life: rnd(0.7, 1), size: rnd(0.18, 0.26), sizeTo: 0.08, alpha: 1, alphaTo: 0 });
    };
    // проклятие: зелёный клуб и искры-черепки
    api.curse = function (pos, big) {
      for (var i = 0; i < count(big ? 5 : 2); i++) emit({ map: T('smoke_' + (i % 3)), pos: pos.clone().add(V(rnd(-0.15, 0.15), rnd(0.2, 0.5), rnd(-0.1, 0.1))), vel: V(rnd(-0.3, 0.3), rnd(0.3, 0.7), 0), drag: 2, life: rnd(0.5, 0.8), size: 0.16, sizeTo: rnd(0.35, 0.5), alpha: 0.85, color: 0x6dff8e });
      if (big) emit({ map: T('ic_skull'), pos: pos.clone().add(V(0, 0.7, 0)), vel: V(0, 0.9, 0), drag: 1.5, life: 0.7, size: 0.22, sizeTo: 0.3, alpha: 1, color: 0x8dffa6 });
    };
    // пороховой взрыв: вспышка, ударная волна, дым, обломки
    api.boom = function (pos) {
      emit({ map: T('flash_' + Math.floor(Math.random() * 3)), pos: pos.clone().add(V(0, 0.3, 0)), life: 0.22, size: 0.6, sizeTo: 1.5, alpha: 1, alphaTo: 0.3, rot: rnd(0, 6) });
      emit({ map: glow, add: true, pos: pos.clone().add(V(0, 0.3, 0)), life: 0.35, size: 1, sizeTo: 2.2, alpha: 1, color: 0xffa040 });
      emit({ map: ringTex, add: true, pos: pos.clone().add(V(0, 0.05, 0)), life: 0.4, size: 0.4, sizeTo: 2.4, alpha: 0.9, color: 0xffc070 });
      for (var i = 0; i < count(6); i++) { var a = Math.random() * 6.28; emit({ map: T('smoke_' + (i % 3)), pos: pos.clone().add(V(0, 0.3, 0)), vel: V(Math.cos(a) * rnd(0.6, 1.4), rnd(0.4, 1.2), Math.sin(a) * rnd(0.5, 1)), drag: 2.5, life: rnd(0.7, 1.1), size: 0.3, sizeTo: rnd(0.7, 1), alpha: 0.9, color: 0x9a8a80 }); }
      api.splinters(pos.clone().add(V(0, 0.2, 0)), V(0, 1, 0));
    };
    // ярость рома: язычок пламени
    api.flame = function (pos) {
      emit({ map: glow, pos: pos.clone().add(V(rnd(-0.2, 0.2), rnd(0.05, 0.45), rnd(-0.14, 0.14))), vel: V(0, rnd(0.7, 1.2), 0), life: rnd(0.3, 0.5), size: rnd(0.22, 0.32), sizeTo: 0.04, alpha: 1, alphaTo: 0.2, color: Math.random() < 0.5 ? 0xff3a1a : 0xffa020 });
    };
    // язык пламени: мультяшная капля с тёмной обводкой, обычное смешивание (аддитив на светлой палубе не виден)
    var flameTex = canvasTex(64, 96, function (g) {
      function drop(sc, col) { g.beginPath(); g.moveTo(32, 6 + (1 - sc) * 40); g.bezierCurveTo(32 + 26 * sc, 40, 32 + 24 * sc, 86, 32, 88); g.bezierCurveTo(32 - 24 * sc, 86, 32 - 26 * sc, 40, 32, 6 + (1 - sc) * 40); g.closePath(); g.fillStyle = col; g.fill(); }
      g.lineWidth = 7; g.strokeStyle = '#5a1407'; g.beginPath(); g.moveTo(32, 6); g.bezierCurveTo(58, 40, 56, 86, 32, 88); g.bezierCurveTo(8, 86, 6, 40, 32, 6); g.closePath(); g.stroke();
      drop(1, '#ff5a1a'); drop(0.66, '#ffa020'); drop(0.36, '#fff0a0');
    });
    // пожар на палубе: крупные языки пламени и искры вверх, без настоящего света
    api.fire = function (pos) {
      var fl = emit({ map: flameTex, pos: pos.clone().add(V(rnd(-0.08, 0.08), rnd(0.12, 0.25), rnd(-0.06, 0.06))), vel: V(rnd(-0.08, 0.08) + api.wind * 0.4, rnd(0.4, 0.7), 0), life: rnd(0.35, 0.55), size: rnd(0.42, 0.56), sizeTo: 0.12, aspect: 0.66, alpha: 1, alphaTo: 0.6, rot: rnd(-0.2, 0.2) }); fl.s.renderOrder = 6;
      if (Math.random() < 0.5) emit({ map: glow, add: true, pos: pos.clone().add(V(rnd(-0.08, 0.08), rnd(0.05, 0.2), rnd(-0.06, 0.06))), vel: V(rnd(-0.1, 0.1) + api.wind * 0.5, rnd(0.9, 1.5), 0), life: rnd(0.35, 0.55), size: rnd(0.38, 0.52), sizeTo: 0.08, alpha: 1, alphaTo: 0.1, color: Math.random() < 0.5 ? 0xff5a1a : 0xffb030 });
      if (Math.random() < 0.3) emit({ map: glow, add: true, pos: pos.clone().add(V(0, 0.3, 0)), vel: V(rnd(-0.4, 0.4), rnd(1.4, 2.2), rnd(-0.2, 0.2)), grav: -1, life: rnd(0.5, 0.8), size: 0.06, sizeTo: 0.02, alpha: 1, color: 0xffd060 });
    };
    // пузырь лопнул: брызги и кольцо
    api.pop = function (pos) {
      emit({ map: ringTex, add: true, pos: pos.clone(), life: 0.3, size: 0.6, sizeTo: 1.3, alpha: 0.9, color: 0xbff4ff });
      for (var i = 0; i < count(8); i++) { var a = Math.random() * 6.28; emit({ map: glow, add: true, pos: pos.clone(), vel: V(Math.cos(a) * rnd(1, 2), rnd(0.5, 1.6), Math.sin(a) * rnd(0.8, 1.5)), grav: -6, life: rnd(0.3, 0.5), size: 0.1, sizeTo: 0.03, alpha: 1, color: 0xa8eeff }); }
    };

    // ядро: тёмная сфера по дуге
    var ballGeo = new THREE.SphereGeometry(0.075, 10, 8), ballMat = new THREE.MeshBasicMaterial({ color: 0x23282c });
    api.ball = function (from, to, dur, onHit) {
      var m = new THREE.Mesh(ballGeo, ballMat); m.position.copy(from); scene.add(m);
      meshes.push({ m: m, t: 0, dur: dur || 0.45, from: from.clone(), to: to.clone(), arc: 0.6, onHit: onHit });
    };

    api.update = function (dt) {
      for (var i = live.length - 1; i >= 0; i--) {
        var o = live[i]; o.t += dt;
        if (o.t < 0) continue;
        o.s.visible = true;
        var u = Math.min(1, o.t / o.life);
        if (o.path) {
          o.s.position.lerpVectors(o.path.from, o.path.to, u); o.s.position.y += Math.sin(Math.PI * u) * o.path.arc;
        } else {
          o.vel.y += o.grav * dt; if (o.drag) o.vel.multiplyScalar(Math.max(0, 1 - o.drag * dt));
          o.s.position.addScaledVector(o.vel, dt);
          if (o.floor != null && o.s.position.y < o.floor) { o.s.position.y = o.floor; o.vel.set(0, 0, 0); o.grav = 0; }
        }
        var sz = o.size + (o.sizeTo - o.size) * u;
        o.s.scale.set(sz * o.aspect, sz, 1);
        o.s.material.opacity = o.alpha + (o.alphaTo - o.alpha) * u;
        o.rot += o.spin * dt; o.s.material.rotation = o.rot;
        if (u >= 1) { scene.remove(o.s); pool.push(o.s); live.splice(i, 1); if (o.done) o.done(); }
      }
      for (var j = meshes.length - 1; j >= 0; j--) {
        var b = meshes[j]; b.t += dt; var v = Math.min(1, b.t / b.dur);
        b.m.position.lerpVectors(b.from, b.to, v); b.m.position.y += Math.sin(Math.PI * v) * b.arc;
        // тонкий дымный хвост за ядром
        b.acc = (b.acc || 0) + dt; if (b.acc > 0.028) { b.acc = 0; emit({ map: T('smoke_' + (j % 3)), pos: b.m.position.clone(), vel: V(api.wind * 0.4, 0.08, 0), life: 0.35, size: 0.07, sizeTo: 0.2, alpha: 0.55, alphaTo: 0 }); }
        if (v >= 1) { scene.remove(b.m); meshes.splice(j, 1); if (b.onHit) b.onHit(); }
      }
    };
    api.count = function () { return live.length + meshes.length; };
    api.preload = function (names) { names.forEach(T); };
    return api;
  }

  TPS.FX = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
