/* ============================================================
   The world: the clock, the light, the water, and the chunks and
   scattered things that stream in and out around you as you walk.
   ============================================================ */

import * as THREE from "three";
import { LUSH, buildChunk, chunkProps, sampleField, sampleLush } from "./chunks.js";
import { InstancePool, bladeGeo, blossomGeo, broadleaf, bushGeo, conifer, stoneGeo, tuftGeo } from "./geometry.js";
import { SH, SKY_FRAG, SKY_VERT, fillSkyLUT, scene } from "./graphics.js";
import { QUALITY } from "./settings.js";
import { TEX, WATER_FRAG, WATER_VERT, cardMaterial, grassMaterial, propMaterial, terrainMaterial } from "./materials.js";
import { CHUNK, WATER, clamp, clamp01, dampAt, fbm, hash, heightAt, lerp, ringCount, smoothstep, splatAt } from "./terrain.js";

const DAY = [
  { t: 0.00, sun: "#ff9a4e", li: 1.45, amb: 0.78, cover: 0.58 },
  { t: 0.18, sun: "#ffd6a0", li: 3.20, amb: 1.60, cover: 0.55 },
  { t: 0.50, sun: "#fff6e2", li: 4.30, amb: 2.05, cover: 0.52 },
  { t: 0.82, sun: "#ffd090", li: 3.00, amb: 1.55, cover: 0.55 },
  { t: 1.00, sun: "#ff8c45", li: 1.35, amb: 0.74, cover: 0.58 },
].map((k) => ({ t: k.t, li: k.li, amb: k.amb, cover: k.cover, sun: new THREE.Color(k.sun) }));

/* ============================================================
   World - streams chunks and scatters everything on them
   ============================================================ */

/* Tints only nudge what a texture already says. Keeping them near white
   is the whole difference between a lit tree and a black blob. */
const LEAF_TINT = ["#ffffff", "#e6f2dc", "#fff0d8", "#dcecdf"].map((c) => new THREE.Color(c));
const PINE_TINT = ["#eef4ec", "#dceade", "#f6f8f0"].map((c) => new THREE.Color(c));
const BARK_TINT = ["#ffffff", "#f4e8da", "#e4dacb"].map((c) => new THREE.Color(c));
const ROCK_TINT = ["#ffffff", "#f1eee8", "#e4e0d6"].map((c) => new THREE.Color(c));
const PETAL_TINT = ["#fbf6ea", "#f8de64", "#f29cc0", "#bd9ae8", "#f5a95a"].map((c) => new THREE.Color(c));
const BLADE_TINT = ["#5c8438", "#527a2e", "#688f41", "#497128", "#74944a"].map((c) => new THREE.Color(c));

function pick(arr, i) { return arr[((i % arr.length) + arr.length) % arr.length]; }

/* ============================================================
   The lawn.

   Chunks are 32 metres across, which is far too coarse to decide
   how thick the grass should be: what matters is the first twenty
   metres in front of your boots. So the dense grass lives on its
   own five-metre grid that walks with you, thinning in three
   bands until it meets the thin grass the chunks lay down. Blades
   are still placed by world position, so the same tussock is in
   the same place every time you walk back to it.
   ============================================================ */

const LAWN_CELL = 5;
const LAWN_R = 21;

class Lawn {
  constructor(world) {
    this.world = world;
    this.cells = new Map();
    this.dummy = new THREE.Object3D();
    this.col = new THREE.Color();
  }

  bandOf(d2) {
    if (d2 < LAWN_R * LAWN_R * 0.26) return 0;
    if (d2 < LAWN_R * LAWN_R * 0.58) return 1;
    if (d2 < LAWN_R * LAWN_R) return 2;
    return -1;
  }

  clear() {
    for (const [k] of this.cells) this.free(k);
  }

  free(k) {
    const c = this.cells.get(k);
    if (!c) return;
    const pool = this.world.pool.grass;
    for (let i = 0; i < c.slots.length; i++) pool.release(c.slots[i]);
    this.cells.delete(k);
  }

