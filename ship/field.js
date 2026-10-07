/* TPS v0 · ship/field.js
   Общее 3D-поле для песочницы и игры: вода, два корабля, матросы, частицы, камера по раскладке.
   Ортокамера с наклоном 30°. Экранные позиции кораблей берутся из layout.js, поэтому DOM-слой UI
   и 3D-сцена совпадают. Сторона 'p' это игрок (снизу, нос вправо), 'e' это соперник.

   var F = TPS.FIELD.create(container, { base: '' });
   F.setFrame('prep' | 'battle' | 'board', instant); F.update(dt);
   F.placeUnit('p', cell, 'gunner', 1, { land: true }); F.pick(clientX, clientY) -> { side, cell }
   F.finisher(worldPos): добивание, замедление и наезд камеры; F.slowK множитель времени для проигрывания */
(function (root) {
  'use strict';
  var TPS = root.TPS = root.TPS || {};

  function create(container, opt) {
    opt = opt || {};
    var THREE = root.THREE, LY = TPS.LAYOUT, C = LY.C, G = C.SHIP;
    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2));
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none';
    container.appendChild(renderer.domElement);
    var scene = new THREE.Scene(); scene.background = new THREE.Color(0x0E8E69);
    var hemi = new THREE.HemisphereLight(0xffffff, 0x8a7a68, 0.78); scene.add(hemi);
    var sun = new THREE.DirectionalLight(0xffffff, 0.62); sun.position.set(-2.5, 5, 3.5); scene.add(sun);

    var F = { THREE: THREE, scene: scene, renderer: renderer, tilt: (opt.tilt || C.TILT || 45) * Math.PI / 180, timeScale: 1, t: 0 };
    var camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 80); F.camera = camera;
    var GEO = TPS.SHIP3D.GEO;

    // ---------- вода: шейдер ----------
    // Медленные гребни-чёрточки как на пробе water, светлее у корпусов, пенный обвод по ватерлинии.
    // Обвод считается по профилю полуширины корпуса, поэтому плывёт и разворачивается вместе с кораблём.
    var NOISE = [
      'float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
      'float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);',
      '  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }',
      'float fbm(vec2 p){ return vn(p) * 0.62 + vn(p * 2.13 + 7.1) * 0.38; }',
      // пузыри пены как на эталоне: расстояние до ближайшего центра пузыря и его случайность; центры покачиваются во времени
      'vec2 h22(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }',
      'vec2 bub(vec2 p, float t){ vec2 i = floor(p), f = fract(p); float md = 8.0, mr = 0.0;',
      '  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(float(x), float(y)), o = h22(i + g);',
      '    vec2 c = g + 0.5 + 0.32 * sin(t * (0.7 + 0.6 * o.y) + 6.2831 * o) - f; float d = length(c); if (d < md) { md = d; mr = o.x; } }',
      '  return vec2(md, mr); }'
    ].join('\n');
    var HWN = 40;
    var hullU = { uShip: { value: [new THREE.Vector4(), new THREE.Vector4()] }, uShipK: { value: [new THREE.Vector4(), new THREE.Vector4()] },
      uHWT: { value: null }, uXR: { value: new THREE.Vector2() } };
    var hwData = new Uint8Array(HWN * 4), hwTex = new THREE.DataTexture(hwData, HWN, 1, THREE.RGBAFormat); hwTex.magFilter = hwTex.minFilter = THREE.LinearFilter; hullU.uHWT.value = hwTex;
    var waterMat = new THREE.ShaderMaterial({
      uniforms: Object.assign({ uT: { value: 0 },
        cDeep: { value: new THREE.Color(0x15745A) }, cMid: { value: new THREE.Color(0x1A8263) }, cLite: { value: new THREE.Color(0x5DBB9C) },
        cShal: { value: new THREE.Color(0x2A9776) }, cFoam: { value: new THREE.Color(0xF4FFFC) }, cFoamB: { value: new THREE.Color(0x8FDCD0) },
        // погода и время суток: время гребней, порог гребней, барашки, дорожка закатных бликов, пена у корпуса
        uTw: { value: 0 }, uCr: { value: 0.885 }, uCap: { value: 0 }, uGlitK: { value: 0 }, uGlitX: { value: 3 }, cGlit: { value: new THREE.Color(0xFFB070) }, uFoamK: { value: 0 } }, hullU),
      vertexShader: 'varying vec2 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: [
        'uniform float uT; uniform vec3 cDeep, cMid, cLite, cShal, cFoam, cFoamB;',
        'uniform float uTw, uCr, uCap, uGlitK, uGlitX, uFoamK; uniform vec3 cGlit;',
        'uniform vec4 uShip[2]; uniform vec4 uShipK[2]; uniform sampler2D uHWT; uniform vec2 uXR;',
        'varying vec2 vW;', NOISE,
        // профиль полуширины корпуса лежит в текстуре 40×1, значение ×2,5
        'float hwAt(float x){ float u = clamp((x - uXR.x) / (uXR.y - uXR.x), 0.0, 1.0); u = (u * ' + (HWN - 1) + '.0 + 0.5) / ' + HWN + '.0; return texture2D(uHWT, vec2(u, 0.5)).r * 2.5; }',
        // расстояние до ватерлинии корабля: >0 снаружи
        'float hullD(vec4 S, vec4 K, out vec2 lo){ vec2 d = vW - S.xy; float c = cos(S.z), s = sin(S.z);',
        '  vec2 l = vec2(c * d.x - s * d.y, s * d.x + c * d.y) / S.w; lo = l;',
        '  float ex = max(uXR.x - l.x, l.x - uXR.y); float hw = hwAt(l.x); float dz = abs(l.y) - hw;',
        '  float dd = ex > 0.0 ? length(vec2(ex, max(dz, 0.0))) : dz; return dd * S.w; }',
        'void main(){',
        '  vec2 p = vW; float t = uT, tw = uTw;',
        '  float big = fbm(p * 0.16 + vec2(t * 0.012, t * 0.007));',
        '  vec3 col = mix(cDeep, cMid, 0.45 + 0.55 * smoothstep(0.25, 0.75, big));',
        // гребни: вытянутые вдоль x чёрточки, два слоя навстречу друг другу, медленно
        '  vec2 q = vec2(p.x * 0.55, p.y * 2.6) + vec2(tw * 0.07, 0.3 * sin(p.x * 0.5 + tw * 0.3));',
        '  vec2 q2 = vec2(p.x * 0.7, p.y * 3.1) + vec2(-tw * 0.05, 0.25 * cos(p.x * 0.4 - tw * 0.25)) + 19.7;',
        '  float w1 = vn(q * 1.6), w2 = vn(q2 * 1.4);',
        '  float dash = max(smoothstep(uCr, uCr + 0.015, w1), 0.7 * smoothstep(uCr + 0.015, uCr + 0.03, w2));',
        // вечером гребни в полосе под солнцем ловят закат, дальше от камеры ярче
        '  float gl = uGlitK * exp(-pow((p.x - uGlitX) / 4.2, 2.0)) * (0.5 + 0.5 * smoothstep(4.0, -8.0, p.y));',
        // вечер: тёплая дымка к дальнему краю (там закат) и темнее у ближнего
        '  col += cGlit * uGlitK * 0.16 * smoothstep(3.0, -10.0, p.y) + cGlit * 0.06 * gl;',
        '  col *= 1.0 - uGlitK * 0.16 * smoothstep(-1.0, 9.0, p.y);',
        '  col = mix(col, mix(cLite, cGlit, min(1.0, gl * 1.4)), dash * (0.6 + 0.4 * gl));',
        // свежий ветер: верхушки самых крупных гребней становятся барашками
        '  col = mix(col, cFoam, uCap * smoothstep(uCr + 0.05, uCr + 0.075, w1));',
        // корпуса: мелководье и пена
        '  for (int i = 0; i < 2; i++) { vec4 S = uShip[i], K = uShipK[i]; if (K.w < 0.01) continue; vec2 lo;',
        '    float d = hullD(S, K, lo); if (d > 1.7) continue; float lx = lo.x;',
        '    float bowF = smoothstep(uXR.y - 1.6, uXR.y, lx), sternF = 1.0 - smoothstep(uXR.x, uXR.x + 1.2, lx);',
        '    col = mix(col, cShal, 0.5 * K.w * (1.0 - smoothstep(0.0, 1.1 + 0.6 * K.x, d)));',
        // кайма у борта: её край собран из дуг пузырей (бугристый, как на эталоне), на ходу шире, у носа и кормы толще
        '    float bw = 0.2 + 0.06 * K.x + 0.22 * K.x * bowF + 0.1 * sternF + uFoamK * 0.07 + 0.02 * sin(t * 1.7 + lx * 2.3);',
        // пузыри в координатах корабля, на ходу текут к корме (K.y накапливает путь)
        '    vec2 lq = vec2(lo.x + K.y, lo.y);',
        '    vec2 b1 = bub(lq * 3.6, t);',
        '    float e = bw + (0.1 + 0.05 * K.x) * (1.0 - smoothstep(0.0, 0.5, b1.x));',
        '    float fo = 1.0 - smoothstep(e - 0.015, e + 0.015, d);',
        // россыпь отдельных пузырьков рядом: чем дальше от борта, тем реже и мельче
        '    float far = smoothstep(bw, bw + 0.7 + 0.4 * K.x * bowF + uFoamK * 0.25, d);',
        '    vec2 b2 = bub(lq * 4.4 + 17.3, t * 1.3);',
        '    float rd = mix(0.36, 0.17, far) * step(mix(0.25, 0.9, far), b2.y) * step(far, 0.999);',
        '    fo = max(fo, 1.0 - smoothstep(rd - 0.08, rd, b2.x));',
        '    col = mix(col, cFoamB, 0.35 * K.w * (1.0 - smoothstep(e, e + 0.08, d)));',
        '    col = mix(col, cFoam, fo * K.w);',
        '  }',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
      ].join('\n')
    });
    var water = new THREE.Mesh(new THREE.PlaneGeometry(72, 72, 1, 1), waterMat);
    water.rotation.x = -Math.PI / 2; water.position.y = GEO.water; scene.add(water);

    // ---------- след за кораблём: лента из точек кормы, расходится клином и тает ----------
    var WAKE_N = 64, WAKE_LIFE = 4.2;
    function makeWake() {
      var g = new THREE.BufferGeometry(), pos = new Float32Array(WAKE_N * 2 * 3), uv = new Float32Array(WAKE_N * 2 * 2), kk = new Float32Array(WAKE_N * 2), tt = new Float32Array(WAKE_N * 2), idx = [];
      for (var i = 0; i < WAKE_N - 1; i++) { var a = i * 2; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('aK', new THREE.BufferAttribute(kk, 1)); g.setAttribute('aT', new THREE.BufferAttribute(tt, 1)); g.setIndex(idx);
      var m = new THREE.Mesh(g, new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: { uT: waterMat.uniforms.uT, cFoam: waterMat.uniforms.cFoam, cFoamB: waterMat.uniforms.cFoamB, cShal: waterMat.uniforms.cShal },
        // aT: путь, пройденный водой к моменту рождения точки; пузыри привязаны к нему и уплывают назад вместе с водой
        vertexShader: 'attribute float aK; attribute float aT; varying vec2 vUv; varying float vK; varying float vT; varying vec2 vW; void main(){ vUv = uv; vK = aK; vT = aT; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: ['uniform float uT; uniform vec3 cFoam, cFoamB, cShal; varying vec2 vUv; varying float vK; varying float vT; varying vec2 vW;', NOISE,
          'void main(){ float u = vUv.x, v = abs(vUv.y);',
          // след как на эталоне: два расходящихся хвоста пузырей по краям клина и плотная пена у кормы; пузыри стоят в воде и тают с возрастом
          '  float edge = smoothstep(0.42, 0.72, v) * (1.0 - smoothstep(0.86, 1.0, v));',
          '  float core = (1.0 - smoothstep(0.0, 0.5, v)) * (1.0 - smoothstep(0.0, 0.45, u));',
          '  float prof = max(edge, core) * vK;',
          '  float age = pow(1.0 - u, 0.9);',
          '  vec2 wq = vec2(vT, vUv.y * (0.7 + 0.9 * u));',
          '  vec2 b1 = bub(wq * vec2(3.2, 2.4), uT * 0.9), b2 = bub(wq * vec2(4.6, 3.4) + 13.1, uT * 1.2);',
          // крупные пузыри: почти сплошь, где профиль высокий; мелкие вокруг, реже; всё уменьшается с возрастом
          '  float r1 = (0.28 + 0.3 * prof) * age * step(0.95 - prof * 1.3, b1.y);',
          '  float r2 = (0.16 + 0.16 * prof) * age * step(0.5, b2.y) * step(0.1, prof + 0.25 * (1.0 - u));',
          '  float fo = max(1.0 - smoothstep(r1 - 0.07, r1, b1.x), 1.0 - smoothstep(r2 - 0.08, r2, b2.x));',
          '  float tint = (1.0 - smoothstep(0.65, 1.0, v)) * 0.45 * (1.0 - u) * vK;',
          '  float a = max(tint, fo);',
          '  if (a < 0.01) discard;',
          '  vec3 c = mix(mix(cShal, cFoamB, 0.35), cFoam, fo);',
          '  gl_FragColor = vec4(c, a); }'].join('\n')
      }));
      m.frustumCulled = false; m.position.y = 0.002; m.renderOrder = 1; scene.add(m);
      return { mesh: m, pts: [], acc: 0 };
    }

    F.fx = TPS.FX.create(THREE, scene, { base: opt.base });
    F.sfx = TPS.SFX;

    // ---------- вспышки света: аддитивное пятно на воде и палубе, как будет в мобильном Unity ----------
    // Настоящих источников света нет: пятно рисуется поверх сцены, а корпус рядом коротко подсвечивается эмиссией.
    var lightTex = (function () {
      var c = document.createElement('canvas'); c.width = c.height = 128; var g = c.getContext('2d');
      var gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,.75)'); gr.addColorStop(0.5, 'rgba(255,255,255,.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
    })();
    var lightGeo = new THREE.PlaneGeometry(1, 1), lights = [], lightPool = [];
    // light(worldPos, { color, r, life, a }): r в клетках, life в секундах игрового времени
    F.light = function (pos, o) {
      o = o || {}; var k = F.atmo.lightK * (o.a == null ? 0.8 : o.a); if (k <= 0.01) return;
      var m = lightPool.pop();
      if (!m) { m = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ map: lightTex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })); m.rotation.x = -Math.PI / 2; m.renderOrder = 4; }
      m.material.color.setHex(o.color || 0xffb060); m.position.copy(pos); m.visible = true; scene.add(m);
      lights.push({ m: m, t: 0, life: (o.life || 0.25) * (0.7 + 0.3 * F.juice), r: (o.r || 1.4) * (0.8 + 0.2 * F.juice), k: Math.min(1.4, k) });
    };
    function updateLights(dt) {
      for (var i = lights.length - 1; i >= 0; i--) {
        var L = lights[i]; L.t += dt; var u = L.t / L.life;
        if (u >= 1) { scene.remove(L.m); L.m.visible = false; lightPool.push(L.m); lights.splice(i, 1); continue; }
        var att = Math.min(1, L.t / 0.03), fall = Math.pow(1 - u, 1.6), sz = L.r * 2 * (0.75 + 0.35 * Math.sqrt(u));
        L.m.scale.set(sz, sz, 1); L.m.material.opacity = L.k * att * fall;
      }
    }
    // короткая тёплая подсветка корпуса корабля: эмиссия тун-материалов, без источников света
    var glowCol = new THREE.Color();
    F.glowShip = function (side, k, color) {
      var sh = F.ships[side]; if (!sh || F.atmo.lightK <= 0.01) return;
      sh.glowA = Math.min(0.9, Math.max(sh.glowA || 0, k * F.atmo.lightK)); if (color) sh.glowC = color;
    };
    function updateGlow(dt) {
      ['p', 'e'].forEach(function (side) {
        var sh = F.ships[side]; if (!sh.glowMats) { sh.glowMats = []; sh.root.traverse(function (o) { if (o.material && o.material.isMeshToonMaterial && o.material.emissive && sh.glowMats.indexOf(o.material) < 0) sh.glowMats.push(o.material); }); }
        var a = sh.glowA || 0; if (a <= 0 && !sh.glowOn) return;
        a = a < 0.01 ? 0 : a * Math.exp(-dt * 10); sh.glowA = a; sh.glowOn = a > 0;
        glowCol.setHex(sh.glowC || 0xff9a40).multiplyScalar(a * 0.55);
        sh.glowMats.forEach(function (m) { m.emissive.copy(glowCol); });
      });
    }

    // ---------- атмосфера: время суток и погода ----------
    // День это прежняя палитра. Вечер: тёмная зелёная вода (не синяя, чтобы не слиться с командой игрока),
    // оранжевые блики гребней в полосе под солнцем, тёплый низкий свет, пятна света от выстрелов в полную силу.
    var TIMES = {
      day: { bg: 0x0E8E69, hemi: [0xffffff, 0x8a7a68, 0.78], sun: [0xffffff, 0.62, -2.5, 5, 3.5], lightK: 0.3,
        water: { cDeep: 0x15745A, cMid: 0x1A8263, cLite: 0x5DBB9C, cShal: 0x2A9776, cFoam: 0xF4FFFC, cFoamB: 0x8FDCD0 }, glit: 0, shadow: 0x02362c },
      evening: { bg: 0x0A3D3A, hemi: [0xffcfa6, 0x40345e, 0.72], sun: [0xff9a52, 0.72, -5, 3.0, 3.0], lightK: 1,
        water: { cDeep: 0x0A3B39, cMid: 0x0E4B46, cLite: 0x7FA894, cShal: 0x17645A, cFoam: 0xFFE9D6, cFoamB: 0x88B6AA }, glit: 1, shadow: 0x041a18 }
    };
    // штиль: редкие медленные гребни и почти нет качки; свежий ветер: качка в бою сильнее, частые гребни с барашками, брызги у носа, дым сносит
    var WEATHERS = {
      calm:   { rock: 0.35, prepRock: 0.35, cr: 0.935, sp: 0.45, cap: 0, foam: 0, wind: 0, spray: 0 },
      normal: { rock: 1, prepRock: 1, cr: 0.885, sp: 1, cap: 0, foam: 0, wind: 0, spray: 0 },
      wind:   { rock: 1.9, prepRock: 1, cr: 0.845, sp: 2.1, cap: 0.55, foam: 1, wind: 0.55, spray: 1 }
    };
    F.TIMES = TIMES; F.WEATHERS = WEATHERS;
    F.atmo = { time: 'day', weather: 'normal', lightK: TIMES.day.lightK };
    F.rockBase = 5;   // качка в градусах; погода умножает её, в подготовке ветер её не усиливает
    var curRock = { p: 5, e: 5 }, twAcc = 0;
    F.setAtmo = function (a) {
      a = a || {}; var T = TIMES[a.time] || TIMES[F.atmo.time] || TIMES.day, W = WEATHERS[a.weather] || WEATHERS[F.atmo.weather] || WEATHERS.normal;
      F.atmo = { time: TIMES[a.time] ? a.time : F.atmo.time, weather: WEATHERS[a.weather] ? a.weather : F.atmo.weather, lightK: T.lightK, W: W };
      scene.background.setHex(T.bg);
      hemi.color.setHex(T.hemi[0]); hemi.groundColor.setHex(T.hemi[1]); hemi.intensity = T.hemi[2];
      sun.color.setHex(T.sun[0]); sun.intensity = T.sun[1]; sun.position.set(T.sun[2], T.sun[3], T.sun[4]);
      var U = waterMat.uniforms; Object.keys(T.water).forEach(function (k) { U[k].value.setHex(T.water[k]); });
      U.uGlitK.value = T.glit; U.uCr.value = W.cr; U.uCap.value = W.cap; U.uFoamK.value = W.foam;
      ['p', 'e'].forEach(function (sd) { var sh = F.ships[sd]; if (sh && sh.shadowMesh) sh.shadowMesh.material.color.setHex(T.shadow); });
      F.fx.wind = W.wind;
      return F.atmo;
    };

    // корабли
    F.ships = {}; F.kits = {}; F.units = { p: {}, e: {} }; F.kegBadges = { p: {}, e: {} };
    ['p', 'e'].forEach(function (side) {
      var sh = TPS.SHIP3D.build(THREE, { team: side === 'p' ? 'blue' : 'red' });
      sh.travel = 0; sh.side = side; scene.add(sh.root);
      F.ships[side] = sh; F.kits[side] = TPS.SAILORS.kit(THREE, sh.deck);
      sh.wake = makeWake(); sh.prevPos = new THREE.Vector3(); sh.vel = 0;
    });
    F.ships.e.setYaw(Math.PI);
    F.ships.p.yaw0 = 0; F.ships.e.yaw0 = Math.PI;
    // профиль полуширины по ватерлинии для шейдера воды
    (function () {
      var wl = F.ships.p.waterline, x0 = Infinity, x1 = -Infinity; wl.forEach(function (q) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); });
      hullU.uXR.value.set(x0, x1);
      for (var i = 0; i < HWN; i++) { var x = x0 + (x1 - x0) * i / (HWN - 1), m = 0; for (var j = 0; j < wl.length; j++) { var A = wl[j], Bq = wl[(j + 1) % wl.length]; if ((A[0] - x) * (Bq[0] - x) <= 0 && A[0] !== Bq[0]) { var u = (x - A[0]) / (Bq[0] - A[0]); m = Math.max(m, Math.abs(A[1] + (Bq[1] - A[1]) * u)); } } hwData[i * 4] = Math.round(Math.min(1, m / 2.5) * 255); hwData[i * 4 + 3] = 255; }
      hwTex.needsUpdate = true;
    })();

    // ---------- кадры по раскладке ----------
    var vp = { w: 375, h: 667, top: 0, bottom: 0 }, cur = null, from = null, to = null, tr = 1, trDur = 0.6;
    // экранная высота корабля в клетках при текущем наклоне: от верха дальних стволов до низа ближнего борта
    function extent() {
      var c = Math.cos(F.tilt), s2 = Math.sin(F.tilt), R = GEO.gunZ + GEO.culLen - 0.2 + 0.05, wl = GEO.beam * (1 - (1 - GEO.flare) * (-GEO.water / GEO.depth));
      var hullUp = (GEO.beam + 0.05) * c + (GEO.railH) * s2, hullDn = (wl + 0.12) * c + (-GEO.water) * s2;
      var barUp = R * c + GEO.barrelY * s2, barDn = Math.max(hullDn, R * c - GEO.barrelY * s2);
      return { hullUp: hullUp, hullDn: hullDn, barUp: barUp, barDn: barDn };
    }
    function frameParams(name) {
      var f = LY.frame(vp), B = LY.bands(f, 'game'), s = f.s, fb = B.field, cx = f.x0 + 187.5 * s, X = extent(), cosT = Math.cos(F.tilt);
      var P = { name: name, anchorY: fb.y + fb.h * s / 2 };
      if (name === 'prep') {
        // в подготовке зазор считается между концами стволов
        var ce = C.CELL_PREP * C.ENEMY_PREP, cp = C.CELL_PREP, eT = (X.barUp + X.barDn) * ce, pT = (X.barUp + X.barDn) * cp, y0 = (C.FIELD_H - eT - C.WATER_PREP - pT) / 2;
        P.ppu = cp * s;
        P.e = { x: cx, y: fb.y + (y0 + X.barUp * ce) * s, sc: C.ENEMY_PREP };
        P.p = { x: cx, y: fb.y + (y0 + eT + C.WATER_PREP + X.barUp * cp) * s, sc: 1 };
      } else {
        // в бою и абордаже зазор между корпусами
        var c2 = C.CELL_BATTLE, sea = name === 'board' ? C.SEA_BOARD : C.SEA_BATTLE;
        var tot = X.barUp * c2 + X.hullDn * c2 + sea + X.hullUp * c2 + X.barDn * c2;
        var y1 = (C.FIELD_H - tot) / 2, eCy = y1 + X.barUp * c2;
        P.ppu = c2 * s; P.e = { x: cx, y: fb.y + eCy * s, sc: 1 }; P.p = { x: cx, y: fb.y + (eCy + X.hullDn * c2 + sea + X.hullUp * c2) * s, sc: 1 };
      }
      P.cx = cx; void cosT; return P;
    }
    function lerpP(a, b, u) {
      var e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2, L2 = function (x, y) { return x + (y - x) * e; };
      return { ppu: L2(a.ppu, b.ppu), anchorY: L2(a.anchorY, b.anchorY), cx: b.cx,
        p: { x: L2(a.p.x, b.p.x), y: L2(a.p.y, b.p.y), sc: L2(a.p.sc, b.p.sc) }, e: { x: L2(a.e.x, b.e.x), y: L2(a.e.y, b.e.y), sc: L2(a.e.sc, b.e.sc) } };
    }
    F.zoom = null;   // { k, dx }: вход в уровень, приближение камеры и сход кораблей
    F.punch = null;  // { k, pos, q }: наезд добивания к точке мира pos, k > 1 приближает, q тянет точку к центру экрана
    F.setFrame = function (name, instant) {
      to = frameParams(name); F.frameName = name;
      if (instant || !cur) { cur = to; tr = 1; } else { from = cur; tr = 0; }
    };
    F.resize = function () {
      var w = container.clientWidth, h = container.clientHeight;
      renderer.setSize(w, h, false); vp = { w: w, h: h, top: 0, bottom: 0 }; if (F.fx) { F.fx.cam = camera; F.fx.aspect = h / Math.max(1, w); }
      if (F.frameName) { to = frameParams(F.frameName); if (tr >= 1) cur = to; }
    };
    function apply(P) {
      var ppu = P.ppu, cosT = Math.cos(F.tilt), sinT = Math.sin(F.tilt);
      var z = F.zoom, k = z ? z.k : 1;
      var ppuK = ppu * k * (1 + (F.zpA || 0));   // F.zpA: короткий наезд камеры (начало абордажа)
      var cl = -vp.w / 2 / ppuK, cr = vp.w / 2 / ppuK, ct = P.anchorY / ppuK, cb = -(vp.h - P.anchorY) / ppuK, pu = F.punch;
      // наезд добивания: кадр сжимается вокруг точки события, она остаётся на месте и немного тянется к центру
      if (pu && pu.k > 1) {
        var fx = pu.pos.x, fy = pu.pos.y * sinT - pu.pos.z * cosT, ik = 1 / pu.k;
        cl = fx + (cl - fx) * ik; cr = fx + (cr - fx) * ik; ct = fy + (ct - fy) * ik; cb = fy + (cb - fy) * ik;
        var ox = (fx - (cl + cr) / 2) * (pu.q || 0), oy = (fy - (ct + cb) / 2) * (pu.q || 0);
        cl += ox; cr += ox; ct += oy; cb += oy;
      }
      camera.left = cl; camera.right = cr; camera.top = ct; camera.bottom = cb;
      var shk = pu ? 0.5 : 1, sx = (F.shakeT > 0 ? (Math.random() - 0.5) * 2 * F.shakeA * shk : 0) / ppuK, sy = (F.shakeT > 0 ? (Math.random() - 0.5) * 2 * F.shakeA * shk : 0) / ppuK;   // во время наезда добивания тряска вдвое слабее
      if (F.nudgeV && !pu) { sx += F.nudgeV.x * (F.nudgeK || 0); sy += F.nudgeV.z * (F.nudgeK || 0); }   // доворот к залпу; во время добивания выключен
      camera.position.set(sx, Math.cos(F.tilt) * 30, Math.sin(F.tilt) * 30 + sy); camera.lookAt(sx, 0, sy);
      camera.updateProjectionMatrix();
      ['p', 'e'].forEach(function (side) {
        var sh = F.ships[side], q = P[side];
        var wx = (q.x - P.cx) / ppu + sh.travel + (z ? (side === 'e' ? z.dx : -z.dx) : 0);
        sh.root.position.set(wx, 0, (q.y - P.anchorY) / (ppu * cosT));
        sh.root.scale.setScalar(q.sc);
      });
      // бейджи соперника одного размера с бейджами игрока
      var inv = 1 / P.e.sc;
      if (Math.abs(inv - (F._inv || 1)) > 0.001) {
        F._inv = inv;
        Object.keys(F.units.e).forEach(function (c) { var u = F.units.e[c]; u.badge.scale.set(u.badge.userData.w * inv, u.badge.userData.h * inv, 1); });
        Object.keys(F.kegBadges.e).forEach(function (c) { var b = F.kegBadges.e[c]; b.scale.set(b.userData.w * inv, b.userData.h * inv, 1); });
      }
      F.ppu = ppuK * (pu && pu.k > 1 ? pu.k : 1); F.cur = P;
    }

    // ---------- юниты, бейджи, бочки ----------
    var RANK_COL = { p: '#2f78dd', e: '#d9473f' };
    function badgeSprite(map, w, h, sideScale) {
      var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: map, depthTest: false, transparent: true }));
      s.renderOrder = 10; s.scale.set(w * sideScale, h * sideScale, 1); s.userData.w = w; s.userData.h = h; return s;
    }
    function compensate(side) { return side === 'e' && F.cur ? 1 / F.cur.e.sc : 1; }
    F.placeUnit = function (side, cell, type, rank, o) {
      o = o || {};
      F.removeUnit(side, cell, { silent: true });
      var sh = F.ships[side], kit = F.kits[side], p = sh.cellPos(cell);
      var S = kit.make(type, p.x, p.z, side === 'p' ? 'blue' : 'red');
      kit.face(S, Math.PI); S.yaw = Math.PI;
      var u = { S: S, type: type, rank: rank || 1, side: side, cell: cell, id: o.id };
      setRankVisual(u);
      u.badge = badgeSprite(TPS.SHIP3D.badgeTex(THREE, 'rank', String(u.rank), RANK_COL[side], u.rank >= 3), 0.34, 0.34, compensate(side));
      u.badge.position.set(p.x + 0.33, 0.06, p.z + 0.33); sh.deck.add(u.badge);
      if (o.hp) addHp(u);
      F.units[side][cell] = u;
      if (o.land) { kit.land(S); setTimeout(function () { F.sfx.land(); }, 320); }
      return u;
    };
    function setRankVisual(u) { var sc = 1 + 0.12 * (u.rank - 1); u.S.root.scale.setScalar(sc); }
    F.setRank = function (side, cell, rank) {
      var u = F.units[side][cell]; if (!u) return; u.rank = rank; setRankVisual(u);
      u.badge.material.map = TPS.SHIP3D.badgeTex(THREE, 'rank', String(rank), RANK_COL[side], rank >= 3); u.badge.material.needsUpdate = true;
    };
    F.removeUnit = function (side, cell, o) {
      var u = F.units[side][cell]; if (!u) return null;
      o = o || {};
      var sh = F.ships[side];
      if (o.death) {
        var wp = F.worldOf(side, cell); F.fx.puff(wp); F.fx.skull(wp); F.sfx.death(); F.deathPos[side][cell] = wp.clone();
      }
      F.kits[side].remove(u.S); if (u.S.root.parent) u.S.root.parent.remove(u.S.root);
      [u.badge, u.hp && u.hp.bg, u.hp && u.hp.fill].forEach(function (o2) { if (o2 && o2.parent) o2.parent.remove(o2); });
      jumps = jumps.filter(function (j) { return j.u !== u; }); void sh;
      delete F.units[side][cell]; return u;
    };
    F.moveUnit = function (side, from2, to2) {
      var a = F.units[side][from2], b = F.units[side][to2], sh = F.ships[side];
      function put(u, c) { if (!u) return; var p = sh.cellPos(c); u.cell = c; u.S.x = p.x; u.S.z = p.z; u.badge.position.set(p.x + 0.33, 0.06, p.z + 0.33); if (u.hp) { u.hp.bg.position.set(p.x, 1.0, p.z); u.hp.fill.position.set(p.x, 1.0, p.z); } }
      delete F.units[side][from2]; delete F.units[side][to2];
      if (a) { put(a, to2); F.units[side][to2] = a; }
      if (b) { put(b, from2); F.units[side][from2] = b; }
    };
    var hpBgTex = null, hpFillTex = null;
    function addHp(u) {
      if (!hpBgTex) {
        var c1 = document.createElement('canvas'); c1.width = 64; c1.height = 12; var g1 = c1.getContext('2d'); g1.fillStyle = 'rgba(0,0,0,.6)'; g1.fillRect(0, 0, 64, 12); hpBgTex = new THREE.CanvasTexture(c1);
        var c2 = document.createElement('canvas'); c2.width = 64; c2.height = 12; var g2 = c2.getContext('2d'); g2.fillStyle = '#48d46c'; g2.fillRect(0, 0, 64, 12); hpFillTex = new THREE.CanvasTexture(c2);
      }
      var sh = F.ships[u.side], p = sh.cellPos(u.cell), cs = compensate(u.side);
      var bg = badgeSprite(hpBgTex, 0.62, 0.1, cs), fill = badgeSprite(hpFillTex, 0.6, 0.075, cs);
      bg.position.set(p.x, 1.0, p.z); fill.position.set(p.x, 1.0, p.z);
      sh.deck.add(bg); sh.deck.add(fill); u.hp = { bg: bg, fill: fill, w: 0.6 * cs };
    }
    F.showHp = function (on) {
      ['p', 'e'].forEach(function (side) { Object.keys(F.units[side]).forEach(function (c) {
        var u = F.units[side][c]; if (on && !u.hp) addHp(u); if (u.hp) { u.hp.bg.visible = u.hp.fill.visible = on; } }); });
    };
    // полоска убывает от правого края: точка привязки спрайта сдвигается так, что левый край стоит на месте (center.x = 1 / (2v))
    F.setHp = function (side, cell, v) { var u = F.units[side][cell]; if (u && u.hp) { var k = Math.max(0.001, v); u.hp.fill.scale.x = u.hp.w * k; u.hp.fill.center.x = 0.5 / k; } };
    F.setKeg = function (side, cell, on) {
      var sh = F.ships[side];
      if (on) {
        sh.addKeg(cell); var p = sh.cellPos(cell);
        var b = badgeSprite(TPS.SHIP3D.badgeTex(THREE, 'keg', '+10'), 0.5, 0.29, compensate(side)); b.position.set(p.x + 0.22, 0.06, p.z + 0.34); sh.deck.add(b); F.kegBadges[side][cell] = b;
      } else {
        sh.removeKeg(cell); var bb = F.kegBadges[side][cell]; if (bb) { sh.deck.remove(bb); delete F.kegBadges[side][cell]; }
      }
    };
    F.clearSide = function (side) {
      F.boardMode = null;
      Object.keys(F.units[side]).forEach(function (c) { F.removeUnit(side, +c, { silent: true }); });
      Object.keys(F.ships[side].kegs).forEach(function (c) { F.setKeg(side, +c, false); });
    };

    // ---------- камера: доворот и короткий наезд ----------
    var nudgeT = 0, zpT = 0;
    F.nudge = function (x, z) { F.nudgeV = new THREE.Vector3(x, 0, z).multiplyScalar(Math.min(1.5, F.juice)); nudgeT = 0; };
    F.zoomPulse = function (k) { F.zpK = k * Math.min(1.5, F.juice); zpT = 0; };
    function updateCam(rdt) {
      if (F.nudgeV) { nudgeT += rdt; var a = nudgeT < 0.18 ? nudgeT / 0.18 : Math.max(0, 1 - (nudgeT - 0.18) / 0.7); F.nudgeV.multiplyScalar(1); F.nudgeK = a; if (nudgeT > 0.9) F.nudgeV = null; }
      if (F.zpK) { zpT += rdt; F.zpA = F.zpK * (zpT < 0.2 ? zpT / 0.2 : Math.max(0, 1 - (zpT - 0.2) / 0.8)); if (zpT > 1) { F.zpK = 0; F.zpA = 0; } }
    }
    // ---------- мерж: отклик пары при наведении, столб света и ударная волна ----------
    var mhover = null, pops = [], goldGlow = (function () { var c = document.createElement('canvas'); c.width = c.height = 64; var g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,240,170,1)'); gr.addColorStop(0.5, 'rgba(255,200,80,.5)'); gr.addColorStop(1, 'rgba(255,180,40,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
    var mhGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), new THREE.MeshBasicMaterial({ map: goldGlow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    mhGlow.rotation.x = -Math.PI / 2; mhGlow.visible = false; mhGlow.renderOrder = 2;
    F.mergeHover = function (side, cell) {
      var u = cell != null && cell >= 0 ? F.units[side][cell] : null;
      if (mhover && mhover.u !== u) { mhover.u.S.root.scale.setScalar(mhover.base); }
      if (!u) { mhover = null; mhGlow.visible = false; return; }
      if (!mhover || mhover.u !== u) { mhover = { u: u, side: side, base: 1 + 0.12 * (u.rank - 1), t: 0 }; F.fx.sparkle(F.worldOf(side, cell, 0.3), false); }
      var sh = F.ships[side], cp = sh.cellPos(cell); if (mhGlow.parent !== sh.deck) sh.deck.add(mhGlow); mhGlow.position.set(cp.x, 0.02, cp.z); mhGlow.visible = true;
    };
    F.mergeBurst = function (side, cell, big) {
      var w = F.worldOf(side, cell, 0.05); F.fx.pillar(w, big);
      var ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: ringTex, color: big ? 0xffd34a : 0xfff0b0, transparent: true, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.copy(w).setY(0.1); ring.renderOrder = 8; scene.add(ring); ults.push({ kind: 'ring', t: 0, real: true, dur: big ? 0.6 : 0.45, m: ring });
      if (big) { F.fx.cheer(w); F.after(0.12, function () { F.fx.cheer(w); }); }
      var u = F.units[side][cell]; if (u && u.badge) pops.push({ b: u.badge, t: 0, w: u.badge.scale.x, h: u.badge.scale.y });
    };
    function updateMerge(rdt) {
      if (mhover) { mhover.t += rdt; var k = mhover.base * (1.08 + 0.05 * Math.sin(mhover.t * 14)); mhover.u.S.root.scale.setScalar(k); mhGlow.material.opacity = 0.7 + 0.3 * Math.sin(mhover.t * 14); }
      for (var i = pops.length - 1; i >= 0; i--) { var p = pops[i]; p.t += rdt; var u = Math.min(1, p.t / 0.45), k2 = 1 + 0.9 * Math.sin(Math.PI * u) * (1 - u * 0.4); p.b.scale.set(p.w * k2, p.h * k2, 1); if (u >= 1) { p.b.scale.set(p.w, p.h, 1); pops.splice(i, 1); } }
    }
    // ---------- атмосфера: тени облаков по воде, чайки, 3D-облака на входе ----------
    var cloudShadowTex = (function () { var c = document.createElement('canvas'); c.width = c.height = 128; var g = c.getContext('2d');
      [[64, 70, 30], [40, 74, 22], [88, 72, 24], [60, 50, 24], [80, 54, 18]].forEach(function (b) { var gr = g.createRadialGradient(b[0], b[1], 0, b[0], b[1], b[2]); gr.addColorStop(0, 'rgba(0,25,22,1)'); gr.addColorStop(0.82, 'rgba(0,25,22,1)'); gr.addColorStop(1, 'rgba(0,25,22,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
      return new THREE.CanvasTexture(c); })();
    var cshadows = [];
    for (var ci = 0; ci < 6; ci++) { var csm = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: cloudShadowTex, transparent: true, depthWrite: false, depthTest: false, opacity: 0.32 }));   // тень ложится и на корабли
      csm.rotation.x = -Math.PI / 2; var sc0 = 2.6 + Math.random() * 1.6; csm.scale.set(sc0, sc0 * 0.7, 1); csm.position.set(-6 + Math.random() * 12, 0.012, -7 + ci * 2.6 + Math.random()); csm.renderOrder = 1; scene.add(csm); cshadows.push(csm); }
    var gullTex = (function () { var c = document.createElement('canvas'); c.width = 64; c.height = 32; var g = c.getContext('2d'); g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(4, 12); g.quadraticCurveTo(18, 2, 32, 18); g.quadraticCurveTo(46, 2, 60, 12); g.strokeStyle = '#1d2a33'; g.lineWidth = 9; g.stroke(); g.strokeStyle = '#ffffff'; g.lineWidth = 5; g.stroke(); return new THREE.CanvasTexture(c); })();
    var gulls = [0].map(function (i) { var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: gullTex, transparent: true, depthWrite: false })); sp.scale.set(0.9, 0.45, 1); sp.visible = false; sp.renderOrder = 12; scene.add(sp);
      var sd = new THREE.Mesh(new THREE.CircleGeometry(0.2, 12), new THREE.MeshBasicMaterial({ color: 0x062018, transparent: true, opacity: 0.35, depthWrite: false })); sd.rotation.x = -Math.PI / 2; sd.visible = false; scene.add(sd);
      sd.visible = false; return { s: sp, sd: sd, t: -6, dur: 7 }; });
    function updateAtmo2(dt) {
      var W = F.atmo.W || WEATHERS.normal, wind = 0.25 + 0.35 * (W.rock || 1);
      cshadows.forEach(function (m) { m.position.x += wind * dt; if (m.position.x > 7) { m.position.x = -7; m.position.z = -6 + Math.random() * 12; } m.material.opacity = F.atmo.time === 'evening' ? 0.2 : 0.3; });
      gulls.forEach(function (g) {
        g.t += dt; if (g.t < 0) { g.s.visible = g.sd.visible = false; return; }
        if (!g.path) { // полоса над кораблём врага или под нашим: на высоте 3,4 точка видна там же, где земля на z - 3,4
          var top = Math.random() < 0.5, z0 = top ? -3.2 + Math.random() * 0.6 : 9.6 + Math.random() * 0.6, dirn = Math.random() < 0.5 ? 1 : -1; g.path = { a: new THREE.Vector3(-6 * dirn, 3.4, z0), b: new THREE.Vector3(6 * dirn, 3.4, z0 + (Math.random() - 0.5) * 0.6) }; g.s.material.rotation = 0; }
        var u = g.t / g.dur; if (u >= 1) { g.t = -(15 - g.dur) - Math.random() * 3; g.path = null; return; }   // раз в ~15 с
        g.s.visible = true; g.sd.visible = false; g.s.position.lerpVectors(g.path.a, g.path.b, u); g.s.position.y += Math.sin(u * 9) * 0.15;
        g.s.scale.set(0.9, 0.45 * (0.55 + 0.45 * Math.abs(Math.sin(g.t * 9))), 1);
      });
    }
    // 3D-облака на входе (реф: мягкие «зефирные» блоки без контура, белые сверху и голубоватые снизу). Два крыла облаков
    // закрывают кадр и расходятся к бокам, открывая центр; pc 0..1
    var enterCl = null;
    function puffGeo(r, len) {
      var g = new THREE.CapsuleGeometry(r, len, 6, 14); g.rotateZ(Math.PI / 2);
      var pos = g.attributes.position, nrm = g.attributes.normal, col = new Float32Array(pos.count * 3), top = new THREE.Color(0xffffff), bot = new THREE.Color(0xb7d2e8), c = new THREE.Color();
      for (var i = 0; i < pos.count; i++) { var k = Math.max(0, Math.min(1, 0.5 + 0.7 * nrm.getY(i) + 0.15 * nrm.getZ(i))); c.copy(bot).lerp(top, k); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g;
    }
    F.enterClouds = function (pc) {
      if (pc >= 1) { if (enterCl) enterCl.visible = false; return; }
      if (!enterCl) {
        enterCl = new THREE.Group(); scene.add(enterCl);
        var mat = new THREE.MeshBasicMaterial({ vertexColors: true });
        enterCl.userData.cl = [];
        for (var i = 0; i < 16; i++) {
          var side = i % 2 ? 1 : -1, g = new THREE.Group(), n = 2 + Math.floor(Math.random() * 3);
          for (var j = 0; j < n; j++) { var r = 0.55 + Math.random() * 0.45, m = new THREE.Mesh(puffGeo(r, 0.6 + Math.random() * 1.4), mat);
            m.position.set((Math.random() - 0.5) * 1.6, j * 0.5 * r, (Math.random() - 0.5) * 1.2); m.scale.set(1, 0.72, 1); g.add(m); }
          g.userData = { side: side, x0: 0.6 + Math.random() * 3.2, z0: -6 + (i >> 1) * 2.3 + (Math.random() - 0.5), y0: Math.random() * 0.8, sp: 0.8 + Math.random() * 0.5 };
          g.scale.setScalar(1.5 + Math.random() * 0.7); enterCl.add(g); enterCl.userData.cl.push(g);
        }
      }
      // слой облаков развёрнут к камере: экранные x и y, глубина мала, иначе края режет ближняя плоскость камеры
      enterCl.visible = true; enterCl.quaternion.copy(camera.quaternion); enterCl.position.copy(camera.position).normalize().multiplyScalar(12); enterCl.scale.setScalar(1 / Math.max(0.3, F.zoom ? F.zoom.k : 1));   // размер от кадра, а не от мира: на дальнем входе облака всё равно закрывают экран
      var e = pc < 0.15 ? 0 : Math.pow((pc - 0.15) / 0.85, 1.6);
      enterCl.userData.cl.forEach(function (g) { var d = g.userData; g.position.set(d.side * (d.x0 - 1.2 + 14 * e * d.sp), -d.z0 * 0.8, d.y0); });
    };

    // ---------- ульты 3-го ранга ----------
    // F.ultSlow(sec, k): короткое замедление мира на кат-ин; game.js умножает шаг симуляции на тот же F.ultSlowK
    F.ultSlowK = 1; F.ultSlowT = 0; F.ultSlowTo = 1;
    F.ultSlow = function (sec, k) { F.ultSlowT = sec; F.ultSlowTo = k; F.ultSlowK = k; };
    var ults = [], _up = new THREE.Vector3(0, 1, 0);
    // толстая линия: цилиндр между двумя точками (WebGL рисует обычные линии в 1 px)
    function beam(r, color, opts) { var m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 8, 1, true), new THREE.MeshBasicMaterial(Object.assign({ color: color, transparent: true, depthWrite: false }, opts || {}))); m.renderOrder = 9; scene.add(m); return m; }
    function setBeam(m, a, b) { var d = b.clone().sub(a), L = d.length(); m.position.copy(a).addScaledVector(d, 0.5); m.scale.set(1, Math.max(0.001, L), 1); m.quaternion.setFromUnitVectors(_up, d.normalize()); }
    var shadowMat = new THREE.MeshBasicMaterial({ color: 0x062018, transparent: true, opacity: 0.45, depthWrite: false });
    var giantMat = new THREE.MeshBasicMaterial({ color: 0x2b2b30 });
    var ringTex = (function () { var c = document.createElement('canvas'); c.width = c.height = 128; var g = c.getContext('2d');
      g.strokeStyle = '#fff'; g.lineWidth = 14; g.beginPath(); g.arc(64, 64, 52, 0, 6.29); g.stroke(); return new THREE.CanvasTexture(c); })();
    // «Ядро-великан»: ствол раскаляется, огромное ядро летит высокой дугой с огненным хвостом, тень растёт на воде, взрыв на полпалубы
    F.giantBall = function (side, board, slot, flight, onHit) {
      var sh = F.ships[side], cn = sh.cannon(board, slot); if (!cn) return;
      var tgSide = side === 'p' ? 'e' : 'p', tg = F.ships[tgSide], m = F.muzzleWorld(cn), dir = m.clone().sub(sh.root.position).setY(0).normalize();
      bumps.push({ cn: cn, t: 0 }); F.light(m, { color: 0xff5a1a, r: 2.2, life: 0.5, a: 1.2 }); F.glowShip(side, 1);
      F.fx.flash(m, dir); F.fx.smokeBank && F.fx.smokeBank(m, dir); F.sfx.broadside && F.sfx.broadside(); sh.kick((side === 'p' ? -1 : 1) * 2); F.shake(4);
      tg.root.updateMatrixWorld(true);
      var to = tg.deck.localToWorld(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.2, 0));
      var ball = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 12), giantMat); ball.position.copy(m); scene.add(ball);
      var halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex2, color: 0xff7a2a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })); halo.scale.setScalar(1.1); ball.add(halo);
      var sd = new THREE.Mesh(new THREE.CircleGeometry(0.3, 24), shadowMat); sd.rotation.x = -Math.PI / 2; sd.position.set(m.x, 0.03, m.z); sd.renderOrder = 1; scene.add(sd);
      ults.push({ kind: 'ball', t: 0, dur: flight, from: m.clone(), to: to, ball: ball, sd: sd, acc: 0, onHit: function () {
        scene.remove(ball); scene.remove(sd);
        for (var i = 0; i < 3; i++) F.fx.splinters(to.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.6)), dir);
        F.fx.smokeBank && F.fx.smokeBank(to, new THREE.Vector3(0, 1, 0)); F.blastAt && 0;
        F.light(to, { color: 0xff6a1a, r: 3.6, life: 0.6, a: 1.3 }); F.glowShip(tgSide, 1);
        F.shake(10); F.hitstop(120); tg.kick((side === 'p' ? 1 : -1) * 3); F.sfx.boom(); F.sfx.hit();
        F.decal(tgSide, to, 'hole_0'); F.decal(tgSide, to.clone().add(new THREE.Vector3(0.25, 0, 0.1)), 'scorch_0');
        if (onHit) onHit();
      } });
    };
    // «Сквозной выстрел»: алый луч прицела тянется через ряд врагов, потом толстый белый трассер прошивает всех
    F.pierce = function (side, cell, targets, onShot) {
      var u = F.units[side][cell]; if (!u) return; var tSide = side === 'p' ? 'e' : 'p';
      F.aimShooter(side, cell);
      var pts = targets.map(function (t) { return F.worldOf(tSide, t.cell, 0.45); }); if (!pts.length) return;
      var far = pts.reduce(function (a, b) { return a; }), from = function () { return u.S.bell ? u.S.bell.getWorldPosition(new THREE.Vector3()) : F.worldOf(side, cell, 0.5); };
      var last = pts[pts.length - 1].clone(), first = from(), beyond = last.clone().add(last.clone().sub(first).setY(0).normalize().multiplyScalar(1.2));
      var line = beam(0.035, 0xff2a3a, { depthTest: false, opacity: 0 }); setBeam(line, first, beyond);
      var glowL = beam(0.09, 0xff6a6a, { depthTest: false, opacity: 0, blending: THREE.AdditiveBlending }); setBeam(glowL, first, beyond); line.add && 0;
      line.userData.glow = glowL;
      ults.push({ kind: 'laser', t: 0, real: true, dur: 0.55, line: line, onEnd: function () {
        scene.remove(line); scene.remove(line.userData.glow); var m = from();
        F.fx.tracer(m, beyond, 0.12); F.fx.tracer(m, beyond, 0.16);
        F.light(m, { color: 0xffe0e0, r: 1.4, life: 0.2, a: 1 }); F.sfx.musket(); F.sfx.hit(); F.shake(4);
        pts.forEach(function (p, i) { F.after(0.04 + i * 0.03, function () { F.fx.spark(p, 10); F.fx.pop && F.fx.pop(p); }); });
        if (onShot) onShot();
      } });
    };
    // «Прыжок на канате»: боец взлетает высокой дугой к переднему ряду врага, канат тянется от мачты, на приземлении золотое кольцо
    F.ropeLeap = function (side, cell, targets, flight, onLand) {
      var u = F.units[side][cell]; if (!u) return; var tSide = side === 'p' ? 'e' : 'p', S = u.S;
      var D = u.away ? F.ships[u.away.side] : F.ships[side], own = F.ships[side];
      var pts = targets.map(function (t) { return F.worldOf(tSide, t.cell, 0.05); }); if (!pts.length) return;
      var c = new THREE.Vector3(); pts.forEach(function (p) { c.add(p); }); c.multiplyScalar(1 / pts.length);
      D.root.updateMatrixWorld(true); var l1 = D.deck.worldToLocal(c.clone());
      var anchor = own.root.position.clone().add(new THREE.Vector3(0, 2.3, 0));
      var rope = beam(0.04, 0x6b4423, { transparent: false }); setBeam(rope, anchor, anchor.clone().add(new THREE.Vector3(0, -0.1, 0)));
      u.badge.visible = false; if (u.hp) u.hp.bg.visible = u.hp.fill.visible = false;
      F.kits[side].act(S); F.sfx.hook && F.sfx.hook();
      ults.push({ kind: 'leap', t: 0, dur: flight, S: S, x0: S.x, z0: S.z, x1: l1.x, z1: l1.z, rope: rope, anchor: anchor, onHit: function () {
        scene.remove(rope); S.lift = 0;
        var ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: ringTex, color: 0xffd34a, transparent: true, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2; ring.position.copy(c).setY(0.12); ring.renderOrder = 8; scene.add(ring);
        ults.push({ kind: 'ring', t: 0, real: true, dur: 0.55, m: ring });
        F.fx.dust(c, 6); F.fx.sparkle(c, true); F.light(c, { color: 0xffd34a, r: 2.6, life: 0.5, a: 1 });
        F.shake(8); F.hitstop(90); F.sfx.land(); F.sfx.boom();
        targets.forEach(function (t) { var tu = F.units[tSide][t.cell]; if (tu) { F.kits[tSide].hit(tu.S); tu.S.stunT = 2; } });
        F.kits[side].act(S);
        if (onLand) onLand();
      } });
    };
    // течь: изредка всплеск у борта тонущего корабля
    F.leakFx = function (side) {
      var sh = F.ships[side]; sh.root.updateMatrixWorld(true);
      var p = sh.deck.localToWorld(new THREE.Vector3((Math.random() - 0.5) * 3, -0.3, (Math.random() < 0.5 ? -1 : 1) * 1.7)); p.y = 0.05;
      F.fx.splash(p); F.fx.foam && F.fx.foam(p, 0.3, 1.2);
    };
    function updateUlts(rdt, dt) {
      for (var i = ults.length - 1; i >= 0; i--) {
        var x = ults[i]; x.t += x.real ? rdt : dt; var u = Math.min(1, x.t / x.dur);
        if (x.kind === 'ball') {
          var p = x.ball.position; p.lerpVectors(x.from, x.to, u); p.y += Math.sin(Math.PI * u) * 2.6;
          x.ball.scale.setScalar(1 + 0.25 * Math.sin(Math.PI * u));
          x.sd.position.set(p.x, 0.03, p.z); x.sd.scale.setScalar(0.5 + 1.1 * u); x.sd.material.opacity = 0.2 + 0.4 * u;
          x.acc += dt; if (x.acc > 0.035) { x.acc = 0; F.fx.fire(p.clone()); if (Math.random() < 0.5) F.fx.smoke(p.clone(), new THREE.Vector3(0, 0.3, 0)); }
        }
        if (x.kind === 'laser') { var lo = Math.min(1, u * 1.6) * (0.75 + 0.25 * Math.sin(x.t * 40)); x.line.material.opacity = lo; x.line.userData.glow.material.opacity = lo * 0.5; }
        if (x.kind === 'leap') {
          var e = u * u * (3 - 2 * u); x.S.x = x.x0 + (x.x1 - x.x0) * e; x.S.z = x.z0 + (x.z1 - x.z0) * e; x.S.lift = Math.sin(Math.PI * u) * 2.2 + 0.001;
          var hp = x.S.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.7, 0)); setBeam(x.rope, x.anchor, hp);
        }
        if (x.kind === 'ring') { x.m.scale.setScalar(0.5 + 3.5 * u); x.m.material.opacity = 1 - u; }
        if (u >= 1) { ults.splice(i, 1); if (x.onHit) x.onHit(); if (x.onEnd) x.onEnd(); if (x.kind === 'ring') scene.remove(x.m); }
      }
    }

    // ---------- подсказки подготовки: клетки канонира у пушек и плашки бочек ----------
    // h = { cannon, hover, skip, occupied: [], kegMode: 'show'|'dim'|'hide', kegHot: [] }. Клетки крайних рядов подсвечиваются
    // салатовым и пульсируют, средние ярче (стоят между двумя пушками), занятые бледнее. Плашки «+10» прячутся, при перетаскивании
    // проявляются на 60%, у бочек, которые сломает мерж под пальцем, яркие и бочка дрожит.
    var hints = { p: { kegMode: 'show', kegHot: [] }, e: { kegMode: 'show', kegHot: [] } }, hintPlanes = { p: [], e: [] }, gunGlows = { p: [], e: [] }, bumps = [];
    var glowTex2 = (function () { var c = document.createElement('canvas'); c.width = c.height = 64; var g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(220,255,190,1)'); gr.addColorStop(0.45, 'rgba(150,240,100,.55)'); gr.addColorStop(1, 'rgba(120,230,80,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
    function cannonRow(cell) { var r = Math.floor(cell / 4); return r === 0 ? 0 : r === 2 ? 1 : -1; }
    F.cannonsForCell = function (side, cell) {
      var bd = cannonRow(cell), k = cell % 4, sh = F.ships[side], out = []; if (bd < 0) return out;
      [k - 1, k].forEach(function (j) { if (j >= 0 && j <= 2) { var cn = sh.cannon(bd, j); if (cn && cn.state !== 'broken') out.push(cn); } });
      return out;
    };
    F.setPrepHints = function (side, h) {
      var prev = hints[side], hov = h.hover != null ? h.hover : -1;
      if (h.cannon && hov >= 0 && hov !== prev.hover) F.cannonsForCell(side, hov).forEach(function (cn) { bumps.push({ cn: cn, t: 0 }); });
      hints[side] = { cannon: !!h.cannon, hover: hov, skip: h.skip != null ? h.skip : -1, occupied: h.occupied || [], kegMode: h.kegMode || 'show', kegHot: h.kegHot || [] };
      var sh = F.ships[side];
      if (!hintPlanes[side].length) for (var c = 0; c < 12; c++) {
        var cp = sh.cellPos(c), m = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 0.94), new THREE.MeshBasicMaterial({ color: 0xa6f06a, transparent: true, opacity: 0, depthWrite: false }));
        m.rotation.x = -Math.PI / 2; m.position.set(cp.x, 0.016, cp.z); m.renderOrder = 1; m.visible = false; sh.deck.add(m);
        var e = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x4fc72e, transparent: true, opacity: 0, depthWrite: false }));
        e.rotation.x = -Math.PI / 2; e.position.set(cp.x, 0.014, cp.z); e.renderOrder = 1; e.visible = false; sh.deck.add(e);
        hintPlanes[side].push({ m: m, e: e });
      }
      if (!gunGlows[side].length) sh.cannons.forEach(function (cn) {
        var g = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex2, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
        g.scale.setScalar(0.75); g.visible = false; g.renderOrder = 3; scene.add(g); gunGlows[side].push({ cn: cn, s: g });
      });
    };
    function updateHints(rdt) {
      var pulse = 0.88 + 0.12 * Math.sin(F.t * 5.2);
      ['p', 'e'].forEach(function (side) {
        var h = hints[side], sh = F.ships[side], hot = h.cannon && h.hover >= 0 ? F.cannonsForCell(side, h.hover) : [];
        hintPlanes[side].forEach(function (pl, c) {
          var on = h.cannon && cannonRow(c) >= 0 && !sh.kegs[c] && c !== h.skip;
          pl.m.visible = on; pl.e.visible = on && c === h.hover; if (!on) return;
          var a = c === h.hover ? 0.85 : h.occupied.indexOf(c) >= 0 ? 0.25 : (c % 4 === 1 || c % 4 === 2) ? 0.6 : 0.45;
          pl.m.material.opacity = a * (c === h.hover ? 1 : pulse); pl.m.scale.setScalar(c === h.hover ? 0.9 : 1); pl.e.material.opacity = 1;
        });
        gunGlows[side].forEach(function (gg) {
          gg.s.visible = !!h.cannon && gg.cn.state !== 'broken'; if (!gg.s.visible) return;
          gg.cn.muzzle.updateMatrixWorld(true); gg.cn.muzzle.getWorldPosition(gg.s.position);
          var isHot = hot.indexOf(gg.cn) >= 0; gg.s.material.opacity = (isHot ? 1 : 0.45) * pulse; gg.s.scale.setScalar(isHot ? 1.05 : 0.7);
        });
        Object.keys(F.kegBadges[side]).forEach(function (c) {
          var b = F.kegBadges[side][c], hotK = h.kegHot.indexOf(+c) >= 0, keg = sh.kegs[c], cs = compensate(side);
          b.visible = h.kegMode !== 'hide' || hotK;
          b.material.opacity = hotK || h.kegMode === 'show' ? 1 : 0.6;
          var k = hotK ? 1.3 + 0.06 * Math.sin(F.t * 14) : 1; b.scale.set(b.userData.w * cs * k, b.userData.h * cs * k, 1);
          b.position.y = hotK ? 0.45 : 0.06;
          if (keg) { keg.rotation.z = hotK ? 0.13 * Math.sin(F.t * 38) : 0; keg.rotation.x = hotK ? 0.08 * Math.sin(F.t * 31 + 1) : 0; }
        });
        // блик на спрятанной бочке раз в 3–4 с, чтобы было видно, что внутри ценное
        if (h.kegMode === 'hide' && side === 'p' && F.frameName === 'prep') {
          h.glintT = (h.glintT || 2) - rdt;
          if (h.glintT <= 0) { h.glintT = 3 + Math.random(); var ks = Object.keys(sh.kegs); if (ks.length) { var kc = +ks[Math.floor(Math.random() * ks.length)], kp = sh.cellPos(kc); F.fx.glint(sh.deck.localToWorld(new THREE.Vector3(kp.x + 0.08, 0.4, kp.z))); } }
        }
      });
      for (var i = bumps.length - 1; i >= 0; i--) { var bp = bumps[i]; bp.t += rdt; var u = Math.min(1, bp.t / 0.28); bp.cn.body.position.y = 0.07 * Math.sin(Math.PI * u); if (u >= 1) { bp.cn.body.position.y = 0; bumps.splice(i, 1); } }
    }

    // ---------- координаты и касания ----------
    var ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    F.worldOf = function (side, cell, y) {
      var u = F.units[side][cell], sh = F.ships[side], p;
      if (u && u.away) { sh = F.ships[u.away.side]; p = new THREE.Vector3(u.S.x, 0, u.S.z); } else p = sh.cellPos(cell);
      p.y = y || 0.2; sh.deck.updateMatrixWorld(true); return sh.deck.localToWorld(p);
    };
    F.toScreen = function (v) { var p = v.clone().project(camera); return { x: (p.x + 1) / 2 * vp.w, y: (1 - p.y) / 2 * vp.h }; };
    // касание: сначала по фигуркам на экране (голова матроса заходит на клетку позади), потом лучом в палубу
    var _up = new THREE.Vector3();
    function pickUnit(x, y) {
      var best = null, by = -1e9;
      ['p', 'e'].forEach(function (side) {
        var sc = F.cur ? F.cur[side].sc : 1;
        Object.keys(F.units[side]).forEach(function (c) {
          var u = F.units[side][c], feet = F.worldOf(side, +c, 0), head = feet.clone().add(_up.set(0, 0.95 * sc * u.S.root.scale.y, 0));
          var a = F.toScreen(feet), h = F.toScreen(head), rx = 0.36 * F.ppu * sc;
          if (Math.abs(x - a.x) < rx && y > h.y - 4 && y < a.y + 0.28 * F.ppu * sc * Math.cos(F.tilt) && a.y > by) { by = a.y; best = { side: side, cell: +c }; }
        });
      });
      return best;
    }
    F.pick = function (clientX, clientY) {
      var r = renderer.domElement.getBoundingClientRect();
      var pu = pickUnit(clientX - r.left, clientY - r.top); if (pu) return pu;
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      var hits = ray.intersectObjects([F.ships.p.pick, F.ships.e.pick], false);
      if (!hits.length) return null;
      var h = hits[0], side = h.object === F.ships.p.pick ? 'p' : 'e', sh = F.ships[side];
      var lp = sh.deck.worldToLocal(h.point.clone()); var cell = sh.cellAt(lp);
      return cell < 0 ? null : { side: side, cell: cell };
    };
    F.groundAt = function (clientX, clientY, side) {
      var r = renderer.domElement.getBoundingClientRect();
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      var plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), out = new THREE.Vector3();
      ray.ray.intersectPlane(plane, out); var sh = F.ships[side || 'p']; return sh.deck.worldToLocal(out);
    };

    // ---------- выстрелы и повреждения ----------
    var recoils = [];
    F.muzzleWorld = function (cn) { cn.muzzle.updateMatrixWorld(true); return cn.muzzle.getWorldPosition(new THREE.Vector3()); };
    // выстрел пушки side по кораблю цели: вспышка, дым, ядро по дуге, на попадании щепки, тряска, толчок, декаль
    F.fire = function (side, board, slot, o) {
      o = o || {};
      var sh = F.ships[side], cn = sh.cannon(board, slot); if (!cn || cn.state === 'broken') return;
      var tgtSide = side === 'p' ? 'e' : 'p', tg = F.ships[tgtSide];
      var m = F.muzzleWorld(cn), outDir = m.clone().sub(sh.root.position).setY(0).normalize();
      F.fx.flash(m, outDir); F.sfx.boom(); recoils.push({ cn: cn, t: 0 });
      F.light(m.clone().addScaledVector(outDir, 0.35), { color: 0xffb35a, r: 1.7, life: 0.3, a: 0.95 }); F.glowShip(side, 0.55);
      if (o.volley) volleyShot(side, sh, m, outDir, o.volley);
      // канониры у этой пушки: откидываются на выстреле, через 0,3 с заряжают (два тычка банником), быстрее с рангом
      var row = board === 0 ? 0 : 2;
      [slot, slot + 1].forEach(function (k) { var gu = F.units[side][row * 4 + k]; if (!gu || gu.type !== 'gunner' || gu.away) return;
        var kit = F.kits[side]; kit.flinch(gu.S); F.after(0.3, function () { if (F.units[side][row * 4 + k] === gu) kit.ram(gu.S, 1 + 0.3 * (gu.rank - 1)); }); });
      var miss = !!o.miss, hitPos;
      tg.root.updateMatrixWorld(true);
      if (o.targetCell != null) hitPos = F.worldOf(tgtSide, o.targetCell, 0.15);
      else {
        var lx = (Math.random() - 0.5) * tg.cols, lz = (tgtSide === 'e' ? 1 : -1) * 0;
        hitPos = tg.deck.localToWorld(new THREE.Vector3(lx, 0.1, (Math.random() - 0.5) * 1.2 + lz));
      }
      if (miss) hitPos.add(new THREE.Vector3((Math.random() - 0.5) * 1.5, -0.45, (side === 'p' ? 1 : -1) * 0.9));
      F.fx.ball(m, hitPos, 0.42 / F.timeScale, function () {
        if (miss) {
          // промах: гейзер; иногда рикошет по воде, ядро прыгает дальше и падает вторым гейзером
          if (Math.random() < 0.35) { F.fx.splash(hitPos); F.sfx.splash(); var far = hitPos.clone().add(outDir.clone().multiplyScalar(1.1)); far.y = hitPos.y;
            F.fx.ball(hitPos.clone().setY(0.05), far, 0.28 / F.timeScale, function () { F.fx.geyser(far); F.sfx.splash(); }); }
          else { F.fx.geyser(hitPos); F.sfx.splash(); }
          return;
        }
        F.fx.splinters(hitPos, outDir); F.sfx.hit(); F.shake(o.shake || 2.5); tg.kick((side === 'p' ? 1 : -1) * 0.8);
        F.light(hitPos, { color: 0xff8a3a, r: 1.1, life: 0.22, a: 0.6 }); F.glowShip(tgtSide, 0.3);
        if (o.decal !== false && Math.random() < 0.6) F.decal(tgtSide, hitPos);
        if (o.onHit) o.onHit();
      });
    };
    // ---------- залп бортом: выстрелы открытия захода идут одной волной ----------
    // v = { i, n, last }: каждый выстрел волны кладёт завесу дыма и толчок воды, корабль кренится от отдачи; последний даёт раскат и тряску
    function volleyShot(side, sh, m, outDir, v) {
      var away = side === 'p' ? -1 : 1, water = m.clone(); water.y = 0.02;
      F.fx.smokeBank(m, outDir); F.fx.blastRing(water.addScaledVector(outDir, 0.2), outDir);
      sh.kick(away * (0.55 + 0.25 * v.i));
      F.light(m.clone().addScaledVector(outDir, 0.6), { color: 0xffa040, r: 2.6, life: 0.4, a: 0.8 });
      F.shake(1.5 + v.i);
      if (v.last) { F.sfx.broadside(); F.shake(5); sh.kick(away * 1.2); F.glowShip(side, 0.9);
        var tgS = F.ships[side === 'p' ? 'e' : 'p'], nd = tgS.root.position.clone().sub(sh.root.position).setY(0).normalize(); F.nudge(nd.x * 0.35, nd.z * 0.35); }
    }
    // салют: холостые выстрелы всем живым бортом, без ядер
    F.salute = function (side) {
      var sh = F.ships[side]; if (!sh || sh.rock.position.y < -0.3) return;
      var foe = F.ships[side === 'p' ? 'e' : 'p'], k = 0;
      sh.cannons.forEach(function (cn) {
        if (cn.state === 'broken') return; var d = k++ * 0.16;
        F.after(d, function () {
          var m = F.muzzleWorld(cn), dir = m.clone().sub(sh.root.position).setY(0).normalize();
          F.fx.flash(m, dir); F.fx.smoke(m, dir); recoils.push({ cn: cn, t: 0 }); F.sfx.salute();
          F.light(m.clone().addScaledVector(dir, 0.35), { color: 0xffc070, r: 1.4, life: 0.25, a: 0.7 });
        });
      });
    };
    // празднование победителей: бойцы прыгают вразнобой, на приземлении машут оружием, над ними цветные искры
    var cel = null;
    F.celebrate = function (side, dur) {
      if (cel) Object.keys(F.units[cel.side]).forEach(function (c) { F.units[cel.side][c].S.lift = 0; });
      cel = side ? { side: side, t: 0, dur: dur || 2.4, last: {} } : null;
    };
    function updateCelebrate(dt) {
      if (!cel) return; cel.t += dt;
      var us = F.units[cel.side], cs = Object.keys(us), done = cel.t >= cel.dur;
      cs.forEach(function (c, i) {
        var u = us[c], S = u.S, ph = (i * 0.37) % 1, period = 0.52, tt = cel.t - i * 0.07;
        if (done || tt < 0) { S.lift = done ? 0 : S.lift; return; }
        var x = (tt / period + ph) % 1, n = Math.floor(tt / period + ph);
        S.lift = 0.5 * 4 * x * (1 - x) + 0.001;
        if (cel.last[c] !== n) { cel.last[c] = n;
          if (n % 2 === 1) F.kits[cel.side].act(S);
          if (n % 2 === 0) F.fx.cheer(S.root.getWorldPosition(new THREE.Vector3()));
        }
      });
      if (done) cel = null;
    }
    var decalTex = {}, decals = [];
    F.decal = function (side, worldPos, kind) {
      var names = ['crack_0', 'crack_1', 'hole_0', 'hole_1', 'scorch_0', 'scorch_1'];
      var nm = kind || names[Math.floor(Math.random() * names.length)];
      if (!decalTex[nm]) decalTex[nm] = new THREE.TextureLoader().load((opt.base || '') + 'art/sprites/' + nm + '.png');
      var sh = F.ships[side], lp = sh.deck.worldToLocal(worldPos.clone());
      var d = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), new THREE.MeshBasicMaterial({ map: decalTex[nm], transparent: true, depthWrite: false }));
      d.rotation.x = -Math.PI / 2; d.rotation.z = Math.random() * 6.28; d.position.set(lp.x, 0.012 + decals.length * 0.0005, lp.z); d.renderOrder = 2;
      sh.deck.add(d); decals.push({ side: side, m: d });
      if (decals.length > 24) { var old = decals.shift(); F.ships[old.side].deck.remove(old.m); }
    };
    F.clearDecals = function () { decals.forEach(function (x) { F.ships[x.side].deck.remove(x.m); }); decals = []; };
    F.cannonState = function (side, board, slot, state) {
      var sh = F.ships[side], cn = sh.cannon(board, slot); sh.setCannon(cn, state); cn.smokeT = 0;
    };

    // ---------- абордаж: нападающие прыгают на палубу защитника ----------
    var jumps = [];
    F.boardMode = null;
    F.boardJump = function (att, def) {
      F.boardMode = { att: att, def: def };
      var A = F.ships[att], D = F.ships[def], taken = {}, spots = [];
      Object.keys(F.units[def]).forEach(function (c) { taken[c] = 1; }); Object.keys(D.kegs).forEach(function (c) { taken[c] = 1; });
      // свободные клетки, ближний к нападающему ряд первым; потом места вдоль борта между пушками
      for (var row = 0; row < D.rows; row++) for (var k = 0; k < D.cols; k++) { var c = row * D.cols + k; if (!taken[c]) { var cp = D.cellPos(c); spots.push({ x: cp.x, z: cp.z }); } }
      [-1, 1].forEach(function (sg) { [-1.5, -0.5, 0.5, 1.5].forEach(function (x) { spots.push({ x: x, z: sg * (D.rows / 2 + 0.17) }); }); });
      var list = Object.keys(F.units[att]).map(Number).sort(function (a, b) { return a - b; });
      A.root.updateMatrixWorld(true); D.root.updateMatrixWorld(true);
      list.forEach(function (c, i) {
        var u = F.units[att][c], S = u.S, sp = spots[i % spots.length];
        var w0 = S.root.getWorldPosition(new THREE.Vector3()), l0 = D.deck.worldToLocal(w0.clone());
        D.deck.attach(S.root); S.x = l0.x; S.z = l0.z;
        var dy = A.root.rotation.y - D.root.rotation.y; S.yaw += dy; S.yawT += dy;
        u.badge.visible = false; if (u.hp) u.hp.bg.visible = u.hp.fill.visible = false;
        u.away = { side: def };
        jumps.push({ u: u, D: D, t: -i * 0.08 - 0.05, dur: 0.55, x0: l0.x, z0: l0.z, x1: sp.x, z1: sp.z });
      });
      return 0.55 + list.length * 0.08 + 0.1;
    };
    function updateJumps(dt) {
      for (var i = jumps.length - 1; i >= 0; i--) {
        var j = jumps[i], S = j.u.S; j.t += dt; if (j.t < 0) continue;
        var u = Math.min(1, j.t / j.dur), e = u * u * (3 - 2 * u);
        S.x = j.x0 + (j.x1 - j.x0) * e; S.z = j.z0 + (j.z1 - j.z0) * e; S.lift = Math.sin(Math.PI * u) * 1.1 + 0.001;
        if (u >= 1) {
          S.lift = 0; jumps.splice(i, 1);
          var D = j.D, b = j.u.badge; D.deck.attach(b); b.position.set(j.x1 + 0.33, 0.06, j.z1 + 0.33); b.visible = true;
          if (j.u.hp) { D.deck.attach(j.u.hp.bg); D.deck.attach(j.u.hp.fill); j.u.hp.bg.position.set(j.x1, 1.0, j.z1); j.u.hp.fill.position.set(j.x1, 1.0, j.z1); j.u.hp.bg.visible = j.u.hp.fill.visible = true; }
          D.deck.updateMatrixWorld(true); var w = D.deck.localToWorld(new THREE.Vector3(j.x1, 0.05, j.z1));
          F.fx.dust(w, 3); F.shake(1.5); F.sfx.land();
        }
      }
    }

    // ---------- эффекты карт на бойцах: всё прикреплено к фигурке и ходит вместе с ней ----------
    var smokeTex = null;
    function unitAt(side, cell) { return F.units[side][cell]; }
    F.setCurse = function (side, cell, stacks) {
      var u = unitAt(side, cell); if (!u) return;
      u.wisps = u.wisps || [];
      if (!smokeTex) smokeTex = new THREE.TextureLoader().load((opt.base || '') + 'art/sprites/smoke_1.png');
      var want = Math.max(0, stacks) * 3;
      while (u.wisps.length < want) { var m = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0x38f06a, transparent: true, depthWrite: false, opacity: 0.9 })); m.renderOrder = 6; u.S.root.add(m); u.wisps.push({ m: m, ph: Math.random() * 6.28, h: 0.15 + Math.random() * 0.55 }); }
      while (u.wisps.length > want) { var w = u.wisps.pop(); u.S.root.remove(w.m); w.m.material.dispose(); }
      var wp = F.worldOf(side, cell, 0.1); F.fx.curse(wp, stacks === 1 && want > 0);
    };
    F.setBubble = function (side, cell, n) {
      var u = unitAt(side, cell); if (!u) return;
      if (n > 0 && !u.bubble) { u.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: F.fx.tex.bubble, transparent: true, depthWrite: false })); u.bubble.renderOrder = 7; u.bubble.position.set(0, 0.45, 0); u.S.root.add(u.bubble); u.bubbleT = 0; }
      if (n <= 0 && u.bubble) { u.S.root.remove(u.bubble); u.bubble = null; }
      if (u.bubble) u.bubble.userData.n = n;
    };
    F.popBubble = function (side, cell, left) {
      var u = unitAt(side, cell); if (!u) return;
      F.fx.pop(F.worldOf(side, cell, 0.5)); F.kits[side].hit(u.S);
      if (left <= 0) F.setBubble(side, cell, 0); else if (u.bubble) u.bubbleT = -0.25;   // дрогнул, но держится
    };
    F.setRage = function (side, cell, sec) { var u = unitAt(side, cell); if (u) { u.rageUntil = F.t + sec; u.rageAcc = 0; } };
    F.bolt = function (aSide, aCell, bSide, bCell) { var bw = F.worldOf(bSide, bCell, 0.5); F.fx.bolt(F.worldOf(aSide, aCell, 0.5), bw); var u = unitAt(bSide, bCell); if (u) F.kits[bSide].hit(u.S);
      F.light(bw, { color: 0x9fdcff, r: 1.3, life: 0.2, a: 0.8 }); };
    F.deathPos = { p: {}, e: {} };
    F.blastAt = function (side, cell) { var w = F.deathPos[side][cell] || F.worldOf(side, cell, 0.1); F.fx.boom(w); F.shake(6); F.hitstop(70);
      F.light(w, { color: 0xff8a2a, r: 3.2, life: 0.55, a: 1.1 }); F.glowShip(F.units[side][cell] && F.units[side][cell].away ? F.units[side][cell].away.side : (F.boardMode ? F.boardMode.def : side), 0.85); };
    F.healAt = function (side, cell) { var u = unitAt(side, cell); if (u) F.fx.heal(F.worldOf(side, cell, 0.05)); };
    var _wv = new THREE.Vector3();
    function updateStatus(dt) {
      ['p', 'e'].forEach(function (side) { Object.keys(F.units[side]).forEach(function (c) {
        var u = F.units[side][c];
        if (u.wisps) u.wisps.forEach(function (w, i) {
          var a = F.t * 2.4 + w.ph + i * 6.28 / u.wisps.length, r = 0.36;
          w.m.position.set(Math.cos(a) * r, w.h + 0.08 * Math.sin(F.t * 3 + w.ph), Math.sin(a) * r);
          var k = 0.3 + 0.07 * Math.sin(F.t * 5 + w.ph); w.m.scale.set(k, k, 1); w.m.material.rotation = a;
        });
        if (u.bubble) { u.bubbleT += dt; var b = 1.05 + 0.04 * Math.sin(F.t * 4) + (u.bubbleT < 0 ? 0.25 * Math.sin(-u.bubbleT * 40) : 0); u.bubble.scale.set(b, b * 1.04, 1); u.bubble.material.opacity = 0.85 + 0.15 * Math.sin(F.t * 3); }
        if (u.rageUntil > F.t) { u.rageAcc += dt; while (u.rageAcc > 0.07) { u.rageAcc -= 0.07; u.S.root.getWorldPosition(_wv); F.fx.flame(_wv); } }
      }); });
    }

    // ---------- монеты убитых: лежат на палубе до конца раунда ----------
    var coinTex = null;
    F.piles = [];
    F.dropCoins = function (side, cell, n, value) {
      if (!coinTex) coinTex = new THREE.TextureLoader().load((opt.base || '') + 'art/sprites/ic_doubloon.png');
      var u0 = F.units[side][cell], dk = u0 && u0.away ? u0.away.side : side, sh = F.ships[dk];
      var p = u0 && u0.away ? new THREE.Vector3(u0.S.x, 0, u0.S.z) : sh.cellPos(cell), pile = { side: dk, value: value || n, coins: [] };
      for (var i = 0; i < Math.min(Math.max(n, 2), 7); i++) {
        var m = new THREE.Sprite(new THREE.SpriteMaterial({ map: coinTex, transparent: true, depthWrite: false }));
        var a = Math.random() * 6.28, r = 0.08 + Math.random() * 0.22;
        m.position.set(p.x, 0.35, p.z); m.scale.setScalar(0.27); m.renderOrder = 5; sh.deck.add(m);
        pile.coins.push({ m: m, vx: Math.cos(a) * r * 3, vz: Math.sin(a) * r * 3, vy: 2 + Math.random() * 1.2, rest: false, glint: 0.4 + Math.random() * 2, bounce: 0 });
      }
      sh.deck.updateMatrixWorld(true); F.fx.sparkle(sh.deck.localToWorld(p.clone().setY(0.2)), false);
      F.piles.push(pile); return pile;
    };
    // экранные точки монет кучи, сами монеты убираются
    F.takePile = function (pile) {
      var pts = pile.coins.map(function (c) { var w = c.m.getWorldPosition(new THREE.Vector3()); F.ships[pile.side].deck.remove(c.m); c.m.material.dispose(); return F.toScreen(w); });
      F.piles.splice(F.piles.indexOf(pile), 1); return pts;
    };
    F.clearPiles = function () { F.piles.slice().forEach(F.takePile); };
    function updatePiles(dt) {
      F.piles.forEach(function (pile) { pile.coins.forEach(function (c) {
        var m = c.m;
        if (!c.rest) {
          c.vy -= 9 * dt; m.position.x += c.vx * dt; m.position.z += c.vz * dt; m.position.y += c.vy * dt;
          if (m.position.y < 0.09) { m.position.y = 0.09; if (c.bounce < 2 && Math.abs(c.vy) > 0.8) { c.vy = -c.vy * 0.4; c.vx *= 0.5; c.vz *= 0.5; c.bounce++; F.sfx.coin && c.bounce === 1 && Math.random() < 0.3 && F.sfx.coin(); } else c.rest = true; }
        }
        // блеск: монета коротко вспыхивает и подпрыгивает
        c.glint -= dt; var k = 1;
        if (c.glint < 0) { var g = -c.glint / 0.25; k = 1 + 0.35 * Math.sin(Math.PI * Math.min(1, g)); if (g >= 1) c.glint = 1.2 + Math.random() * 2; if (g < 0.05 && c.rest) F.fx.sparkle && F.fx.glint && F.fx.glint(m.getWorldPosition(new THREE.Vector3())); }
        m.scale.setScalar(0.27 * k);
      }); });
    }

    // ---------- отклик ----------
    F.shakeT = 0; F.shakeA = 0; F.stopT = 0; F.juice = 1;
    F.shake = function (px) { F.shakeA = Math.max(F.shakeA, px * F.juice); F.shakeT = 0.25 * F.juice; };
    F.hitstop = function (ms) { F.stopT = Math.max(F.stopT, ms / 1000 * F.juice); };
    F.setJuice = function (j) { F.juice = j; F.fx.juice = j; };
    // Добивание: последнее убийство матча и потопление. После хит-стопа время идёт на 0,25x около 0,6 с реального
    // времени, к концу плавно возвращается к 1x; камера за это время наезжает на 8% к месту события и отъезжает обратно.
    // Длительность и наезд умножаются на сочность. Симуляцию не трогает: проигрывание умножает свой шаг на F.slowK.
    // ---------- стадии повреждения корпуса: ниже 50% дым с палубы, ниже 25% огонь, крен и осадка ----------
    // pct приходит из события impact; 1 снимает всё (новый матч). Тумблер в игре выключает через F.hullStagesOn.
    F.hullStagesOn = true;
    F.setHullDamage = function (side, pct) {
      var sh = F.ships[side]; if (!sh) return;
      sh.dmgPct = pct; var crit = F.hullStagesOn && pct < 0.25;
      sh.setList(crit ? (side === 'p' ? 1 : -1) * (0.6 + 0.4 * (0.25 - pct) / 0.25) : 0);
      if (!sh.dmgSpots) sh.dmgSpots = [[-1.2, -0.6], [0.8, 0.5], [-0.2, 0.9], [1.6, -0.7]];
    };
    var _dp = new THREE.Vector3();
    function updateDamage(dt) {
      if (!F.hullStagesOn || dt <= 0) return;
      ['p', 'e'].forEach(function (side) {
        var sh = F.ships[side], pct = sh.dmgPct == null ? 1 : sh.dmgPct; if (pct >= 0.5 || sh.rock.position.y < -0.5) return;
        var crit = pct < 0.25, n = crit ? 4 : 2;
        sh.smokeAcc = (sh.smokeAcc || 0) + dt; sh.fireAcc = (sh.fireAcc || 0) + dt;
        if (sh.smokeAcc > (crit ? 0.18 : 0.32)) { sh.smokeAcc = 0;
          var s = sh.dmgSpots[Math.floor(Math.random() * n)]; _dp.set(s[0], 0.25, s[1]); sh.deck.localToWorld(_dp);
          var sm = F.fx.smoke(_dp.clone(), new THREE.Vector3(0.15, 0.9, 0)); }
        if (crit && sh.fireAcc > 0.06) { sh.fireAcc = 0;
          var f = sh.dmgSpots[Math.floor(Math.random() * 3)]; _dp.set(f[0] + (Math.random() - 0.5) * 0.3, 0.1, f[1] + (Math.random() - 0.5) * 0.3); sh.deck.localToWorld(_dp);
          F.fx.fire(_dp.clone()); if (Math.random() < 0.12) F.light(_dp.clone(), { color: 0xff7a2a, r: 0.9, life: 0.25, a: 0.5 }); }
      });
    }

    F.slowK = 1;
    var fin = null;
    // F.finisherPlus (по умолчанию): наезд 50% на последнее убийство с подтягиванием к центру, на потопление 30% и затемнение краёв,
    // замедление 0,1x около 1,2 с при сочности 150%, плавный выход. false возвращает прежние 0,25x и 8%.
    F.finisherPlus = true; F.angryOn = true;
    var vigEl = document.createElement('div');
    vigEl.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(ellipse at 50% 45%,rgba(0,0,0,0) 38%,rgba(5,10,20,.62) 100%)';
    container.appendChild(vigEl);
    F.finisher = function (pos, o) {
      o = o || {};
      if (!pos || F.juice <= 0) { fin = null; F.slowK = 1; F.punch = null; vigEl.style.opacity = 0; return; }
      if (F.finisherPlus) { var jk = F.juice / 1.5;
        fin = { t: 0, dur: 1.2 * jk, zoom: (o.sink ? 0.3 : 0.5) * jk, slow: 0.1, pos: pos.clone(), back: 0.6, q: o.sink ? 0.35 : 0.6, vig: !!o.sink }; }
      else fin = { t: 0, dur: (o.sec || 0.6) * F.juice, zoom: (o.zoom || 0.08) * F.juice, slow: o.slow || 0.25, pos: pos.clone(), back: 0.45, q: 0.2 };
    };
    F.finishing = function () { return !!fin; };
    function updateFinisher(rdt) {
      if (!fin) return;
      fin.t += rdt;
      var t = fin.t, D = fin.dur, hold = D * 0.7, zin = Math.min(0.28, D * 0.45), sm = function (u) { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
      F.slowK = t < hold ? fin.slow : fin.slow + (1 - fin.slow) * sm((t - hold) / (D - hold));
      var a = t < zin ? 1 - Math.pow(1 - t / zin, 3) : t < D ? 1 : 1 - sm((t - D) / fin.back);
      F.punch = { k: 1 + fin.zoom * a, pos: fin.pos, q: fin.q * a };
      if (fin.vig) vigEl.style.opacity = t < 0.15 ? t / 0.15 : t < 0.5 ? 1 : Math.max(0, 1 - (t - 0.5) / 0.35);
      if (t >= D + fin.back) { fin = null; F.slowK = 1; F.punch = null; vigEl.style.opacity = 0; }
    }

    // ---------- кадр ----------
    var _fw = new THREE.Vector3(), _v = new THREE.Vector3(), _e = new THREE.Vector3();
    // След: корабли на экране почти стоят (заход 2,8 клетки за 9 с), поэтому вода условно течёт мимо корпуса со скоростью хода
    // под парусом и уносит точки следа назад. В бою ход полный, в подготовке дрейф, в абордаже корабли сцеплены.
    function updateWake(sh, dt, vx, vz) {
      var W = sh.wake, sc = sh.root.scale.x, sail = (F.frameName === 'battle' ? 0.95 : F.frameName === 'board' ? 0.12 : 0.3);
      if (sh.rock.position.y < -0.3) sail = 0;
      W.acc += dt;
      _fw.set(1, 0, 0).applyQuaternion(sh.root.quaternion); _fw.y = 0; _fw.normalize();
      var ex = vx + _fw.x * sail, ez = vz + _fw.z * sail, sp = Math.hypot(ex, ez);
      var dirx = sp > 1e-4 ? ex / sp : _fw.x, dirz = sp > 1e-4 ? ez / sp : _fw.z;
      var forward = dirx * _fw.x + dirz * _fw.z >= 0;
      _e.set(forward ? sh.xs * 0.95 : sh.xt * 0.92, 0, 0); sh.root.localToWorld(_e);
      W.path = (W.path || 0) + sp * dt;
      var k = Math.min(1, 0.3 + sp / 0.9) * sc, on = sp > 0.06;
      // вода уносит старые точки назад
      if (sail > 0) W.pts.forEach(function (q) { q.x -= _fw.x * sail * dt; q.z -= _fw.z * sail * dt; });
      if (on && W.acc > 0.06) { W.acc = 0; W.pts.unshift({ x: _e.x, z: _e.z, dx: dirx, dz: dirz, t: F.t, k: k, p: W.path }); if (W.pts.length > WAKE_N - 2) W.pts.pop(); }
      while (W.pts.length && F.t - W.pts[W.pts.length - 1].t > WAKE_LIFE) W.pts.pop();
      var list = on ? [{ x: _e.x, z: _e.z, dx: dirx, dz: dirz, t: F.t, k: k, p: W.path }].concat(W.pts) : W.pts;
      var g = W.mesh.geometry, P = g.attributes.position.array, U = g.attributes.uv.array, A = g.attributes.aK.array, TT = g.attributes.aT.array, y = GEO.water;
      var n = Math.min(list.length, WAKE_N);
      for (var j = 0; j < WAKE_N; j++) {
        var q = list[Math.min(j, n - 1)] || { x: 0, z: 0, dx: 1, dz: 0, t: F.t - WAKE_LIFE, k: 0, p: 0 }, age = F.t - q.t, u = Math.min(1, age / WAKE_LIFE);
        var hw = (0.6 + 0.22 * age) * sc, nx = -q.dz, nz = q.dx, i6 = j * 6, i4 = j * 4;
        P[i6] = q.x + nx * hw; P[i6 + 1] = y; P[i6 + 2] = q.z + nz * hw; P[i6 + 3] = q.x - nx * hw; P[i6 + 4] = y; P[i6 + 5] = q.z - nz * hw;
        U[i4] = u; U[i4 + 1] = -1; U[i4 + 2] = u; U[i4 + 3] = 1;
        A[j * 2] = A[j * 2 + 1] = j < n ? q.k : 0;
        TT[j * 2] = TT[j * 2 + 1] = q.p || 0;
      }
      g.attributes.position.needsUpdate = g.attributes.uv.needsUpdate = g.attributes.aK.needsUpdate = g.attributes.aT.needsUpdate = true;
      g.setDrawRange(0, Math.max(0, n - 1) * 6);
    }
    // матросы всегда смотрят на корабль противника, при развороте корабля поворачиваются вместе с ним
    var _tw = new THREE.Vector3(), _uw = new THREE.Vector3();
    function faceEnemies(side) {
      var sh = F.ships[side], other = F.ships[side === 'p' ? 'e' : 'p'], foe = side === 'p' ? 'e' : 'p', bm = F.boardMode, cen = null;
      if (bm) {   // в абордаже смотрим на центр команды противника
        var n = 0; cen = new THREE.Vector3();
        Object.keys(F.units[foe]).forEach(function (c) { var fu = F.units[foe][c]; if (side === bm.def && !fu.away) return; cen.add(fu.S.root.getWorldPosition(_uw)); n++; });
        if (n) cen.multiplyScalar(1 / n); else cen = null;
      }
      Object.keys(F.units[side]).forEach(function (c) {
        var u = F.units[side][c], S = u.S; if (S.lift) return;
        var par = u.away ? F.ships[u.away.side] : sh, yaw = par.root.rotation.y;
        if (u.aim && u.aim.until > F.t) _tw.copy(u.aim.pos); else if (cen) _tw.copy(cen); else _tw.copy(other.root.position);
        _uw.set(S.x, 0, S.z); par.deck.localToWorld(_uw);
        var dx = _tw.x - _uw.x, dz = _tw.z - _uw.z, cs = Math.cos(yaw), sn = Math.sin(yaw);
        var lx = cs * dx - sn * dz, lz = sn * dx + cs * dz;
        F.kits[side].face(S, Math.atan2(lx, lz));
      });
    }
    // отложенные действия по игровому времени: x2 и стоп-кадр их тоже ускоряют и замораживают
    var pend = [];
    F.after = function (sec, fn) { pend.push({ t: F.t + sec, fn: fn }); };
    // выстрел стрелка: развернуться к цели, вскинуть мушкет, вспышка, трассер, искры на цели
    var _m = new THREE.Vector3();
    // стрелок вскидывает мушкетон заранее: игра зовёт за 0,3 с до события атаки
    F.aimShooter = function (side, cell) { var u = F.units[side][cell]; if (u && u.type === 'shooter') F.kits[side].aim(u.S); };
    F.musket = function (side, cell, tSide, tCell, o) {
      o = o || {};
      var u = F.units[side][cell]; if (!u) return;
      var tp = F.worldOf(tSide, tCell, 0.45);
      F.aimUnit(side, cell, tp, 0.9);
      F.kits[side].act(u.S); u.S.act = 0.09;   // выстрел в анимации на 0,25 с: сдвигаем, чтобы трассер долетел к попаданию из симуляции (0,25 с)
      F.after(0.15, function () {
        if (!F.units[side][cell]) return;
        var m = u.S.bell ? u.S.bell.getWorldPosition(_m).clone() : F.worldOf(side, cell, 0.5);
        var tp2 = F.worldOf(tSide, tCell, 0.45), miss = !!o.miss;
        if (miss) tp2.add(new THREE.Vector3((Math.random() - 0.5) * 0.8, -0.2, (Math.random() - 0.5) * 0.4));
        F.fx.tracer(m, tp2, 0.1);
        F.sfx.musket(); F.light(m, { color: 0xffc070, r: 0.7, life: 0.14, a: 0.6 });
        F.after(0.1, function () { F.fx.spark(tp2, miss ? 3 : 8); F.fx.dust(tp2, miss ? 1 : 2); });
      });
    };
    F.aimUnit = function (side, cell, worldPos, sec) { var u = F.units[side][cell]; if (u) u.aim = { pos: worldPos.clone(), until: F.t + (sec || 0.8) }; };

    // свежий ветер: брызги у носа и редкие удары волн в борт
    var _bw = new THREE.Vector3();
    function spray(sh, dt, W) {
      sh.sprayT = (sh.sprayT || 0) - dt; sh.slapT = (sh.slapT == null ? Math.random() * 2 : sh.slapT) - dt;
      if (sh.sprayT <= 0 && sh.root.visible && sh.rock.position.y > -0.3) {
        sh.sprayT = 0.28 + Math.random() * 0.45;
        _bw.set(sh.xs * 0.95, 0, (Math.random() - 0.5) * 1.2); sh.root.localToWorld(_bw); _bw.y = GEO.water + 0.05;
        F.fx.foam(_bw, 0.22 + Math.random() * 0.15, 0.9);
        if (Math.random() < 0.35) F.fx.spray(_bw);
      }
      if (sh.slapT <= 0) { sh.slapT = 1.6 + Math.random() * 2.2; sh.kick((Math.random() < 0.5 ? -1 : 1) * 0.5 * W.rock); }
    }
    F.update = function (rdt) {
      var dt = rdt;
      if (F.stopT > 0) { F.stopT -= rdt; dt = 0; } else updateFinisher(rdt);   // добивание начинается после хит-стопа
      if (F.ultSlowT > 0) { F.ultSlowT -= rdt; F.ultSlowK = F.ultSlowT > 0 ? F.ultSlowTo : 1; }
      dt *= F.timeScale * F.slowK * F.ultSlowK; F.t += dt;
      if (tr < 1) { tr = Math.min(1, tr + rdt / trDur); cur = lerpP(from, to, tr); } else cur = to;
      if (F.shakeT > 0) { F.shakeT -= rdt; F.shakeA *= 0.85; } else F.shakeA = 0;
      apply(cur);
      waterMat.uniforms.uT.value += dt;
      var W = F.atmo.W || WEATHERS.normal; twAcc += dt * W.sp; waterMat.uniforms.uTw.value = twAcc;
      for (var pi = pend.length - 1; pi >= 0; pi--) if (pend[pi].t <= F.t) { var pf = pend[pi].fn; pend.splice(pi, 1); pf(); }
      ['p', 'e'].forEach(function (side, i) {
        var sh = F.ships[side];
        // качка по погоде: плавно к цели, в подготовке ветер не раскачивает сильнее обычного
        var rt = F.rockBase * (F.frameName === 'prep' ? W.prepRock : W.rock);
        curRock[side] += (rt - curRock[side]) * Math.min(1, rdt * 1.5); sh.setRock(curRock[side]);
        if (W.spray && F.frameName !== 'prep' && dt > 0) spray(sh, dt, W);
        sh.update(F.t, dt);
        var angry = F.angryOn && (F.frameName === 'battle' || F.frameName === 'board') && !(cel && cel.side === side), kit = F.kits[side];
        Object.keys(F.units[side]).forEach(function (c) { kit.setAngry(F.units[side][c].S, angry); });
        faceEnemies(side); F.kits[side].update(F.t, dt);
        var pos = sh.root.position, vx = 0, vz = 0;
        if (dt > 0 && tr >= 1) { vx = (pos.x - sh.prevPos.x) / dt; vz = (pos.z - sh.prevPos.z) / dt; }
        sh.prevPos.copy(pos);
        var v = Math.min(4, Math.hypot(vx, vz)); if (dt > 0) sh.vel += (v - sh.vel) * Math.min(1, dt * 5);
        sh.root.updateMatrixWorld(true);
        updateWake(sh, dt, vx, vz);
        var vis = Math.max(0, Math.min(1, 1 + sh.rock.position.y / 0.5));
        hullU.uShip.value[i].set(pos.x, pos.z, sh.root.rotation.y, sh.root.scale.x);
        var sail0 = F.frameName === 'battle' ? 0.95 : F.frameName === 'board' ? 0.12 : 0.3;
        sh.flowAcc = (sh.flowAcc || 0) + dt * (sail0 * 0.55 + 0.9 * Math.min(1, sh.vel / 0.8)) * (W.foam ? 1.5 : 1);   // пузыри у борта текут к корме
        hullU.uShipK.value[i].set(Math.min(1, sh.vel / 0.8), sh.flowAcc % 1000, 0, vis);
      });
      for (var ri = recoils.length - 1; ri >= 0; ri--) {
        var rc = recoils[ri]; rc.t += dt; var ru = rc.t / 0.35;
        rc.cn.body.position.z = ru < 0.25 ? 0.12 * (ru / 0.25) : 0.12 * Math.max(0, 1 - (ru - 0.25) / 0.75);
        if (ru >= 1) { rc.cn.body.position.z = 0; recoils.splice(ri, 1); }
      }
      ['p', 'e'].forEach(function (side) { F.ships[side].cannons.forEach(function (cn) {
        if (cn.state !== 'smoking') return; cn.smokeT = (cn.smokeT || 0) + dt;
        if (cn.smokeT > 0.5) { cn.smokeT = 0; var mp = F.muzzleWorld(cn); F.fx.emit && 0; F.fx.smoke(mp.add(new THREE.Vector3(0, 0.1, 0)), new THREE.Vector3(0.2, 0.6, 0)); }
      }); });
      updatePiles(dt); updateJumps(dt); updateStatus(dt); updateLights(dt); updateGlow(dt); updateDamage(dt); updateCelebrate(dt); updateHints(rdt); updateUlts(rdt, dt); updateCam(rdt); updateMerge(rdt); updateAtmo2(dt);
      F.fx.update(dt);
      renderer.render(scene, camera);
      return dt;
    };

    F.resize();
    F.setFrame('prep', true);
    F.setAtmo({ time: 'day', weather: 'normal' });
    return F;
  }

  TPS.FIELD = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
