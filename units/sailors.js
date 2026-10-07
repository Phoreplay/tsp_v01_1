/* TPS v0 · units/sailors.js
   3D-матросы из примитивов three.js. Перенесено со страницы «Матросы TPS в 3D» (units/sailors_demo.html)
   и превращено в набор, который ставит бойцов на любую сцену.
   1 единица мира = 1 клетка палубы. Матрос стоит в центре клетки (x, z), палуба на высоте 0.

   var kit = TPS.SAILORS.kit(THREE, worldGroup);
   var s = kit.make('gunner' | 'shooter' | 'boarder', x, z, 'blue' | 'red');
   kit.act(s); kit.hit(s); kit.land(s); kit.setTeam(s, 'red'); kit.face(s, Math.PI);
   kit.update(t, dt) каждый кадр. */
(function (root) {
  'use strict';
  var TPS = root.TPS = root.TPS || {};

  var TEAM = {
    blue: { cloth: 0x3a6fd8, hat: 0x1d3874, feather: 0x7fa6ee },
    red:  { cloth: 0xd5503c, hat: 0x7a2419, feather: 0xef8f7c }
  };
  var HAIR = { gunner: 0xd9d6cf, shooter: 0x4a2f1f, boarder: 0x241a15 };
  var DUR = { gunner: 0.75, shooter: 1.0, boarder: 0.65 };

  function kit(THREE, world) {
    var L = function (c) { return new THREE.MeshLambertMaterial({ color: c }); };
    var sph = function (r, a, b) { return new THREE.SphereGeometry(r, a || 22, b || 16); };
    var dome = function (r) { return new THREE.SphereGeometry(r, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2); };
    var cyl = function (rt, rb, h, s, open) { return new THREE.CylinderGeometry(rt, rb, h, s || 22, 1, !!open); };
    var cap = function (r, l) { return new THREE.CapsuleGeometry(r, l, 6, 14); };
    function add(parent, geo, mat, p, s, r) {
      var m = new THREE.Mesh(geo, mat);
      if (p) m.position.set(p[0], p[1], p[2]);
      if (s) m.scale.set(s[0], s[1], s[2]);
      if (r) m.rotation.set(r[0], r[1], r[2], r[3] || 'XYZ');
      parent.add(m);
      return m;
    }
    function kf(keys, t) {
      if (t <= keys[0][0]) return keys[0][1];
      for (var i = 1; i < keys.length; i++) {
        var t1 = keys[i][0], v1 = keys[i][1], t0 = keys[i - 1][0], v0 = keys[i - 1][1];
        if (t <= t1) { var u = (t - t0) / (t1 - t0), e = u * u * (3 - 2 * u); return v0 + (v1 - v0) * e; }
      }
      return keys[keys.length - 1][1];
    }

    var shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false });
    var sailors = [], fx = [];

    function make(type, x, z, team) {
      team = team || 'blue';
      var S = {
        type: type, x: x, z: z || 0, team: team,
        phase: Math.random() * 6.28, period: 1.25 + Math.random() * 0.35,
        act: -1, hit: -1, land: -1, ram: -1, flinch: -1, aim: -1, aimK: 0, ramSp: 1, landActed: false, fired: false, slashed: false, landDust: false,
        nextBlink: 1 + Math.random() * 3, blink: -1
      };
      var T = TEAM[team];
      var mats = {
        cloth: L(T.cloth), hat: L(T.hat), feather: L(T.feather),
        skin: L(0xf1c39b), nose: L(0xe99d7c), dark: L(0x3a2b22), black: L(0x18181c),
        white: L(0xf2f1ec), wood: L(0x8b5a32), metal: L(0xaab3bd), gold: L(0xd3a548),
        brown: L(0x5b3a27), hair: L(HAIR[type])
      };
      S.mats = mats;
      var rootG = new THREE.Group(); rootG.position.set(S.x, 0.03, S.z); world.add(rootG); S.root = rootG;
      S.shadow = add(rootG, new THREE.CircleGeometry(0.3, 28), shadowMat, [0, 0.004, 0.02], null, [-Math.PI / 2, 0, 0]);
      var body = new THREE.Group(); rootG.add(body); S.body = body;
      var head = new THREE.Group(); body.add(head); S.head = head;
      var hat = new THREE.Group(); head.add(hat); S.hat = hat;
      var eyes = new THREE.Group(); head.add(eyes); S.eyes = eyes;
      var armR = new THREE.Group(); body.add(armR); S.armR = armR;
      var armL = new THREE.Group(); body.add(armL); S.armL = armL;
      var tail = new THREE.Group(); S.tail = tail;
      var backHair = function (r, y, th0, th1) {
        return add(head, new THREE.SphereGeometry(r, 20, 10, Math.PI + 0.3, Math.PI - 0.6, th0 * Math.PI, (th1 - th0) * Math.PI), mats.hair, [0, y, 0]);
      };
      var ears = function (r, y) { [-1, 1].forEach(function (s) { add(head, sph(0.042, 12, 8), mats.skin, [s * (r + 0.012), y - 0.01, 0.0], [0.5, 1, 0.8]); }); };
      [-1, 1].forEach(function (s) { add(rootG, sph(0.07), mats.dark, [s * 0.09, 0.035, 0.04], [1, 0.6, 1.45]); });

      if (type === 'gunner') {
        add(body, sph(0.2), mats.dark, [0, 0.13, 0], [1.05, 0.55, 0.95]);
        add(body, sph(0.22), mats.cloth, [0, 0.3, 0], [1.18, 1.0, 1.0]);
        head.position.set(0, 0.46, 0);
        add(head, sph(0.2), mats.skin, [0, 0.16, 0]);
        add(head, sph(0.15), mats.white, [0, 0.07, 0.1], [1.25, 0.95, 0.75]);
        add(head, sph(0.045), mats.nose, [0, 0.16, 0.2]);
        backHair(0.214, 0.16, 0, 0.68);
        ears(0.2, 0.16);
        [-1, 1].forEach(function (s) { add(eyes, sph(0.026, 10, 8), mats.black, [s * 0.075, 0.215, 0.172]); });
        hat.position.set(0, 0.31, -0.02);
        add(hat, cyl(0.27, 0.27, 0.06, 3), mats.hat);
        add(hat, dome(0.17), mats.hat, [0, 0.02, 0]);
        add(hat, sph(0.1), mats.feather, [0.13, 0.12, -0.05], [0.28, 1.0, 0.5], [0, 0, -0.55]);
        tail.position.set(0, 0.08, -0.19); head.add(tail);
        add(tail, cap(0.034, 0.1), mats.hair, [0, -0.08, -0.02], null, [0.3, 0, 0]);
        [-1, 1].forEach(function (s) { add(tail, sph(0.045, 12, 8), mats.hat, [s * 0.042, 0, -0.005], [1, 0.62, 0.5], [0, 0, s * 0.45]); });
        armR.position.set(0.25, 0.36, 0.02);
        add(armR, cap(0.055, 0.11), mats.cloth, [0.03, -0.09, 0], null, [0, 0, 0.3]);
        add(armR, sph(0.066), mats.skin, [0.05, -0.19, 0.05]);
        var prop = new THREE.Group(); prop.position.set(0.06, -0.19, 0.07); armR.add(prop); S.prop = prop;
        add(prop, cyl(0.018, 0.018, 0.95, 10), mats.wood, [0, 0.315, 0]);
        add(prop, cyl(0.058, 0.058, 0.14, 14), mats.dark, [0, 0.73, 0]);
        armL.position.set(-0.25, 0.36, 0.02);
        add(armL, cap(0.055, 0.11), mats.cloth, [-0.02, -0.09, 0.02], null, [0.3, 0, -0.25]);
        add(armL, sph(0.066), mats.skin, [-0.02, -0.18, 0.1]);
      }

      if (type === 'shooter') {
        add(body, cyl(0.11, 0.12, 0.16), mats.dark, [0, 0.1, 0]);
        add(body, cap(0.13, 0.26), mats.cloth, [0, 0.33, 0]);
        add(body, new THREE.TorusGeometry(0.142, 0.022, 8, 28), mats.brown, [0, 0.35, 0], null, [Math.PI / 2, 0, 0.62, 'ZXY']);
        head.position.set(0, 0.58, 0);
        add(head, sph(0.18), mats.skin, [0, 0.15, 0]);
        add(head, sph(0.04), mats.nose, [0, 0.13, 0.18]);
        [-1, 1].forEach(function (s) { add(head, sph(0.05, 12, 8), mats.brown, [s * 0.05, 0.085, 0.165], [1.25, 0.45, 0.6], [0, 0, s * 0.25]); });
        backHair(0.193, 0.15, 0, 0.74);
        ears(0.18, 0.15);
        [-1, 1].forEach(function (s) { add(eyes, sph(0.024, 10, 8), mats.black, [s * 0.065, 0.185, 0.155]); });
        hat.position.set(0, 0.27, 0);
        add(hat, cyl(0.35, 0.35, 0.03, 30), mats.hat);
        add(hat, cyl(0.14, 0.17, 0.17, 24), mats.hat, [0, 0.095, 0]);
        add(hat, cyl(0.173, 0.173, 0.045, 24), mats.brown, [0, 0.035, 0]);
        tail.position.set(0, 0.04, -0.17); head.add(tail);
        add(tail, cap(0.036, 0.13), mats.hair, [0, -0.1, -0.02], null, [0.25, 0, 0]);
        [-1, 1].forEach(function (s) { add(tail, sph(0.046, 12, 8), mats.hat, [s * 0.043, 0, -0.005], [1, 0.62, 0.5], [0, 0, s * 0.45]); });
        var gun = new THREE.Group(); gun.position.set(0, 0.32, 0.18); gun.rotation.z = 0.32; body.add(gun); S.prop = gun;
        add(gun, new THREE.BoxGeometry(0.24, 0.075, 0.07), mats.wood, [-0.15, 0, 0]);
        add(gun, cyl(0.032, 0.032, 0.42, 12), mats.metal, [0.15, 0, 0], null, [0, 0, Math.PI / 2]);
        var bellMat = new THREE.MeshLambertMaterial({ color: 0xaab3bd, side: THREE.DoubleSide });
        S.bell = add(gun, cyl(0.11, 0.033, 0.13, 18, true), bellMat, [0.42, 0, 0], null, [0, 0, -Math.PI / 2]);
        mats.bell = bellMat;
        add(gun, sph(0.062), mats.skin, [0.1, -0.03, 0.04]);
        add(gun, sph(0.062), mats.skin, [-0.1, -0.03, 0.04]);
        armR.position.set(0.17, 0.46, 0.02);
        add(armR, cap(0.05, 0.12), mats.cloth, [0.0, -0.08, 0.08], null, [1.0, 0, 0.2]);
        armL.position.set(-0.17, 0.46, 0.02);
        add(armL, cap(0.05, 0.12), mats.cloth, [-0.02, -0.1, 0.08], null, [1.0, 0, -0.35]);
      }

      if (type === 'boarder') {
        add(body, cyl(0.11, 0.1, 0.12), mats.dark, [0, 0.08, 0]);
        add(body, cyl(0.25, 0.12, 0.36, 24), mats.cloth, [0, 0.3, 0]);
        add(body, sph(0.25, 24, 12), mats.cloth, [0, 0.46, 0], [1, 0.25, 0.8]);
        head.position.set(0, 0.47, 0);
        add(head, sph(0.18), mats.skin, [0, 0.15, 0]);
        add(head, sph(0.042), mats.nose, [0, 0.13, 0.18]);
        backHair(0.188, 0.15, 0.42, 0.66);
        ears(0.18, 0.15);
        add(eyes, sph(0.024, 10, 8), mats.black, [-0.065, 0.18, 0.16]);
        add(head, new THREE.CircleGeometry(0.048, 18), mats.black, [0.068, 0.18, 0.168], null, [0, 0.35, 0]);
        add(head, new THREE.TorusGeometry(0.183, 0.008, 6, 32), mats.black, [0, 0.17, 0], null, [Math.PI / 2 - 0.35, 0.0, 0.5]);
        hat.position.set(0, 0.17, 0);
        add(hat, dome(0.19), mats.hat, [0, 0, -0.01], [1, 0.95, 1], [-0.22, 0, 0]);
        tail.position.set(0.07, -0.01, -0.18); hat.add(tail);
        add(tail, sph(0.05, 12, 10), mats.hat, [0, 0, 0], [1, 0.85, 0.75]);
        add(tail, new THREE.ConeGeometry(0.045, 0.19, 10), mats.hat, [0.02, -0.06, -0.05], null, [-2.3, 0, -0.35]);
        add(tail, new THREE.ConeGeometry(0.04, 0.16, 10), mats.hat, [0.07, -0.04, -0.02], null, [-2.0, 0, -1.0]);
        armR.position.set(0.27, 0.42, 0.02);
        add(armR, cap(0.06, 0.1), mats.cloth, [0.06, 0.06, 0], null, [0, 0, -0.7]);
        add(armR, sph(0.068), mats.skin, [0.12, 0.14, 0.02]);
        var sword = new THREE.Group(); sword.position.set(0.12, 0.14, 0.02); sword.rotation.x = -0.9; armR.add(sword); S.prop = sword;
        add(sword, cyl(0.02, 0.02, 0.11, 10), mats.dark, [0, -0.02, 0]);
        add(sword, new THREE.TorusGeometry(0.045, 0.012, 6, 14), mats.gold, [0, 0.04, 0], null, [Math.PI / 2, 0, 0]);
        add(sword, new THREE.TorusGeometry(0.4, 0.038, 6, 24, 1.05), mats.metal, [-0.4, 0.05, 0], [1, 1, 0.35]);
        armL.position.set(-0.27, 0.42, 0.02);
        add(armL, cap(0.06, 0.1), mats.cloth, [-0.03, -0.08, 0.02], null, [0, 0, -0.3]);
        add(armL, sph(0.068), mats.skin, [-0.05, -0.17, 0.05]);
      }

      rootG.traverse(function (o) { if (o.isMesh) o.userData.sailor = S; });
      S.base = { propRx: S.prop.rotation.x, propRz: S.prop.rotation.z, propZ: S.prop.position.z, armRz: armR.rotation.z };
      S.head.userData.baseY = S.head.position.y;
      S.yaw = 0; S.yawT = 0; S.prevY = 0; S.prevYaw = 0; S.tailA = 0; S.tailV = 0;
      S.allMats = Object.keys(mats).map(function (k) { return mats[k]; });
      sailors.push(S);
      return S;
    }

    function remove(S) {
      world.remove(S.root);
      var i = sailors.indexOf(S); if (i >= 0) sailors.splice(i, 1);
    }

    // ---------- эффекты ----------
    function addFx(obj, life, upd) { world.add(obj); fx.push({ obj: obj, t: 0, life: life, update: upd }); }
    var flashTex = (function () {
      var c = document.createElement('canvas'); c.width = c.height = 64;
      var g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(0.35, 'rgba(255,190,80,.9)'); gr.addColorStop(1, 'rgba(255,120,20,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();
    var tmp = new THREE.Vector3();
    function worldPosOf(obj) { obj.getWorldPosition(tmp); return world.worldToLocal(tmp.clone()); }

    function muzzleFx(S) {
      var p = worldPosOf(S.bell);
      var fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      fl.position.copy(p); fl.scale.setScalar(0.35);
      addFx(fl, 0.12, function (u, o) { o.scale.setScalar(0.35 + 0.25 * u); o.material.opacity = 1 - u; });
      for (var i = 0; i < 4; i++) (function (i) {
        var m = new THREE.Mesh(sph(0.07, 12, 8), new THREE.MeshBasicMaterial({ color: 0xe4e8ea, transparent: true, opacity: 0.85, depthWrite: false }));
        m.position.copy(p).add(new THREE.Vector3(0.05 * i, 0.02 * i, -0.03 * i));
        var dx = 0.15 + Math.random() * 0.1, dy = 0.15 + Math.random() * 0.15, p0 = m.position.clone();
        addFx(m, 0.7 + i * 0.1, function (u, o) {
          o.position.set(p0.x + dx * u, p0.y + dy * u, p0.z - 0.1 * u);
          o.scale.setScalar(1 + 1.8 * u); o.material.opacity = 0.85 * (1 - u);
        });
      })(i);
    }
    function slashFx(S) {
      var m = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 6, 24, 1.9),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.position.set(S.x + 0.05, 0.55, S.z + 0.05); m.rotation.set(-0.5, 0, -1.1);
      addFx(m, 0.2, function (u, o) { o.material.opacity = 0.8 * (1 - u); o.scale.setScalar(1 + 0.15 * u); });
    }
    function dustFx(S) {
      var m = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.27, 36),
        new THREE.MeshBasicMaterial({ color: 0xf1e2c4, transparent: true, opacity: 0.75, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(S.x, 0.045, S.z + 0.02);
      addFx(m, 0.45, function (u, o) { o.scale.setScalar(1 + 2.2 * u); o.material.opacity = 0.75 * (1 - u); });
      for (var i = 0; i < 6; i++) (function (i) {
        var a = (i / 6) * Math.PI * 2 + Math.random() * 0.4;
        var m2 = new THREE.Mesh(sph(0.04, 8, 6), new THREE.MeshBasicMaterial({ color: 0xe8d6b0, transparent: true, opacity: 0.9, depthWrite: false }));
        addFx(m2, 0.4, function (u, o) {
          var r = 0.25 + 0.35 * u;
          o.position.set(S.x + Math.cos(a) * r, 0.05 + 0.18 * Math.sin(Math.PI * u), S.z + Math.sin(a) * r * 0.8);
          o.material.opacity = 0.9 * (1 - u);
        });
      })(i);
    }

    // пар из ушей у злого бойца: два белых клуба по бокам головы поднимаются и тают
    function steamFx(S) {
      var p = worldPosOf(S.head);
      [-1, 1].forEach(function (sd) { for (var i = 0; i < 3; i++) (function (i) {
        var m = new THREE.Mesh(sph(0.075, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
        var p0 = p.clone().add(new THREE.Vector3(sd * 0.22, 0.3, 0)); m.position.copy(p0); m.renderOrder = 5;
        addFx(m, 0.75 + i * 0.12, function (u, o) { var v = Math.max(0, u - i * 0.15) / (1 - i * 0.15);
          o.position.set(p0.x + sd * 0.18 * v, p0.y + 0.55 * v, p0.z); o.scale.setScalar(1 + 2 * v); o.material.opacity = v > 0 ? 0.95 * (1 - v * v) : 0; });
      })(i); });
    }
    // боевой айдл: бой идёт, а боец ждёт перезарядку или очередь. 0..1, плавно
    function setAngry(S, on) { S.angryT = on ? 1 : 0; }
    // канонир: на выстреле своей пушки откидывается, потом шаг к стволу и два тычка банником; цикл быстрее с рангом
    function flinch(S) { S.flinch = 0; S.ram = -1; }
    function ram(S, sp) { S.ram = 0; S.ramSp = sp || 1; }
    // стрелок: вскидывает мушкетон к плечу заранее и держит до выстрела (не дольше 0,8 с)
    function aim(S) { S.aim = 0; }

    // ---------- действия ----------
    function act(S) { S.act = 0; S.fired = false; S.slashed = false; }
    function hit(S) { S.hit = 0; }
    function land(S) { S.land = 0; S.landActed = false; }
    function face(S, yaw) { S.yawT = yaw; }
    function setTeam(S, team) {
      S.team = team;
      S.mats.cloth.color.setHex(TEAM[team].cloth);
      S.mats.hat.color.setHex(TEAM[team].hat);
      S.mats.feather.color.setHex(TEAM[team].feather);
    }

    function updateOne(S, t, dt) {
      var tt = t + S.phase;
      var br = Math.sin((2 * Math.PI * t) / S.period + S.phase);
      var sy = 1 + 0.035 * br, sx = 1 - 0.0175 * br;
      var rootY = 0.03, rootZ = 0, rootRy = 0, bodyZ = 0, bodyRx = 0, bodyRy = 0, headSy = 1;
      var headLag = Math.sin((2 * Math.PI * (t - 0.08)) / S.period + S.phase);
      S.head.position.y = S.head.userData.baseY + 0.012 * headLag;
      S.hat.rotation.z = 0.07 * Math.sin((2 * Math.PI * (t - 0.18)) / S.period + S.phase);
      S.hat.rotation.x = 0.04 * Math.sin((2 * Math.PI * (t - 0.22)) / S.period + S.phase + 1);

      if (S.blink < 0 && t > S.nextBlink) S.blink = 0;
      if (S.blink >= 0) {
        S.blink += dt;
        S.eyes.scale.y = S.blink < 0.12 ? 0.12 : 1;
        if (S.blink >= 0.12) { S.blink = -1; S.nextBlink = t + 2 + Math.random() * 3; }
      }

      var propRx = S.base.propRx, propRz = S.base.propRz, propZ = S.base.propZ, armRz = S.base.armRz;
      if (S.type === 'gunner') propRz += 0.05 * Math.sin(1.3 * tt);
      if (S.type === 'shooter') propRz += 0.04 * Math.sin(1.1 * tt);
      if (S.type === 'boarder') {
        armRz += 0.09 * Math.sin(1.8 * tt);
        var cyc = (tt % 1.7) / 0.3;
        if (cyc < 1 && S.act < 0 && S.land < 0) { rootY += 0.05 * Math.sin(Math.PI * cyc); if (cyc > 0.8) { sy *= 0.94; sx *= 1.03; } }
      }

      // злость: стойка ниже и шире, топчется, наклон вперёд, шляпа на глаза, глаза прищурены, оружие трясётся;
      // изредка краснеет и пускает пар
      S.angry = (S.angry || 0) + ((S.angryT || 0) - (S.angry || 0)) * Math.min(1, dt * 4);
      var ang = S.act < 0 && S.land < 0 && S.ram < 0 && S.flinch < 0 && S.aim < 0 ? S.angry : 0, flush = 0;
      if (ang > 0.01) {
        sy *= 1 - 0.08 * ang; sx *= 1 + 0.06 * ang;
        rootY += ang * 0.035 * Math.abs(Math.sin(tt * 7));
        bodyRx += 0.14 * ang;
        S.hat.rotation.x += 0.16 * ang;
        if (S.blink < 0) S.eyes.scale.y = 1 - 0.5 * ang;
        var burst = Math.sin(tt * 1.4) > 0.2 ? 1 : 0.25;
        propRz += ang * 0.14 * burst * Math.sin(tt * 17); armRz += ang * 0.1 * burst * Math.sin(tt * 17 + 1);
        if (S.rageNext == null) S.rageNext = t + 1 + Math.random() * 3;
        if (t > S.rageNext && ang > 0.8) { S.rageT = 0; S.rageNext = t + 3.5 + Math.random() * 4; }   // пар убран: избыточно, остаётся покраснение
      } else if (S.blink < 0) S.eyes.scale.y = 1;
      if (S.rageT != null && S.rageT >= 0) { S.rageT += dt; flush = Math.sin(Math.PI * Math.min(1, S.rageT / 0.9)) * 0.55; if (S.rageT >= 0.9) S.rageT = -1; }

      if (S.flinch >= 0) {
        S.flinch += dt; var fu = Math.min(1, S.flinch / 0.3), fk = Math.sin(Math.PI * fu) * (1 - 0.3 * fu);
        bodyRx -= 0.38 * fk; rootZ -= 0.12 * fk; rootY += 0.04 * fk; sy *= 1 + 0.06 * fk; sx *= 1 - 0.04 * fk;
        if (fu >= 1) S.flinch = -1;
      }
      if (S.ram >= 0) {
        S.ram += dt * S.ramSp; var ru = Math.min(1, S.ram / 0.9), env = Math.sin(Math.PI * ru), th = Math.abs(Math.sin(ru * Math.PI * 2));
        rootZ += 0.15 * env; bodyRx += (0.16 + 0.14 * th) * env;
        propRx += 0.95 * env; propZ += 0.13 * th * env; sy *= 1 - 0.05 * th * env;
        if (ru >= 1) S.ram = -1;
      }
      // прицел стрелка: ствол из стойки к горизонту, наклон вперёд, приседание
      if (S.type === 'shooter') {
        if (S.aim >= 0) { S.aim += dt; if (S.aim > 0.8 && S.act < 0) S.aim = -1; }
        var aimT = S.aim >= 0 || (S.act >= 0 && S.act < 0.3) ? 1 : 0;
        S.aimK += (aimT - S.aimK) * Math.min(1, dt * (aimT ? 14 : 6));
        propRz -= 0.32 * S.aimK; bodyRx += 0.14 * S.aimK; sy *= 1 - 0.07 * S.aimK; sx *= 1 + 0.05 * S.aimK;
      }

      if (S.act >= 0) {
        S.act += dt; var a = S.act;
        if (S.type === 'gunner') {
          propRx += kf([[0, 0], [0.22, 0.45], [0.32, -0.75], [0.5, -0.6], [0.75, 0]], a);
          propZ += kf([[0, 0], [0.22, 0.04], [0.32, -0.12], [0.75, 0]], a);
          bodyRx += kf([[0, 0], [0.22, 0.1], [0.32, -0.14], [0.75, 0]], a);
        }
        if (S.type === 'shooter') {
          // выстрел из вскинутого положения: отдача вверх, потом ствол вверх на перезарядку и опускание
          propRz += kf([[0, 0], [0.2, -0.04], [0.25, 0.35], [0.4, 0.2], [0.55, 0.62], [0.82, 0.62], [1, 0]], a);
          if (a > 0.5 && S.aim >= 0) S.aim = -1;
          bodyZ += kf([[0, 0], [0.24, -0.02], [0.27, 0.07], [0.5, 0], [0.8, 0]], a);
          var k = kf([[0, 1], [0.2, 0.94], [0.27, 1.06], [0.4, 1]], a); sy *= k; sx *= 2 - k;
          if (!S.fired && a >= 0.25) { S.fired = true; muzzleFx(S); }
        }
        if (S.type === 'boarder') {
          armRz += kf([[0, 0], [0.2, 0.7], [0.3, -1.7], [0.45, -1.4], [0.65, 0]], a);
          bodyZ += kf([[0, 0], [0.2, 0.03], [0.3, -0.12], [0.65, 0]], a);
          bodyRy += kf([[0, 0], [0.2, 0.3], [0.3, -0.35], [0.65, 0]], a);
          if (!S.slashed && a >= 0.26) { S.slashed = true; slashFx(S); }
        }
        if (a >= DUR[S.type]) S.act = -1;
      }

      var flash = 0;
      if (S.hit >= 0) {
        S.hit += dt; var u = S.hit / 0.35;
        flash = u < 0.17 ? 0.85 : Math.max(0, 0.85 * (1 - (u - 0.17) / 0.3));
        rootZ += 0.08 * Math.sin(Math.PI * Math.min(u / 0.6, 1));
        headSy = 1 - 0.14 * Math.sin(Math.PI * Math.min(u / 0.5, 1));
        if (u >= 1) S.hit = -1;
      }
      for (var mi = 0; mi < S.allMats.length; mi++) if (S.allMats[mi].emissive) S.allMats[mi].emissive.setScalar(flash);
      if (flush > 0) { S.mats.skin.emissive.setRGB(Math.max(flash, flush), flash, flash); S.mats.nose.emissive.setRGB(Math.max(flash, flush), flash, flash); }

      if (S.land >= 0) {
        S.land += dt; var l = S.land;
        if (l < 0.32) {
          var uu = l / 0.32;
          rootY += 1.6 * (1 - uu * uu);
          rootRy = (1 - uu) * Math.PI;
          S.shadow.scale.setScalar(0.5 + 0.5 * uu);
        } else {
          if (!S.landDust) { S.landDust = true; dustFx(S); }
          var v = l - 0.32, w = 0.3 * Math.exp(-6 * v) * Math.cos(16 * v);
          sy *= 1 - w; sx *= 1 + w * 0.6;
          S.shadow.scale.setScalar(1);
          if (!S.landActed && l > 0.62) { S.landActed = true; act(S); }
          if (l > 1.2) { S.land = -1; S.landDust = false; }
        }
      }

      S.yaw += Math.atan2(Math.sin(S.yawT - S.yaw), Math.cos(S.yawT - S.yaw)) * Math.min(1, dt * 7);
      var yawRate = (S.yaw - S.prevYaw) / Math.max(dt, 1e-3); S.prevYaw = S.yaw;
      var vy = (rootY - S.prevY) / Math.max(dt, 1e-3); S.prevY = rootY;
      var tgt = 0.06 * br + Math.max(-0.7, Math.min(0.7, vy * 0.35));
      S.tailV += ((tgt - S.tailA) * 160 - S.tailV * 10) * dt; S.tailA += S.tailV * dt;
      S.tail.rotation.x = S.tailA; S.tail.rotation.z = Math.max(-0.6, Math.min(0.6, -yawRate * 0.06));
      S.root.position.set(S.x + rootZ * Math.sin(S.yaw), rootY + (S.lift || 0), S.z + rootZ * Math.cos(S.yaw));
      if (S.sway != null) S.root.rotation.z = S.sway;
      S.root.rotation.y = S.yaw + rootRy;
      S.body.scale.set(sx, sy, sx);
      S.body.position.z = bodyZ; S.body.rotation.x = bodyRx; S.body.rotation.y = bodyRy;
      S.head.scale.y = headSy;
      S.prop.rotation.x = propRx; S.prop.rotation.z = propRz; S.prop.position.z = propZ;
      S.armR.rotation.z = armRz;
    }

    function update(t, dt) {
      for (var i = 0; i < sailors.length; i++) updateOne(sailors[i], t, dt);
      for (var j = fx.length - 1; j >= 0; j--) {
        var f = fx[j]; f.t += dt; var u = Math.min(f.t / f.life, 1);
        f.update(u, f.obj);
        if (u >= 1) { world.remove(f.obj); if (f.obj.geometry) f.obj.geometry.dispose(); f.obj.material.dispose(); fx.splice(j, 1); }
      }
    }

    return { make: make, remove: remove, act: act, hit: hit, land: land, face: face, setAngry: setAngry, flinch: flinch, ram: ram, aim: aim, setTeam: setTeam, update: update, sailors: sailors };
  }

  TPS.SAILORS = { kit: kit, TEAM: TEAM, TYPES: ['gunner', 'shooter', 'boarder'] };
})(typeof window !== 'undefined' ? window : globalThis);