  update(px, pz, budget) {
    for (const [k, c] of this.cells) {
      const dx = (c.x + 0.5) * LAWN_CELL - px, dz = (c.z + 0.5) * LAWN_CELL - pz;
      if (this.bandOf(dx * dx + dz * dz) !== c.band) this.free(k);
    }
    const cx = Math.floor(px / LAWN_CELL), cz = Math.floor(pz / LAWN_CELL);
    const reach = Math.ceil(LAWN_R / LAWN_CELL) + 1;
    let work = 0;
    for (let j = -reach; j <= reach; j++) {
      for (let i = -reach; i <= reach; i++) {
        const gx = cx + i, gz = cz + j;
        const k = gx + "," + gz;
        if (this.cells.has(k)) continue;
        const dx = (gx + 0.5) * LAWN_CELL - px, dz = (gz + 0.5) * LAWN_CELL - pz;
        const b = this.bandOf(dx * dx + dz * dz);
        if (b < 0) continue;
        this.sow(gx, gz, b, k);
        if (++work >= budget) return;
      }
    }
  }

  sow(gx, gz, band, key) {
    const w = this.world;
    const pool = w.pool.grass;
    const n = Math.round(w.q.lawn * [1, 0.46, 0.2][band]);
    const ox = gx * LAWN_CELL, oz = gz * LAWN_CELL;
    const col = this.col;
    const slots = [];
    /* how lush this patch of meadow is - a five-metre cell is far smaller
       than the feature, so once per cell is as good as once per blade and
       hundreds of times cheaper */
    const patch = fbm((ox + 2.5) * 0.022, (oz + 2.5) * 0.022, 2, 555);
    const take = 0.34 + patch * 0.9;

    for (let i = 0; i < n; i++) {
      const s = i * 5;
      const r = hash(gx, gz, s + 3);
      if (r > take) continue;
      const wx = ox + hash(gx, gz, s + 1) * LAWN_CELL;
      const wz = oz + hash(gx, gz, s + 2) * LAWN_CELL;
      const h = w.groundAt(wx, wz);
      if (h < WATER + 0.22) continue;
      if (w.flatAt(wx, wz) < 0.6) continue;
      const r2 = hash(gx, gz, s + 4);
      col.copy(pick(BLADE_TINT, i + gx + gz * 3)).multiplyScalar(0.70 + r2 * 0.55);
      const slot = pool.placeUpright(wx, h - 0.07, wz, hash(gx, gz, s + 5) * 6.2832,
        0.85 + r * 0.4, 0.40 + r2 * 0.66, 0.85 + r2 * 0.4, col);
      if (slot >= 0) slots.push(slot);
    }
    this.cells.set(key, { x: gx, z: gz, band, slots });
  }
}

