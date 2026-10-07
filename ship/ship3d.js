/* TPS v0 · ship/ship3d.js
   3D-фрегат из кода по константам layout.js. 1 единица = 1 клетка палубы, палуба на высоте 0.
   Ось x вдоль корабля (корма -> нос), z поперёк: борт 0 на -z, борт 1 на +z. Нос смотрит в +x.
   Облик с эталона: светлая палуба панелями, фальшборт, низкий ют, бушприт, пушки у борта,
   полоса по ватерлинии в цвет стороны. Тун-шейдинг и обводка инвертированным корпусом.

   var ship = TPS.SHIP3D.build(THREE, { team: 'blue', guns: ['cul','car','cul'] });
   scene.add(ship.root);  ship.cellPos(i) -> Vector3 в координатах ship.deck
   ship.update(t, dt) каждый кадр; ship.setRock(deg); ship.kick(power); ship.turn(); ship.sink(); */
(function (root) {
  'use strict';
  var TPS = root.TPS = root.TPS || {};
  var PAL = {
    deckA: '#FBE3B0', deckB: '#F0B670', deckEdge: '#C99358', seam: 'rgba(120,70,30,.35)',
    side: 0x8E4A2C, sideDark: 0x5A2A18, rail: 0xA9643A, railTop: 0xD99550, outline: 0x180904,
    iron: 0x4A5058, ironRing: 0x2C3036, ironBroken: 0x9ea4a8, carriage: 0x7A4A28, keg: 0xa26f3d, hoop: 0x4d3420,
    team: { blue: 0x1f3f78, red: 0x7a2a22 }, pennant: { blue: 0x2f6fd8, red: 0xd5503c }
  };

  var gradTex = null;
  function toon(THREE, color, extra) {
    if (!gradTex) {
      gradTex = new THREE.DataTexture(new Uint8Array([110, 185, 255]), 3, 1, THREE.RedFormat);
      gradTex.minFilter = gradTex.magFilter = THREE.NearestFilter; gradTex.needsUpdate = true;
    }
    var o = { color: new THREE.Color(color).multiplyScalar(0.86), gradientMap: gradTex };
    if (extra) for (var k in extra) o[k] = extra[k];
    return new THREE.MeshToonMaterial(o);
  }

  // доски: canvas-текстура, вдоль x или вдоль z, два тона
  var plankCache = {};
  function plankTex(THREE, tone, along) {
    var key = tone + along; if (plankCache[key]) return plankCache[key];
    var c = document.createElement('canvas'); c.width = c.height = 128; var g = c.getContext('2d');
    g.fillStyle = tone; g.fillRect(0, 0, 128, 128);
    var n = 5, w = 128 / n;
    for (var i = 0; i < n; i++) {
      g.fillStyle = i % 2 ? 'rgba(255,255,255,.07)' : 'rgba(120,70,30,.06)';
      if (along === 'x') g.fillRect(0, i * w, 128, w); else g.fillRect(i * w, 0, w, 128);
      g.fillStyle = PAL.seam;
      if (along === 'x') { g.fillRect(0, i * w, 128, 2); g.fillRect((i * 47) % 128, i * w, 2, w); }
      else { g.fillRect(i * w, 0, 2, 128); g.fillRect(i * w, (i * 53) % 128, w, 2); }
    }
    g.strokeStyle = 'rgba(90,50,20,.45)'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, 125, 125);
    var t = new THREE.CanvasTexture(c); t.anisotropy = 4;
    plankCache[key] = t; return t;
  }

  // ---------- геометрия корпуса: всё в клетках, центр сетки в нуле ----------
  // Пропорции с эталона: борта слегка выпуклые, тупая скруглённая корма, длинный заострённый нос.
  // Нос и корма могут уходить за край экрана, сетка 4×3 всегда целиком.
  var GEO = {
    rail: 0.24, railH: 0.2,          // фальшборт: толщина и высота над палубой (толще, как на эталоне)
    beam: 2.0, bulge: 0.07,          // полуширина по внешнему краю у торцов сетки и выпуклость в середине
    stern: 1.0, bow: 1.85,           // вынос кормы и носа от торцов сетки
    depth: 0.62, flare: 0.86,        // высота борта под палубой и сужение к днищу
    water: -0.38,                    // ватерлиния
    gunZ: 1.66, barrelY: 0.27,       // ось пушек поперёк и высота стволов (над фальшбортом)
    culLen: 1.02, carLen: 0.74       // длина стволов: вынос за борт около 0,5 клетки
  };

  // контур сверху: массив [x, z] по часовой, начиная с кормы на борту 0 (-z)
  function hullPts(gw, scale, inset) {
    var g = gw / 2, B = GEO.beam * (scale || 1) - (inset || 0), bu = GEO.bulge, st = GEO.stern - (inset || 0) * 0.8, bw = GEO.bow - (inset || 0) * 1.6, pts = [];
    function cub(p0, p1, p2, p3, n, skip0) { for (var i = skip0 ? 1 : 0; i <= n; i++) { var u = i / n, a = 1 - u;
      pts.push([a * a * a * p0[0] + 3 * a * a * u * p1[0] + 3 * a * u * u * p2[0] + u * u * u * p3[0], a * a * a * p0[1] + 3 * a * a * u * p1[1] + 3 * a * u * u * p2[1] + u * u * u * p3[1]]); } }
    // борт 0: от кормы к носу, слегка выпуклый
    cub([-g, -B], [-g * 0.35, -B - bu * 1.33], [g * 0.35, -B - bu * 1.33], [g, -B], 10);
    // нос
    cub([g, -B], [g + bw * 0.5, -B], [g + bw * 0.93, -B * 0.42], [g + bw, 0], 14, true);
    cub([g + bw, 0], [g + bw * 0.93, B * 0.42], [g + bw * 0.5, B], [g, B], 14, true);
    // борт 1
    cub([g, B], [g * 0.35, B + bu * 1.33], [-g * 0.35, B + bu * 1.33], [-g, B], 10, true);
    // корма: тупая, со скруглёнными углами
    cub([-g, B], [-g - st * 0.62, B], [-g - st, B * 0.78], [-g - st, B * 0.34], 10, true);
    cub([-g - st, B * 0.34], [-g - st * 1.03, B * 0.12], [-g - st * 1.03, -B * 0.12], [-g - st, -B * 0.34], 6, true);
    cub([-g - st, -B * 0.34], [-g - st, -B * 0.78], [-g - st * 0.62, -B], [-g, -B], 10, true);
    pts.pop();
    return pts;
  }
  function shapeOf(THREE, pts, holePts) {
    var s = new THREE.Shape(); s.moveTo(pts[0][0], -pts[0][1]);
    for (var i = 1; i < pts.length; i++) s.lineTo(pts[i][0], -pts[i][1]);
    if (holePts) { var h = new THREE.Path(); h.moveTo(holePts[0][0], -holePts[0][1]); for (var j = 1; j < holePts.length; j++) h.lineTo(holePts[j][0], -holePts[j][1]); s.holes.push(h); }
    return s;
  }
  function extrude(THREE, shape, depth, y0) {
    var g = new THREE.ExtrudeGeometry(shape, { depth: depth, bevelEnabled: false, curveSegments: 4 });
    g.rotateX(-Math.PI / 2); g.translate(0, y0, 0); return g;
  }
  // борт как лофт между контуром сверху (y1) и сжатым контуром снизу (y0): корпус сужается к днищу
  function loft(THREE, top, y1, y0, k, out) {
    var n = top.length, pos = [], uv = [], idx = [], per = 0, acc = [0];
    for (var i = 1; i <= n; i++) { var a = top[i - 1], b = top[i % n]; per += Math.hypot(b[0] - a[0], b[1] - a[1]); acc.push(per); }
    for (var j = 0; j <= n; j++) {
      var p = top[j % n], u = acc[j] / per * 14;
      pos.push(p[0] * (out || 1), y1, p[1] * (out || 1), p[0] * (k.x) * (out || 1), y0, p[1] * (k.z) * (out || 1));
      uv.push(u, 1, u, 0);
    }
    for (var q = 0; q < n; q++) { var i0 = q * 2, i1 = q * 2 + 1, i2 = q * 2 + 2, i3 = q * 2 + 3; idx.push(i0, i1, i2, i2, i1, i3); }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  // доски борта: горизонтальные швы, тёмный низ
  var sideTexC = null;
  function sideTex(THREE) {
    if (sideTexC) return sideTexC;
    var c = document.createElement('canvas'); c.width = 64; c.height = 64; var g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 64);
    for (var i = 0; i < 4; i++) { g.fillStyle = i % 2 ? 'rgba(255,255,255,0)' : 'rgba(60,25,10,.10)'; g.fillRect(0, i * 16, 64, 16); g.fillStyle = 'rgba(50,20,8,.55)'; g.fillRect(0, i * 16, 64, 2); }
    g.fillStyle = 'rgba(50,20,8,.35)'; g.fillRect(20, 2, 2, 14); g.fillRect(48, 18, 2, 14); g.fillRect(8, 34, 2, 14); g.fillRect(36, 50, 2, 14);
    var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; sideTexC = t; return t;
  }

  function makeCannon(THREE, kind) {
    var g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    var wood = toon(THREE, PAL.carriage), iron = toon(THREE, PAL.iron), ring = toon(THREE, PAL.ironRing), Y = GEO.barrelY;
    var car = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.4), wood); car.position.set(0, 0.1, 0.06); body.add(car);
    if (kind === 'car') {
      [-0.13, 0.13].forEach(function (x) { var r = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.5), wood); r.position.set(x, 0.035, 0.04); body.add(r); });
    } else {
      [-0.17, 0.17].forEach(function (x) { [-0.08, 0.16].forEach(function (z) {
        var w = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.06, 14), wood); w.rotation.z = Math.PI / 2; w.position.set(x, 0.085, z); body.add(w); }); });
    }
    var len = kind === 'car' ? GEO.carLen : GEO.culLen, rB = kind === 'car' ? 0.13 : 0.1, rM = kind === 'car' ? 0.115 : 0.072;
    var z0 = 0.2;   // казённая часть над лафетом, ствол уходит наружу в -z
    var barrel = new THREE.Mesh(new THREE.CylinderGeometry(rM, rB, len, 18), iron);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, Y, z0 - len / 2); body.add(barrel);
    var tipZ = z0 - len;
    [0.12, 0.45, 0.93].forEach(function (f) {
      var rr = rB + (rM - rB) * f + 0.018, t = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, 0.05, 18), ring);
      t.rotation.x = Math.PI / 2; t.position.set(0, Y, z0 - len * f); body.add(t);
    });
    var lip = new THREE.Mesh(new THREE.CylinderGeometry(rM + 0.03, rM + 0.02, 0.06, 18), ring); lip.rotation.x = Math.PI / 2; lip.position.set(0, Y, tipZ + 0.02); body.add(lip);
    var bore = new THREE.Mesh(new THREE.CircleGeometry(rM * 0.62, 14), new THREE.MeshBasicMaterial({ color: 0x0b0b0c })); bore.position.set(0, Y, tipZ - 0.012); bore.rotation.y = Math.PI; body.add(bore);
    var knob = new THREE.Mesh(new THREE.SphereGeometry(rB * 0.62, 12, 8), iron); knob.position.set(0, Y, z0 + 0.04); body.add(knob);
    var olM = new THREE.MeshBasicMaterial({ color: PAL.outline, side: THREE.BackSide });
    var ol = new THREE.Mesh(new THREE.CylinderGeometry(rM + 0.03, rB + 0.03, len + 0.05, 14), olM); ol.rotation.x = Math.PI / 2; ol.position.copy(barrel.position); body.add(ol);
    var muzzle = new THREE.Object3D(); muzzle.position.set(0, Y, tipZ - 0.05); body.add(muzzle);
    return { group: g, body: body, barrel: barrel, iron: iron, muzzle: muzzle, kind: kind, state: 'ok' };
  }

  // бочка пузатая: бока шире дна и крышки примерно на треть, два тёмных обруча по выпуклости, крышка с ободом и клёпкой, контур
  function makeKeg(THREE) {
    var g = new THREE.Group(), H = 0.36, R0 = 0.165, BULGE = 0.07;
    var wood = toon(THREE, PAL.keg), hoop = toon(THREE, PAL.hoop), rad = function (y) { return R0 + BULGE * Math.sin(Math.PI * y / H); };
    var prof = []; for (var i = 0; i <= 12; i++) { var y = H * i / 12; prof.push(new THREE.Vector2(rad(y), y)); }
    var body = new THREE.Mesh(new THREE.LatheGeometry(prof, 22), wood); g.add(body);
    var ol = new THREE.Mesh(new THREE.LatheGeometry(prof.map(function (v) { return new THREE.Vector2(v.x + 0.018, v.y); }), 22), new THREE.MeshBasicMaterial({ color: PAL.outline, side: THREE.BackSide }));
    ol.scale.y = 1.04; ol.position.y = -0.007; g.add(ol);
    [0.075, H - 0.075].forEach(function (y) { var h = new THREE.Mesh(new THREE.TorusGeometry(rad(y) + 0.004, 0.02, 6, 22), hoop); h.rotation.x = Math.PI / 2; h.position.y = y; g.add(h); });
    var rim = new THREE.Mesh(new THREE.TorusGeometry(R0 - 0.005, 0.016, 6, 22), hoop); rim.rotation.x = Math.PI / 2; rim.position.y = H; g.add(rim);
    var lid = new THREE.Mesh(new THREE.CircleGeometry(R0 - 0.01, 20), toon(THREE, 0x8a5a32)); lid.rotation.x = -Math.PI / 2; lid.position.y = H - 0.004; g.add(lid);
    var stud = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), hoop); stud.position.set(0.05, H + 0.004, 0.03); stud.scale.y = 0.6; g.add(stud);
    return g;
  }

  function build(THREE, o) {
    o = o || {};
    var C = (TPS.LAYOUT && TPS.LAYOUT.C.SHIP) || { cols: 4, rows: 3, perBoard: 3, gun: 0.32 };
    var cols = C.cols, rows = C.rows, gun = C.gun, n = C.perBoard;
    var gx0 = -cols / 2, hw = GEO.beam, xs = gx0 - GEO.stern, xt = cols / 2 + GEO.bow, L = xt - xs;
    var team = o.team || 'blue';

    var root = new THREE.Group(), rock = new THREE.Group(), deck = new THREE.Group();
    root.add(rock); rock.add(deck);
    var outer = hullPts(cols, 1, 0), inner = hullPts(cols, 1, GEO.rail);
    var D = GEO.depth, K = { x: 0.97, z: GEO.flare };

    // палуба: плоская крышка по внутреннему контуру
    var deckCapTex = plankTex(THREE, PAL.deckEdge, 'x').clone(); deckCapTex.needsUpdate = true;
    deckCapTex.wrapS = deckCapTex.wrapT = THREE.RepeatWrapping;
    var cap = new THREE.Mesh(new THREE.ShapeGeometry(shapeOf(THREE, inner)), toon(THREE, 0xffffff, { map: deckCapTex }));
    cap.rotation.x = -Math.PI / 2; deck.add(cap);
    // борт: сужается к днищу, доски и тёмный низ
    var sT = sideTex(THREE).clone(); sT.needsUpdate = true; sT.repeat.set(1, 1);
    var sideMat = toon(THREE, PAL.side, { map: sT });
    var side = new THREE.Mesh(loft(THREE, outer, 0, -D, K), sideMat); deck.add(side);
    var bottom = new THREE.Mesh(new THREE.ShapeGeometry(shapeOf(THREE, outer.map(function (p) { return [p[0] * K.x, p[1] * K.z]; }))), toon(THREE, PAL.sideDark));
    bottom.rotation.x = -Math.PI / 2; bottom.position.y = -D; deck.add(bottom);
    // полоса цвета стороны по ватерлинии
    var stripeMat = toon(THREE, PAL.team[team]);
    var wy0 = GEO.water - 0.05, wy1 = GEO.water + 0.13, f0 = 1 - (1 - K.z) * (-wy0 / D), f1 = 1 - (1 - K.z) * (-wy1 / D);
    var sp = outer.map(function (p) { return [p[0] * (1 - (1 - K.x) * (-wy1 / D)), p[1] * f1]; });
    var stripe = new THREE.Mesh(loft(THREE, sp, wy1, wy0, { x: (1 - (1 - K.x) * (-wy0 / D)) / (1 - (1 - K.x) * (-wy1 / D)), z: f0 / f1 }, 1.012), stripeMat); deck.add(stripe);
    // фальшборт
    var railMat = toon(THREE, PAL.railTop), railSide = toon(THREE, PAL.rail);
    var rail = new THREE.Mesh(extrude(THREE, shapeOf(THREE, outer, inner), GEO.railH, 0), [railMat, railSide]); deck.add(rail);
    // контур сверху: тёмные кольца по внешнему и внутреннему краю фальшборта
    var ringMat = new THREE.MeshBasicMaterial({ color: 0x2a1206 });
    var ringOut = new THREE.Mesh(new THREE.ShapeGeometry(shapeOf(THREE, hullPts(cols, 1, -0.06), outer)), ringMat);
    ringOut.rotation.x = -Math.PI / 2; ringOut.position.y = GEO.railH + 0.001; deck.add(ringOut);
    var ringIn = new THREE.Mesh(new THREE.ShapeGeometry(shapeOf(THREE, hullPts(cols, 1, GEO.rail - 0.035), inner)), ringMat);
    ringIn.rotation.x = -Math.PI / 2; ringIn.position.y = GEO.railH + 0.001; deck.add(ringIn);
    // обводка всего корпуса: вывернутая оболочка
    var olMat = new THREE.MeshBasicMaterial({ color: PAL.outline, side: THREE.BackSide });
    var olTop = hullPts(cols, 1, -0.06);
    var ol = new THREE.Mesh(loft(THREE, olTop, GEO.railH + 0.01, -D - 0.03, K), olMat); deck.add(ol);

    // шаг высоты как на эталоне: фальшборт кормы за сеткой выше на 0,13 и заканчивается ступенькой у края сетки
    var RAISE = 0.13;
    function sternArc(pts) { var g0 = -cols / 2 + 1e-6, head = [], tail = []; pts.forEach(function (p, i) { if (p[0] <= g0) (i === 0 ? head : tail).push(p); }); return tail.concat(head); }
    var oArc = sternArc(outer), iArc = sternArc(inner).reverse();
    var sternRail = new THREE.Mesh(extrude(THREE, shapeOf(THREE, oArc.concat(iArc)), RAISE, GEO.railH), [railMat, railSide]); deck.add(sternRail);
    var olArc = sternArc(hullPts(cols, 1, -0.06)), ilArc = sternArc(hullPts(cols, 1, GEO.rail + 0.05)).reverse();
    var sternOl = new THREE.Mesh(extrude(THREE, shapeOf(THREE, olArc.concat(ilArc)), RAISE + 0.02, GEO.railH - 0.01), olMat); sternOl.material = new THREE.MeshBasicMaterial({ color: PAL.outline, side: THREE.BackSide }); deck.add(sternOl);
    var sternTop = new THREE.Mesh(new THREE.ShapeGeometry(shapeOf(THREE, oArc.concat(iArc))), ringMat); sternTop.rotation.x = -Math.PI / 2; sternTop.position.y = GEO.railH + RAISE + 0.002; sternTop.scale.set(1, 1, 1); deck.add(sternTop);
    var sternTopFace = new THREE.Mesh(new THREE.ShapeGeometry(shapeOf(THREE, sternArc(hullPts(cols, 1, 0.035)).concat(sternArc(hullPts(cols, 1, GEO.rail - 0.035)).reverse()))), railMat); sternTopFace.rotation.x = -Math.PI / 2; sternTopFace.position.y = GEO.railH + RAISE + 0.004; deck.add(sternTopFace);

    // низкий ют на корме
    var qPts = inner.filter(function (p) { return p[0] < gx0 - 0.06; });
    var zq = qPts.reduce(function (m, p) { return Math.max(m, Math.abs(p[1])); }, 0);
    qPts.sort(function (a2, b2) { return Math.atan2(a2[1], a2[0] - (gx0 - 0.3)) - Math.atan2(b2[1], b2[0] - (gx0 - 0.3)); });
    var qTex = plankTex(THREE, '#e0b47a', 'z').clone(); qTex.needsUpdate = true;
    var quarter = new THREE.Mesh(extrude(THREE, shapeOf(THREE, qPts), 0.16, 0), [toon(THREE, 0xffffff, { map: qTex }), toon(THREE, PAL.sideDark)]); deck.add(quarter);
    var step = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.17, zq * 1.6), toon(THREE, PAL.rail)); step.position.set(gx0 - 0.08, 0.085, 0); deck.add(step);
    void zq;

    // панели сетки
    var cells = [];
    for (var rr = 0; rr < rows; rr++) for (var k = 0; k < cols; k++) {
      var alt = (rr + k) % 2;
      var m = new THREE.Mesh(new THREE.PlaneGeometry(0.985, 0.985), toon(THREE, 0xffffff, { map: plankTex(THREE, alt ? PAL.deckB : PAL.deckA, alt ? 'z' : 'x') }));
      m.rotation.x = -Math.PI / 2;
      var cx = gx0 + k + 0.5, cz = -rows / 2 + rr + 0.5;
      m.position.set(cx, 0.004, cz); deck.add(m);
      cells.push({ i: rr * cols + k, x: cx, z: cz, mesh: m });
    }

    // бушприт и флагшток с вымпелом
    // бушприт толще и светлее, с тёмной обводкой, как на эталоне
    var olSpar = new THREE.MeshBasicMaterial({ color: PAL.outline, side: THREE.BackSide });
    var spar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.105, 1.4, 10), toon(THREE, PAL.rail));
    spar.rotation.z = -Math.PI / 2 + 0.2; spar.position.set(xt + 0.42, 0.3, 0); deck.add(spar);
    var sparOl = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.13, 1.44, 10), olSpar); sparOl.rotation.copy(spar.rotation); sparOl.position.copy(spar.position); deck.add(sparOl);
    var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 1.05, 8), toon(THREE, PAL.sideDark)); pole.position.set(xs + 0.28, 0.62, 0); deck.add(pole);
    var poleOl = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.08, 1.08, 8), olSpar); poleOl.position.copy(pole.position); deck.add(poleOl);
    // вымпел крупнее и с ласточкиным хвостом
    var PEN_L = 0.78, PEN_H = 0.36;
    var penMat = toon(THREE, PAL.pennant[team], { side: THREE.DoubleSide });
    var penGeo = new THREE.PlaneGeometry(PEN_L, PEN_H, 8, 2);
    (function () { var a = penGeo.attributes.position; for (var q = 0; q < a.count; q++) { if (a.getX(q) < -PEN_L / 2 + 1e-4 && Math.abs(a.getY(q)) < 1e-4) a.setX(q, -PEN_L / 2 + 0.22); } a.needsUpdate = true; })();
    var pennant = new THREE.Mesh(penGeo, penMat); pennant.position.set(xs + 0.28 - PEN_L / 2, 1.0, 0); deck.add(pennant);
    var penBase = penGeo.attributes.position.array.slice();

    // пушки: лафет на полосе у борта, ствол над фальшбортом и наружу
    var guns = o.guns || ['cul', 'car', 'cul'], cannons = [];
    for (var bd = 0; bd < 2; bd++) for (var j = 0; j < n; j++) {
      var cn = makeCannon(THREE, guns[j] || 'cul');
      var x = gx0 + cols * (j + 1) / (n + 1), z = (bd === 0 ? -1 : 1) * GEO.gunZ;
      cn.group.position.set(x, 0, z); if (bd === 1) cn.group.rotation.y = Math.PI;
      cn.board = bd; cn.slot = j; deck.add(cn.group); cannons.push(cn);
    }

    // тень на воде
    var shadow = new THREE.Mesh(new THREE.ShapeGeometry(shapeOf(THREE, outer.map(function (p) { return [p[0] * 0.98, p[1] * 0.9]; }))), new THREE.MeshBasicMaterial({ color: 0x02362c, transparent: true, opacity: 0.3, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.set(0.12, GEO.water + 0.004, 0.22); root.add(shadow);

    var pick = new THREE.Mesh(new THREE.PlaneGeometry(cols, rows), new THREE.MeshBasicMaterial({ visible: false }));
    pick.rotation.x = -Math.PI / 2; pick.position.set(0, 0.01, 0); deck.add(pick);

    // ватерлиния: полуширина корпуса на уровне воды для пены и следа
    var wl = outer.map(function (p) { var f = 1 - (1 - K.z) * (-GEO.water / D), fx = 1 - (1 - K.x) * (-GEO.water / D); return [p[0] * fx, p[1] * f]; });

    var kegs = {};
    var S = { rockDeg: 5, kickV: 0, kickA: 0, yaw: 0, yawFrom: 0, yawTo: 0, turnT: -1, turnDur: 1.6, sinkT: -1, phase: Math.random() * 6 };

    var api = {
      root: root, rock: rock, deck: deck, cells: cells, cannons: cannons, pick: pick, team: team, shadowMesh: shadow,
      L: L, hw: hw, gx0: gx0, xs: xs, xt: xt, cols: cols, rows: rows, waterline: wl,
      get yaw() { return S.yaw; },
      cellPos: function (i) { var c = cells[i]; return new THREE.Vector3(c.x, 0, c.z); },
      cellAt: function (localPoint) {
        var k2 = Math.floor(localPoint.x - gx0), r2 = Math.floor(localPoint.z + rows / 2);
        if (k2 < 0 || k2 >= cols || r2 < 0 || r2 >= rows) return -1;
        return r2 * cols + k2;
      },
      cannon: function (bd, j) { return cannons[bd * n + j]; },
      setCannon: function (cn, state) {
        cn.state = state;
        cn.iron.color.setHex(state === 'broken' ? PAL.ironBroken : PAL.iron);
        cn.barrel.rotation.z = state === 'broken' ? 0.25 : 0;
      },
      addKeg: function (i) { if (kegs[i]) return kegs[i]; var g = makeKeg(THREE), p = api.cellPos(i); g.position.copy(p); deck.add(g); kegs[i] = g; return g; },
      removeKeg: function (i) { if (kegs[i]) { deck.remove(kegs[i]); delete kegs[i]; } },
      kegs: kegs,
      setTeam: function (t2) { api.team = t2; stripeMat.color.setHex(PAL.team[t2]); penMat.color.setHex(PAL.pennant[t2]); },
      setRock: function (deg) { S.rockDeg = deg; },
      kick: function (p) { S.kickV += p || 1; },
      turn: function (dur) { S.yawFrom = S.yaw; S.yawTo = S.yaw + Math.PI; S.turnT = 0; S.turnDur = dur || 1.6; },
      setYaw: function (y) { S.yaw = S.yawTo = y; S.turnT = -1; root.rotation.y = y; },
      sink: function () { S.sinkT = 0; },
      unsink: function () { S.sinkT = -1; S.list = 0; S.listT = 0; rock.position.y = 0; rock.rotation.set(0, 0, 0); },
      // крен и осадка от повреждений: 0..1, плавно
      setList: function (k) { S.listT = k; },
      update: function (t, dt) {
        var a = S.rockDeg * Math.PI / 180;
        S.kickV += (-S.kickA * 60 - S.kickV * 6) * dt; S.kickA += S.kickV * dt;
        rock.rotation.x = a * Math.sin(t * 1.3 + S.phase) + S.kickA * 0.08;
        rock.rotation.z = a * 0.4 * Math.sin(t * 0.9 + S.phase * 2);
        rock.position.y = 0.012 * Math.min(S.rockDeg, 6) * Math.sin(t * 1.1 + S.phase);
        S.list = (S.list || 0) + ((S.listT || 0) - (S.list || 0)) * Math.min(1, dt * 1.5);
        rock.rotation.x += 0.11 * S.list; rock.position.y -= 0.09 * S.list;
        if (S.turnT >= 0) {
          S.turnT += dt; var u = Math.min(1, S.turnT / S.turnDur), e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
          S.yaw = S.yawFrom + (S.yawTo - S.yawFrom) * e; root.rotation.y = S.yaw;
          rock.rotation.x += Math.sin(u * Math.PI) * 0.12;
          if (u >= 1) S.turnT = -1;
        }
        if (S.sinkT >= 0) {
          S.sinkT += dt; var s2 = Math.min(1, S.sinkT / 2.4);
          rock.rotation.x = 0.45 * s2; rock.position.y = -1.4 * s2 * s2;
        }
        var pa = penGeo.attributes.position;
        for (var q = 0; q < pa.count; q++) {
          var px = penBase[q * 3], w2 = (PEN_L / 2 - px) / PEN_L;
          pa.array[q * 3 + 2] = Math.sin(t * 6 + px * 10) * 0.05 * w2;
        }
        pa.needsUpdate = true;
      }
    };
    return api;
  }

  // бейджи и полоски: canvas-текстуры для спрайтов
  var texCache = {};
  // gold: обводка золотом для 3-го ранга; подложка остаётся цветом команды, цифра белая
  function badgeTex(THREE, kind, text, color, gold) {
    var key = kind + text + color + (gold ? 'g' : ''); if (texCache[key]) return texCache[key];
    var c = document.createElement('canvas'), g = c.getContext('2d');
    var font = '900 40px Rubik, "Arial Black", sans-serif';
    if (kind === 'rank') {
      c.width = c.height = 64; g.fillStyle = color; g.beginPath(); g.arc(32, 32, gold ? 25 : 27, 0, 7); g.fill();
      if (gold) { g.lineWidth = 7; g.strokeStyle = '#FFC62E'; g.stroke(); g.beginPath(); g.arc(32, 32, 29.5, 0, 7); g.lineWidth = 1.5; g.strokeStyle = '#7a4a00'; g.stroke(); }
      else { g.lineWidth = 5; g.strokeStyle = '#fff'; g.stroke(); }
      g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 6; g.strokeStyle = '#08090B'; g.strokeText(text, 32, 34); g.fillStyle = color === '#DEB550' ? '#1a2126' : '#fff'; g.fillText(text, 32, 34);
    } else {
      c.width = 96; c.height = 56; g.fillStyle = '#DEB550'; g.strokeStyle = '#8a5a0a'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(10, 4); g.lineTo(86, 4); g.quadraticCurveTo(92, 4, 92, 10); g.lineTo(92, 46); g.quadraticCurveTo(92, 52, 86, 52); g.lineTo(10, 52); g.quadraticCurveTo(4, 52, 4, 46); g.lineTo(4, 10); g.quadraticCurveTo(4, 4, 10, 4); g.fill(); g.stroke();
      g.font = '900 32px Rubik, "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#1a2126'; g.fillText(text, 48, 30);
    }
    var t = new THREE.CanvasTexture(c); texCache[key] = t; return t;
  }

  TPS.SHIP3D = { build: build, badgeTex: badgeTex, toon: toon, PAL: PAL, GEO: GEO };
})(typeof window !== 'undefined' ? window : globalThis);
