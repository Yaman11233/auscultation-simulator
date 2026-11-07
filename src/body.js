/* =====================================================================
   BODY — procedural manikin as a signed distance field (SDF)
   Pure math (no Three.js): SDF primitives, smooth-min union, sculpted landmarks,
   marching-cubes polygonization, ray marching, and the 2D↔3D surface mapping.

   World units: centimetres. +Y = up (head), +Z = anterior, +X = PATIENT'S LEFT.
   2D SVG units (8 units/cm, midline x = 300) convert as  y = (500 − y2d)/8.
   ===================================================================== */
import { edgeTable, triTable } from 'three/examples/jsm/objects/MarchingCubes.js';

const sqrt = Math.sqrt, abs = Math.abs, max = Math.max, min = Math.min, exp = Math.exp;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ---------- primitives ---------- */
function sdEll(px, py, pz, q) { // q = [cx,cy,cz, rx,ry,rz]
  const x = px - q[0], y = py - q[1], z = pz - q[2];
  const ax = x / q[3], ay = y / q[4], az = z / q[5];
  const k0 = sqrt(ax * ax + ay * ay + az * az);
  const bx = ax / q[3], by = ay / q[4], bz = az / q[5];
  const k1 = sqrt(bx * bx + by * by + bz * bz);
  return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -min(q[3], q[4], q[5]);
}
// Round cone (capsule with two radii) — after Inigo Quilez. q=[ax,ay,az,bx,by,bz,r1,r2]
function sdRoundCone(px, py, pz, q) {
  const bax = q[3] - q[0], bay = q[4] - q[1], baz = q[5] - q[2];
  const l2 = bax * bax + bay * bay + baz * baz, rr = q[6] - q[7], a2 = l2 - rr * rr, il2 = 1 / l2;
  const pax = px - q[0], pay = py - q[1], paz = pz - q[2];
  const y = pax * bax + pay * bay + paz * baz, z = y - l2;
  const wx = pax * l2 - bax * y, wy = pay * l2 - bay * y, wz = paz * l2 - baz * y;
  const x2 = wx * wx + wy * wy + wz * wz, y2 = y * y * l2, z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - q[7];
  if (Math.sign(y) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - q[6];
  return (sqrt(x2 * a2 * il2) + y * rr) * il2 - q[6];
}
function smin(a, b, k) { const h = max(k - abs(a - b), 0) / k; return min(a, b) - h * h * k * 0.25; }
function smax(a, b, k) { return -smin(-a, -b, k); }

/* ---------- body definition (data) ---------- */
const E = (cx, cy, cz, rx, ry, rz) => ({ t: 'e', q: [cx, cy, cz, rx, ry, rz] });
const RC = (a, b, r1, r2) => ({ t: 'c', q: [...a, ...b, r1, r2] });
const mirrorX = p => (p.t === 'e' ? E(-p.q[0], p.q[1], p.q[2], p.q[3], p.q[4], p.q[5]) : RC([-p.q[0], p.q[1], p.q[2]], [-p.q[3], p.q[4], p.q[5]], p.q[6], p.q[7]));

// Torso core (also used for the 2D↔3D mapping): neck, thorax, abdomen, pelvis, thighs
const TORSO = [
  RC([0, 29.5, -0.6], [0, 42, 0.4], 5.3, 5.0),          // neck
  E(0, 25.2, -0.6, 17.6, 6.2, 8.6),                     // shoulder girdle / upper thorax
  E(0, 17, 0.4, 15.4, 11.5, 10.6),                      // chest
  E(0, 7, 0.4, 14.3, 9.5, 10.1),                        // lower rib cage
  E(0, -4, 0.8, 13.8, 10, 9.6),                         // waist / abdomen
  E(0, -12, 2.6, 12.2, 7, 7.8),                         // lower abdomen
  E(0, -16.5, -0.2, 15.0, 9, 10.2),                     // pelvis
  E(6.6, -22, -4.6, 7.6, 8, 7.2), E(-6.6, -22, -4.6, 7.6, 8, 7.2), // gluteal
  { ...RC([8.6, -24, 0.3], [8.4, -60, 0.8], 7.8, 6.4), k: 3 }, { ...RC([-8.6, -24, 0.3], [-8.4, -60, 0.8], 7.8, 6.4), k: 3 }, // thighs (less blending → visible gap)
  RC([0, 31.8, -1.6], [15.5, 29.6, -1.4], 3.9, 3.6), RC([0, 31.8, -1.6], [-15.5, 29.6, -1.4], 3.9, 3.6), // trapezius
  E(19.2, 26.4, -0.3, 4.9, 5.9, 5.3), E(-19.2, 26.4, -0.3, 4.9, 5.9, 5.3), // deltoids
];
const HEAD = [
  E(0, 51, 0.5, 7.8, 10.3, 9.6),    // cranium
  E(0, 44.6, 2.3, 5.7, 4.9, 6.7),   // jaw
  E(0, 50.4, 9.8, 1.15, 2.3, 1.45), // nose (stylized)
  E(7.9, 50.5, 0, 1.2, 2.6, 1.8), E(-7.9, 50.5, 0, 1.2, 2.6, 1.8), // ears
];
const ARM_L = [
  RC([19.6, 25, -0.5], [27.6, -1.5, 0.2], 4.6, 3.6), // upper arm (abducted ≈ 17°)
  RC([27.6, -1.5, 0.2], [33, -24, 2.2], 3.6, 2.6),   // forearm
  E(34.5, -30.6, 2.6, 2.0, 5.7, 4.1),                // hand
];
const ARM_R = ARM_L.map(mirrorX);
const K = { torso: 5, head: 2.6, headNeck: 3, arm: 1.6, armBody: 2.2, nose: 1.2 };

function evalPrim(p, x, y, z) { return p.t === 'e' ? sdEll(x, y, z, p.q) : sdRoundCone(x, y, z, p.q); }
function groupDist(list, k, x, y, z) {
  let d = evalPrim(list[0], x, y, z);
  for (let i = 1; i < list.length; i++) d = smin(d, evalPrim(list[i], x, y, z), list[i].k || k);
  return d;
}
function bounds(list, pad) {
  const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (const p of list) {
    const q = p.q;
    const pts = p.t === 'e' ? [[q[0] - q[3], q[1] - q[4], q[2] - q[5]], [q[0] + q[3], q[1] + q[4], q[2] + q[5]]]
      : [[q[0] - q[6], q[1] - q[6], q[2] - q[6]], [q[0] + q[6], q[1] + q[6], q[2] + q[6]], [q[3] - q[7], q[4] - q[7], q[5] - q[7]], [q[3] + q[7], q[4] + q[7], q[5] + q[7]]];
    for (const v of pts) for (let i = 0; i < 3; i++) { b[i] = min(b[i], v[i] - pad); b[i + 3] = max(b[i + 3], v[i] + pad); }
  }
  return b;
}
function boxDist(b, x, y, z) {
  const dx = max(b[0] - x, 0, x - b[3]), dy = max(b[1] - y, 0, y - b[4]), dz = max(b[2] - z, 0, z - b[5]);
  return sqrt(dx * dx + dy * dy + dz * dz);
}
const BH = bounds(HEAD, 2), BL = bounds(ARM_L, 2), BR = bounds(ARM_R, 2);
function headD(x, y, z) {
  const bd = boxDist(BH, x, y, z); if (bd > 3) return bd;
  let d = groupDist(HEAD.slice(0, 2), K.head, x, y, z);
  d = smin(d, evalPrim(HEAD[2], x, y, z), K.nose);
  d = smin(d, evalPrim(HEAD[3], x, y, z), 1); d = smin(d, evalPrim(HEAD[4], x, y, z), 1);
  return d;
}
function armD(list, B, x, y, z) { const bd = boxDist(B, x, y, z); return bd > 3 ? bd : groupDist(list, K.arm, x, y, z); }
const CUT_Y = -58.5;

/** Torso core only (no head, arms or landmarks) — basis of the 2D↔3D mapping. */
export function sdfCore(x, y, z) { return smax(groupDist(TORSO, K.torso, x, y, z), CUT_Y - y, 1); }

function sdfBase(x, y, z) {
  let d = groupDist(TORSO, K.torso, x, y, z);
  d = smin(d, headD(x, y, z), K.headNeck);
  d = smin(d, armD(ARM_L, BL, x, y, z), K.armBody);
  d = smin(d, armD(ARM_R, BR, x, y, z), K.armBody);
  return smax(d, CUT_Y - y, 1);
}

/* ---------- sculpted landmarks (bumps / grooves along surface curves) ---------- */
let BUMPS = []; // {pts:[[x,y,z]...], a (cm, + = raised), s (sigma cm), box}
function segDist2(px, py, pz, a, b) {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
  const t = clamp(((px - a[0]) * abx + (py - a[1]) * aby + (pz - a[2]) * abz) / (abx * abx + aby * aby + abz * abz || 1), 0, 1);
  const dx = px - a[0] - abx * t, dy = py - a[1] - aby * t, dz = pz - a[2] - abz * t;
  return dx * dx + dy * dy + dz * dz;
}
function bumpSum(x, y, z) {
  let s = 0;
  for (const b of BUMPS) {
    const bx = b.box; if (x < bx[0] || x > bx[3] || y < bx[1] || y > bx[4] || z < bx[2] || z > bx[5]) continue;
    let m = 1e9;
    if (b.pts.length === 1) { const p = b.pts[0]; m = (x - p[0]) ** 2 + (y - p[1]) ** 2 + (z - p[2]) ** 2; }
    else for (let i = 0; i + 1 < b.pts.length; i++) m = min(m, segDist2(x, y, z, b.pts[i], b.pts[i + 1]));
    s += b.a * exp(-m / (2 * b.s * b.s));
  }
  return s;
}

/** Full body SDF (what is rendered, ray-cast and touched). */
export function sdf(x, y, z) { return sdfBase(x, y, z) - bumpSum(x, y, z); }

export function gradient(f, x, y, z, e = 0.2) {
  const gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e);
  const l = sqrt(gx * gx + gy * gy + gz * gz) || 1;
  return [gx / l, gy / l, gz / l];
}
export function regionAt(x, y, z) {
  const t = groupDist(TORSO, K.torso, x, y, z), h = headD(x, y, z), l = armD(ARM_L, BL, x, y, z), r = armD(ARM_R, BR, x, y, z);
  const m = min(t, h, l, r);
  return m === h ? 'head' : m === l ? 'armL' : m === r ? 'armR' : 'torso';
}