class World {
  constructor(scene, qualName) {
    this.scene = scene;
    this.q = QUALITY[qualName];
    this.chunks = new Map();
    this.queue = [];
    this.dummy = new THREE.Object3D();
    this.cx = 1e9; this.cz = 1e9;
    this.dayT = 0.33;

    this.terrainMat = terrainMaterial();

    /* ---- prototypes ---- */
    const protos = [
      [broadleaf(5150, true), broadleaf(5150, false)],
      [broadleaf(9271, true), broadleaf(9271, false)],
      [conifer(3314, true), conifer(3314, false)],
    ];
    this.protos = protos;

    const woodMat = propMaterial(TEX.bark, "bark", { normal: 1.1 });
    /* [kind][lod] - only the conifers need a different leaf at distance */
    const leafA = cardMaterial(TEX.leaf[0], { key: "l0", trans: 1.0 });
    const leafB = cardMaterial(TEX.leaf[1], { key: "l1", trans: 1.0 });
    const leafMats = [
      [leafA, leafA],
      [leafB, leafB],
      [cardMaterial(TEX.needle, { key: "n0", trans: 0.75, alphaTest: 0.22 }),
       cardMaterial(TEX.needleFar, { key: "n1", trans: 0.75, alphaTest: 0.20 })],
    ];
    const stoneMat = propMaterial(TEX.stone, "stone", { normal: 1.0 });

    /* How many of a thing can possibly be on screen: worked out from the
       ring sizes, not guessed, so a pool can never run dry. */
    const RV = ringCount(QUALITY.high.view);
    const RD = ringCount(2);
    const far = RV - RD;
    const caps = [
      { near: RD * 17, far: far * 17 },
      { near: RD * 17, far: far * 17 },
      { near: RD * 30, far: far * 30 },
    ];

    this.pool = {};
    for (let k = 0; k < 3; k++) {
      for (let l = 0; l < 2; l++) {
        const cap = l === 0 ? caps[k].near : caps[k].far;
        const cast = l === 0;
        this.pool["wood" + k + l] = new InstancePool(scene, protos[k][l].wood, woodMat, cap, { cast });
        this.pool["leaf" + k + l] = new InstancePool(scene, protos[k][l].leaf, leafMats[k][l], cap, { cast });
      }
    }

    this.pool.bush = new InstancePool(scene, bushGeo(7711),
      cardMaterial(TEX.leaf[2], { key: "bush", trans: 1.0 }), RV * 12, { cast: false });

    for (let k = 0; k < 3; k++) {
      this.pool["stone" + k] = new InstancePool(scene, stoneGeo(400 + k * 97), stoneMat, RV * 4, { cast: true });
    }

    const gR = ringCount(QUALITY.high.grassR);
    const tR = ringCount(QUALITY.high.tuftR) - gR;
    /* the thin grass the chunks lay down, plus everything the lawn can
       possibly want inside its three bands */
    this.pool.grass = new InstancePool(scene, bladeGeo(), grassMaterial(),
      gR * QUALITY.high.blades + 34000, { cast: false });
    this.pool.tuft = new InstancePool(scene, tuftGeo(),
      cardMaterial(TEX.tuft, { key: "tuft", wind: true, up: true, trans: 1.1, alphaTest: 0.24 }),
      tR * QUALITY.high.tufts, { cast: false });
    this.pool.flower = new InstancePool(scene, blossomGeo(),
      cardMaterial(TEX.blossom, { key: "bloom", wind: true, up: true, trans: 0.5, alphaTest: 0.45 }),
      gR * Math.round(QUALITY.high.blades * 0.09), { cast: false });

    /* ---- sky, light, water, air ---- */

    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
      side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
      uniforms: {
        uSkyLUT: SH.uSkyLUT, uNoise: SH.uNoise, uSunDir: SH.uSunDir,
        uSunCol: SH.uSunCol, uTime: SH.uTime,
        uCover: { value: 0.54 }, uCloud: { value: 0.9 },
      },
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(8, 32, 20), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1000;
    scene.add(this.sky);

    this.hemi = new THREE.HemisphereLight(new THREE.Color("#9ec4e8"), new THREE.Color("#4e5c34"), 0.6);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(this.q.shadow, this.q.shadow);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 320;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.055;
    this.shadowSpan(this.q.span);
    scene.add(this.sun);
    this.sunTarget = new THREE.Object3D();
    scene.add(this.sunTarget);
    this.sun.target = this.sunTarget;

    this.makeWater();
    this.makeMotes();
    this.lawn = new Lawn(this);

    this.setDay(this.dayT);
  }

  shadowSpan(s) {
    const c = this.sun.shadow.camera;
    c.left = -s; c.right = s; c.top = s; c.bottom = -s;
    c.updateProjectionMatrix();
    this.span = s;
  }

  /* ---- water ---- */

  makeWater() {
    const SIZE = 300, D = 96;
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, D, D);
    geo.rotateX(-Math.PI / 2);
    geo.setAttribute("aDepth", new THREE.BufferAttribute(new Float32Array((D + 1) * (D + 1)), 1));
    this.water = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      vertexShader: WATER_VERT, fragmentShader: WATER_FRAG,
      transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false,
      uniforms: {
        uTime: SH.uTime, uSkyLUT: SH.uSkyLUT, uNoise: SH.uNoise,
        uSunDir: SH.uSunDir, uSunCol: SH.uSunCol, uAir: SH.uAir,
      },
    }));
    this.water.position.y = WATER;
    this.water.renderOrder = 4;
    this.water.frustumCulled = false;
    this.waterAt = new THREE.Vector2(1e9, 1e9);
    this.scene.add(this.water);
  }

  tendWater(px, pz) {
    const sx = Math.round(px / 16) * 16, sz = Math.round(pz / 16) * 16;
    if (sx === this.waterAt.x && sz === this.waterAt.y) return;
    this.waterAt.set(sx, sz);
    this.water.position.set(sx, WATER, sz);
    const pos = this.water.geometry.attributes.position;
    const dep = this.water.geometry.attributes.aDepth;
    for (let i = 0; i < pos.count; i++) {
      dep.array[i] = WATER - this.groundNear(sx + pos.getX(i), sz + pos.getZ(i));
    }
    dep.needsUpdate = true;
  }

  /* Past the loaded chunks the lake is simply deep - re-running the noise
     for nine thousand vertices out there would cost more than it shows. */
  groundNear(x, z) {
    const c = this.chunkAt(x, z);
    if (!c) return WATER - 2.5;
    return sampleField(c.field.heights, x - c.cx * CHUNK, z - c.cz * CHUNK);
  }

  /* ---- motes drifting in the light ---- */

  makeMotes() {
    const n = 420;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      p[i * 3] = (Math.random() - 0.5) * 34;
      p[i * 3 + 1] = Math.random() * 11;
      p[i * 3 + 2] = (Math.random() - 0.5) * 34;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    this.motes = new THREE.Points(g, new THREE.PointsMaterial({
      map: TEX.mote, size: 0.075, sizeAttenuation: true, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5, fog: false,
    }));
    this.motes.frustumCulled = false;
    this.motes.renderOrder = 3;
    this.scene.add(this.motes);
  }

  /* ---- time of day ---- */

  setDay(t) {
    this.dayT = clamp(t, 0.03, 0.97);
    const u = this.dayT;
    let i = 0;
    while (i < DAY.length - 2 && DAY[i + 1].t < u) i++;
    const a = DAY[i], b = DAY[i + 1];
    const k = clamp01((u - a.t) / (b.t - a.t));

    const elev = Math.max(0.045, Math.sin(u * Math.PI) * 1.02);
    const az = -Math.PI * 0.58 + u * Math.PI * 1.16;
    SH.uSunDir.value.set(
      Math.cos(elev) * Math.sin(az), Math.sin(elev), Math.cos(elev) * Math.cos(az)
    ).normalize();
    this.sunDir = SH.uSunDir.value;

    fillSkyLUT(this.sunDir.y);

    const lit = a.sun.clone().lerp(b.sun, k);
    const li = lerp(a.li, b.li, k);
    SH.uSunCol.value.copy(lit).multiplyScalar(clamp(li * 0.42, 0.18, 1.6));

    this.sun.color.copy(lit);
    this.sun.intensity = li;
    this.hemi.intensity = lerp(a.amb, b.amb, k);
    this.hemi.color.setRGB(0.48, 0.62, 0.86).lerp(lit, 0.45);
    this.hemi.groundColor.setRGB(0.34, 0.36, 0.26).lerp(lit, 0.25);
    this.skyMat.uniforms.uCover.value = lerp(a.cover, b.cover, k);
  }

  clockLabel() {
    const hours = 6 + this.dayT * 12;
    const h = Math.floor(hours);
    const m = Math.floor(((hours - h) * 60) / 5) * 5;
    return h + ":" + String(m).padStart(2, "0");
  }

  /* ---- chunk streaming ---- */

  key(cx, cz) { return cx + "," + cz; }

  /* The grass asks which chunk it is standing on tens of thousands of
     times a second, and almost always gets the same answer twice. One
     slot of memory saves building that many map keys. */
  chunkAt(x, z) {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    if (cx === this._ccx && cz === this._ccz) return this._cc;
    this._ccx = cx; this._ccz = cz;
    this._cc = this.chunks.get(this.key(cx, cz));
    return this._cc;
  }

  forget() { this._ccx = 1e9; this._cc = undefined; }

  setQuality(name) {
    this.q = QUALITY[name];
    this.sun.shadow.mapSize.set(this.q.shadow, this.q.shadow);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.shadowSpan(this.q.span);
    SH.uAir.value.y = this.q.fog;
    this.lawn.clear();
    for (const k of Array.from(this.chunks.keys())) this.drop(k);
    this.queue.length = 0;
    this.cx = 1e9; this.cz = 1e9;
    this.waterAt.set(1e9, 1e9);
  }

  enqueue(px, pz) {
    const pcx = Math.floor(px / CHUNK), pcz = Math.floor(pz / CHUNK);
    if (pcx === this.cx && pcz === this.cz) return;
    this.cx = pcx; this.cz = pcz;
    const R = this.q.view, lim = (R + 0.5) * (R + 0.5);
    this.queue.length = 0;
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const d2 = dx * dx + dz * dz;
      if (d2 > lim) continue;
      const k = this.key(pcx + dx, pcz + dz);
      if (!this.chunks.has(k)) this.queue.push({ cx: pcx + dx, cz: pcz + dz, d2 });
    }
    this.queue.sort((a, b) => b.d2 - a.d2);      // pop() hands back the nearest first
    const gone = (R + 1.6) * (R + 1.6);
    for (const [k, c] of this.chunks) {
      const dx = c.cx - pcx, dz = c.cz - pcz;
      if (dx * dx + dz * dz > gone) this.drop(k);
    }
  }

  build(budgetMs) {
    const t0 = performance.now();
    while (this.queue.length) {
      const j = this.queue.pop();
      this.make(j.cx, j.cz);
      if (performance.now() - t0 > budgetMs) break;
    }
    for (const p in this.pool) this.pool[p].flush();
  }

  make(cx, cz) {
    const field = buildChunk(cx, cz);
    const mesh = new THREE.Mesh(field.geometry, this.terrainMat);
    mesh.position.set(cx * CHUNK, 0, cz * CHUNK);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    this.scene.add(mesh);
    const dx = cx - this.cx, dz = cz - this.cz;
    const c = { cx, cz, mesh, field, allocs: [], solids: [], grass: null, lod: -1 };
    this.chunks.set(this.key(cx, cz), c);
    this.forget();
    this.scatter(c, dx * dx + dz * dz <= this.q.detail * this.q.detail ? 0 : 1);
    return c;
  }

  drop(k) {
    const c = this.chunks.get(k);
    if (!c) return;
    this.scene.remove(c.mesh);
    c.mesh.geometry.dispose();
    for (let i = 0; i < c.allocs.length; i += 2) c.allocs[i].release(c.allocs[i + 1]);
    if (c.grass) for (let i = 0; i < c.grass.length; i += 2) c.grass[i].release(c.grass[i + 1]);
    this.chunks.delete(k);
    this.forget();
  }

  put(list, name, obj, color) {
    const p = this.pool[name];
    const i = p.place(obj, color);
    if (i >= 0) list.push(p, i);
  }

  /* ---- props, at one of two levels of detail ---- */

  scatter(c, lod) {
    if (c.lod === lod) return;
    for (let i = 0; i < c.allocs.length; i += 2) c.allocs[i].release(c.allocs[i + 1]);
    c.allocs.length = 0;
    c.solids.length = 0;
    c.lod = lod;

    const P = chunkProps(c.cx, c.cz);
    const d = this.dummy, col = new THREE.Color();
    const A = c.allocs;

    for (let i = 0; i < P.trees.length; i++) {
      const t = P.trees[i];
      d.position.set(t.x, t.h, t.z);
      d.rotation.set(0, t.yaw, 0);
      d.scale.setScalar(t.sc);
      this.put(A, "wood" + t.kind + lod, d, col.copy(pick(BARK_TINT, i + c.cx)).multiplyScalar(t.tint));
      this.put(A, "leaf" + t.kind + lod, d,
        col.copy(t.kind === 2 ? pick(PINE_TINT, i) : pick(LEAF_TINT, i + c.cz)).multiplyScalar(t.tint));
      c.solids.push(t.x, t.z, t.r);
    }

    for (let i = 0; i < P.bushes.length; i++) {
      const b = P.bushes[i];
      d.position.set(b.x, b.h, b.z);
      d.rotation.set(0, b.yaw, 0);
      d.scale.setScalar(b.sc);
      this.put(A, "bush", d, col.copy(pick(LEAF_TINT, i + c.cx)).multiplyScalar(b.tint));
    }

    for (let i = 0; i < P.rocks.length; i++) {
      const r = P.rocks[i];
      d.position.set(r.x, r.h - r.sc * r.sy * 0.45, r.z);
      d.rotation.set(r.tilt, r.yaw, r.tilt * 0.6);
      d.scale.set(r.sc, r.sc * r.sy, r.sc * 0.92);
      this.put(A, "stone" + r.kind, d, col.copy(pick(ROCK_TINT, i)).multiplyScalar(r.tint));
      if (r.sc > 0.75) c.solids.push(r.x, r.z, r.sc * 0.72);
    }
  }

  /* promote and demote chunks as you walk, a couple at a time */
  tendDetail(pcx, pcz) {
    const lim = this.q.detail * this.q.detail;
    let work = 0;
    for (const [, c] of this.chunks) {
      const dx = c.cx - pcx, dz = c.cz - pcz;
      const want = dx * dx + dz * dz <= lim ? 0 : 1;
      if (c.lod === want) continue;
      this.scatter(c, want);
      if (++work >= 2) break;
    }
  }

  /* ---- grass lives only in the chunks around you ---- */

  tendGrass(pcx, pcz) {
    const R = this.q.grassR, lim = (R + 0.5) * (R + 0.5);
    const T = this.q.tuftR, tlim = (T + 0.5) * (T + 0.5);
    for (const [, c] of this.chunks) {
      const dx = c.cx - pcx, dz = c.cz - pcz;
      const d2 = dx * dx + dz * dz;
      const want = d2 <= lim ? 2 : d2 <= tlim ? 1 : 0;
      const have = c.grass ? c.grassLevel : 0;
      if (want === have) continue;
      if (c.grass) this.reap(c);
      if (want) this.sow(c, want);
      return;                                  // one chunk a frame is plenty
    }
  }

  /* How lush the meadow is, sampled on a coarse grid across the chunk and
     read back by interpolation. The patchiness it carries is a 45-metre
     feature, so a five-metre grid loses nothing - and it turns one noise
     evaluation per blade into twenty-five per chunk. */
  lushness(ox, oz) {
    const P = LUSH, g = this._lush || (this._lush = new Float32Array((P + 1) * (P + 1)));
    for (let j = 0; j <= P; j++) {
      for (let i = 0; i <= P; i++) {
        g[j * (P + 1) + i] = fbm((ox + (i * CHUNK) / P) * 0.022, (oz + (j * CHUNK) / P) * 0.022, 2, 555);
      }
    }
    return g;
  }

  sow(c, level) {
    const ox = c.cx * CHUNK, oz = c.cz * CHUNK;
    const d = this.dummy, col = new THREE.Color();
    const G = [];
    const lush = this.lushness(ox, oz);
    c.grassLevel = level;

    if (level === 2) {
      const pool = this.pool.grass;
      for (let k = 0; k < this.q.blades; k++) {
        const s = k * 6;
        const lx = hash(c.cx, c.cz, s + 1) * CHUNK, lz = hash(c.cx, c.cz, s + 2) * CHUNK;
        const r = hash(c.cx, c.cz, s + 3);
        if (r > 0.26 + sampleLush(lush, lx, lz) * 0.95) continue;
        const h = sampleField(c.field.heights, lx, lz);
        if (h < WATER + 0.25) continue;
        if (h < WATER + 1.1 && r > 0.3) continue;            // thin out on the sand
        if (sampleField(c.field.flats, lx, lz) < 0.62) continue;
        const r2 = hash(c.cx, c.cz, s + 4);
        col.copy(pick(BLADE_TINT, k + c.cx + c.cz * 3)).multiplyScalar(0.70 + r2 * 0.55);
        const slot = pool.placeUpright(ox + lx, h - 0.06, oz + lz,
          hash(c.cx, c.cz, s + 5) * 6.2832,
          0.9 + r * 0.35, 0.42 + r2 * 0.62, 0.9 + r2 * 0.35, col);
        if (slot >= 0) G.push(pool, slot);
      }

      const flowers = Math.round(this.q.blades * 0.085);
      for (let k = 0; k < flowers; k++) {
        const s = 3000 + k * 6;
        const lx = hash(c.cx, c.cz, s + 1) * CHUNK, lz = hash(c.cx, c.cz, s + 2) * CHUNK;
        const h = sampleField(c.field.heights, lx, lz);
        if (h < WATER + 0.8) continue;
        if (sampleField(c.field.flats, lx, lz) < 0.78) continue;
        const wx = ox + lx, wz = oz + lz;
        const bloom = fbm(wx * 0.031 + 11, wz * 0.031 - 7, 2, 777);
        if (hash(c.cx, c.cz, s + 3) > smoothstep(0.50, 0.8, bloom)) continue;
        const r = hash(c.cx, c.cz, s + 4), r2 = hash(c.cx, c.cz, s + 5);
        d.position.set(wx, h, wz);
        d.rotation.set((r - 0.5) * 0.5, r2 * 6.2832, (r2 - 0.5) * 0.5);
        d.scale.setScalar(0.19 + r * 0.12);
        col.copy(pick(PETAL_TINT, Math.floor(bloom * 97 + c.cx))).multiplyScalar(0.9 + r2 * 0.25);
        this.put(G, "flower", d, col);
      }
    } else {
      const pool = this.pool.tuft;
      for (let k = 0; k < this.q.tufts; k++) {
        const s = 7000 + k * 6;
        const lx = hash(c.cx, c.cz, s + 1) * CHUNK, lz = hash(c.cx, c.cz, s + 2) * CHUNK;
        const r = hash(c.cx, c.cz, s + 3);
        if (r > 0.3 + sampleLush(lush, lx, lz) * 0.9) continue;
        const h = sampleField(c.field.heights, lx, lz);
        if (h < WATER + 0.35) continue;
        if (sampleField(c.field.flats, lx, lz) < 0.62) continue;
        const r2 = hash(c.cx, c.cz, s + 4);
        col.copy(pick(BLADE_TINT, k + c.cx)).multiplyScalar(0.74 + r2 * 0.34);
        const slot = pool.placeUpright(ox + lx, h - 0.08, oz + lz,
          hash(c.cx, c.cz, s + 5) * 6.2832,
          0.60 + r * 0.42, 0.46 + r2 * 0.5, 0.60 + r2 * 0.42, col);
        if (slot >= 0) G.push(pool, slot);
      }
    }

    c.grass = G;
  }

  reap(c) {
    for (let i = 0; i < c.grass.length; i += 2) c.grass[i].release(c.grass[i + 1]);
    c.grass = null;
  }