/* ---------- ray marching ---------- */
export const BOX = [-40, -60, -15.5, 40, 63, 14.5];
/** Sphere-trace ray o + t·d (d normalised). Returns t of first hit or -1. */
export function raymarch(o, d, f = sdf, tMax = 2000) {
  // clip to body box
  let t0 = 0, t1 = tMax;
  for (let i = 0; i < 3; i++) {
    const inv = 1 / (d[i] || 1e-12); let ta = (BOX[i] - o[i]) * inv, tb = (BOX[i + 3] - o[i]) * inv;
    if (ta > tb) [ta, tb] = [tb, ta]; t0 = max(t0, ta); t1 = min(t1, tb); if (t0 > t1) return -1;
  }
  let t = t0;
  for (let i = 0; i < 160 && t <= t1; i++) {
    const h = f(o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t);
    if (h < 0.015) return t;
    t += h * 0.85;
  }
  return -1;
}

/* ---------- 2D ↔ 3D mapping (cylindrical about the torso axis) ----------
   A 2D front-view point at horizontal offset u from the midline maps to the torso surface
   in the direction θ = asin(u / halfWidth(y)) from the anterior axis (back view: π − θ).
   So points at the 2D silhouette edge land on the lateral (mid-axillary) surface.        */
const Y0 = -60, YS = 0.5, NY = Math.round((63 - Y0) / YS) + 1;
const ZC = new Float32Array(NY), HW = new Float32Array(NY), HDF = new Float32Array(NY), HDB = new Float32Array(NY);
function tableAt(T, y) { const f = clamp((y - Y0) / YS, 0, NY - 1), i = Math.floor(f), j = min(i + 1, NY - 1); return T[i] + (T[j] - T[i]) * (f - i); }
export const zc = y => tableAt(ZC, y), halfWidth = y => tableAt(HW, y), halfDepth = (y, front) => tableAt(front ? HDF : HDB, y);
function buildTables() {
  let lastZ = 0, lastW = 10, lastF = 10, lastB = 10;
  for (let i = 0; i < NY; i++) {
    const y = Y0 + i * YS;
    const tf = raymarch([0, y, 60], [0, 0, -1], sdfCore), tb = raymarch([0, y, -60], [0, 0, 1], sdfCore);
    if (tf > 0 && tb > 0) { lastZ = ((60 - tf) + (-60 + tb)) / 2; lastF = max(3, 60 - tf - lastZ); lastB = max(3, lastZ - (-60 + tb)); }
    ZC[i] = lastZ; HDF[i] = lastF; HDB[i] = lastB;
    const ts = raymarch([60, y, lastZ], [-1, 0, 0], sdfCore);
    if (ts > 0) lastW = max(3, 60 - ts);
    HW[i] = lastW;
  }
}
const toCm = (view, x2d, y2d) => ({ y: (500 - y2d) / 8, u: (view === 'front' ? x2d - 300 : 300 - x2d) / 8 });

/** Project a 2D point (front or back view) onto the 3D surface. Returns {x,y,z,n:[...]} */
export function to3D(view, x2d, y2d, f = sdf) {
  const { y, u } = toCm(view, x2d, y2d);
  const s = clamp(u / halfWidth(y), -0.985, 0.985), c = sqrt(1 - s * s) * (view === 'front' ? 1 : -1);
  // elliptical direction: on an elliptic cross-section the hit keeps x = u exactly for anterior points
  const a = halfWidth(y), b = halfDepth(y, c > 0), L = Math.hypot(a * s, b * c);
  const ex = a * s / L, ez = b * c / L, zc0 = zc(y), o = [ex * 90, y, zc0 + ez * 90], d = [-ex, 0, -ez];
  let t = raymarch(o, d, sdfCore);
  if (t < 0) t = raymarch(o, d, f);
  let p = t > 0 ? [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t] : [s * 10, y, zc0 + c * 10];
  for (let k = 0; k < 4; k++) { const h = f(...p), n = gradient(f, ...p); p = [p[0] - n[0] * h, p[1] - n[1] * h, p[2] - n[2] * h]; }
  return { x: p[0], y: p[1], z: p[2], n: gradient(f, ...p) };
}
/** Inverse mapping: 3D point → 2D coordinates in front and back texture space + blend weights. */
export function to2D(x, y, z) {
  const dz = z - zc(y), a = halfWidth(y), b = halfDepth(y, dz >= 0), X = x / a, Z = dz / b, r = sqrt(X * X + Z * Z) || 1, s = X / r, c = Z / r, hw = a * 8;
  const y2d = 500 - y * 8;
  const sm = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  return { fx: 300 + hw * s, bx: 300 - hw * s, y2d, wf: sm(-0.06, 0.22, c), wb: sm(-0.06, 0.22, -c), cos: c };
}