/* ---- what the rest of the game asks the world ---- */

  groundAt(x, z) {
    const c = this.chunkAt(x, z);
    if (!c) return heightAt(x, z);
    return sampleField(c.field.heights, x - c.cx * CHUNK, z - c.cz * CHUNK);
  }

  /* What he is standing on, as one word, for the sound a boot makes on
     it. These are the same four weights the ground shader blends the
     surface from, so what you hear is what you are looking at. */
  surfaceAt(x, z) {
    const h = this.groundAt(x, z);
    if (h < WATER - 0.06) return "water";
    splatAt(h, this.flatAt(x, z), dampAt(x, z), _splat);
    if (_splat[0] > 0.45) return "rock";
    if (_splat[1] > 0.45) return "sand";
    if (_splat[2] > 0.38) return "soil";
    return "turf";
  }

  /* how much water a boot is dragging through here, nought to one */
  wetAt(x, z) {
    return clamp01((WATER - this.groundAt(x, z)) / 0.55);
  }

  flatAt(x, z) {
    const c = this.chunkAt(x, z);
    if (!c) return 1;
    return sampleField(c.field.flats, x - c.cx * CHUNK, z - c.cz * CHUNK);
  }

  pushOut(pos, rad) {
    const pcx = Math.floor(pos.x / CHUNK), pcz = Math.floor(pos.z / CHUNK);
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const c = this.chunks.get(this.key(pcx + dx, pcz + dz));
        if (!c) continue;
        const s = c.solids;
        for (let i = 0; i < s.length; i += 3) {
          const ex = pos.x - s[i], ez = pos.z - s[i + 1];
          const rr = s[i + 2] + rad;
          const d2 = ex * ex + ez * ez;
          if (d2 > rr * rr) continue;
          if (d2 < 1e-5) { pos.x += rr; moved = true; continue; }
          const dist = Math.sqrt(d2), push = (rr - dist) / dist;
          pos.x += ex * push; pos.z += ez * push;
          moved = true;
        }
      }
      if (!moved) break;
    }
  }

  /* ---- everything that rides along with the camera ---- */

  follow(cam, px, pz, elapsed) {
    this.sky.position.copy(cam.position);
    this.motes.position.set(Math.round(px), 0, Math.round(pz));
    this.motes.material.opacity = 0.16 + clamp01(SH.uSunCol.value.g) * 0.4;

    /* The shadow map follows you, snapped to its own texel grid - without
       that, every step makes the edge of every shadow crawl. */
    const g = this.groundAt(px, pz);
    const texel = (this.span * 2) / this.q.shadow;
    const f = this.sunDir;
    const right = _tmpA.set(-f.z, 0, f.x).normalize();
    const up2 = _tmpB.copy(f).cross(right).normalize();
    const p = _tmpC.set(px, g, pz);
    const a = Math.round(p.dot(right) / texel) * texel;
    const b = Math.round(p.dot(up2) / texel) * texel;
    const along = p.dot(f);
    this.sunTarget.position.copy(right).multiplyScalar(a)
      .addScaledVector(up2, b).addScaledVector(f, along);
    this.sun.position.copy(this.sunTarget.position).addScaledVector(f, 170);
  }

  update(px, pz, budgetMs) {
    this.enqueue(px, pz);
    this.build(budgetMs);
    const pcx = Math.floor(px / CHUNK), pcz = Math.floor(pz / CHUNK);
    this.tendDetail(pcx, pcz);
    this.tendGrass(pcx, pcz);
    this.lawn.update(px, pz, 2);
    this.tendWater(px, pz);
    for (const p in this.pool) this.pool[p].flush();
  }
}

/* the four ground weights, read back for the sound underfoot */
const _splat = [0, 0, 0];
const _tmpA = new THREE.Vector3();
const _tmpB = new THREE.Vector3();
const _tmpC = new THREE.Vector3();
export {
  DAY, Lawn, World, LEAF_TINT, BLADE_TINT,
};