/* ---------- landmarks defined in 2D (same coordinates as the SVG drawing) ---------- */
function addBump(view, pts2d, a, s) {
  const pts = pts2d.map(([x, y]) => { const p = to3D(view, x, y, sdfBase); return [p.x, p.y, p.z]; });
  const box = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9], pad = s * 3.5;
  for (const p of pts) for (let i = 0; i < 3; i++) { box[i] = min(box[i], p[i] - pad); box[i + 3] = max(box[i + 3], p[i] + pad); }
  BUMPS.push({ pts, a, s, box });
}
function buildLandmarks() {
  BUMPS = [];
  const M = pts => pts.map(([x, y]) => [600 - x, y]);
  const clav = [[306, 250], [340, 249], [378, 256], [412, 257], [440, 260], [456, 266]];
  addBump('front', clav, 0.38, 0.75); addBump('front', M(clav), 0.38, 0.75);          // clavicles
  addBump('front', [[300, 247]], -0.75, 1.0);                                          // jugular (suprasternal) notch
  addBump('front', [[300, 262], [300, 395]], -0.2, 1.4);                               // sternal groove
  addBump('front', [[285, 292], [315, 292]], 0.18, 0.45);                              // sternal angle (angle of Louis)
  const cm = [[300, 405], [322, 424], [345, 441], [382, 462], [410, 476], [432, 488]];
  addBump('front', cm, 0.28, 0.9); addBump('front', M(cm), 0.28, 0.9);                // costal margins
  addBump('front', [[382, 362]], 0.12, 1.3); addBump('front', [[218, 362]], 0.12, 1.3); // areolae
  addBump('front', [[382, 362]], 0.3, 0.45); addBump('front', [[218, 362]], 0.3, 0.45); // nipples
  addBump('front', [[300, 566]], -0.65, 0.55);                                         // umbilicus
  const pec = [[310, 392], [350, 408], [395, 398], [430, 356]];
  addBump('front', pec, 0.18, 1.6); addBump('front', M(pec), 0.18, 1.6);              // lower pectoral border
  // back
  addBump('back', [[300, 240], [300, 640]], -0.4, 1.0);                                // spinal groove
  addBump('back', [[300, 232]], 0.45, 0.8);                                            // C7 (vertebra prominens)
  const scapM = [[248, 258], [244, 300], [234, 345], [220, 374]], scapL = [[220, 374], [196, 345], [178, 318], [166, 284]];
  const spine = [[246, 298], [205, 285], [162, 270]];
  for (const s of [scapM, scapL, spine]) { addBump('back', s, 0.34, 1.0); addBump('back', M(s), 0.34, 1.0); } // scapulae
  addBump('back', [[300, 640], [300, 742]], -0.35, 1.0);                               // natal cleft
}

/* ---------- marching cubes ---------- */
const EDGES = [[0, 0, 0, 0], [1, 0, 0, 1], [0, 1, 0, 0], [0, 0, 0, 1], [0, 0, 1, 0], [1, 0, 1, 1], [0, 1, 1, 0], [0, 0, 1, 1], [0, 0, 0, 2], [1, 0, 0, 2], [1, 1, 0, 2], [0, 1, 0, 2]];
const CORNERS = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
/** Polygonize the full SDF into ONE indexed mesh with gradient normals. */
export function polygonize(cell = 0.9) {
  const [x0, y0, z0, x1, y1, z1] = BOX;
  const nx = Math.ceil((x1 - x0) / cell) + 1, ny = Math.ceil((y1 - y0) / cell) + 1, nz = Math.ceil((z1 - z0) / cell) + 1;
  const sy = nx, sz = nx * ny, F = new Float32Array(nx * ny * nz);
  for (let k = 0; k < nz; k++) { const z = z0 + k * cell;
    for (let j = 0; j < ny; j++) { const y = y0 + j * cell;
      for (let i = 0; i < nx; i++) F[i + j * sy + k * sz] = sdf(x0 + i * cell, y, z); } }
  const vmap = new Int32Array(nx * ny * nz * 3).fill(-1);
  const pos = [], idx = [];
  const val = new Float32Array(8), ev = new Int32Array(12);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const q = i + j * sy + k * sz; let ci = 0;
    for (let c = 0; c < 8; c++) { const o = CORNERS[c]; val[c] = F[q + o[0] + o[1] * sy + o[2] * sz]; if (val[c] < 0) ci |= 1 << c; }
    const bits = edgeTable[ci]; if (!bits) continue;
    for (let e = 0; e < 12; e++) {
      if (!(bits & (1 << e))) continue;
      const E_ = EDGES[e], gi = q + E_[0] + E_[1] * sy + E_[2] * sz, key = gi * 3 + E_[3];
      if (vmap[key] < 0) {
        const a = F[gi], b = F[gi + (E_[3] === 0 ? 1 : E_[3] === 1 ? sy : sz)], t = a / (a - b);
        const px = x0 + (i + E_[0]) * cell, py = y0 + (j + E_[1]) * cell, pz = z0 + (k + E_[2]) * cell;
        vmap[key] = pos.length / 3;
        pos.push(px + (E_[3] === 0 ? t * cell : 0), py + (E_[3] === 1 ? t * cell : 0), pz + (E_[3] === 2 ? t * cell : 0));
      }
      ev[e] = vmap[key];
    }
    const o = ci << 4;
    for (let t = 0; triTable[o + t] !== -1; t += 3) idx.push(ev[triTable[o + t]], ev[triTable[o + t + 1]], ev[triTable[o + t + 2]]);
  }
  const P = new Float32Array(pos), I = new Uint32Array(idx), N = new Float32Array(P.length);
  for (let v = 0; v < P.length; v += 3) { const n = gradient(sdf, P[v], P[v + 1], P[v + 2], 0.25); N[v] = n[0]; N[v + 1] = n[1]; N[v + 2] = n[2]; }
  // winding: make triangle normals agree with the SDF gradient
  let agree = 0;
  for (let t = 0; t < min(I.length, 3000); t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    agree += (uy * vz - uz * vy) * N[a] + (uz * vx - ux * vz) * N[a + 1] + (ux * vy - uy * vx) * N[a + 2] > 0 ? 1 : -1;
  }
  if (agree < 0) for (let t = 0; t < I.length; t += 3) { const s = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = s; }
  return { positions: P, normals: N, indices: I };
}

/* ---------- per-vertex attributes: decal UVs, masks, breathing weight, region ---------- */
export function vertexAttributes(P, N) {
  const n = P.length / 3, uvF = new Float32Array(n * 2), uvB = new Float32Array(n * 2), mask = new Float32Array(n * 3), region = new Uint8Array(n);
  const RID = { torso: 0, head: 1, armL: 2, armR: 3 };
  for (let v = 0; v < n; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2], r = regionAt(x, y, z), m = to2D(x, y, z);
    region[v] = RID[r];
    uvF[v * 2] = m.fx / 600; uvF[v * 2 + 1] = 1 - m.y2d / 990; uvB[v * 2] = m.bx / 600; uvB[v * 2 + 1] = 1 - m.y2d / 990;
    const torso = r === 'torso' && y < 33 ? 1 : 0;
    mask[v * 3] = m.wf * torso; mask[v * 3 + 1] = m.wb * torso;
    // breathing: chest expands most, abdomen a little, back hardly
    const chest = exp(-(((y - 15) / 11) ** 2)), abd = 0.55 * exp(-(((y + 3) / 7) ** 2)) * max(0, m.cos);
    mask[v * 3 + 2] = torso * (chest * (0.55 + 0.45 * max(0, m.cos)) + abd);
  }
  return { uvF, uvB, mask, region };
}

/* ---------- project the tested 2D spatial model onto the 3D surface ---------- */
export function projectSpatialModel(SITES, MAPS) {
  const SITES3 = {}, MAPS3 = {};
  for (const [k, s] of Object.entries(SITES)) { const p = to3D(s.view, s.x, s.y); SITES3[k] = { ...s, p: [p.x, p.y, p.z], n: p.n }; }
  // sigma: 2D units → cm, scaled by the local stretch of the 2D→3D mapping. The Gaussian is anisotropic:
  // along the horizontal surface tangent (th) σh = σ·kh, otherwise σv = σ·kv. kh ≈ 1 anteriorly and grows
  // towards the lateral chest wall, where the 2D drawing is foreshortened — so the tested falloff is preserved.
  for (const [name, lobes] of Object.entries(MAPS)) MAPS3[name] = lobes.map(l => {
    const p = to3D(l.view, l.x, l.y), a = to3D(l.view, l.x - 4, l.y), b = to3D(l.view, l.x + 4, l.y), c = to3D(l.view, l.x, l.y - 4), d = to3D(l.view, l.x, l.y + 4);
    const hx = b.x - a.x, hy = b.y - a.y, hz = b.z - a.z, kh = Math.hypot(hx, hy, hz), kv = Math.hypot(d.x - c.x, d.y - c.y, d.z - c.z);
    return { x: p.x, y: p.y, z: p.z, w: l.w, s: l.s / 8, sh: l.s / 8 * clamp(kh, 0.8, 3), sv: l.s / 8 * clamp(kv, 0.8, 3), th: [hx / kh, hy / kh, hz / kh] };
  });
  return { SITES3, MAPS3 };
}
/** Same formula as the 2D model, I = 1 − Π(1 − w·g); g is a Gaussian of the 3D Euclidean offset (cm),
    split into its component along the lobe's horizontal surface tangent (σh) and the rest (σv). */
export function mapAt3(lobes, p) {
  let prod = 1;
  for (const l of lobes) {
    const dx = p[0] - l.x, dy = p[1] - l.y, dz = p[2] - l.z, h = dx * l.th[0] + dy * l.th[1] + dz * l.th[2], r2 = dx * dx + dy * dy + dz * dz - h * h;
    prod *= 1 - l.w * exp(-(h * h) / (2 * l.sh * l.sh) - max(0, r2) / (2 * l.sv * l.sv));
  }
  return 1 - prod;
}

let built = false;
/** Build mapping tables and sculpted landmarks (must run before sdf()/to3D() are used). */
export function initBody() { if (built) return; buildTables(); buildLandmarks(); built = true; }
