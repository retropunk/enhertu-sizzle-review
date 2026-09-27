/* =====================================================================
   3D course for frames 6–21 (Three.js)
   hooped channel → funnel → zig-zag pathway → peg wall → corkscrew → ramp →
   tunnel (10) → [cut in the dark] → exit ring, winding path (11) → arched tunnel (12)
   → [cut in the dark] → pipe, arch bridge (13) → ramp (14) → opening (15)
   → [cut under the 2D pill wipe] → snake track (16) → floating discs (17) → swirl (18)
   → [match cut on the sphere filling the frame] → U-turn track (19) → marble run into a hole (20)
   → [cut in the dark of the hole] → path among shifting shapes (21) → drop through a gap, behind the
   eBC screen (22) → loop-the-loop (23) → hump over an arch, into a dark doorway (24)
   → [cut in the dark] → out of an arched tunnel (25) → [cut under a right-to-left pill wipe] → ramp (27)
   → [cut under the full-screen tail art] → across the copy (28) → widening ramp out of a ring (29–30)
   → [match cut on the sphere filling the frame] → shapes split, logo revealed (31).
   In 2D mode (frames 6–31 all have 2D versions) this layer shows only for the 3D intro.
   Everything is a pure function of timeline time t, so it scrubs and
   renders frame-accurately like the rest of the piece.
   Uses globals from the main script: gsap, flowAmt, hex2rgb, PAL, DEEP, dist, rnd, osc.
   ===================================================================== */
import * as THREE from './vendor/three.module.js';   // three.js 0.169.0, kept locally

const T_IN = 20.15, T_OUT = END - D28;   // window this layer owns in 3D mode (frame 6 → end)
// NOTE (2026-09-26): times from frame 28's sphere entry on are authored D28 = 1 s earlier than index.html's (which shifts
// its own tweens with tl.shiftChildren), because the user wanted the sphere in sooner. Frames before that are unchanged.
const T_CUT = 44.06;                   // unseen camera cut inside the frame-10 tunnel
const T_CUT2 = 54.95;                  // unseen cut inside the frame-12 arched tunnel
const T_CUT3 = 69.5;                   // cut while the 2D pill wipe covers the frame (15 → 16)
const T_CUT4 = 85.9;                   // match cut: the sphere fills the frame (18 → 19)
const T_CUT5 = 95.9;                   // cut inside the dark hole (20 → 21)
const T_CUT6 = 117.8;                  // cut inside the dark doorway (24 → 25); was 118.2 with a ~1.3 s dark hold (user, 2026-09-26)
const T_CUT7 = 123.3;                  // cut under the right-to-left pill wipe (25 → 27)
const T_CUT8 = 128.2;                  // cut while the tail art fills the frame (27 → 28)
const T_CUT9 = 142.0;                  // match cut: the sphere fills the frame (30 → 31); frames 29–30 were trimmed to 3.5 s each (2026-09-26)
const T_2D = Infinity;                 // every course frame (6–31) has a 2D version now, so in 2D mode this layer shows only for the 3D intro
const R = 1;                           // sphere radius (world units)

const wrap = document.getElementById('course3d');
const canvas = document.getElementById('c3d');
// logarithmic depth: even precision near and far, so surfaces a few hundredths apart don't flicker in the distance
// (the custom shaders below include three's logdepthbuf chunks for it)
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(1);
{ // the exporter asks for 4K with ?scale=2: the drawing buffer grows, the canvas stays 1920×1080 in stage px
  const k = Math.min(3, Math.max(1, +new URLSearchParams(location.search).get('scale') || 1));
  renderer.setSize(1920 * k, 1080 * k, false);
}
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;   // shaders already output display sRGB
renderer.localClippingEnabled = true;                      // the frame 4 words rise out of the shelf
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.3, 500);

/* ---------------- flat "illustration" materials ---------------- */
const v3 = rgb => new THREE.Vector3(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
const hexV = h => v3(hex2rgb(h));
function partnerOf(hex, seed) {            // same neighbour-in-palette rule as the 2D gradients
  const base = hex2rgb(hex);
  if (Math.max(...base) < 140) return v3(DEEP);
  let best = 0; PAL.forEach((c, k) => { if (dist(c, base) < dist(PAL[best], base)) best = k; });
  const k = best + (rnd(seed) < 0.5 ? -1 : 1);            // one direction per material (see mat), held at the ends
  return v3(PAL[k < 0 || k >= PAL.length ? best : k]);
}
const GV = `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vW; varying vec3 vN;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}`;
const GF = `
uniform vec3 c0, c1, c2, p0, p1, p2, axis, rc;
uniform float lo, hi, rad, t, flow, ph, per, shadeK, op, spd, wild, walk, fold;
uniform vec3 bi, kph, pal[6];
varying vec3 vW; varying vec3 vN;
#include <logdepthbuf_pars_fragment>
vec3 palAt(float x) {                                                  // brand palette, held at both ends (no bounce-back bands)
  x = clamp(x, 0.0, 5.0);
  vec3 c = pal[0];
  for (int i = 0; i < 5; i++) c = mix(c, pal[i + 1], clamp(x - float(i), 0.0, 1.0));
  return c;
}
float easeEnds(float r) {                                              // soft fold: the ramp eases flat into both ends
  const float z = 0.25;
  float g = r < z ? r * r / (2.0 * z) : r > 1.0 - z ? 1.0 - z - (1.0 - r) * (1.0 - r) / (2.0 * z) : r - z * 0.5;
  return g / (1.0 - z);
}
vec3 walkTo(vec3 col, float b, float tt, float k) {                    // past Bold: bright stops travel along the palette
  if (wild <= 0.0 || b < 0.0) return col;
  return mix(col, palAt(b + walk * (sin(tt / (per * 0.8) * 6.2832 + ph + k) - sin(ph + k))), wild);
}
void main() {
  float tt = t * spd;                                                  // past Bold everything runs faster
  float g = rad > 0.0 ? length(vW - rc) / rad : (dot(vW, axis) - lo) / (hi - lo);
  float dg = min(flow, 1.6) * 0.14 * (sin(tt / per * 6.2832 + ph) - sin(ph));   // drift distance stops growing past Bold
  g += dg;                                                             // gradient drifts through the shape
  g = 1.0 - abs(1.0 - mod(max(g, 0.0), 2.0));                          // reflect
  g = mix(g, easeEnds(g), fold * min(1.0, abs(dg) / 0.04));                   // …with a soft fold once it has moved (exact at rest)
  float s = sin(3.14159 * tt / (per * 0.8));
  float m = min(0.85, flow * 0.5 * s * s);                             // colour drifts to palette neighbour
  vec3 a = walkTo(mix(c0, p0, m), bi.x, tt, kph.x), b = walkTo(mix(c1, p1, m), bi.y, tt, kph.y), c = walkTo(mix(c2, p2, m), bi.z, tt, kph.z);
  vec3 col = g < 0.5 ? mix(a, b, g * 2.0) : mix(b, c, g * 2.0 - 1.0);
  vec3 n = normalize(vN);
  float shade = mix(1.0, 0.8 + 0.2 * n.y + 0.08 * n.z - 0.05 * n.x, shadeK);   // faces read as flat tones
  gl_FragColor = vec4(col * shade, op);
  #include <logdepthbuf_fragment>
}`;
const mats = [];
let mSeed = 0;
// shared by every material: gradient-flow speed, palette walk (see setFlow in the main script)
const FXU = { fold: { value: FOLD_ON }, spd: { value: 1 }, wild: { value: 0 }, walk: { value: 0 }, pal: { value: PAL.map(v3) } };
const palIdx = hex => { const base = hex2rgb(hex); if (Math.max(...base) < 140) return -1; let best = 0; PAL.forEach((c, k) => { if (dist(c, base) < dist(PAL[best], base)) best = k; }); return best; };
function mat(cols, o = {}) {
  const i = mSeed++;
  const c = cols.length === 1 ? [cols[0], cols[0], cols[0]] : cols.length === 2 ? [cols[0], cols[0], cols[1]] : cols;
  // a repeated colour is one colour: same partner and same walk phase, or a flat shape would split into stripes
  const uq = c.map((h, j) => c.indexOf(h));
  const u = {
    c0: { value: hexV(c[0]) }, c1: { value: hexV(c[1]) }, c2: { value: hexV(c[2]) },
    p0: { value: partnerOf(c[0], i * 3) }, p1: { value: partnerOf(c[1], i * 3) }, p2: { value: partnerOf(c[2], i * 3) },
    kph: { value: new THREE.Vector3(...uq.map(j => 0.25 * j)) },
    axis: { value: new THREE.Vector3(...(o.axis || [0, 1, 0])).normalize() }, lo: { value: o.lo ?? -1 }, hi: { value: o.hi ?? 1 },
    rc: { value: new THREE.Vector3(...(o.rc || [0, 0, 0])) }, rad: { value: o.rad ?? 0 },
    t: { value: 0 }, flow: { value: 1 }, ph: { value: rnd(i + 7) * 6.28 }, per: { value: 7 + rnd(i + 3) * 6 },
    shadeK: { value: o.flat ? 0 : 1 }, op: { value: o.op ?? 1 },
    bi: { value: new THREE.Vector3(palIdx(c[0]), palIdx(c[1]), palIdx(c[2])) }, ...FXU,
  };
  const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: GV, fragmentShader: GF, transparent: (o.op ?? 1) < 1, side: o.side ?? THREE.FrontSide });
  mats.push(m);
  return m;
}

/* ---------------- geometry helpers ---------------- */
function add(geo, m, pos = [0, 0, 0], rot = [0, 0, 0], parent = scene) {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(...pos); mesh.rotation.set(...rot);
  parent.add(mesh);
  return mesh;
}
function rr(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0);
  s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, 1.5 * Math.PI);
  return s;
}
function withHole(outer, inner) { const p = new THREE.Path(); p.setFromPoints(inner.getPoints(64)); outer.holes.push(p); return outer; }
function ring(ro, ri) { const s = new THREE.Shape(); s.absarc(0, 0, ro, 0, Math.PI * 2, false); const h = new THREE.Path(); h.absarc(0, 0, ri, 0, Math.PI * 2, true); s.holes.push(h); return s; }
function disc(r) { const s = new THREE.Shape(); s.absarc(0, 0, r, 0, Math.PI * 2, false); return s; }
function arch(w, h, t) {                     // U turned upside down (∩), open at the bottom
  const s = new THREE.Shape(), r = w / 2, ri = r - t, cy = h - r;
  s.moveTo(-r, 0); s.lineTo(-r, cy); s.absarc(0, cy, r, Math.PI, 0, true); s.lineTo(r, 0);
  s.lineTo(ri, 0); s.lineTo(ri, cy); s.absarc(0, cy, ri, 0, Math.PI, false); s.lineTo(-ri, 0); s.lineTo(-r, 0);
  return s;
}
const ext = (shape, depth = 0.4) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 48 });
function basis(dir) {                         // x along dir, z horizontal, y "up" of the surface
  const ex = dir.clone().normalize();
  const ez = new THREE.Vector3().crossVectors(ex, new THREE.Vector3(0, 1, 0)).normalize();
  const ey = new THREE.Vector3().crossVectors(ez, ex).normalize();
  return new THREE.Matrix4().makeBasis(ex, ey, ez);
}
function slab(a, b, width, thick, m) {        // box whose TOP face runs from a to b
  const d = b.clone().sub(a), B = basis(d);
  const ey = new THREE.Vector3().setFromMatrixColumn(B, 1);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(d.length(), thick, width), m);
  mesh.quaternion.setFromRotationMatrix(B);
  mesh.position.copy(a).add(b).multiplyScalar(0.5).addScaledVector(ey, -thick / 2);
  scene.add(mesh);
  return mesh;
}
const surfN = tan => { const up = new THREE.Vector3(0, 1, 0); return up.sub(tan.clone().multiplyScalar(tan.dot(up))).normalize(); };
/* path the sphere rolls on: sweep a w × thick rectangle under a ball-centre curve
   (top face gets topM, sides/bottom get sideM).
   The surface rises very slightly along its length (lift + RISE·u, a few hundredths of a unit, invisible) so that where a
   wide path folds over itself on a tight turn, or a following path starts on top of it, the two layers never sit at
   exactly the same depth; equal depths flicker (z-fighting).
   On a bend tighter than the offset of an edge (the underside on a crest, the inner edge of a wide turn) that edge would
   run backwards and fold over itself (flickering cracks); each edge is held still until the path has turned past it,
   which makes a clean mitred corner instead. */
const RISE = 0.02;
function ribbon(curve, wFn, thick, topM, sideM, n = 240, lift = 0) {
  const up = new THREE.Vector3(0, 1, 0), rows = [], tans = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, p = curve.getPointAt(u), t = curve.getTangentAt(u);
    const r = new THREE.Vector3().crossVectors(t, up).normalize(), nn = new THREE.Vector3().crossVectors(r, t).normalize();
    const c = p.clone().addScaledVector(nn, -R + lift + RISE * u), w = wFn(u) / 2;
    const TL = c.clone().addScaledVector(r, -w), TR = c.clone().addScaledVector(r, w);
    rows.push([TL, TR, TR.clone().addScaledVector(nn, -thick), TL.clone().addScaledVector(nn, -thick)]); tans.push(t);
  }
  for (let k = 0; k < 4; k++) {                                   // no edge runs backwards (see above)
    let last = rows[0][k];
    for (let i = 1; i <= n; i++) {
      if (rows[i][k].clone().sub(last).dot(tans[i]) <= 1e-4) rows[i][k] = last.clone();
      else last = rows[i][k];
    }
  }
  const top = [], side = [], quad = (arr, a, b, c, d) => arr.push(...a.toArray(), ...b.toArray(), ...c.toArray(), ...c.toArray(), ...b.toArray(), ...d.toArray());
  for (let i = 0; i < n; i++) {
    const A = rows[i], B = rows[i + 1];
    quad(top, A[0], B[0], A[1], B[1]);
    quad(side, A[1], B[1], A[2], B[2]); quad(side, A[2], B[2], A[3], B[3]); quad(side, A[3], B[3], A[0], B[0]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...top, ...side], 3));
  g.addGroup(0, top.length / 3, 0); g.addGroup(top.length / 3, side.length / 3, 1);
  g.computeVertexNormals();
  const nrm = g.attributes.normal; for (let i = 0; i < nrm.array.length; i++) nrm.array[i] *= -1;   // winding faces inward; flip so tops shade as tops
  topM.side = sideM.side = THREE.DoubleSide;
  const m = new THREE.Mesh(g, [topM, sideM]); scene.add(m); return m;
}
function holedWall(w, h, cy, holeR) {         // flat wall with a round hole at the local origin
  const s = new THREE.Shape();
  s.moveTo(-w / 2, cy - h / 2); s.lineTo(w / 2, cy - h / 2); s.lineTo(w / 2, cy + h / 2); s.lineTo(-w / 2, cy + h / 2); s.lineTo(-w / 2, cy - h / 2);
  const hole = new THREE.Path(); hole.absarc(0, 0, holeR, 0, Math.PI * 2, true); s.holes.push(hole);
  return new THREE.ShapeGeometry(s, 64);
}
function tunnel(parent, radius, len, col = '#150632') {   // dark open cylinder going away along local -z
  const m = mat([col], { flat: true, side: THREE.DoubleSide });
  add(new THREE.CylinderGeometry(radius, radius, len, 48, 1, true), m, [0, 0, -len / 2], [Math.PI / 2, 0, 0], parent);
  add(new THREE.CircleGeometry(radius, 48), m, [0, 0, -len], [0, 0, 0], parent);
}
function archShape(w, h) {                    // filled ∩ (rect with a round top), base at y = 0
  const s = new THREE.Shape(), r = w / 2, cy = h - r;
  s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, cy); s.absarc(0, cy, r, 0, Math.PI, false); s.lineTo(-r, 0);
  return s;
}
function wallArch(w, h, cy, aw, ah) {         // flat wall with an arched doorway at the local origin
  const s = new THREE.Shape();
  s.moveTo(-w / 2, cy - h / 2); s.lineTo(w / 2, cy - h / 2); s.lineTo(w / 2, cy + h / 2); s.lineTo(-w / 2, cy + h / 2); s.lineTo(-w / 2, cy - h / 2);
  const hp = new THREE.Path(); hp.setFromPoints(archShape(aw, ah).getPoints(48)); s.holes.push(hp);
  return new THREE.ShapeGeometry(s, 48);
}
function halfRing(ro, ri) { const s = new THREE.Shape(); s.moveTo(ro, 0); s.absarc(0, 0, ro, 0, Math.PI, false); s.lineTo(-ri, 0); s.absarc(0, 0, ri, Math.PI, 0, true); s.lineTo(ro, 0); return s; }
function halfDisc(r) { const s = new THREE.Shape(); s.moveTo(r, 0); s.absarc(0, 0, r, 0, Math.PI, false); s.lineTo(r, 0); return s; }
const rooms = [];                              // dark rooms: the sphere dims to black as it rolls into one (see render3D)
function darkRoom(parent, w, h, d) {          // interior seen through a doorway: back faces only (returns the mesh)
  rooms.push({ parent, w, h, d });
  // floor 0.05 below the doorway sill: a path running in at sill height would otherwise lie exactly on it and flicker
  return add(new THREE.BoxGeometry(w, h, d), mat(['#150632'], { flat: true, side: THREE.BackSide }), [0, h / 2 - 0.05, -d / 2 - 0.05], [0, 0, 0], parent);
}
function arcFrac(curve, pt) { let best = 0, bd = 1e9; for (let i = 0; i <= 3000; i++) { const u = i / 3000, d = curve.getPointAt(u).distanceToSquared(pt); if (d < bd) { bd = d; best = u; } } return best; }
const win = (u, a, b, e = 0.02) => { const k = x => Math.min(1, Math.max(0, x)); return k((u - a + e) / e) * k((b + e - u) / e); };

// screen-space background gradient whose colours change per frame
const bgU = { a: { value: new THREE.Vector3() }, b: { value: new THREE.Vector3() }, c: { value: new THREE.Vector3() }, t: { value: 0 }, flow: { value: 1 }, spd: FXU.spd };
const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
  uniforms: bgU, depthWrite: false, depthTest: false,
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }',
  fragmentShader: `uniform vec3 a, b, c; uniform float t, flow, spd; varying vec2 vUv;
    void main() { float g = vUv.x * 0.75 + (1.0 - vUv.y) * 0.25 + flow * 0.08 * sin(t * 0.5 * spd);
      g = clamp(g, 0.0, 1.0); gl_FragColor = vec4(g < 0.5 ? mix(a, b, g * 2.0) : mix(b, c, g * 2.0 - 1.0), 1.0); }`,
}));
bg.frustumCulled = false; bg.renderOrder = -1; scene.add(bg);
const BGK = [
  [20.15, '#1a0a4a', '#220c5e', '#3f0aa8'], [22.9, '#1a0a4a', '#220c5e', '#3f0aa8'],
  [23.9, '#e8409a', '#b21fe0', '#6a10ff'], [29.3, '#e8409a', '#b21fe0', '#6a10ff'],
  [30.0, '#e0409a', '#b030e8', '#4b00ff'], [34.2, '#e0409a', '#b030e8', '#4b00ff'],
  [35.0, '#e020f0', '#a040e8', '#4b00ff'], [39.4, '#e020f0', '#a040e8', '#4b00ff'],
  [40.2, '#f07a2a', '#d0509a', '#7a2bf0'], [43.8, '#f07a2a', '#d0509a', '#7a2bf0'],
  [44.1, '#2a0c78', '#1e0c5a', '#2a0c70'], [49.4, '#2a0c78', '#1e0c5a', '#2a0c70'],
  [50.6, '#ff7a1a', '#c050a0', '#6a14ff'], [54.6, '#ff7a1a', '#c050a0', '#6a14ff'],
  [55.0, '#4b00ff', '#6a14ff', '#8a2bf0'], [59.0, '#4b00ff', '#6a14ff', '#8a2bf0'],
  [59.6, '#e0409a', '#ff7a1a', '#6a14ff'], [64.0, '#e0409a', '#ff7a1a', '#6a14ff'],
  [64.6, '#ff7a1a', '#6a14ff', '#4b00ff'], [69.4, '#ff7a1a', '#6a14ff', '#4b00ff'],
  [69.5, '#5a0bff', '#6a14ff', '#e0409a'], [74.8, '#5a0bff', '#6a14ff', '#e0409a'],
  [75.8, '#2a0c78', '#4b00ff', '#6a14ff'], [85.8, '#2a0c78', '#4b00ff', '#6a14ff'],
  [85.9, '#6a14ff', '#8a2bf0', '#e0409a'], [90.8, '#6a14ff', '#8a2bf0', '#e0409a'],
  [91.6, '#2a0c78', '#4b00ff', '#6a14ff'], [95.8, '#2a0c78', '#4b00ff', '#6a14ff'],
  [95.9, '#1e0b55', '#2a0c78', '#4b00ff'], [999, '#1e0b55', '#2a0c78', '#4b00ff'],
].map(([t, ...c]) => ({ t, c: c.map(hexV) }));
function bgAt(t) {
  const i = Math.max(0, BGK.findIndex((k, j) => j < BGK.length - 1 && t <= BGK[j + 1].t));
  const a = BGK[i], b = BGK[i + 1], u = Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))), k = u * u * (3 - 2 * u);
  ['a', 'b', 'c'].forEach((n, j) => bgU[n].value.copy(a.c[j]).lerp(b.c[j], k));
}

/* =====================================================================
   SECTION 0 · frame 6 · hooped channel at an odd angle → pipe bend → funnel → stem
   (sits above the start of the frame-7 pathway, so the fall lands on it)
   ===================================================================== */
const P6Y = 28, P6X0 = -64, BEND_X = -20.5, DROP_X = -17, MOUTH_Y = 21, AX_Y = P6Y + 0.35;
{
  const len = BEND_X - P6X0;
  const trough = add(new THREE.CylinderGeometry(1.35, 1.35, len, 32, 1, true, Math.PI, Math.PI),
    mat(['#4b00ff', '#e0508a', '#ff7a1a'], { axis: [1, 0, 0], lo: P6X0, hi: BEND_X, side: THREE.DoubleSide }), [(P6X0 + BEND_X) / 2, AX_Y, 0], [0, 0, Math.PI / 2]);
  const hoopM = mat(['#ff7a1a', '#ff4f7b', '#7b2bf9'], { axis: [1, 0, 0], lo: P6X0, hi: BEND_X });
  for (let x = P6X0 + 1; x < BEND_X - 0.5; x += 3) add(new THREE.TorusGeometry(1.8, 0.24, 12, 48), hoopM, [x, AX_Y, 0], [0, Math.PI / 2, 0]);
}
const bendPath = new THREE.CurvePath();
bendPath.add(new THREE.QuadraticBezierCurve3(new THREE.Vector3(BEND_X, AX_Y, 0), new THREE.Vector3(DROP_X, AX_Y, 0), new THREE.Vector3(DROP_X, AX_Y - 3.5, 0)));
bendPath.add(new THREE.LineCurve3(new THREE.Vector3(DROP_X, AX_Y - 3.5, 0), new THREE.Vector3(DROP_X, MOUTH_Y, 0)));
add(new THREE.TubeGeometry(bendPath, 80, 1.5, 32, false), mat(['#ff7a1a', '#e0508a', '#7b2bf9'], { axis: [1, -1, 0], lo: BEND_X - 30, hi: DROP_X - 16, side: THREE.DoubleSide }));
add(new THREE.TorusGeometry(1.5, 0.32, 12, 48), mat(['#ffa800'], { flat: true }), [DROP_X, MOUTH_Y, 0], [Math.PI / 2, 0, 0]);
add(new THREE.CylinderGeometry(4.2, 1.4, 3, 48, 1, true), mat(['#f07820', '#a03aa0', '#6a14ff'], { axis: [1, 0, 0], lo: DROP_X - 4, hi: DROP_X + 4, side: THREE.DoubleSide }), [DROP_X, 18.5, 0]);
add(new THREE.TorusGeometry(4.2, 0.3, 12, 64), mat(['#ff8a2a'], { flat: true }), [DROP_X, 20, 0], [Math.PI / 2, 0, 0]);
add(new THREE.CylinderGeometry(1.4, 1.4, 4, 32, 1, true), mat(['#f07820', '#6a14ff'], { axis: [1, 0, 0], lo: DROP_X - 1.4, hi: DROP_X + 1.4, side: THREE.DoubleSide }), [DROP_X, 15, 0]);
// frame-6 relief shapes floating behind (kept above the frame-7 view)
add(ext(arch(8, 13, 2.6), 0.5), mat(['#d10cf0', '#6a14ff'], { axis: [0, -1, 0], lo: -28, hi: -15 }), [-36, 15, -11.94]);   // just in front of the pill it overlaps (same depth flickers)
add(ext(disc(6), 0.5), mat(['#ff8a2a', '#b8406a', '#5a1070'], { axis: [0, -1, 0], lo: -34, hi: -22 }), [0, 28, -12]);
add(ext(rr(8, 3.6, 1.8), 0.5), mat(['#8a34c8'], { flat: true }), [2.5, 28, -11.4]);
add(ext(withHole(rr(10, 5.2, 2.6), rr(7, 2.2, 1.1)), 0.5), mat(['#220c5e', '#6a2a6a', '#c8801a'], { axis: [1, 0, 0], lo: -6, hi: 7 }), [2, 18.5, -12]);
add(ext(rr(12, 3.6, 1.8), 0.5), mat(['#7a14ff', '#9a50a0', '#e0b020'], { axis: [1, 0, 0], lo: -47, hi: -33 }), [-40, 16.5, -12]);
add(new THREE.BoxGeometry(3, 3, 0.5), mat(['#8a3a9a'], { flat: true }), [-40, 37, -12]);

/* =====================================================================
   SECTION A · frame 7 · elevated zig-zag pathway on diamond pillars
   ===================================================================== */
const J = [[-26, 3.8, 0], [-9, 2.2, 0], [-3, 0.2, -3.6], [3, -1.4, 0], [9, -3.4, -3.6], [15, -5.0, 0]].map(a => new THREE.Vector3(...a));
const slabM = mat(['#2a0c70', '#3a0fb8', '#5a14f0'], { axis: [1, 0, 0], lo: -20, hi: 16 });
const pillarM = mat(['#ff8a2a', '#e0508a', '#9a2bd0'], { axis: [0, -1, 0], lo: 3, hi: 26 });
for (let i = 0; i < J.length - 1; i++) slab(J[i], J[i + 1], 2.8, 0.7, slabM);
J.slice(1).forEach(p => {
  add(new THREE.BoxGeometry(3.1, 60, 3.1), pillarM, [p.x, p.y - 30 - 0.01, p.z], [0, Math.PI / 4, 0]);
  const capM = mat(['#5a14ff', '#8a3ae0', '#ff8a1a'], { rc: [p.x, p.y, p.z], rad: 2.2, flat: true });
  add(new THREE.BoxGeometry(3.1, 0.04, 3.1), capM, [p.x, p.y + 0.02, p.z], [0, Math.PI / 4, 0]);
});
// backdrop for frame 7 (flat relief shapes behind the path)
const bdA = -26;
add(ext(rr(52, 30, 15), 0.5), mat(['#8a18e8', '#5a0bff', '#4b00ff'], { axis: [1, -1, 0], lo: -20, hi: 30 }), [4, 2, bdA]);
add(ext(disc(9.5), 0.5), mat(['#b58bff'], { flat: true }), [29, 15, bdA - 1]);
for (let k = 0; k < 9; k++) add(new THREE.BoxGeometry(10, 1.45, 0.5), mat(['#6a2bff'], { flat: true }), [31, 11.5 - k * 3.1, bdA - 0.5]);
add(ext(rr(22, 10, 5), 0.5), mat(['#2a0c6a'], { flat: true }), [-10, 1.8, bdA + 0.6]);

/* =====================================================================
   SECTION B · frame 8 · peg wall
   ===================================================================== */
const WALLZ = -7, BZ = -3.6, PEG_R = 0.42;
const wallM = mat(['#e0409a', '#8a2bf0', '#4b00ff'], { axis: [1, 1, 0], lo: 0, hi: 50 });
add(new THREE.PlaneGeometry(90, 90), wallM, [50, -46, WALLZ]);
// relief shapes on the wall, echoing the board
const RZ = WALLZ + 0.02;
add(ext(rr(15, 26, 7), 0.25), mat(['#5a0bff', '#8a2bf0', '#e8603a'], { axis: [0, -1, 0], lo: 6, hi: 34 }), [22, -21, RZ]);
add(ext(rr(26, 24, 8), 0.25), mat(['#ff8a2a', '#e05a7a', '#9a30e0'], { axis: [0, -1, 0], lo: 8, hi: 34 }), [49, -22, RZ]);
add(ext(rr(12, 13, 6), 0.3), mat(['#c21bff', '#7a2be0'], { axis: [0, -1, 0], lo: 20, hi: 34 }), [51, -27.5, RZ + 0.1]);
add(ext(rr(18, 4.8, 2.4), 0.35), mat(['#9a60f0'], { flat: true, op: 0.75 }), [48, -16, RZ + 0.15]);
for (let k = 0; k < 3; k++) add(new THREE.BoxGeometry(18, 0.8, 0.3), mat(['#d0602a', '#4b10e0', '#ff7a1a'], { axis: [1, 0, 0], lo: 38, hi: 56 }), [47, -30.5 - k * 1.2, RZ + 0.2]);
// pegs on a diagonal lattice, keeping clear of the copy (bottom left) and holding shape (top right)
const pegs = [];
for (let r = 0; r < 12; r++) for (let c = 0; c < 14; c++) {
  const x = 22 + c * 3 + (r % 2) * 1.5, y = -9 - r * 2.5;
  if (Math.abs(y - (-13 - 0.72 * (x - 27))) > 5.5) continue;
  if (x < 39 && y < -21) continue;
  if (x > 53 && y > -18) continue;
  if (y < -32) continue;                                  // stay on the upper wall
  pegs.push({ x, y });
}
const pegM = mat(['#ffb020', '#4b18c8', '#3010a0'], { axis: [0, 0, 1], lo: WALLZ, hi: WALLZ + 4.4 });
const pegGeo = new THREE.CapsuleGeometry(PEG_R, 3.6, 6, 16).rotateX(Math.PI / 2);
pegs.forEach(p => { p.mesh = add(pegGeo, pegM, [p.x, p.y, WALLZ + 2.2]); p.hit = []; });
const near = (tx, ty) => pegs.reduce((a, p, i) => (Math.hypot(p.x - tx, p.y - ty) < Math.hypot(pegs[a].x - tx, pegs[a].y - ty) ? i : a), 0);
const hops = [near(26, -12)];
const pegAt = (x, y) => pegs.findIndex(p => Math.abs(p.x - x) < 0.01 && Math.abs(p.y - y) < 0.01);
while (hops.length < 9) {                      // alternate long/short hops down and to the right
  const c = pegs[hops.at(-1)], k = hops.length;
  const prefs = k % 2 ? [[1.5, -2.5], [4.5, -2.5], [3, 0]] : [[4.5, -2.5], [1.5, -2.5], [3, 0]];
  const next = prefs.map(([dx, dy]) => pegAt(c.x + dx, c.y + dy)).find(i => i >= 0);
  if (next == null) break;
  hops.push(next);
}
const landB = i => new THREE.Vector3(pegs[i].x, pegs[i].y + PEG_R + R, BZ);

/* =====================================================================
   SECTION C · frame 9 · corkscrew around a post, then a ramp to camera
   ===================================================================== */
const D = new THREE.Vector3(0.35, -0.3, 1).normalize();          // ramp direction (toward camera)
const Dh = new THREE.Vector2(D.x, D.z).normalize();
const thetaE = Math.atan2(Dh.x, -Dh.y);                          // helix exit angle whose tangent matches the ramp
const TURNS = 2.25, PITCH = 3.0, HR = 2.6;
const theta0 = thetaE + TURNS * Math.PI * 2;
const lastLand = landB(hops.at(-1));
const HTOP = Math.min(lastLand.y - 9, -38);
const C = new THREE.Vector3(lastLand.x + 5 - HR * Math.cos(theta0), 0, -1);
const helixP = u => {
  const th = theta0 - u * TURNS * Math.PI * 2;
  return new THREE.Vector3(C.x + HR * Math.cos(th), HTOP - u * TURNS * PITCH, C.z + HR * Math.sin(th));
};
const HBOT = HTOP - TURNS * PITCH;
// spiral ramp: sweep a rectangular cross-section
{
  const N = 360, ri = 1.35, ro = 3.9, th = 0.4, pos = [];
  const pt = (u, r, dy) => { const a = theta0 - u * TURNS * Math.PI * 2; return [C.x + r * Math.cos(a), HTOP - R - u * TURNS * PITCH + dy, C.z + r * Math.sin(a)]; };
  for (let i = 0; i < N; i++) {
    const u0 = i / N, u1 = (i + 1) / N;
    const q = [[ri, 0], [ro, 0], [ro, -th], [ri, -th]];
    for (let k = 0; k < 4; k++) {
      const a0 = pt(u0, ...q[k]), b0 = pt(u0, ...q[(k + 1) % 4]), a1 = pt(u1, ...q[k]), b1 = pt(u1, ...q[(k + 1) % 4]);
      pos.push(...a0, ...a1, ...b0, ...b0, ...a1, ...b1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  add(g, mat(['#3a10b0', '#6a14ff', '#f07a2a'], { axis: [1, 0, 0], lo: C.x - 4, hi: C.x + 4 }), [0, 0, 0], [0, 0, 0]).material.side = THREE.DoubleSide;
}
add(new THREE.CylinderGeometry(1.3, 1.3, 40, 40), mat(['#f07a2a', '#8a2bf0', '#4b00ff'], { axis: [0, -1, 0], lo: -HTOP - 5, hi: -HBOT + 4 }), [C.x, HTOP + 5 - 20, C.z]);
const E = helixP(1);
const RAMP_L = 21;
const Q = E.clone().addScaledVector(D, RAMP_L);
const rampTopA = E.clone().addScaledVector(surfN(D), -R), rampTopB = Q.clone().addScaledVector(D, 0.6).addScaledVector(surfN(D), -R);
{
  const ramp = slab(rampTopA.clone().addScaledVector(D, -1.5), rampTopB, 10, 2.2,
    mat(['#ff7a1a', '#d05a8a', '#9a70ff'], { axis: [D.x, 0, D.z], lo: E.x * D.x + E.z * D.z, hi: E.x * D.x + E.z * D.z + 26 }));
  ramp.material.uniforms.shadeK.value = 1;
}
// side "wedge" under the ramp, like the yellow face on the board
{
  const B = basis(D), ez = new THREE.Vector3().setFromMatrixColumn(B, 2);
  const left = rampTopA.clone().addScaledVector(ez, -5.01), leftEnd = rampTopB.clone().addScaledVector(ez, -5.01);
  const g = new THREE.BufferGeometry();
  const bot = (p) => [p.x, p.y - 30, p.z];
  g.setAttribute('position', new THREE.Float32BufferAttribute([...left.toArray(), ...bot(left), ...leftEnd.toArray(), ...leftEnd.toArray(), ...bot(left), ...bot(leftEnd)], 3));
  g.computeVertexNormals();
  add(g, mat(['#ffd000', '#ff8a1a', '#c04aa0'], { axis: [0, -1, 0], lo: -E.y, hi: -E.y + 14, flat: true }), [0, 0, 0]).material.side = THREE.DoubleSide;
}
// frame-9 backdrop: relief on the lower wall behind the corkscrew
const g9 = new THREE.Group();
g9.position.set(C.x, HTOP, WALLZ + 0.05); g9.scale.setScalar(0.66); scene.add(g9);
add(ext(disc(15), 0.5), mat(['#ff7a1a', '#c05a7a', '#6a10e0'], { axis: [0, -1, 0], lo: -HTOP - 12, hi: -HTOP + 12 }), [22, 4, 0], [0, 0, 0], g9);
add(ext(rr(26, 7, 3.5), 0.5), mat(['#4a10c8'], { flat: true }), [20, 5, 0.6], [0, 0, 0], g9);
add(ext(rr(14, 40, 7), 0.5), mat(['#5a0bff'], { flat: true }), [2, -TURNS * PITCH - 6, -0.2], [0, 0, 0], g9);
add(ext(arch(10, 22, 4.2), 0.5), mat(['#ff8a2a', '#8a2be0'], { axis: [0, -1, 0], lo: -HBOT - 8, hi: -HBOT + 10 }), [31, -TURNS * PITCH - 18, 1], [0, 0, 0], g9);
add(ext(withHole(rr(18, 7, 3.5), rr(10, 1.4, 0.7)), 0.5), mat(['#6a14ff', '#c08a4a', '#ffd000'], { axis: [1, 0, 0], lo: C.x + 2, hi: C.x + 16 }), [15, -TURNS * PITCH - 12, 1.2], [0, 0, 0], g9);
add(new THREE.BoxGeometry(14, 60, 0.5), mat(['#e020f0', '#f07a2a', '#4b00ff'], { axis: [0, -1, 0], lo: -HTOP - 8, hi: -HBOT + 14 }), [-17, -10, 0], [0, 0, 0], g9);

/* =====================================================================
   SECTION D · frame 10 · path from the ramp into a tunnel set in a wall
   ===================================================================== */
const F = new THREE.Vector3(D.x, 0, D.z).normalize(), RT = new THREE.Vector3(-F.z, 0, F.x);
const along = (d, dy = 0) => Q.clone().addScaledVector(F, d).add(new THREE.Vector3(0, dy, 0));
const P10 = new THREE.CatmullRomCurve3([Q.clone(), Q.clone().addScaledVector(D, 4), along(10, -2.0), along(17, -2.2), along(22, -2.2), along(28, -2.2)], false, 'centripetal');
const T10 = along(22, -2.2), RC10 = T10.clone().add(new THREE.Vector3(0, 3.0 - R, 0));
ribbon(P10, u => (u < 0.18 ? 10 - 5.8 * (u / 0.18) : 4.2), 1.0,
  mat(['#6a14ff', '#9a40e0', '#ff8a2a'], { axis: [-F.x, 0, -F.z], lo: -F.dot(T10), hi: -F.dot(Q) }), mat(['#e0508a', '#ff7a1a']));
const w10 = new THREE.Group();
w10.position.copy(RC10).addScaledVector(F, 0.2); w10.rotation.y = Math.atan2(-F.x, -F.z); scene.add(w10);
{
  const W = (geo, m, x, y, z) => add(geo, m, [x, y, z], [0, 0, 0], w10);
  const rl = RT.dot(RC10);
  W(holedWall(120, 80, 10, 3.2), mat(['#f07a2a', '#d0509a', '#7a2bf0'], { axis: RT.toArray(), lo: rl - 22, hi: rl + 22, side: THREE.DoubleSide }), 0, 0, 0);
  tunnel(w10, 3.05, 34);
  W(ext(ring(4.6, 3.2), 1.4), mat(['#6a14ff', '#ff7a1a', '#e04a9a'], { axis: [RT.x, -1, RT.z], lo: -RC10.y - 5, hi: -RC10.y + 5 }), 0, 0, 0);
  W(ext(ring(3.75, 3.05), 1.6), mat(['#ff8a1a', '#6a14ff'], { axis: [-RT.x, -1, -RT.z], lo: -RC10.y - 4, hi: -RC10.y + 4 }), 0, 0, 0.02);
  W(new THREE.BoxGeometry(2.8, 34, 0.3), mat(['#4b00ff', '#c050a0', '#ff8a1a'], { axis: RT.toArray(), lo: rl - 1.4, hi: rl + 1.4 }), 0.1, 21.6, 0.15);
  W(ext(rr(7.7, 26, 4), 0.25), mat(['#e04a9a', '#9a3ae8', '#4b00ff'], { axis: [0, -1, 0], lo: -RC10.y - 22, hi: -RC10.y + 2 }), 8.9, 10, 0.05);
  W(new THREE.PlaneGeometry(9, 50), mat(['#e04a9a', '#9a40e8'], { axis: [0, -1, 0], lo: -RC10.y - 20, hi: -RC10.y + 10 }), 17.5, 8, 0.12);
  const hg = (y0, cols, z, inset = 0) => {    // hourglass relief, like the board's right edge
    const s = new THREE.Shape(), l = 13.2 + inset, r = 21.8 - inset, nl = 17, nr = 18;
    s.moveTo(l, y0 + 16); s.lineTo(r, y0 + 16); s.lineTo(r, y0 + 9);
    s.bezierCurveTo(r, y0 + 7, nr, y0 + 6.9, nr, y0 + 5.6); s.bezierCurveTo(nr, y0 + 4.3, r, y0 + 4, r, y0 + 2);
    s.lineTo(r, y0); s.lineTo(l, y0); s.lineTo(l, y0 + 2);
    s.bezierCurveTo(l, y0 + 4, nl, y0 + 4.3, nl, y0 + 5.6); s.bezierCurveTo(nl, y0 + 6.9, l, y0 + 7, l, y0 + 9); s.lineTo(l, y0 + 16);
    W(ext(s, 0.25), mat(cols, { axis: [0, -1, 0], lo: -RC10.y - y0 - 16, hi: -RC10.y - y0 }), 0, 0, z);
  };
  hg(3.4, ['#5a0bff', '#a060f0'], 0.34); hg(-9, ['#d0604a', '#ff4a3a'], 0.3, 0.03);   // they overlap: different depths and side walls, or they flicker
  W(ext(rr(16, 8.2, 4.1), 0.25), mat(['#6a14ff', '#5a0be8', '#e0703a'], { axis: [0, -1, 0], lo: -RC10.y - 8, hi: -RC10.y + 1 }), -12.8, 3.6, 0.1);
  W(ext(rr(10.3, 2.8, 1.4), 0.25), mat(['#9a60f0'], { flat: true }), -12.8, 3.6, 0.2);
  W(ext(arch(6, 8, 2), 0.25), mat(['#ff5a6a', '#ff8a1a'], { axis: RT.toArray(), lo: rl - 13, hi: rl - 6 }), -9.7, -12, 0.3);
  W(ext(rr(7.1, 14, 3.5), 0.25), mat(['#3a0fa8'], { flat: true }), -6.5, 13, 0.06);
  W(ext(rr(4.8, 7.5, 0.1), 0.25), mat(['#f07a2a', '#d0608a'], { axis: [0, -1, 0], lo: -RC10.y - 15, hi: -RC10.y - 8 }), -10.7, 11.5, 0.04);
  W(ext(rr(2.5, 2.9, 1.25), 0.25), mat(['#b070d0'], { flat: true }), -11.9, 9, 0.12);
  W(ext(rr(2.5, 6.6, 1.25), 0.25), mat(['#d07a80'], { flat: true }), -6.45, 7.1, 0.34);
  W(ext(disc(2.9), 0.25), mat(['#c010f0'], { flat: true }), -7.5, -2, 0.36);
}

/* =====================================================================
   SECTION E · frame 11 · exit ring and winding path (reached by an unseen cut)
   ===================================================================== */
const RC11 = new THREE.Vector3(200, -40, 0);
const at11 = (x, y, z) => RC11.clone().add(new THREE.Vector3(x, y, z));
const P11 = new THREE.CatmullRomCurve3([at11(0, -1.6, -8), at11(0, -1.6, 0.6), at11(1.6, -2.4, 3.5), at11(2.6, -3.6, 6), at11(0.2, -4.6, 8.5),
  at11(-0.6, -5.4, 10), at11(2.5, -5.8, 11.5), at11(7, -6, 12), at11(13, -6, 12.5), at11(21, -6, 13)], false, 'centripetal');
ribbon(P11, u => (u < 0.45 ? 2.4 : u < 0.7 ? 2.4 + (u - 0.45) / 0.25 * 13.6 : 16 + (u - 0.7) / 0.3 * 8), 0.9,
  mat(['#5a14ff', '#e0409a', '#ff7a1a'], { axis: [0, 0, 1], lo: RC11.z + 5, hi: RC11.z + 16 }), mat(['#ff7a1a', '#e0508a']));
const w11 = new THREE.Group(); w11.position.copy(RC11).add(new THREE.Vector3(0, 0, -0.2)); scene.add(w11);
{
  const W = (geo, m, x, y, z) => add(geo, m, [x, y, z], [0, 0, 0], w11);
  W(holedWall(110, 80, -4, 2.6), mat(['#2a0c78', '#1e0c5a', '#2a0c70'], { axis: [1, -1, 0], lo: -40, hi: 40, side: THREE.DoubleSide }), 0, 0, 0);
  tunnel(w11, 2.65, 30);
  W(ext(ring(5.2, 2.6), 1.4), mat(['#ff8a1a', '#ff4f7b', '#4b00ff'], { axis: [1, -0.4, 0], lo: RC11.x - 5, hi: RC11.x + 5 }), 0, 0, 0);
  W(ext(disc(11.5), 0.2), mat(['#2a0e8a'], { flat: true }), -15.3, -12.2, 0.02);
  const band = new THREE.Shape([[-19.9, 7.8], [-14.7, 7.8], [-10.3, 5.4], [0, 5.4], [0, 2.7], [-10.3, 2.7]].map(([x, y]) => new THREE.Vector2(x, y)));
  W(ext(band, 0.25), mat(['#4b00ff', '#a040e8', '#ff4f7b'], { axis: [1, 0, 0], lo: RC11.x - 20, hi: RC11.x }), 0, 0, 0.05);
  W(ext(withHole(rr(13.2, 8, 4), rr(10.2, 5, 2.5)), 0.3), mat(['#ff7a1a', '#ff9a3a'], { axis: [1, 0, 0], lo: RC11.x + 3, hi: RC11.x + 16 }), 9.8, 3.1, 0.08);
  W(ext(rr(9.9, 17.2, 0.1), 0.2), mat(['#5a1080', '#c05a3a'], { axis: [0, -1, 0], lo: -RC11.y, hi: -RC11.y + 17 }), 11.35, -8.06, 0.04);   // top just under the ring hole's edge (level = flicker)
  W(ext(arch(6, 14, 2.1), 0.3), mat(['#ffd000', '#d08a2a'], { axis: [0, -1, 0], lo: -RC11.y + 4, hi: -RC11.y + 18 }), 12.7, -18, 0.12);
  W(new THREE.BoxGeometry(3.2, 6, 0.3), mat(['#6a14ff', '#f07a2a'], { axis: [0, -1, 0], lo: -RC11.y - 12, hi: -RC11.y - 6 }), 10.3, 8.8, 0.15);
}

/* =====================================================================
   SECTION F · frame 12 · on toward an arched tunnel in a wall
   ===================================================================== */
const P12 = new THREE.CatmullRomCurve3([at11(21, -6, 13), at11(25.5, -6, 15), at11(28, -6, 20), at11(28, -6, 30), at11(28, -6, 46), at11(28, -6, 56)], false, 'centripetal');
ribbon(P12, u => (u < 0.25 ? 24 - 19.5 * (u / 0.25) : 4.5), 0.9,
  mat(['#ff7a1a', '#e0409a', '#6a14ff'], { axis: [0, 0, 1], lo: RC11.z + 14, hi: RC11.z + 46 }), mat(['#ff7a1a', '#e0508a']), 240, RISE + 0.005);   // starts just above the end of P11, which it overlaps
const w12 = new THREE.Group(); w12.position.copy(at11(28, -7, 46.2)); w12.rotation.y = Math.PI; scene.add(w12);
{
  const W = (geo, m, x, y, z) => add(geo, m, [x, y, z], [0, 0, 0], w12);
  W(wallArch(100, 70, 25, 5.6, 7), mat(['#6a14ff', '#b050c0', '#ff7a1a'], { axis: [1, 1, 0], lo: RC11.x - 10, hi: RC11.x + 50, side: THREE.DoubleSide }), 0, 0, 0);
  darkRoom(w12, 5.6, 7, 24);
  W(ext(arch(8, 8.2, 1.2), 1.2), mat(['#ff8a1a', '#e0409a', '#6a14ff'], { axis: [0, -1, 0], lo: -RC11.y - 1, hi: -RC11.y + 9 }), 0, 0, 0);
  W(ext(arch(13.4, 12.2, 2.5), 0.3), mat(['#5a0bff', '#7a2be0'], { axis: [0, -1, 0], lo: -RC11.y - 5, hi: -RC11.y + 12 }), 0, 0.01, 0.05);
  W(ext(arch(19, 16, 2.8), 0.4), mat(['#ff8a2a', '#ff5a6a', '#e0409a'], { axis: [0, -1, 0], lo: -RC11.y - 9, hi: -RC11.y + 9 }), 0, 0, 0.08);
  W(ext(rr(2.6, 10, 1.3), 0.3), mat(['#5a0bff', '#e0508a'], { axis: [0, -1, 0], lo: -RC11.y - 5, hi: -RC11.y + 7 }), 13, 6, 0.1);
  W(ext(disc(0.95), 0.3), mat(['#f9c27e'], { flat: true }), 11, 2.6, 0.12);
  W(ext(disc(6), 0.3), mat(['#c21bff', '#6a14ff'], { axis: [0, -1, 0], lo: -RC11.y - 16, hi: -RC11.y - 4 }), -14.5, 10, 0.06);
  W(ext(rr(8, 3, 1.5), 0.3), mat(['#ff7a1a'], { flat: true }), -13, 1.8, 0.1);
  W(ext(rr(46, 3.6, 1.8), 0.3), mat(['#ff7a1a', '#e0409a', '#6a14ff'], { axis: [1, 0, 0], lo: RC11.x + 5, hi: RC11.x + 51 }), 0, 19.5, 0.06);
}

/* =====================================================================
   SECTION G · frames 13–15 · pipe → arch bridge → ramp (left) → doorway (right)
   ===================================================================== */
const O13 = new THREE.Vector3(400, -40, 0);
const o13 = (x, y, z) => O13.clone().add(new THREE.Vector3(x, y, z));
// D15: the frame 15 floor run was stretched by moving the doorway wall this far along −x (user, 2026-09-26: the ball
// crawled through frame 15 at ~2.5 u/s because the run was only 15 units long); the camera tracks along with it
const D15 = 22;
const P13 = new THREE.CatmullRomCurve3([
  o13(-14, 0, -9), o13(-14, 0, -2), o13(-13, 0, 3), o13(-9, 0, 5),
  o13(-5, 0.8, 5), o13(-1.5, 3.2, 5), o13(2.5, 5, 5), o13(6.5, 3.2, 5), o13(10, 0.8, 5),
  o13(14, 0, 5), o13(19, 0, 7), o13(22, 0, 12.5), o13(19, -0.3, 18),
  o13(12, -1.8, 18), o13(-18, -16, 18),
  o13(-24, -16.2, 16.5), o13(-24 - D15 * 0.55, -16.2, 15.2), o13(-29 - D15, -16.2, 10), o13(-31.5 - D15, -16.2, 0), o13(-34 - D15, -16.2, -4), o13(-44 - D15, -16.2, -4)], false, 'centripetal');
const g13 = {
  mouth: arcFrac(P13, o13(-14, 0, -2)), b0: arcFrac(P13, o13(-5, 0.8, 5)), top: arcFrac(P13, o13(2.5, 5, 5)),
  c3: arcFrac(P13, o13(19, -0.3, 18)), d0: arcFrac(P13, o13(12, -1.8, 18)), d1: arcFrac(P13, o13(-18, -16, 18)),
  f1: arcFrac(P13, o13(-24, -16.2, 16.5)), open: arcFrac(P13, o13(-34 - D15, -16.2, -4)),
};
ribbon(P13, u => (u < g13.mouth ? 0.01 : 3.8 + 4.4 * win(u, g13.d0, g13.d1, 0.03)), 0.9,
  mat(['#ff7a1a', '#e0508a', '#6a14ff'], { axis: [1, -0.4, 0], lo: O13.x - 30, hi: O13.x + 22 }), mat(['#ff8a2a', '#c04aa0']), 400);
// entry pipe (frame 13 starts inside it)
const wp = new THREE.Group(); wp.position.copy(o13(-14, 0.85, -2)); scene.add(wp);
tunnel(wp, 1.85, 14);
add(new THREE.CylinderGeometry(2.6, 2.6, 14, 40, 1, true), mat(['#ff7a1a', '#7b2bf9'], { axis: [0, 0, 1], lo: -16, hi: -2, side: THREE.DoubleSide }), [0, 0, -7], [Math.PI / 2, 0, 0], wp);
add(ext(ring(2.9, 1.85), 0.8), mat(['#ff8a1a', '#ff4f7b'], { axis: [1, 0, 0], lo: O13.x - 17, hi: O13.x - 11 }), [0, 0, 0], [0, 0, 0], wp);
// the arch under the bridge (orange rim, violet fill), like the board's half-ring
add(ext(halfRing(8.75, 6.2), 3.6), mat(['#ff8a2a', '#ff5a6a', '#e0409a'], { axis: [0, 1, 0], lo: -43, hi: -35 }), [O13.x + 2.5, O13.y - 5.7, 3.2]);
add(ext(halfDisc(6.2), 3.4), mat(['#6a14ff', '#8a2bf0'], { axis: [0, 1, 0], lo: -46, hi: -38 }), [O13.x + 2.5, O13.y - 5.7, 3.3]);
// backdrop wall for 13–14 (the pipe comes out of it)
const w13 = new THREE.Group(); w13.position.copy(o13(0, -1, -16)); scene.add(w13);
{
  const W = (geo, m, x, y, z) => add(geo, m, [x, y, z], [0, 0, 0], w13);
  W(new THREE.PlaneGeometry(110, 70), mat(['#4b00ff', '#6a14ff', '#8a2bf0'], { axis: [1, 1, 0], lo: O13.x - 30, hi: O13.x + 40 }), 20, 10, 0);
  W(ext(ring(5.5, 3.3), 0.4), mat(['#ff8a2a', '#ff5a6a'], { axis: [0, -1, 0], lo: -O13.y - 18, hi: -O13.y - 6 }), 20, 12, 0.05);
  W(ext(disc(6), 0.3), mat(['#ff7a1a', '#ffa800'], { axis: [1, 0, 0], lo: O13.x + 25, hi: O13.x + 37 }), 31, 4, 0.05);
  W(ext(rr(10, 6, 3), 0.3), mat(['#d10cf0'], { flat: true }), 30, 13, 0.1);
  W(ext(rr(14, 14, 7), 0.3), mat(['#e0409a', '#ff7a1a'], { axis: [1, -1, 0], lo: O13.x + 12, hi: O13.x + 40 }), 27, -5, 0.08);
  W(ext(disc(9), 0.2), mat(['#6a14ff'], { flat: true }), -6, -10, 0.03);
  W(ext(rr(6, 20, 3), 0.3), mat(['#2a0c6a'], { flat: true }), -24, 6, 0.06);
}
// frame-15 wall with an arched doorway, facing +x
const w15 = new THREE.Group(); w15.position.copy(o13(-34 - D15, -17.2, -4)); w15.rotation.y = Math.PI / 2; scene.add(w15);
{
  const W = (geo, m, x, y, z) => add(geo, m, [x, y, z], [0, 0, 0], w15);
  W(wallArch(50, 44, 14, 4.6, 6), mat(['#ff7a1a', '#c050a0', '#4b00ff'], { axis: [0, 0, -1], lo: 4 - 25, hi: 4 + 25, side: THREE.DoubleSide }), 0, 0, 0);
  darkRoom(w15, 4.6, 6, 20);
  W(ext(arch(7, 7.2, 1.2), 1.0), mat(['#ff8a1a', '#6a14ff'], { axis: [0, -1, 0], lo: -O13.y + 10, hi: -O13.y + 18 }), 0, 0, 0);
  for (let k = 0; k < 4; k++) {                  // board's horizontal slats across the top of the doorway
    const y = 3.95 + k * 0.45, half = Math.sqrt(Math.max(0, 2.3 * 2.3 - (y - 3.7) ** 2));
    W(new THREE.BoxGeometry(half * 2, 0.22, 0.2), mat(['#2a0c78'], { flat: true }), 0, y, 0.5);
  }
  W(ext(disc(9), 0.3), mat(['#ff8a2a', '#ff5a6a'], { axis: [0, -1, 0], lo: -O13.y + 11 - 9, hi: -O13.y + 11 + 9 }), -11, 13, 0.05);
  W(ext(rr(12, 5, 2.5), 0.3), mat(['#6a14ff'], { flat: true }), 11, 11, 0.08);
  W(ext(disc(4), 0.3), mat(['#d10cf0', '#ff7a1a'], { axis: [0, -1, 0], lo: -O13.y + 7, hi: -O13.y + 15 }), 12, 2, 0.06);
}

/* =====================================================================
   SECTION H · frame 16 · snake-like track (reached under the pill wipe)
   ===================================================================== */
const O16 = new THREE.Vector3(600, -40, 0);
const o16 = (x, y, z) => O16.clone().add(new THREE.Vector3(x, y, z));
const snakeY = x => 3.2 * Math.sin(2 * Math.PI * (x + 20) / 18);
const snakePts = []; for (let x = -26; x <= 44; x += 1.5) snakePts.push(o16(x, snakeY(x), 0));
const P16 = new THREE.CatmullRomCurve3(snakePts, false, 'centripetal');
ribbon(P16, () => 3.4, 1.8, mat(['#ff8a2a', '#ff7a1a', '#e0508a'], { axis: [1, 0, 0], lo: O16.x - 20, hi: O16.x + 40 }), mat(['#ff7a1a', '#c04aa0']), 500);
[-6.5, 11.5, 29.5].forEach(x => add(new THREE.BoxGeometry(3.4, 30, 3.4), mat(['#e0508a', '#6a14ff'], { axis: [0, -1, 0], lo: -O16.y + 6, hi: -O16.y + 26 }), [O16.x + x, O16.y - 6 - 15, 0]));
const w16 = new THREE.Group(); w16.position.copy(o16(0, 0, -8)); scene.add(w16);
{
  const W = (geo, m, x, y, z) => add(geo, m, [x, y, z], [0, 0, 0], w16);
  W(new THREE.PlaneGeometry(260, 130), mat(['#5a0bff', '#6a14ff', '#8a2bf0'], { axis: [1, 0, 0], lo: O16.x - 40, hi: O16.x + 60 }), 45, -25, 0);
  for (let x = -34; x <= 29; x += 21) {
    W(ext(rr(12, 9, 4.5), 0.3), mat(['#ff8a2a', '#e0409a'], { axis: [0, -1, 0], lo: -O16.y - 16, hi: -O16.y - 7 }), x + 6, 12, 0.05);
    for (let k = 0; k < 4; k++) W(new THREE.BoxGeometry(0.7, 8, 0.2), mat(['#ff7a1a', '#6a14ff'], { axis: [0, -1, 0], lo: -O16.y - 14, hi: -O16.y - 6 }), x + 14 + k * 1.3, 10, 0.08);
    W(ext(disc(4), 0.3), mat(['#c21bff', '#ff7a1a'], { axis: [0, -1, 0], lo: -O16.y + 2, hi: -O16.y + 10 }), x, -3, 0.05);
    W(ext(rr(7, 16, 3.5), 0.2), mat(['#a57bff'], { flat: true, op: 0.6 }), x - 6, 6, 0.03);
  }
}

const animFns = [];                           // per-frame procedural motion (discs, shifting shapes, split)

/* =====================================================================
   SECTION I · frames 17–18 · off the end of the snake track, down floating discs,
   onto a soft-serve swirl, then straight at the camera
   ===================================================================== */
const O17 = P16.getPointAt(1);
const o17 = (x, y, z) => O17.clone().add(new THREE.Vector3(x, y, z));
// swirl: ball-centre helix, radius growing as it winds down, exits heading +z (toward camera)
const SC = o17(-1, 0, 0.3), SW_Y = -23.5, TH0 = 0.35, TH1 = -5 * Math.PI, SW_R0 = 1.6, SW_R1 = 5.6, SW_H = 9.7, TUBE = 1.1;
const swirlP = th => {
  const k = (TH0 - th) / (TH0 - TH1), r = SW_R0 + (SW_R1 - SW_R0) * k;
  return new THREE.Vector3(SC.x + r * Math.cos(th), O17.y + SW_Y - SW_H * k, SC.z + r * Math.sin(th));
};
const L18 = swirlP(TH0), E18 = swirlP(TH1);
const LANE = 11;
const P18 = (() => {
  const pts = [];
  for (let i = 0; i <= 160; i++) pts.push(swirlP(TH0 + (TH1 - TH0) * i / 160));
  for (let z = 1; z <= LANE; z += 1) pts.push(E18.clone().add(new THREE.Vector3(0, -0.8 * z / LANE, z)));
  return new THREE.CatmullRomCurve3(pts, false, 'centripetal');
})();
const fExit18 = arcFrac(P18, E18), fLane18 = arcFrac(P18, E18.clone().add(new THREE.Vector3(0, -0.8 * 9.5 / LANE, 9.5)));
{
  // soft-serve coils: a fat tube under the ball path, starting a little above the landing point
  const pts = [];
  for (let i = -8; i <= 160; i++) pts.push(swirlP(TH0 + (TH1 - TH0) * i / 160).add(new THREE.Vector3(0, -R - TUBE, 0)));
  for (let z = 1; z <= LANE; z += 1) pts.push(E18.clone().add(new THREE.Vector3(0, -0.8 * z / LANE - R - TUBE, z)));
  const tc = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const tm = mat(['#7b2bf9', '#e0409a', '#ff8a2a'], { axis: [0, 1, 0], lo: O17.y + SW_Y - 12, hi: O17.y + SW_Y });
  add(new THREE.TubeGeometry(tc, 700, TUBE, 28, false), tm);
  add(new THREE.SphereGeometry(TUBE, 28, 20), tm, tc.getPointAt(0).toArray());
  add(new THREE.SphereGeometry(TUBE, 28, 20), tm, tc.getPointAt(1).toArray());
  // core fills the middle so the coils read as one swirl
  const yT = O17.y + SW_Y - R - TUBE + 0.4, yB = E18.y - R - 2 * TUBE - 1.2;
  add(new THREE.CylinderGeometry(0.9, SW_R1 - TUBE + 0.3, yT - yB, 48), mat(['#2a0c78', '#5a0bff'], { axis: [0, 1, 0], lo: yB, hi: yT }), [SC.x, (yT + yB) / 2, SC.z]);
}
// discs: bounce points (ball centres) → each disc faces the reflection normal, tipped toward camera
const b17 = [o17(0, 0, 0), o17(3.2, -5.5, 0.6), o17(-1.5, -9, 1.6), o17(2.8, -12.5, 0.6), o17(-1.5, -16, 1.6), o17(2.5, -19.5, 0.8), L18];
const h17 = [0.38, 1.5, 1.5, 1.5, 1.5, 0.9];
const t17 = [75.0, 75.45, 76.4, 77.35, 78.3, 79.25, 80.35];
const DISC_R = 2.5, DISC_T = 0.38;
const discs = [];
{
  const vS = i => b17[i + 1].clone().sub(b17[i]).add(new THREE.Vector3(0, 4 * h17[i], 0)).divideScalar(t17[i + 1] - t17[i]);
  const vE = i => b17[i + 1].clone().sub(b17[i]).add(new THREE.Vector3(0, -4 * h17[i], 0)).divideScalar(t17[i + 1] - t17[i]);
  const rimM = mat(['#ffa800', '#ff7a00'], { flat: true });
  const mk = (P, n, hit, wob) => {
    n.normalize();
    const c = P.clone().addScaledVector(n, -(R + DISC_T / 2));
    const faceM = mat(['#2a0c78', '#7b2bf9', '#ff7a1a'], { rc: c.toArray(), rad: DISC_R });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(DISC_R, DISC_R, DISC_T, 56), [rimM, faceM, faceM]);
    const q0 = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    m.position.copy(c); m.quaternion.copy(q0); scene.add(m);
    discs.push({ m, c, q0, hit, wob: wob.normalize() });
  };
  for (let i = 1; i <= 5; i++) {
    const n = vS(i).sub(vE(i - 1)).normalize(); n.z += 0.5;
    mk(b17[i], n, t17[i], new THREE.Vector3().crossVectors(n, vE(i - 1)));
  }
  mk(o17(-5.5, -3, -1.5), new THREE.Vector3(0.8, 0.3, 0.5), 74.1, new THREE.Vector3(0, 1, 0));
  const wq = new THREE.Quaternion();
  animFns.push(t => discs.forEach(d => {
    const x = t - d.hit;
    d.m.position.copy(d.c).add(new THREE.Vector3(0, 0.2 * Math.sin(2 * Math.PI * x / 3.3), 0));       // bob, zero at impact
    const s = x > 0 && x < 0.26 ? 1 + 0.22 * Math.sin(Math.PI * x / 0.26) : 1;                          // flex on impact
    d.m.scale.set(s, 1, s);
    const a = x > 0 ? 0.28 * Math.exp(-2.5 * x) * Math.sin(9 * x) : 0;                                 // knocked wobble
    d.m.quaternion.copy(wq.setFromAxisAngle(d.wob, a).multiply(d.q0));
  }));
}
// frame 17–18 relief shapes on the (widened) frame-16 backdrop
{
  const W = (geo, m, x, y, z) => add(geo, m, [x, y, z], [0, 0, 0], w16);
  const oy = -O16.y;
  W(ext(disc(10), 0.3), mat(['#e0409a', '#8a2bf0'], { axis: [0, -1, 0], lo: oy - 15, hi: oy + 5 }), 80, 4, 0.05);
  W(ext(disc(13), 0.3), mat(['#8a2bf0', '#c21bff'], { axis: [1, 0, 0], lo: O16.x + 82, hi: O16.x + 108 }), 98, -20, 0.04);
  W(ext(rr(12, 30, 6), 0.3), mat(['#3a10a8'], { flat: true }), 36, -24, 0.05);
  W(ext(rr(34, 44, 17), 0.3), mat(['#6a14ff', '#b030e8', '#e0409a'], { axis: [1, 1, 0], lo: O16.x + O16.y + 30, hi: O16.x + O16.y + 80 }), 80, -44, 0.08);
  W(ext(rr(9, 36, 4.5), 0.3), mat(['#8a2bf0', '#ff7a1a'], { axis: [0, -1, 0], lo: oy + 30, hi: oy + 60 }), 102, -40, 0.1);
}

/* =====================================================================
   SECTION J · frames 19–20 · U-turn track seen from above → marble run down into a hole
   (reached by a match cut on the sphere)
   ===================================================================== */
const O19 = new THREE.Vector3(1000, -40, 0);
const o19 = (x, y, z) => O19.clone().add(new THREE.Vector3(x, y, z));
const arcXZ = (cx, cz, r, a0, a1, n = 18) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return o19(cx + r * Math.cos(a), 0, cz + r * Math.sin(a)); });
const P19 = new THREE.CatmullRomCurve3([
  o19(0, 0, -15), o19(0, 0, -13),
  ...arcXZ(4, -11, 4, Math.PI, Math.PI / 2),                  // quarter turn to +x
  o19(8.5, 0, -7),
  ...arcXZ(13, -2, 5, -Math.PI / 2, Math.PI / 2, 28),         // U-turn on the right
  o19(9, 0, 3),
  ...arcXZ(5, 7, 4, -Math.PI / 2, -Math.PI),                  // quarter turn toward the camera
  o19(1, 0, 9), o19(1, 0, 11)], false, 'centripetal');
const fS19 = arcFrac(P19, o19(0, 0, -12));
ribbon(P19, () => 4.2, 1.4, mat(['#ffb060', '#ff7a1a', '#e0508a'], { axis: [1, 0, 1], lo: O19.x + O19.z - 6, hi: O19.x + O19.z + 22 }), mat(['#ff7a1a', '#c04aa0']), 600);
// frame-19 ground with big flat shapes (reads like the board's background from above)
{
  const flat = (shape, m, x, z, y = -6.9) => add(ext(shape, 0.1), m, [O19.x + x, O19.y + y, O19.z + z], [-Math.PI / 2, 0, 0]);
  add(new THREE.PlaneGeometry(90, 55), mat(['#4b00ff', '#6a14ff', '#b030e8'], { axis: [1, 0, -1], lo: O19.x - 20, hi: O19.x + 50, flat: true }), [O19.x + 8, O19.y - 7, O19.z - 17.2], [-Math.PI / 2, 0, 0]);
  flat(disc(7), mat(['#ff7a1a', '#e0409a'], { axis: [1, 0, 0], lo: O19.x - 16, hi: O19.x - 2 }), -10, -3);
  flat(disc(9), mat(['#b030e8', '#e020f0'], { axis: [0, 0, 1], lo: O19.z - 24, hi: O19.z - 6 }), 25, -15);
  flat(ring(6, 3.6), mat(['#ff8a2a', '#ff4f7b'], { axis: [1, 0, 0], lo: O19.x + 22, hi: O19.x + 34 }), 28, 3);
  flat(disc(2.6), mat(['#3a10b0'], { flat: true }), 13, -2);
  flat(rr(10, 4, 2), mat(['#8a2bf0'], { flat: true }), 10, -12.5);
}
// frame 20: wall under the end of the track, bars, switchback ramps with curved ends, platform with a hole
const Z20 = 13;
const p20 = (x, y) => o19(x, y, Z20);
const BEND1 = p20(7, -6.8), BEND2 = p20(0, -11.5), RB = 1.6, HOLE = p20(7, -14.9);
const arcXY = (C, a0, a1, n = 18) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return C.clone().add(new THREE.Vector3(RB * Math.cos(a), RB * Math.sin(a), 0)); });
const P20 = new THREE.CatmullRomCurve3([
  p20(1.5, -4), p20(4, -4.55),
  ...arcXY(BEND1, Math.PI / 2, -Math.PI / 2, 24),
  p20(3.5, -9.15),
  ...arcXY(BEND2, Math.PI / 2, 3 * Math.PI / 2, 24),
  p20(2, -13.5), p20(4, -13.9), p20(5.5, -13.9), p20(7, -13.9)], false, 'centripetal');
{
  const w20 = new THREE.Group(); w20.position.copy(o19(0, 0, 10.8)); scene.add(w20);
  const W = (geo, m, x, y, z) => add(geo, m, [x, y, z], [0, 0, 0], w20);
  W(new THREE.PlaneGeometry(80, 38), mat(['#2a0c78', '#4b00ff', '#6a14ff'], { axis: [1, -1, 0], lo: O19.x - O19.y - 10, hi: O19.x - O19.y + 60 }), 10, -21.2, 0);
  for (let x = -2.2; x <= 9.9; x += 1.2) W(new THREE.BoxGeometry(0.42, 7.2, 0.25), mat(['#7b2bf9', '#ff8a4a', '#ffc890'], { axis: [0, 1, 0], lo: O19.y - 9.6, hi: O19.y - 2.4 }), x, -6.0, 0.2);
  W(ext(archShape(4.2, 5.0), 0.1), mat(['#150632'], { flat: true }), 7, -14.9, 0.02);
  W(ext(arch(5.6, 5.8, 1.2), 0.25), mat(['#6a14ff', '#b030e8'], { axis: [0, -1, 0], lo: -O19.y + 9, hi: -O19.y + 15 }), 7, -14.9, 0.05);
  W(ext(rr(28, 11, 5.5), 0.3), mat(['#8a2bf0', '#c21bff'], { axis: [1, 0, 0], lo: O19.x + 19, hi: O19.x + 47 }), 33, -5, 0.05);
  W(ext(arch(12, 15, 3.2), 0.3), mat(['#8a2bf0', '#e020f0'], { axis: [0, -1, 0], lo: -O19.y + 17, hi: -O19.y + 32 }), 34, -32, 0.05);
  W(ext(disc(7), 0.3), mat(['#ff7a1a', '#e0409a', '#8a2bf0'], { axis: [1, -1, 0], lo: O19.x - O19.y + 30, hi: O19.x - O19.y + 46 }), 15, -24, 0.04);
  W(ext(rr(14, 30, 7), 0.3), mat(['#5a0bff', '#8a2bf0'], { axis: [0, -1, 0], lo: -O19.y + 12, hi: -O19.y + 40 }), -10, -24, 0.03);
  // ramps (slabs under the ball line) and curved ends
  const rampM = mat(['#ff8a2a', '#e0409a', '#8a2bf0'], { axis: [1, 0, 0], lo: O19.x - 2, hi: O19.x + 9 });
  const ramp = (a, b, extA = 0.6, extB = 0) => {
    const d = b.clone().sub(a).normalize(), n = surfN(d);
    slab(a.clone().addScaledVector(n, -R).addScaledVector(d, -extA), b.clone().addScaledVector(n, -R).addScaledVector(d, extB), 3, 0.5, rampM);
  };
  ramp(p20(1.5, -4), p20(7, -5.2), 1.8);
  ramp(p20(7, -8.4), p20(0, -9.9), 0.2);
  ramp(p20(0, -13.1), p20(4, -13.9), 0.2);
  const bendM = mat(['#ffa800', '#ff7a1a', '#d10cf0'], { axis: [0, -1, 0], lo: -O19.y + 3, hi: -O19.y + 14 });
  // a hair narrower than the 3-wide ramps they join: flush faces flicker
  add(ext(halfRing(RB + R + 0.45, RB + R), 2.96), bendM, [BEND1.x, BEND1.y, Z20 - 1.48 + O19.z], [0, 0, -Math.PI / 2]);
  add(ext(halfRing(RB + R + 0.45, RB + R), 2.96), bendM, [BEND2.x, BEND2.y, Z20 - 1.48 + O19.z], [0, 0, Math.PI / 2]);
  // platform with the hole, and the dark shaft under it
  const hg = new THREE.Group(); hg.position.copy(HOLE).add(new THREE.Vector3(0, -0.5, 0)); hg.rotation.x = -Math.PI / 2; scene.add(hg);
  const pl = new THREE.Shape(); pl.moveTo(-3.5, -1.8); pl.lineTo(3.5, -1.8); pl.lineTo(3.5, 1.8); pl.lineTo(-3.5, 1.8); pl.lineTo(-3.5, -1.8);
  add(ext(withHole(pl, disc(1.35)), 0.5), mat(['#ff8a2a', '#e0409a'], { axis: [1, 0, 0], lo: HOLE.x - 3.5, hi: HOLE.x + 3.5 }), [0, 0, 0], [0, 0, 0], hg);
  tunnel(hg, 1.33, 14);
}

/* =====================================================================
   SECTION K · frame 21 · a straight path among shifting shapes (reached by a cut in the dark)
   ===================================================================== */
const O21 = new THREE.Vector3(1200, -40, 0);
const o21 = (x, y, z) => O21.clone().add(new THREE.Vector3(x, y, z));
const CAM21 = [o21(-3, 3.8, 16), o21(-3, 3.0, 0)];
const GAP21 = [8.8, 11.6];
{
  const G = (geo, m, pos, rot = [0, 0, 0]) => add(geo, m, o21(...pos).toArray(), rot);
  G(new THREE.PlaneGeometry(130, 80), mat(['#1e0b55', '#2a0c78', '#4b00ff'], { axis: [1, -1, 0], lo: O21.x - O21.y - 20, hi: O21.x - O21.y + 40 }), [-5, 0, -8]);
  const trackM = mat(['#ff8a2a', '#e0409a', '#7b2bf9'], { axis: [1, 0, 0], lo: O21.x - 20, hi: O21.x + 30 }), plateM = mat(['#3a10a8', '#5a0bff'], { axis: [1, 0, 0], lo: O21.x - 20, hi: O21.x + 30 });
  for (const [x0, x1] of [[-45, GAP21[0]], [GAP21[1], 40]]) {          // gap where the sphere drops into frame 22
    G(new THREE.BoxGeometry(x1 - x0, 0.6, 3), trackM, [(x0 + x1) / 2, -1.3, 0]);
    G(new THREE.BoxGeometry(x1 - x0, 3, 0.4), plateM, [(x0 + x1) / 2, -3.1, 1.2]);
  }
  const moving = [];
  const mv = (mesh, fn) => { moving.push({ mesh, base: mesh.position.clone(), rot: mesh.rotation.clone(), fn }); return mesh; };
  // stripes behind the ball on the right, sliding at different rates
  for (let k = 0; k < 5; k++) mv(G(new THREE.BoxGeometry(30, 0.36, 0.3), mat(k % 2 ? ['#7b2bf9', '#e0409a'] : ['#ffb070', '#ff7a1a', '#e0409a'], { axis: [1, 0, 0], lo: O21.x + 8, hi: O21.x + 38 }), [23, -0.7 + k * 0.5, -2]),
    (t, o) => { o.x = 2.5 * Math.sin(t * (0.6 + 0.17 * k) + k); });
  // half-discs on the left that flip in turn
  [-12, -9.3, -6.6, -3.9].forEach((x, k) => mv(G(ext(halfDisc(1.9), 0.3), mat(k % 2 ? ['#ffb070', '#ff7a1a'] : ['#6a14ff', '#b58bff'], { axis: [1, 0, 0], lo: O21.x + x - 1.9, hi: O21.x + x }), [x, 0, -2.2], [0, 0, Math.PI / 2]),
    (t, o, r) => { const c = ((t - 96.4 - 0.35 * k) / 1.6), f = c - Math.floor(c), e = f < 0.4 ? 0.5 - 0.5 * Math.cos(Math.PI * f / 0.4) : 1; r.y = Math.PI * (Math.floor(Math.max(0, c)) + (c > 0 ? e : 0)); }));
  // open ring at the top that turns
  const cArc = new THREE.Shape(); cArc.absarc(0, 0, 5, 0.3, 1.5 * Math.PI + 0.3, false); cArc.absarc(0, 0, 3.2, 1.5 * Math.PI + 0.3, 0.3, true);
  mv(G(ext(cArc, 0.4), mat(['#ff8a2a', '#ffb070', '#e0409a'], { axis: [0, -1, 0], lo: -O21.y - 15, hi: -O21.y - 5 }), [-2, 10.5, -5]), (t, o, r) => { r.z = 0.35 * (t - 96); });
  // ∪ shape and a stadium outline that slide
  mv(G(ext(arch(5.5, 7, 1.7), 0.4), mat(['#6a14ff', '#8a2bf0']), [13, 12.5, -5], [0, 0, Math.PI]), (t, o) => { o.y = 1.2 * Math.sin(0.8 * (t - 96)); });
  mv(G(ext(withHole(rr(15, 5.2, 2.6), rr(11, 1.8, 0.9)), 0.4), mat(['#e0409a', '#ff7a1a'], { axis: [1, 0, 0], lo: O21.x + 12, hi: O21.x + 27 }), [21, 9, -6]), (t, o) => { o.x = -2.2 * Math.sin(0.55 * (t - 96)); });
  // big quarter disc lower left that turns in 90° steps, and a rounded block
  const qd = new THREE.Shape(); qd.moveTo(0, 0); qd.lineTo(8, 0); qd.absarc(0, 0, 8, 0, Math.PI / 2, false); qd.lineTo(0, 0);
  mv(G(ext(qd, 0.4), mat(['#5a0bff', '#b58bff']), [-20, -4, -6]), (t, o, r) => { const c = (t - 96.6) / 1.4, f = c - Math.floor(c), e = f < 0.35 ? 0.5 - 0.5 * Math.cos(Math.PI * f / 0.35) : 1; r.z = c > 0 ? (Math.floor(c) + e) * Math.PI / 2 : 0; });
  G(ext(rr(11, 9, 4.5), 0.3), mat(['#6a14ff', '#e0409a', '#ff7a1a'], { axis: [1, -1, 0], lo: O21.x - O21.y - 24, hi: O21.x - O21.y - 8 }), [-15, 8, -6.5]);
  G(ext(disc(4.5), 0.3), mat(['#8a2bf0', '#d10cf0']), [5, -9, -6]);
  animFns.push(t => moving.forEach(s => {
    const o = new THREE.Vector3(), r = new THREE.Euler().copy(s.rot);
    s.fn(t, o, r);
    s.mesh.position.copy(s.base).add(o); s.mesh.rotation.copy(r);
  }));
  // two dark half-discs just in front of the camera at the cut; they part to reveal the frame
  const dir = CAM21[1].clone().sub(CAM21[0]).normalize(), ctr = CAM21[0].clone().addScaledVector(dir, 3);
  const darkM = mat(['#150632'], { flat: true }), edgeM = mat(['#ff8a1a', '#ffa800'], { flat: true });
  const halves = [1, -1].map(s => {
    const g = new THREE.Group(); g.position.copy(ctr); g.rotation.z = s > 0 ? 0 : Math.PI; scene.add(g);
    add(new THREE.ShapeGeometry(halfDisc(2.9), 48), darkM, [0, 0, 0], [0, 0, 0], g);
    add(new THREE.BoxGeometry(5.8, 0.05, 0.02), edgeM, [0, 0.025, 0.01], [0, 0, 0], g);
    return { g, s };
  });
  const ease = gsap.parseEase('power3.inOut');
  animFns.push(t => halves.forEach(({ g, s }) => {
    const u = Math.min(1, Math.max(0, (t - 96.0) / 0.75));
    g.visible = t >= T_CUT5 && u < 1;
    g.position.copy(ctr).add(new THREE.Vector3(0, s * 3.4 * ease(u), 0));
  }));
}

/* =====================================================================
   SECTION L · frames 22–24 · below the frame-21 track: drop between rails, roll behind the eBC
   screen (a 2D overlay), loop-the-loop, hump over an orange arch, turn into a dark doorway
   (all in o21 coordinates; the ball centre runs at y −14)
   ===================================================================== */
const PY = -14;
const LX = 48.8, LR = 4.2, LZ = -2.8;                    // loop: centre x, ball-centre radius, z drift across it
const loopPt = u => {
  const f = -Math.PI / 2 + 2 * Math.PI * u, d = new THREE.Vector3(Math.cos(f), Math.sin(f), 0);
  return { p: o21(LX + LR * d.x, PY + LR + LR * d.y, LZ * u), c: 1, n: d.clone().negate(),
    tan: new THREE.Vector3(-d.y * 2 * Math.PI * LR, d.x * 2 * Math.PI * LR, LZ).normalize() };
};
const HX = 72, HA = 8, HH = 3.2, TX = 82, DX = TX + 3.2;  // hump centre / half-width / height, turn start, doorway x
const humpY = x => (Math.abs(x - HX) < HA ? HH * 0.5 * (1 + Math.cos(Math.PI * (x - HX) / HA)) : 0);
const p24pts = (zEnd) => {
  const pts = [o21(LX, PY, LZ), o21(52, PY, LZ), o21(56, PY, LZ), o21(60, PY, LZ)];
  for (let x = 63; x <= 81; x += 1) pts.push(o21(x, PY + humpY(x), LZ));
  for (let k = 1; k <= 8; k++) { const a = (k / 8) * Math.PI / 2; pts.push(o21(TX + 3.2 * Math.sin(a), PY, LZ - 3.2 + 3.2 * Math.cos(a))); }   // turn toward the wall
  pts.push(o21(DX, PY, zEnd));
  return new THREE.CatmullRomCurve3(pts, false, 'centripetal');
};
const P24 = p24pts(-14);
const fH0 = arcFrac(P24, o21(HX - HA, PY, LZ)), fH1 = arcFrac(P24, o21(HX + HA, PY, LZ));
{
  const G = (geo, m, pos, rot = [0, 0, 0]) => add(geo, m, o21(...pos).toArray(), rot);
  // frame 22: rails either side of the drop, flat track (runs under the eBC screen to the loop)
  const railM = mat(['#ffb060', '#ff7a1a', '#d0509a'], { axis: [0, -1, 0], lo: -O21.y + 1.6, hi: -O21.y + 8 });
  for (const x of [GAP21[0] - 0.25, GAP21[1] + 0.25]) G(new THREE.BoxGeometry(0.45, 6.4, 0.45), railM, [x, -4.8, 0]);
  G(new THREE.BoxGeometry(LX - 2, 0.8, 2.4), mat(['#ff8a2a', '#e0409a', '#8a2bf0'], { axis: [1, 0, 0], lo: O21.x + 4, hi: O21.x + LX }), [(LX + 2) / 2, PY - 1.4, 0]);
  // frame 22 reliefs on the frame-21 wall
  G(ext(rr(24, 4.4, 2.2), 0.2), mat(['#2a0c78'], { flat: true }), [2, -4.5, -7.9]);
  G(ext(withHole(rr(18, 15, 7.5), rr(9, 6, 3)), 0.25), mat(['#ffa800', '#ff7a1a', '#e0409a'], { axis: [0, -1, 0], lo: -O21.y + 12, hi: -O21.y + 27 }), [31, -19.5, -7.85]);
  [-6, 0.8, 7.6, 14.4].forEach((x, k) => G(ext(halfDisc(3.4), 0.2), mat(k % 2 ? ['#6a14ff', '#b58bff'] : ['#ff7a1a', '#e0409a'], { axis: [1, 0, 0], lo: O21.x + x - 3.4, hi: O21.x + x + 3.4 }), [x, -24.6, -7.9]));
  // frame 23: the loop (a band swept round the ball-centre circle, drifting back in z)
  {
    const N = 200, w = 1.2, rIn = LR + R, rOut = rIn + 1.3, pos = [];
    const P = (u, r, dz) => { const f = -Math.PI / 2 + 2 * Math.PI * u; return o21(LX + r * Math.cos(f), PY + LR + r * Math.sin(f), LZ * u + dz).toArray(); };
    const q = (a, b, c, d) => pos.push(...a, ...b, ...c, ...c, ...b, ...d);
    for (let i = 0; i < N; i++) {
      const u0 = i / N, u1 = (i + 1) / N;
      q(P(u0, rIn, -w), P(u1, rIn, -w), P(u0, rIn, w), P(u1, rIn, w));
      q(P(u0, rOut, -w), P(u1, rOut, -w), P(u0, rOut, w), P(u1, rOut, w));
      q(P(u0, rIn, w), P(u1, rIn, w), P(u0, rOut, w), P(u1, rOut, w));
      q(P(u0, rIn, -w), P(u1, rIn, -w), P(u0, rOut, -w), P(u1, rOut, -w));
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    add(g, mat(['#4b00ff', '#8a2bf0', '#d10cf0'], { axis: [0, 1, 0], lo: O21.y + PY - 1, hi: O21.y + PY + 2 * LR + 2, flat: true, side: THREE.DoubleSide }));
  }
  // frame 24: track after the loop (stops at the doorway so the room stays dark), arch under the hump
  ribbon(p24pts(-6.3), () => 2.4, 1.0, mat(['#ff8a2a', '#e0409a', '#7b2bf9'], { axis: [1, 0, 0], lo: O21.x + LX, hi: O21.x + DX }), mat(['#ff7a1a', '#c04aa0']), 400);
  G(ext(arch(9, 13.3, 2.6), 2.36), mat(['#ffa800', '#ff7a1a', '#e0409a'], { axis: [0, -1, 0], lo: -O21.y - PY - 1, hi: -O21.y - PY + 12 }), [HX, PY - 12, LZ - 1.18]);   // a hair narrower than the 2.4 track: flush sides flicker
  G(ext(archShape(3.8, 10.6), 0.1), mat(['#2a0c78'], { flat: true }), [HX, PY - 12, LZ - 1.25]);
}
// wall with the dark doorway (frame 24) — also carries the frame-23 tiles
const w24 = new THREE.Group(); w24.position.copy(o21(DX, PY - 1, -6)); scene.add(w24);
{
  const W = (geo, m, x, y, z = 0.05, rz = 0) => add(geo, m, [x, y, z], [0, 0, rz], w24);
  const lx = x => x - DX;                               // o21 x → wall-local x
  W(wallArch(102, 70, 3, 5, 7), mat(['#4b00ff', '#6a14ff', '#8a2bf0'], { axis: [1, 1, 0], lo: O21.x + 40 + O21.y, hi: O21.x + 120 + O21.y, side: THREE.DoubleSide }), 0, 0, 0);
  darkRoom(w24, 5, 7, 24);
  W(ext(arch(7.4, 8.2, 1.2), 0.4), mat(['#ff8a1a', '#e0409a']), 0, 0, 0.02);
  // tiles (frame 23, right half)
  const tile = (x0, y0, w, h, cols) => W(new THREE.PlaneGeometry(w, h), mat(cols, { axis: [1, -1, 0], lo: O21.x + x0 + O21.y + y0 - h, hi: O21.x + x0 + w + O21.y + y0 }), lx(x0 + w / 2), y0 - PY + 1 + h / 2 - h, 0.03);
  tile(50.5, -7.7 + 8.9, 9.5, 8.9, ['#2a0c78', '#3a10b0']);
  tile(60, -7.7 + 8.9, 9.5, 8.9, ['#ffb070', '#ff7a1a']);
  tile(50.5, -25 + 17.3, 9.5, 17.3, ['#4b00ff', '#6a14ff', '#8a2bf0']);
  tile(60, -25 + 17.3, 9.5, 17.3, ['#3a10a8', '#5a0bff']);
  const wy = y => y - PY + 1;                            // o21 y → wall-local y
  W(ext(halfDisc(3.2), 0.2), mat(['#8a2bf0', '#d10cf0']), lx(55.25), wy(-2.4), 0.06);
  W(ext(halfDisc(3.2), 0.2), mat(['#ffb060', '#ff8a2a']), lx(55.25), wy(-6.9), 0.06);
  const qd = new THREE.Shape(); qd.moveTo(0, 0); qd.lineTo(4.45, 0); qd.absarc(0, 0, 4.45, 0, Math.PI / 2, false); qd.lineTo(0, 0);
  [[60, -7.7, 0], [69.5, -7.7, Math.PI / 2], [69.5, 1.2, Math.PI], [60, 1.2, -Math.PI / 2]].forEach(([x, y, r]) => W(ext(qd, 0.2), mat(['#ff5a7a', '#e0409a']), lx(x), wy(y), 0.06, r));
  W(ext(archShape(7, 12), 0.2), mat(['#e0409a', '#8a2bf0']), lx(55.25), wy(-25), 0.06);
  for (let k = 0; k < 4; k++) W(new THREE.BoxGeometry(0.35, 13, 0.1), mat(['#ffb070', '#ff7a1a']), lx(53 + k * 1.5), wy(-18.5), 0.3);
  W(ext(halfDisc(8.2), 0.2), mat(['#e0409a', '#8a2bf0']), lx(60), wy(-16.3), 0.06, -Math.PI / 2);
  // frame 24: big arch at the top centre
  W(ext(arch(12, 26, 3.6), 0.3), mat(['#ff8a2a', '#e0409a', '#8a2bf0'], { axis: [0, -1, 0], lo: -O21.y - PY - 14, hi: -O21.y - PY + 10 }), lx(76.5), -11, 0.1);
}

/* =====================================================================
   SECTION M · frame 25 · out of a big dark arched tunnel toward camera, then right
   ===================================================================== */
const O25 = new THREE.Vector3(1500, -40, 0);
const o25 = (x, y, z) => O25.clone().add(new THREE.Vector3(x, y, z));
const P25 = new THREE.CatmullRomCurve3([o25(0, 0, -14), o25(0, 0, -6), o25(0, 0, -1), o25(0, 0, 1.2),
  ...Array.from({ length: 9 }, (_, k) => { const a = (k + 1) / 9 * Math.PI / 2; return o25(3 - 3 * Math.cos(a), 0, 1.2 + 3 * Math.sin(a)); }),
  o25(8, 0, 4.2), o25(20, 0, 4.2), o25(34, 0, 4.2)], false, 'centripetal');
const fOut25 = arcFrac(P25, o25(0, 0, 1.2));
{
  const P = new THREE.CatmullRomCurve3(P25.points.slice(2), false, 'centripetal');
  ribbon(P, () => 3, 0.9, mat(['#ff8a2a', '#ff7a1a', '#e0409a'], { axis: [1, 0, 0], lo: O25.x - 2, hi: O25.x + 24 }), mat(['#ff7a1a', '#c04aa0']), 300);
  const w25 = new THREE.Group(); w25.position.copy(o25(0, -1, 0)); scene.add(w25);
  const W = (geo, m, x, y, z = 0.05, rz = 0) => add(geo, m, [x, y, z], [0, 0, rz], w25);
  W(wallArch(120, 70, 20, 6, 11.25), mat(['#4b00ff', '#7a2bff', '#c050a0'], { axis: [1, 1, 0], lo: O25.x + O25.y - 20, hi: O25.x + O25.y + 30, side: THREE.DoubleSide }), 0, 0, 0);
  const room = darkRoom(w25, 6, 11.25, 24);
  const darkS = room.material.clone(); darkS.side = THREE.FrontSide; darkS.uniforms = room.material.uniforms;   // same colour and drift as the room
  W(ext(arch(13.5, 15, 3.75), 0.2), darkS, 0, 0, 0.02);          // the big dark ∩ around the doorway reads as one shape
  W(ext(arch(11, 13, 3.6), 0.3), mat(['#ff7a1a', '#e0409a', '#8a2bf0'], { axis: [0, -1, 0], lo: -O25.y - 12, hi: -O25.y + 2 }), -13.5, -5);
  W(ext(halfDisc(5.6), 0.3), mat(['#ff8a2a', '#ff5a3a']), 1.5, 15.6, 0.05, Math.PI);
  W(ext(archShape(13, 22), 0.2), mat(['#3a10a8', '#6a14ff']), 14.5, -5, 0.03);
  const qd = new THREE.Shape(); qd.moveTo(0, 0); qd.lineTo(6.2, 0); qd.absarc(0, 0, 6.2, 0, Math.PI / 2, false); qd.lineTo(0, 0);
  W(ext(qd, 0.2), mat(['#6a14ff', '#e0409a', '#ff7a1a'], { axis: [1, 0, 0], lo: O25.x + 8, hi: O25.x + 20 }), 14.5, 4.4, 0.06, Math.PI / 2);
  W(ext(qd, 0.2), mat(['#ff7a1a', '#ffa800']), 14.5, 4.4, 0.06, Math.PI);
  // three stacked pills under the ball, like the board
  [['#4b00ff', '#b58bff'], ['#c8c4ff'], ['#ff7a1a', '#ff4f7b']].forEach((c, k) => add(ext(rr(4.6, 0.85, 0.42), 0.3), mat(c, { axis: [1, 0, 0], lo: O25.x - 2.3, hi: O25.x + 2.3, flat: true }), o25(0.2, -2.35 - k * 1.15, 5.4).toArray()));
}

/* =====================================================================
   SECTION N · frame 27 · a ramp from the right, down behind the tail-art image
   ===================================================================== */
const O27 = new THREE.Vector3(1700, -40, 0);
const o27 = (x, y, z) => O27.clone().add(new THREE.Vector3(x, y, z));
const ramp27 = x => 3.6 - 0.364 * (20 - x);              // ball-centre height along the ramp
{
  const G = (geo, m, pos, rot = [0, 0, 0]) => add(geo, m, o27(...pos).toArray(), rot);
  const a = o27(24, ramp27(24), 0), b = o27(-34, ramp27(-34), 0), d = b.clone().sub(a).normalize(), n = surfN(d);
  slab(a.clone().addScaledVector(n, -R), b.clone().addScaledVector(n, -R), 2.4, 0.8, mat(['#ff8a2a', '#e0409a', '#7b2bf9'], { axis: [-1, 0, 0], lo: -O27.x - 20, hi: -O27.x + 12 }));
  G(new THREE.PlaneGeometry(100, 60), mat(['#2a0c78', '#4b00ff', '#6a14ff'], { axis: [1, 1, 0], lo: O27.x + O27.y - 30, hi: O27.x + O27.y + 30 }), [0, 0, -6]);
  G(ext(arch(13, 20, 3.5), 0.3), mat(['#ff8a2a', '#e0409a', '#8a2bf0'], { axis: [0, -1, 0], lo: -O27.y - 10, hi: -O27.y + 10 }), [10.7, -10.3, -4]);
  G(ext(archShape(5.4, 7.2), 0.1), mat(['#1e0b55'], { flat: true }), [10.7, -1.2, -3.95]);
  for (let k = 0; k < 4; k++) G(new THREE.BoxGeometry(0.4, 4.6, 0.1), mat(['#6a14ff', '#b58bff']), [8.9 + k * 1.2, 7.9, -3.6]);
  for (let k = 0; k < 4; k++) G(ext(arch(4.4, 5, 1.2), 0.3), mat(['#6a14ff', '#8a2bf0']), [-16 + k * 4.4, 13, -4.5], [0, 0, Math.PI]);
  G(ext(arch(12, 14, 3.5), 0.3), mat(['#8a2bf0', '#e0409a', '#ff7a1a'], { axis: [0, -1, 0], lo: -O27.y - 6, hi: -O27.y + 14 }), [-15, -16, -4.5]);
  G(ext(rr(8, 20, 4), 0.2), mat(['#3a10a8'], { flat: true }), [2, 6, -5]);
}

/* =====================================================================
   SECTION O · frame 28 · the sphere runs across the copy (2D lines): a ledge in from the right, a narrow
   funnel onto the top of GAME-CHANGING, a big rounded edge down the right, a track back left under
   the last lines. Laid out in stage pixels on the z = 0 plane of a fixed camera (sw below).
   ===================================================================== */
const O28 = new THREE.Vector3(1900, -40, 0), CAM28 = 26;
const o28 = (x, y, z) => O28.clone().add(new THREE.Vector3(x, y, z));
const K28 = 960 / (CAM28 * Math.tan(20 * Math.PI / 180) * 16 / 9);   // stage px per world unit at z = 0
const sw = (px, py, z = 0) => o28((px - 960) / K28, (540 - py) / K28, z);
const RPX = R * K28;                                                // sphere radius in stage px
const F28 = { ledgeY: 340, ledgeX: 1354, funX: 1240, funTop: 350, funBot: 445, textTop: 535, bendX: 1470, trackY: 1002, trackL: 560 };
const B28 = sw(F28.bendX, (F28.textTop - RPX + F28.trackY - RPX) / 2), RB28 = (F28.trackY - F28.textTop) / 2 / K28;
const TILT28 = 18 * Math.PI / 180, FUN_R = 2.0, FUN_H = (F28.funBot - F28.funTop) / K28;   // funnel lean, rim radius, height (world units)
const PIV28 = sw(F28.funX + FUN_R * K28, F28.funTop);                                       // rim edge by the ledge's end (stays put)
const fun28 = (x, y) => PIV28.clone().add(new THREE.Vector3(x * Math.cos(TILT28) - y * Math.sin(TILT28), x * Math.sin(TILT28) + y * Math.cos(TILT28), 0));   // funnel-local → world
{
  const trackM = mat(['#ff8a2a', '#e0409a', '#7b2bf9'], { axis: [1, 0, 0], lo: O28.x - 16, hi: O28.x + 18 });
  const flatSlab = (x0, x1, py) => slab(sw(x0, py), sw(x1, py), 2.4, 0.5, trackM);
  const kit = [flatSlab(F28.ledgeX, 2100, F28.ledgeY),                              // ledge in from the right
    flatSlab(F28.trackL, F28.bendX, F28.trackY)];                                   // track back left under the copy
  // the funnel leans (TILT28) so its spout points at the bounce on the track; it pivots on the rim edge by the ledge's end
  const fg = new THREE.Group(); fg.position.copy(PIV28); fg.rotation.z = TILT28; scene.add(fg);
  add(new THREE.CylinderGeometry(FUN_R, 1.15, FUN_H, 40, 1, true), mat(['#ffb060', '#ff7a1a', '#c04aa0'], { axis: [0, -1, 0], lo: -sw(0, F28.funTop).y - 1, hi: -sw(0, F28.funBot).y + 1, side: THREE.DoubleSide }), [-FUN_R, -FUN_H / 2, 0], [0, 0, 0], fg);
  add(new THREE.TorusGeometry(FUN_R, 0.16, 10, 48), mat(['#ffa800'], { flat: true }), [-FUN_R, 0, 0], [Math.PI / 2, 0, 0], fg);
  kit.push(fg);
  kit.push(add(ext(halfRing(RB28 + R + 0.5, RB28 + R), 2.4), mat(['#ffa800', '#ff7a1a', '#d10cf0'], { axis: [0, -1, 0], lo: -B28.y - RB28 - 1, hi: -B28.y + RB28 + 1 }), [B28.x, B28.y, B28.z - 1.2], [0, 0, -Math.PI / 2]));
  animFns.push(t => kit.forEach(m => { m.visible = t < 135.5; }));                    // frame 30 looks up past where they hang
  // backdrop (frames 28–30), far enough back for the frame 29–30 ramp
  const W = (geo, m, x, y, z = -12) => add(geo, m, o28(x, y, z).toArray());
  W(new THREE.PlaneGeometry(150, 110), mat(['#2a0c78', '#4b00ff', '#6a14ff'], { axis: [1, 1, 0], lo: O28.x + O28.y - 40, hi: O28.x + O28.y + 40 }), 0, -20);
  for (let k = 0; k < 5; k++) add(ext(arch(6.4, 7, 1.8), 0.3), mat(['#6a14ff', '#8a2bf0']), o28(-17 + k * 6.4, 16.5, -11.8).toArray(), [0, 0, Math.PI]);
  W(ext(ring(6, 3.6), 0.3), mat(['#ffa800', '#e0a020', '#c04aa0'], { axis: [1, 0, 0], lo: O28.x - 30, hi: O28.x - 18 }), -25, 3, -11.8);
  W(ext(ring(10, 6.5), 0.3), mat(['#8a2bf0', '#e0409a', '#ff7a1a'], { axis: [1, -1, 0], lo: O28.x - O28.y - 5, hi: O28.x - O28.y + 20 }), 6, -14, -11.85);
}

/* =====================================================================
   SECTION P · frames 29–30 · a widening ramp out of a ring. From the side it runs down to the right
   (29); head-on it reads as the board's orange triangle with the ring behind the apex (30).
   ===================================================================== */
// K30: the ramp is 1.85× its first length so the sphere rolls at about frame 31's pace across the (trimmed) frames 29–30 (≈9 u/s, was ≈3.6);
// the frame 30 camera sits further back and zooms in (FOV30), and the ring is 1.25× (RING30), so the head-on triangle still reads the same
const K30 = 1.85, FOV30 = 32, RING30 = 1.25;
const RA = o28(-10, -22, -4), RD = new THREE.Vector3(18, -12, 40).multiplyScalar(K30), RBp = RA.clone().add(RD), RDn = RD.clone().normalize();
const rampAt = s => RA.clone().addScaledVector(RD, s);
{
  ribbon(new THREE.LineCurve3(RA.clone().addScaledVector(RDn, -0.6), RBp), u => 1.8 + 12.2 * K30 * u, 1.2,
    mat(['#ffa800', '#ff7a1a', '#c04aa0'], { axis: RDn.toArray(), lo: RDn.dot(RA), hi: RDn.dot(RBp) }), mat(['#ff7a1a', '#8a2bf0']), 200);
  const g = new THREE.Group(); g.position.copy(RA); g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), RDn); g.scale.setScalar(RING30); scene.add(g);
  add(new THREE.TorusGeometry(3.3, 0.8, 16, 64), mat(['#ff8a2a', '#e0409a', '#6a14ff'], { axis: [1, -1, 0], lo: RA.x - RA.y - 5, hi: RA.x - RA.y + 5 }), [0, 0, 0], [0, 0, 0], g);
  add(new THREE.TorusGeometry(4.6, 0.35, 12, 64), mat(['#8a2bf0', '#ff7a1a']), [0, 0, -0.6], [0, 0, 0], g);
  tunnel(g, 2.5, 7);
  // frame 29 reliefs on the backdrop (right side, behind the copy; big ring lower right)
  add(ext(rr(30, 10, 5), 0.3), mat(['#6a14ff', '#b030e8', '#e020f0'], { axis: [1, 0, 0], lo: O28.x + 5, hi: O28.x + 35 }), o28(20, -24, -11.7).toArray());
  add(ext(arch(16, 16, 4.2), 0.3), mat(['#ff7a1a', '#e0409a', '#8a2bf0'], { axis: [1, 0, 0], lo: O28.x + 12, hi: O28.x + 28 }), o28(20, -44, -11.76).toArray());   // just behind the pill it overlaps
}

/* =====================================================================
   SECTION Q · frame 31 · shapes split apart as the sphere rolls through; the logo (2D) is revealed
   ===================================================================== */
const O31 = new THREE.Vector3(2100, -40, 0);
const o31 = (x, y, z) => O31.clone().add(new THREE.Vector3(x, y, z));
const Y31 = -4.26;                                                   // ball centre height (rolls along the orange band)
{
  const G = (geo, m, pos, rot = [0, 0, 0], parent = scene) => add(geo, m, parent === scene ? o31(...pos).toArray() : pos, rot, parent);
  G(new THREE.PlaneGeometry(120, 70), mat(['#1e0b55', '#3a10b0', '#4b00ff'], { axis: [1, -1, 0], lo: O31.x - O31.y - 25, hi: O31.x - O31.y + 25 }), [0, 0, -7]);
  G(new THREE.BoxGeometry(70, 6, 2.4), mat(['#c04aa0', '#ff7a1a', '#ffa800'], { axis: [1, 0, 0], lo: O31.x - 12, hi: O31.x + 20 }), [14, Y31 - R - 3, 0]);
  const grp = () => { const g = new THREE.Group(); g.position.copy(O31); scene.add(g); return g; };
  const L = grp(), Rt = grp(), C = grp();
  const qd = new THREE.Shape(); qd.moveTo(0, 0); qd.lineTo(4, 0); qd.absarc(0, 0, 4, 0, Math.PI / 2, false); qd.lineTo(0, 0);
  G(ext(withHole(rr(14, 22, 7), rr(6, 12, 3)), 0.3), mat(['#ff7a1a', '#e0409a', '#6a14ff'], { axis: [1, 0, 0], lo: O31.x - 26, hi: O31.x - 10 }), [-19, -1, -5.5], [0, 0, 0], L);
  [-17, -12.5, -8].forEach((x, k) => G(ext(halfDisc(2.3), 0.3), mat(k % 2 ? ['#6a14ff', '#ff7a1a'] : ['#ff5a3a', '#6a14ff'], { axis: [0, -1, 0], lo: -O31.y - 12, hi: -O31.y - 7 }), [x, 12.3, -5.4], [0, 0, Math.PI], L));
  G(ext(rr(26, 9, 4.5), 0.3), mat(['#2a0c78', '#4b00ff', '#ff7a1a'], { axis: [1, 0, 0], lo: O31.x + 2, hi: O31.x + 28 }), [16, 10.5, -5.5], [0, 0, 0], Rt);
  G(ext(arch(14, 20, 4.2), 0.3), mat(['#8a2bf0', '#b030e8', '#6a14ff']), [17, -11, -5.4], [0, 0, 0], Rt);
  // two big half-discs that meet in the middle, then part
  G(ext(halfDisc(7.5), 0.3), mat(['#4b00ff', '#8a2bf0', '#e0409a'], { axis: [1, 0, 0], lo: O31.x - 8, hi: O31.x }), [0, 0.5, -4.5], [0, 0, Math.PI / 2], C);
  G(ext(halfDisc(7.5), 0.3), mat(['#e0409a', '#ff7a1a', '#ffa800'], { axis: [1, 0, 0], lo: O31.x, hi: O31.x + 8 }), [0, 0.5, -4.4], [0, 0, -Math.PI / 2], C);
  const halvesC = C.children.slice();
  const ease = gsap.parseEase('power3.inOut');
  animFns.push(t => {
    const u = ease(Math.min(1, Math.max(0, (t - 142.9) / 1.5)));
    L.position.copy(O31).add(new THREE.Vector3(7 * (1 - u), 0, 0));
    Rt.position.copy(O31).add(new THREE.Vector3(-7 * (1 - u), 0, 0));
    halvesC[0].position.x = -14 * u; halvesC[1].position.x = 14 * u;
  });
}

/* =====================================================================
   The sphere: conic palette in local space (so it rolls), fixed highlight in view space
   ===================================================================== */
const SV = `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vL; varying vec3 vNv;
void main() { vL = position; vNv = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}`;
const SF = `
uniform vec3 ring[8];
uniform float dim;
varying vec3 vL; varying vec3 vNv;
#include <logdepthbuf_pars_fragment>
void main() {
  float a = atan(vL.z, vL.x) / 6.28318 + 0.5 + vL.y * 0.12;
  a = fract(a) * 8.0;
  int i = int(floor(a)); float f = fract(a);
  vec3 col = mix(ring[i], ring[(i + 1) - 8 * ((i + 1) / 8)], smoothstep(0.0, 1.0, f));
  vec3 n = normalize(vNv);
  float d = max(dot(n, normalize(vec3(-0.45, 0.55, 0.7))), 0.0);
  float dark = smoothstep(-0.1, 0.9, dot(n, normalize(vec3(0.45, -0.6, 0.35))));
  col = col * (1.0 - 0.35 * dark) + vec3(pow(d, 30.0) * 0.95 + pow(d, 6.0) * 0.22);
  gl_FragColor = vec4(col, 1.0 - dim);                              // melts into a dark room (see render3D)
  #include <logdepthbuf_fragment>
}`;
const ringCols = ['#ff7a00', '#ffd9a0', '#ffffff', '#ff4f7b', '#b52bf0', '#4b00ff', '#6a14ff', '#d10cf0'].map(hexV);
const ball = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 48), new THREE.ShaderMaterial({ uniforms: { ring: { value: ringCols }, dim: { value: 0 } }, vertexShader: SV, fragmentShader: SF }));
scene.add(ball);
// stylised contact shadow (board uses a dark ellipse)
const shTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(10,0,25,0.95)'); grd.addColorStop(0.55, 'rgba(10,0,25,0.6)'); grd.addColorStop(1, 'rgba(10,0,25,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();
const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.6 * R, 2.6 * R), new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false }));
scene.add(shadow);

/* =====================================================================
   Sphere trajectory: segments → sampled table (position, contact, roll)
   ===================================================================== */
const segs = [];
const seg = (t0, t1, ease, fn) => segs.push({ t0, t1, e: gsap.parseEase(ease), fn });
const easeV = a => u => a * u + (1 - a) * u * u;                     // start speed a × average (end speed 2 − a)
// Hermite ease: start / end speed as multiples of the seg's average speed; monotonic while m0² + m1² ≤ 9
const easeH = (m0, m1) => u => { const u2 = u * u, u3 = u2 * u; return 3 * u2 - 2 * u3 + m0 * (u3 - 2 * u2 + u) + m1 * (u3 - u2); };
// consecutive segs [t0, t1, length, fn] with no stop-and-start between them (the user wants continuous motion):
// knot times and places are kept, the speed at each knot is the weighted harmonic mean of the neighbouring
// average speeds (a monotone cubic, as PCHIP); v0 / v1 set the end speeds (default: that seg's average)
const runSegs = (list, v0, v1) => {
  const d = list.map(([a, b, L]) => L / (b - a)), h = list.map(([a, b]) => b - a), v = [v0 ?? d[0]];
  for (let k = 1; k < list.length; k++) { const w1 = 2 * h[k] + h[k - 1], w2 = h[k] + 2 * h[k - 1]; v.push((w1 + w2) / (w1 / d[k - 1] + w2 / d[k])); }
  v.push(v1 ?? d.at(-1));
  list.forEach(([a, b, , fn], k) => { let m0 = v[k] / d[k], m1 = v[k + 1] / d[k]; const r = Math.hypot(m0, m1) / 3; if (r > 1) { m0 /= r; m1 /= r; } seg(a, b, easeH(m0, m1), fn); });
  return v;
};
const up = new THREE.Vector3(0, 1, 0);
const onTop = p => p.clone().add(new THREE.Vector3(0, R, 0));
const A1a = onTop(J[0]), A1b = onTop(J[1]);
const lastDir = J[5].clone().sub(J[4]).normalize();
const A2 = new THREE.CatmullRomCurve3([...J.slice(1).map(onTop), onTop(J[5]).addScaledVector(new THREE.Vector3(lastDir.x, 0, lastDir.z).normalize(), 1.4)], false, 'centripetal');
const airArc = (a, b, h) => u => ({ p: new THREE.Vector3().lerpVectors(a, b, u).setY(a.y + (b.y - a.y) * u + 4 * h * u * (1 - u)), c: 0 });
const fallArc = (a, b) => u => ({ p: new THREE.Vector3(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u * u, a.z + (b.z - a.z) * u), c: 0 });

const yOnA = x => J[0].y + (J[1].y - J[0].y) * (x - J[0].x) / (J[1].x - J[0].x) + R;
const aDir = A1b.clone().sub(A1a).normalize();
/* =====================================================================
   INTRO · frames 1–5 in 3D (optional: the player's "Frames 1–5" control; the 2D build is kept)
   1–2: the board's flat shapes as reliefs at different depths, laid out in stage px for a reference
   camera (spx), so the composition matches the board while the camera and shapes move in depth.
   2 → 3: the camera dollies through them to frame 3's set. Cut under the full-frame PTP art.
   4–5: the words sit on a pill wall at the mouth of the frame-6 channel; the O becomes the sphere,
   which rolls through the gate straight into the channel (no cut into frame 6).
   ===================================================================== */
const T_CUT0 = 12.7;                     // cut while the PTP art fills the frame (3 → 4)
// frames 4–5 are authored in display time and end at T6D; everything from frame 6 on is authored from T_IN
// and plays SHIFT (index.html) earlier, so render3D maps display time t ≥ T6D to t + SHIFT
const T6D = T_IN - SHIFT;
const DI = 25, KI = 960 / (DI * Math.tan(20 * Math.PI / 180) * 16 / 9);   // reference camera distance, px per unit at depth 0
const O1 = new THREE.Vector3(-400, 0, 0), O3 = O1.clone().add(new THREE.Vector3(0, 0, -70));
const pxs = z => (DI - z) / (DI * KI);                                    // world units per stage px at depth z
const spx = (O, px, py, z) => O.clone().add(new THREE.Vector3((px - 960) * pxs(z), (540 - py) * pxs(z), z));
const EZ = e => gsap.parseEase(e || 'none');
const ev = (keys, t, dflt) => {                                           // piecewise eased keys [[t, v], [t, v, ease], …]
  if (!keys) return dflt;
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { const [t0, v0] = keys[i - 1], [t1, v1, e] = keys[i]; return v0 + (v1 - v0) * e((t - t0) / (t1 - t0)); }
  return keys.at(-1)[1];
};
const gradPx = (cols, O, z, [x0, y0, x1, y1], o = {}) => {                // a gradient running between two stage points
  const A = spx(O, x0, y0, z), B = spx(O, x1, y1, z), ax = B.clone().sub(A).normalize();
  return mat(cols, { axis: ax.toArray(), lo: ax.dot(A), hi: ax.dot(B), ...o });
};
function cornerRect(w, h, r, tl) {                                       // rectangle with one rounded top corner
  const s = new THREE.Shape(), x0 = -w / 2, x1 = w / 2, y0 = -h / 2, y1 = h / 2;
  if (tl) { s.moveTo(x0, y0); s.lineTo(x1, y0); s.lineTo(x1, y1); s.lineTo(x0 + r, y1); s.absarc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI, false); s.lineTo(x0, y0); }
  else { s.moveTo(x0, y0); s.lineTo(x1, y0); s.lineTo(x1, y1 - r); s.absarc(x1 - r, y1 - r, r, 0, Math.PI / 2, false); s.lineTo(x0, y1); s.lineTo(x0, y0); }
  return s;
}
const introObjs = [];
// a relief at stage point (px, py) and depth z; k: eased keys for x/y (stage px offsets), z (depth offset), s (scale), rz, ry
function relief(O, px, py, z, build, k = {}) {
  const g = new THREE.Group(); scene.add(g);
  build(g, pxs(z));
  for (const key in k) k[key].forEach(kk => { kk[2] = EZ(kk[2]); });
  const o = { g, O, px, py, z, k };
  introObjs.push(o); return o;
}
const flat = (shape, m, sc, depth = 0.3, at = [0, 0]) => { const mesh = new THREE.Mesh(ext(shape, depth), m); mesh.position.set(at[0] * sc, -at[1] * sc, -depth); return mesh; };
const qdisc = r => { const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(-r, 0); s.absarc(0, 0, r, Math.PI, 1.5 * Math.PI, false); s.lineTo(0, 0); return s; };
{
  const fly = (d) => [[d, -18], [d + 1.1, 0, 'expo.out']];             // frame 1: shapes arrive out of the depth
  const F2 = 4.2;
  const mvk = (t0, d, v, e = 'power3.inOut') => [[t0, 0], [t0 + d, v, e]];
  // frames 1–2 ----------------------------------------------------------
  relief(O1, 960, 540, -16, (g, s) => g.add(new THREE.Mesh(new THREE.PlaneGeometry(2700 * s, 1700 * s), gradPx(['#170842', '#2a0c78', '#4a0fd0'], O1, -16, [0, 1080, 1920, 0]))));
  relief(O1, 990, 625, -12, (g, s) => g.add(flat(rr(780 * s, 1100 * s, 390 * s), mat(['#5a0bff'], { flat: true }), s)), { z: fly(0.05) });
  relief(O1, 1585, 405, -10, (g, s) => g.add(flat(rr(900 * s, 490 * s, 245 * s), gradPx(['#ff8a1a', '#ff5a6a'], O1, -10, [0, 160, 0, 650]), s)),
    { z: fly(0.2), x: mvk(F2 + 0.05, 1.3, -120), y: mvk(F2 + 0.05, 1.3, 260), s: [[F2 + 0.05, 1], [F2 + 1.35, 0.9, 'power3.inOut']] });
  relief(O1, 1035, 795, -8, (g, s) => {
    g.add(flat(rr(420 * s, 1000 * s, 210 * s), gradPx(['#e8702a', '#8a2ad0', '#2c0c80'], O1, -8, [0, 295, 0, 1295]), s));
    g.add(flat(rr(145 * s, 490 * s, 72 * s), gradPx(['#6a14ff', '#e0508a'], O1, -7.8, [0, 465, 0, 955]), s, 0.3, [-2.5, -85]).translateZ(0.2));
  }, { z: fly(0.12), x: mvk(F2, 1.3, -120), y: mvk(F2, 1.3, 180) });
  relief(O1, 1155, 200, -6, (g, s) => g.add(flat(withHole(rr(450 * s, 250 * s, 125 * s), rr(282 * s, 82 * s, 41 * s)), gradPx(['#5a0bff', '#d10cf0'], O1, -6, [930, 0, 1380, 0]), s)),
    { z: fly(0.3), x: mvk(F2 + 0.1, 1.3, -520), y: mvk(F2 + 0.1, 1.3, -60) });
  // quarter-circle tiles: flip over in 3D, then fold away in frame 2
  const tileCols = [['#ff7a00', '#a64bdb', '#4b00ff'], ['#5a0bff', '#9b45e0', '#ff7a00'], ['#ff8a00', '#ff3d4a']];
  [[180, 180, 0, 0], [540, 180, 1, 1], [180, 540, 0, 2], [540, 540, 1, 0], [180, 900, 0, 1], [540, 900, 1, 2]].forEach(([x, y, flip, c], i) => relief(O1, x, y, -4, (g, s) => {
    const m = new THREE.Mesh(ext(qdisc(360 * s), 0.3), gradPx(tileCols[c], O1, -4, [x - 180, 0, x + 180, 0]));
    m.position.set(180 * s, 180 * s, -0.3); if (flip) { m.rotation.z = Math.PI; m.position.set(-180 * s, -180 * s, -0.3); }
    g.add(m);
  }, { z: fly(0.02 + i * 0.07), ry: [[2.2 + 0.12 * i, 0], [3.1 + 0.12 * i, Math.PI, 'power2.inOut']],
    s: [[F2 + 0.05 * i, 1], [F2 + 0.9 + 0.05 * i, 0.001, 'power3.in']], rz: [[F2 + 0.05 * i, 0], [F2 + 0.9 + 0.05 * i, Math.PI / 2, 'power3.in']] }));
  // frame-2 arrivals
  relief(O1, 150, 640, -3, (g, s) => g.add(flat(disc(200 * s), gradPx(['#ff4f7b', '#ff8a1a'], O1, -3, [-50, 0, 350, 0]), s)), { s: [[F2 + 0.5, 0.001], [F2 + 1.6, 1, 'expo.out']] });
  relief(O1, 560, 900, -2.5, (g, s) => g.add(flat(disc(230 * s), gradPx(['#ff8a00', '#ff3d4a'], O1, -2.5, [330, 0, 790, 0]), s)), { s: [[F2 + 0.65, 0.001], [F2 + 1.75, 1, 'expo.out']] });
  relief(O1, 380, 30, -3.5, (g, s) => g.add(flat(rr(560 * s, 180 * s, 90 * s), mat(['#2a0c6e'], { flat: true }), s)), { s: [[F2 + 0.8, 0.001], [F2 + 1.8, 1, 'expo.out']] });
  // the rest of the frame-1 set
  relief(O1, 1580, -40, -3, (g, s) => { const m = flat(arch(350 * s, 477 * s, 116 * s), gradPx(['#ff8a1a', '#ff5a6a'], O1, -3, [0, -40, 0, 437]), s); m.rotation.z = Math.PI; g.add(m); },
    { z: fly(0.25), y: mvk(F2, 1.0, -520, 'power3.in') });
  relief(O1, 1725, 155, -2.2, (g, s) => g.add(flat(disc(52 * s), mat(['#f9c27e'], { flat: true }), s)), { z: fly(0.4), y: mvk(F2, 1.0, -520, 'power3.in') });
  relief(O1, 1705, 1120, -5, (g, s) => g.add(flat(arch(420 * s, 610 * s, 140 * s), gradPx(['#d10cf0', '#6a14ff'], O1, -5, [0, 510, 0, 1120]), s)),
    { z: fly(0.15), x: mvk(F2 + 0.1, 1.4, -620), y: mvk(F2 + 0.1, 1.4, 60) });
  relief(O1, 1756, 915, -3.2, (g, s) => {
    g.add(flat(disc(178 * s), gradPx(['#ff8a00', '#ff3d4a'], O1, -3.2, [1567, 0, 1923, 0]), s, 0.3, [-11, 0]));
    g.add(flat(new THREE.Shape([[-100, -87.5], [100, -87.5], [100, 87.5], [-100, 87.5]].map(([a, b]) => new THREE.Vector2(a * s, b * s))), mat(['#a57bff'], { flat: true }), s, 0.3, [89, -87.5]).translateZ(0.05));
  }, { z: fly(0.35), x: mvk(F2 + 0.15, 1.4, 120), y: mvk(F2 + 0.15, 1.4, -560), rz: mvk(F2 + 0.15, 1.4, Math.PI / 2) });
  relief(O1, 1440, 875, -1.8, (g, s) => g.add(flat(withHole(rr(560 * s, 310 * s, 155 * s), rr(380 * s, 130 * s, 65 * s)), gradPx(['#3a1880', '#b0506a', '#e0b020'], O1, -1.8, [1160, 0, 1720, 0]), s)),
    { z: fly(0.45), x: mvk(F2 + 0.1, 1.4, 180), y: mvk(F2 + 0.1, 1.4, 40) });
  relief(O1, 1400, 705, -1.2, (g, s) => g.add(flat(disc(30 * s), mat(['#ff8a00', '#ff3d4a']), s)), { z: fly(0.5), x: mvk(F2 + 0.1, 1.2, 290), y: mvk(F2 + 0.1, 1.2, -60) });
  relief(O1, 1605, 402.5, -2.6, (g, s) => g.add(flat(rr(620 * s, 165 * s, 82 * s), mat(['#230c5e', '#3a1090'], { axis: [1, 0, 0], lo: O1.x, hi: O1.x + 12 }), s, 0.6)),
    { z: fly(0.3), x: mvk(F2 + 0.05, 1.3, 180), y: mvk(F2 + 0.05, 1.3, -60) });
  // frame 3 -------------------------------------------------------------
  const F3 = 8.0, inL = (i, d = -800) => [[F3 + 0.1 + i * 0.05, d], [F3 + 1.1 + i * 0.05, 0, 'expo.out']];
  relief(O3, 960, 540, -16, (g, s) => g.add(new THREE.Mesh(new THREE.PlaneGeometry(2700 * s, 1700 * s), gradPx(['#d05a6a', '#4b00ff', '#ff7a1a'], O3, -16, [0, 0, 1920, 0]))));
  relief(O3, 130, 360, -6, (g, s) => g.add(flat(cornerRect(660 * s, 720 * s, 160 * s, false), gradPx(['#e2743a', '#b4368a'], O3, -6, [0, 0, 0, 720]), s)), { x: inL(0) });
  relief(O3, 195, 390, -4, (g, s) => g.add(flat(rr(180 * s, 630 * s, 90 * s), gradPx(['#2a0c55', '#3b0f8a'], O3, -4, [0, 75, 0, 705]), s)), { x: inL(1) });
  relief(O3, 1080, 1045, -5, (g, s) => g.add(flat(rr(760 * s, 280 * s, 1 * s), mat(['#ee5096'], { flat: true }), s)), { y: inL(2, 500) });
  relief(O3, 285, 940, -3, (g, s) => g.add(flat(cornerRect(970 * s, 480 * s, 150 * s, false), gradPx(['#6a14ff', '#4b00d8', '#e8742e'], O3, -3, [0, 0, 770, 0]), s)), { y: inL(3, 500) });
  relief(O3, 1702.5, 345, -7, (g, s) => g.add(flat(cornerRect(895 * s, 630 * s, 350 * s, true), gradPx(['#ff8a2a', '#d2506a'], O3, -7, [0, 30, 0, 660]), s)), { x: inL(4, 900) });
  relief(O3, 1735, 332.5, -3, (g, s) => g.add(flat(rr(560 * s, 205 * s, 102 * s), mat(['#2e0d7a'], { flat: true }), s)), { x: inL(5, 900) });
  relief(O3, 1795, 805, -5.5, (g, s) => g.add(flat(cornerRect(710 * s, 750 * s, 330 * s, true), gradPx(['#f0508c', '#a52bff'], O3, -5.5, [1440, 430, 1920, 1080]), s)), { x: inL(6, 900) });
  relief(O3, 1795, 712, -2, (g, s) => g.add(flat(disc(38 * s), mat(['#ff7a1a'], { flat: true }), s)), { x: inL(7, 900) });
  relief(O3, 1800, 925, -2.5, (g, s) => g.add(flat(rr(420 * s, 130 * s, 65 * s), gradPx(['#e0508a', '#6a14ff'], O3, -2.5, [1590, 0, 2010, 0]), s)), { x: inL(8, 900) });
  animFns.push(t => {
    if (t > T_IN + 0.5) return;
    for (const o of introObjs) {
      const x = ev(o.k.x, t, 0), y = ev(o.k.y, t, 0), dz = ev(o.k.z, t, 0), sc = ev(o.k.s, t, 1);
      o.g.position.copy(spx(o.O, o.px + x, o.py + y, o.z)).add(new THREE.Vector3(0, 0, dz));
      o.g.scale.setScalar(Math.max(0.001, sc)); o.g.rotation.set(0, ev(o.k.ry, t, 0), ev(o.k.rz, t, 0));
    }
  });
}
// frames 4–5: the words on a pill wall at the mouth of the frame-6 channel ---------------------------
const OX = -83, TXT_Y = 27;                                  // the O's centre x (= where the sphere appears); baseline (= shelf top)
let TX4 = -93;                                               // text centre (set once the words are measured)
const introWords = [];
{
  await document.fonts.load('800 280px "new-hero"').catch(() => {}); await document.fonts.ready;
  const cv = document.createElement('canvas').getContext('2d');
  const FP = 280; cv.font = `800 ${FP}px "new-hero", "Open Sans"`;   // ExtraBold, like the 2D copy
  const om = cv.measureText('O'), S = 2 * R * FP / (om.actualBoundingBoxAscent + om.actualBoundingBoxDescent), PU = FP / S;   // the O is as tall as the sphere
  const wOf = w => cv.measureText(w).width / PU, sp = cv.measureText(' ').width / PU;
  const clip = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -(TXT_Y - 0.08))];
  const word = (w, xL, i) => {
    const c = document.createElement('canvas'), g = c.getContext('2d'), pad = 30;
    g.font = cv.font; const wp = Math.ceil(g.measureText(w).width) + 2 * pad;
    c.width = wp; c.height = Math.ceil(FP * 1.3);
    g.font = cv.font; g.fillStyle = '#fff'; g.textBaseline = 'alphabetic'; g.fillText(w, pad, FP * 1.02);
    const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4;
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, clippingPlanes: clip });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(c.width / PU, c.height / PU), m);
    const base = new THREE.Vector3(xL - pad / PU + c.width / PU / 2, TXT_Y + (FP * 1.02 - c.height / 2) / PU, -2.15);   // canvas baseline on the shelf
    mesh.position.copy(base); scene.add(mesh);
    introWords.push({ mesh, base, i, w });
  };
  const wO = wOf('O'), wG = wOf('G'), wL = wOf('LET’S'), wR = wOf('READY?');
  const xO = OX - wO / 2, xG = xO - wG, xL = xG - sp - wL, xR = xL - sp - wR;
  word('READY?', xR, 0); word('LET’S', xL, 1); word('G', xG, 2); word('O', xO, 2);
  TX4 = (xR + OX + wO / 2) / 2;
  const T4 = 13.2, T5 = 14.8;
  animFns.push(t => {
    if (t > T_IN + 0.5) return;
    for (const o of introWords) {
      const r = gsap.parseEase('power3.out')(Math.min(1, Math.max(0, (t - (T4 + 0.25 + 0.18 * o.i)) / 0.5)));
      o.mesh.position.copy(o.base).add(new THREE.Vector3(0, -3.8 * (1 - r), 0));
      o.mesh.visible = !document.getElementById('stage').classList.contains('hide-text');   // the frame 4 words are copy too
      if (o.w === 'O') { const f = Math.min(1, Math.max(0, (t - (T5 + 0.6)) / 0.25)); o.mesh.material.opacity = 1 - f; o.mesh.scale.setScalar(1 + 0.15 * f); }
    }
  });
  // pill wall, shelf, gate, backdrop
  const pl = xR - 3.4;                                          // the pill's rounded left end shows, as on the board
  add(ext(rr(-62 - pl, 9.2, 4.6), 1.8), mat(['#4b12c8', '#241060', '#1d0d52'], { axis: [1, 1, 0], lo: pl + 18, hi: -62 + 34 }), [(pl - 62) / 2, 28, -4.0]);
  add(new THREE.BoxGeometry(-64 - (pl + 2), 0.8, 3.6), mat(['#2a0c78', '#3a10b0'], { axis: [1, 0, 0], lo: pl, hi: -64 }), [(pl + 2 - 64) / 2, TXT_Y - 0.4, -0.4]);
  const bars = [];
  for (let k = 0; k < 4; k++) {
    const geo = new THREE.BoxGeometry(0.28, 4.4, 0.3).translate(0, 2.2, 0);
    bars.push(add(geo, mat(['#5a14e0', '#ff7a1a'], { axis: [0, 1, 0], lo: TXT_Y, hi: TXT_Y + 4.4 }), [OX + 3 + k * 0.75, TXT_Y, 0]));
  }
  animFns.push(t => {
    if (t > T_IN + 0.5) return;
    bars.forEach((b, k) => {
      const g = gsap.parseEase('expo.out')(Math.min(1, Math.max(0, (t - (T5 + 0.15 + 0.05 * k)) / 0.45)));
      const l = gsap.parseEase('power2.in')(Math.min(1, Math.max(0, (t - (T5 + 0.9 + 0.04 * k)) / 0.35)));
      b.scale.y = Math.max(0.001, g); b.position.y = TXT_Y + 8 * l;
    });
  });
  const cy = 30;
  add(new THREE.PlaneGeometry(72, 52), mat(['#ec6a34', '#d4486e', '#8a1fd8'], { axis: [0, -1, 0], lo: -(cy + 22), hi: -(cy - 22) }), [-102, cy, -12]);   // stops short of frame 6's set
  add(ext(disc(11), 0.3), mat(['#ff9a2a', '#ff6a3d'], { axis: [0, 1, 0], lo: 36, hi: 52 }), [TX4 + 6, 45, -10]);
  add(ext(halfDisc(6.5), 0.3), mat(['#ff7a1a', '#ff5a3a'], { axis: [1, 0, 0], lo: TX4 - 23, hi: TX4 - 10 }), [TX4 - 16, 14.5, -8]);
  add(ext(rr(2.8, 4.2, 1.4), 0.3), mat(['#3a0f7a'], { flat: true }), [TX4 - 16.4, 15.5, -7.6]);
  add(ext(disc(11), 0.3), mat(['#d21bff', '#7a14e8'], { axis: [0, -1, 0], lo: -20, hi: -4 }), [TX4 + 12, 9, -9]).scale.set(1, 0.65, 1);
  add(ext(halfDisc(1.2), 0.2), mat(['#ff7a1a'], { flat: true }), [TX4 + 0.6, 21.8, -3], [0, 0, Math.PI / 2]);
  add(ext(halfDisc(1.2), 0.2), mat(['#ffae4a'], { flat: true }), [TX4 + 1.4, 22.2, -3], [0, 0, -Math.PI / 2]);
}
// intro sphere: floats in the frame-1 pill channel, moves with frame 2, pops up in frame 3; then out of the O
{
  const bob = t => new THREE.Vector3(0, 0.08 * Math.sin(2 * Math.PI * t / 2.6), 0);
  const pop = (t, t0) => EZ('back.out(2)')(Math.min(1, Math.max(0, (t - t0) / 0.8)));
  const b1 = spx(O1, 1383, 402, -1.5), b2 = spx(O1, 1690, 345, -1.5), b3 = spx(O3, 1565, 332, 3.8);
  seg(0, 4.25, 'none', u => { const t = 4.25 * u; return { p: b1.clone().add(bob(t)), c: 0, sc: pop(t, 0.5) }; });
  seg(4.25, 5.55, 'power3.inOut', u => ({ p: b1.clone().lerp(b2, u), c: 0 }));
  seg(5.55, 8.4, 'none', u => ({ p: b2.clone().add(bob(5.55 + 2.85 * u)), c: 0 }));
  seg(8.4, 8.6, 'none', () => ({ p: b3.clone(), c: 0, h: 1 }));
  seg(8.6, T_CUT0, 'none', u => { const t = 8.6 + (T_CUT0 - 8.6) * u; return { p: b3.clone().add(bob(t)), c: 0, sc: pop(t, 8.6) }; });
  // the O pops into the sphere, then it rolls into the channel, reaching frame 6's speed as it arrives (power2.in: 2L/d)
  seg(T_CUT0, 15.35, 'none', () => ({ p: new THREE.Vector3(OX, TXT_Y + R, -1.2), c: 0, h: 1 }));
  seg(15.35, 15.73, 'none', u => ({ p: new THREE.Vector3(OX, TXT_Y + R, -1.2 + 1.2 * EZ('power2.out')(u)), c: 0, sc: 0.7 + 0.3 * EZ('back.out(2)')(u) }));
  seg(15.73, T6D, 'power2.in', u => ({ p: new THREE.Vector3(OX + (P6X0 + 2 - OX) * u, TXT_Y + R, 0), c: 1, tan: new THREE.Vector3(1, 0, 0) }));
  seg(T6D, T_IN, 'none', () => ({ p: new THREE.Vector3(P6X0 + 2, TXT_Y + R, 0), c: 0 }));   // authored gap, never shown
}
const SHOT_P = [                                              // frames 1–3: slow drift with parallax; dolly through into frame 3
  [0, O1.clone().add(new THREE.Vector3(-0.6, 0.2, 23.4)).toArray(), O1.clone().add(new THREE.Vector3(-0.3, 0, 0)).toArray(), 0, 40],
  [4.2, O1.clone().add(new THREE.Vector3(0.3, 0, DI)).toArray(), O1.clone().add(new THREE.Vector3(0.15, 0, 0)).toArray(), 0, 40],
  [8.0, O1.clone().add(new THREE.Vector3(0.8, -0.1, 24)).toArray(), O1.clone().add(new THREE.Vector3(0.4, 0, 0)).toArray(), 0, 40],
  [9.2, O3.clone().add(new THREE.Vector3(0, 0, DI)).toArray(), O3.toArray(), 0, 40, 0, 0, 'power2.inOut'],
  [12.1, O3.clone().add(new THREE.Vector3(-0.3, 0.1, 23.7)).toArray(), O3.clone().add(new THREE.Vector3(-0.15, 0, 0)).toArray(), 0, 40],
  [T_CUT0, O3.clone().add(new THREE.Vector3(2.2, -1.0, 15)).toArray(), O3.clone().add(new THREE.Vector3(0.7, -0.3, 0)).toArray(), 0, 40, 0, 6, 'power2.in'],   // pushes and arcs into the circle burst
];
const SHOT_Q = [                                              // frames 4–5: push on the pill, pan to GO, swing behind the sphere into the channel
  [T_CUT0, [TX4 - 12, 33.5, 44], [TX4 - 3, 28.6, -2.2], 0, 40, 0, 7],    // sweeps in through the circle's opening (from the left, rolled) …
  [13.8, [TX4, 28.9, 30], [TX4, 28.3, -2.2], 0, 40, 0, 0, 'expo.out'],     // … and settles on the pill: the layers slide past each other
  [14.55, [TX4, 28.6, 25.4], [TX4, 28.3, -2.2], 0, 40],
  [14.8, [TX4 + 0.2, 28.6, 25], [TX4 + 0.2, 28.3, -2.2], 0, 40],
  [15.35, [OX - 1.2, 28.7, 12], [OX - 0.8, 28.2, -2], 0, 40, 0, 0, 'power3.inOut'],   // snap in on GO
  [15.8, [OX - 0.8, 28.9, 10.8], [OX + 0.2, 28.1, -1], 0.2, 40],
  [16.6, [-5.5, 3.0, 6.0], [0, 0, 0], 1, 44, 1, -8],
  [T6D, [-6, 2.4, 2.4], [0, 0, 0], 1, 46, 1, -28],               // = frame 6's first key (at T_IN, authored)
];

// frame 6: channel → pipe bend (hidden) → drop through funnel and stem → bounce on the pathway
seg(T_IN, 21.9, 'none', u => ({ p: new THREE.Vector3(P6X0 + 2 + (BEND_X - P6X0 - 2) * u, P6Y, 0), c: 1, tan: new THREE.Vector3(1, 0, 0) }));
seg(21.9, 22.35, 'none', u => ({ p: bendPath.getPointAt(u).add(new THREE.Vector3(0, -0.35 * (1 - u), 0)), c: 0 }));
{ // the drop keeps the speed the sphere leaves the bend with (no pause at the funnel mouth)
  const vB = bendPath.getLength() / 0.45, avg = (MOUTH_Y - yOnA(DROP_X)) / 0.85;
  seg(22.35, 23.2, easeV(Math.min(1, vB / avg)), u => ({ p: new THREE.Vector3(DROP_X, MOUTH_Y + (yOnA(DROP_X) - MOUTH_Y) * u, 0), c: 0 }));
}
seg(23.2, 23.5, 'none', u => { const x = DROP_X + 0.5 * u; return { p: new THREE.Vector3(x, yOnA(x) + 2.8 * u * (1 - u), 0), c: 1 - 0.6 * Math.sin(Math.PI * u), tan: aDir }; });
const L7b = new THREE.Vector3(DROP_X + 0.5, yOnA(DROP_X + 0.5), 0);
let tt = 29.0;
const A2end = A2.getPointAt(1);
// frame 7: from the bounce along the pathway without stopping, handing the fall its speed
runSegs([
  [23.5, 25.1, L7b.distanceTo(A1b), u => ({ p: new THREE.Vector3().lerpVectors(L7b, A1b, u), c: 1, tan: aDir })],
  [25.1, 29.0, A2.getLength(), u => ({ p: A2.getPointAt(u), c: 1, tan: A2.getTangentAt(u) })],
], 0.5 / 0.3, Math.hypot(landB(hops[0]).x - A2end.x, landB(hops[0]).z - A2end.z) / 0.85);
seg(tt, tt + 0.85, 'none', fallArc(A2end, landB(hops[0]))); tt += 0.85;
const HOP = 0.42;
hops.forEach((h, k) => {
  pegs[h].hit.push(tt);
  if (k < hops.length - 1) { const a = landB(h), b = landB(hops[k + 1]); seg(tt, tt + HOP, 'none', airArc(a, b, 1.5)); tt += HOP; }
});
seg(tt, tt + 0.7, 'none', fallArc(landB(hops.at(-1)), helixP(0))); tt += 0.7;
const tHelix = tt, tEnd = 39.45;
// corkscrew + ramp as one run by arc length, speed rising steadily (no stop at the bottom); frame 10 carries the exit speed on
const LH9 = TURNS * Math.hypot(2 * Math.PI * HR, PITCH), L9 = LH9 + RAMP_L, A9 = 0.85;
seg(tHelix, tEnd, easeV(A9), u => {
  const s = u * L9;
  if (s < LH9) { const v = s / LH9, p = helixP(v), q = helixP(Math.min(1, v + 0.002)); return { p, c: 1, tan: q.sub(p).normalize() }; }
  return { p: E.clone().addScaledVector(D, s - LH9), c: 1, tan: D };
});
// frame 10: on past the camera and into the tunnel, easing off; hidden while the camera cuts in the dark
const V9 = (2 - A9) * L9 / (tEnd - tHelix), A10 = V9 / (P10.getLength() / (42.9 - tEnd));
seg(tEnd, 42.9, easeV(A10), u => ({ p: P10.getPointAt(u), c: 1, tan: P10.getTangentAt(u) }));
seg(42.9, 44.35, 'none', () => ({ p: P11.getPointAt(0), c: 0, h: 1 }));
// frame 11: out of the exit ring and down the winding path toward camera
const sub = (curve, a, b) => u => { const v = a + (b - a) * u; return { p: curve.getPointAt(v), c: 1, tan: curve.getTangentAt(v) }; };
const subS = (t0, t1, curve, a, b) => [t0, t1, (b - a) * curve.getLength(), sub(curve, a, b)];
// frames 11–12 (one run, entering at about the speed it left frame 10, leaving at frame 13's entry speed across the unseen cut):
// out of the exit ring, down the winding path, toward the arched tunnel and in; hidden for the cut
const fA12 = arcFrac(P12, at11(28, -6, 46)), V13 = g13.b0 * P13.getLength() / (56.4 - T_CUT2 - 0.05);
const V15 = 9.5;                                                // frame 15 pace at the doorway (u/s)
runSegs([
  [44.35, 49.6, P11.getLength(), u => ({ p: P11.getPointAt(u), c: 1, tan: P11.getTangentAt(u) })],
  subS(49.6, 53.9, P12, 0, fA12),
  subS(53.9, 54.75, P12, fA12, 1),
], (2 - A10) * P10.getLength() / (42.9 - tEnd), V13);
seg(54.75, T_CUT2 + 0.05, 'none', () => ({ p: P13.getPointAt(0), c: 0, h: 1 }));
// frames 13–15 along one path, same knot times and places, speed continuous (the hill crest and the corners slow it, never stop it)
runSegs([
  subS(T_CUT2 + 0.05, 56.4, P13, 0, g13.b0),
  subS(56.4, 57.6, P13, g13.b0, g13.top),
  subS(57.6, 59.3, P13, g13.top, g13.c3),
  subS(59.3, 63.6, P13, g13.c3, g13.f1),                       // down the ramp to its foot
  subS(63.6, 68.75, P13, g13.f1, g13.open),                     // frame 15: the long floor run to the doorway, no slow-down
], V13, V15);
{ // then on through the doorway at the same pace, out of sight by the cut
  const vD = V15 / P13.getLength(), dL = (1 - g13.open) / (69.45 - 68.75);
  seg(68.75, 69.45, easeV(vD / dL), sub(P13, g13.open, 1));
}
seg(69.45, T_CUT3, 'none', () => ({ p: P16.getPointAt(0), c: 0, h: 1 }));
// frame 16: along the snake track and off its end
const fS0 = arcFrac(P16, o16(-8, snakeY(-8), 0));
seg(T_CUT3, t17[0], 'none', sub(P16, fS0, 1));
// frame 17: bounce down the floating discs onto the swirl
for (let i = 0; i < b17.length - 1; i++) seg(t17[i], t17[i + 1], 'none', airArc(b17[i], b17[i + 1], h17[i]));
// frame 18: wind down the swirl, then straight at the camera until the sphere fills the frame
seg(t17.at(-1), 84.9, 'none', sub(P18, 0, fExit18));
seg(84.9, T_CUT4, 'none', sub(P18, fExit18, fLane18));
// frame 19 (match cut): around the U-turn track
seg(T_CUT4, 91.25, 'none', sub(P19, fS19, 1));
// frame 20: off the end of the track, down the marble run, into the hole (hidden once inside)
seg(91.25, 91.7, 'none', fallArc(P19.getPointAt(1), p20(1.5, -4)));
{
  const up2 = (C, p) => Math.abs(p.distanceTo(C) - RB) < 0.08 && p.y > C.y + 0.05;   // on the ceiling half of a curved end
  // the run stops short of the hole's centre; the drop carries the sphere's speed on over the rim as it sinks (no stop)
  const DX20 = 1.3, fH20 = arcFrac(P20, p20(7 - DX20, -13.9)), kX20 = fH20 * P20.getLength() / 3.4 * 0.45 / DX20;
  seg(91.7, 95.1, 'none', u => { const p = P20.getPointAt(u * fH20); return { p, c: up2(BEND1, p) || up2(BEND2, p) ? 0 : 1, tan: P20.getTangentAt(u * fH20) }; });
  seg(95.1, 95.55, 'none', u => { const p = p20(7 - DX20 * (1 - u) ** kX20, -13.9 - 3.6 * u ** 2.2); return { p, c: u < 0.15 ? 1 : 0, tan: new THREE.Vector3(1, 0, 0), h: p.y < HOLE.y - 2.2 ? 1 : 0 }; });
}
// frame 21: hidden across the cut, then rolls in from the left
// (it starts off-screen left so it can roll at a livelier pace, 4.8 u/s (was 4.1), and still reach the gap on time;
// at 4.8 it enters about 0.8 s into the frame)
const V21 = 4.8, X21 = 9.3 - V21 * (101.55 - T_CUT5);
seg(95.55, T_CUT5, 'none', () => ({ p: o21(X21, 0, 0), c: 0, h: 1 }));
seg(T_CUT5, 101.55, 'none', u => ({ p: o21(X21 + (9.3 - X21) * u, 0, 0), c: 1, tan: new THREE.Vector3(1, 0, 0) }));
// frame 22: through the gap, down between the rails, behind the eBC screen and out to the right
const line = (a, b) => u => ({ p: new THREE.Vector3().lerpVectors(a, b, u), c: 1, tan: b.clone().sub(a).normalize() });
{ // through the gap carrying frame 21's speed (it bleeds off as the sphere drops between the rails)
  const a = o21(9.3, 0, 0), b = o21(10.5, PY, 0), k = V21 * 0.7 / (b.x - a.x);
  seg(101.55, 102.25, 'none', u => ({ p: new THREE.Vector3(a.x + (b.x - a.x) * (1 - (1 - u) ** k), a.y + (b.y - a.y) * u * u, a.z), c: 0 }));
}
// frames 22–23: behind the screen and on, speeding up steadily into the loop-the-loop (faster at the bottom, slower over the top)
runSegs([
  [102.25, 105.9, 30.6 - 10.5, line(o21(10.5, PY, 0), o21(30.6, PY, 0))],
  [105.9, 108.1, LX - 30.6, line(o21(30.6, PY, 0), o21(LX, PY, 0))],
], 2.5, 1.335 * (LX - 30.6) / 2.2);
seg(108.1, 111.2, u => u + 0.3 * Math.sin(2 * Math.PI * u) / (2 * Math.PI), loopPt);
// frame 24: ease off, over the hump, turn into the doorway; hidden once inside
// (one run: out of the loop at its exit speed, easing over the hump, on into the doorway; no jolts between the pieces)
runSegs([
  subS(111.2, 112.9, P24, 0, fH0),
  subS(112.9, 115.9, P24, fH0, fH1),
  [115.9, 117.6, (1 - fH1) * P24.getLength(), u => { const r = sub(P24, fH1, 1)(u); r.h = r.p.z < O21.z - 10 ? 1 : 0; return r; }],   // dims to black first (rooms)
], 11.0);
// frame 25: hidden across the cut, then out of the arched tunnel toward camera and away to the right
seg(117.6, T_CUT6, 'none', () => ({ p: P24.getPointAt(1), c: 0, h: 1 }));   // hidden in the room; parked here so the camera's look-follow doesn't swing away
const f25in = arcFrac(P25, o25(0, 0, -5));                     // starts just inside the tunnel mouth, so it emerges right after the cut
seg(T_CUT6, 118.3, 'none', () => ({ p: P25.getPointAt(f25in), c: 0, h: 1 }));
// frame 25: out of the tunnel dark (it fades in as it leaves the room) right behind the camera, then away to the right
{
  const fEnd25 = 1, L25 = P25.getLength();                       // on to the end of the path (off screen right well before the cut)
  const tOut25 = 118.3 + (fOut25 - f25in) * L25 / 9;          // ~9 u/s all the way, like the end of frame 24
  runSegs([
    subS(118.3, tOut25, P25, f25in, fOut25),
    subS(tOut25, T_CUT7, P25, fOut25, fEnd25),
  ], 9, (fEnd25 - fOut25) * L25 / (T_CUT7 - tOut25));
}
// frame 27: right to left down the ramp
seg(T_CUT7, T_CUT8, 'none', u => { const x = 18 - 8.5 * (T_CUT8 - T_CUT7) * u; return { p: o27(x, ramp27(x), 0), c: 1, tan: new THREE.Vector3(-1, -0.364, 0).normalize() }; });

// frame 28: in along the ledge, through the funnel, along the top of GAME-CHANGING, round the edge, back left
const y28 = py => py - RPX;                                         // ball-centre stage y resting on a surface at py
// the whole run at ~11 u/s (sped up at the user's request; was ~7): it enters later and leaves the track sooner.
// index.html's copy reveals use the same times (authored there 1 s later and shifted by D28: in 129.4, landing 131.0, track 132.55 → 134.05 = 620 px/s)
const T28 = { in: 128.4, drop: 129.35, out: 129.6, arc: 130.4, track: 131.55, fall: 133.05, land: 133.85 };   // 1 s sooner than before (D28): rolls in as the circle opens
seg(T_CUT8, T28.in, 'none', () => ({ p: sw(2080, y28(F28.ledgeY)), c: 0, h: 1 }));
const V28t = sw(F28.bendX, 0).distanceTo(sw(F28.trackL - 20, 0)) / (T28.fall - T28.track);   // track speed (the copy reveals are timed to it)
{ // ledge → into the leaning funnel → out of its spout → bounce on the track → up to the top of the rounded edge → round it
  // (user, 2026-09-26: "bounce down, bounce up towards the top of the circle, and then follow … down and around")
  const V0 = 6, dir = new THREE.Vector3(Math.sin(TILT28), -Math.cos(TILT28), 0);             // spout exit speed (u/s) and direction
  const X = fun28(-FUN_R, -FUN_H), yT = sw(0, y28(F28.trackY)).y, top = B28.clone().add(new THREE.Vector3(0, RB28, 0));
  const Hf = X.y - yT, Hr = top.y - yT, T = T28.arc - T28.out;
  // gravity chosen so the fall from the spout plus a bounce whose peak is exactly the top of the edge fill the time
  const fit = g => { const tu = Math.sqrt(2 * Hr / g), tf = T - tu; return V0 * dir.y * -1 * tf + g * tf * tf / 2 - Hf; };
  let lo = 5, hi = 400; for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (fit(m) > 0) hi = m; else lo = m; }
  const g = (lo + hi) / 2, tu = Math.sqrt(2 * Hr / g), tf = T - tu, tL = T28.out + tf;
  const L = new THREE.Vector3(X.x + V0 * dir.x * tf, yT, X.z), vxB = (top.x - L.x) / tu, vyB = g * tu;
  const inF = new THREE.CatmullRomCurve3([sw(F28.ledgeX, y28(F28.ledgeY)), sw(F28.ledgeX - 45, y28(F28.ledgeY) + 20), fun28(-FUN_R, -0.35), fun28(-FUN_R, -FUN_H * 0.6), X]);
  seg(T28.in, T28.drop, 'none', line(sw(2080, y28(F28.ledgeY)), sw(F28.ledgeX, y28(F28.ledgeY))));
  runSegs([[T28.drop, T28.out, inF.getLength(), u => ({ p: inF.getPointAt(u), c: 0 })]], sw(2080, 0).distanceTo(sw(F28.ledgeX, 0)) / (T28.drop - T28.in), V0);
  seg(T28.out, tL, 'none', u => { const t = u * tf; return { p: X.clone().addScaledVector(dir, V0 * t).add(new THREE.Vector3(0, -g * t * t / 2, 0)), c: 0, tan: dir.clone().multiplyScalar(V0).add(new THREE.Vector3(0, -g * t, 0)).normalize() }; });
  seg(tL, T28.arc, 'none', u => { const t = u * tu; return { p: new THREE.Vector3(L.x + vxB * t, yT + vyB * t - g * t * t / 2, L.z), c: 0, tan: new THREE.Vector3(vxB, vyB - g * t, 0).normalize() }; });
  runSegs([
    [T28.arc, T28.track, Math.PI * RB28, u => {
      const a = Math.PI / 2 - Math.PI * u, d = new THREE.Vector3(Math.cos(a), Math.sin(a), 0);
      return { p: B28.clone().addScaledVector(d, RB28), n: d.clone().negate(), tan: new THREE.Vector3(Math.sin(a), -Math.cos(a), 0), c: d.y < 0 ? 1 : 0 };
    }],
  ], vxB, V28t);
  window.course3dF28 = { g, tf, tu, tL, landPx: L.x * 0 + 960 + (L.x - O28.x) * K28, vxB, vyB, V0 };   // dev
}
seg(T28.track, T28.fall, 'none', line(sw(F28.bendX, y28(F28.trackY)), sw(F28.trackL - 20, y28(F28.trackY))));
// frames 29–30: off the end (carrying its speed left, then curving down), onto the ramp by the ring, and down it toward the camera
{
  const a = sw(F28.trackL - 20, y28(F28.trackY)), b = rampAt(0.1 / K30), k = V28t * (T28.land - T28.fall) / Math.abs(b.x - a.x || 1);
  seg(T28.fall, T28.land, 'none', u => ({ p: new THREE.Vector3(a.x + (b.x - a.x) * (1 - (1 - u) ** k), a.y + (b.y - a.y) * u * u, a.z + (b.z - a.z) * u), c: 0 }));
}
const S30 = 0.93;
seg(T28.land, T_CUT9, easeH(0.9, 1.1), line(rampAt(0.1 / K30), rampAt(S30)));   // ≈7 → 8.7 u/s
// frame 31 (match cut): rolls left to right along the orange band
const V31 = 8.5;                                                  // index.html's logo wipe is timed to this speed
seg(T_CUT9, T_OUT + 0.3, 'none', u => ({ p: o31(-18 + V31 * (T_OUT + 0.3 - T_CUT9) * u, Y31, 0), c: 1, tan: new THREE.Vector3(1, 0, 0) }));

const T0 = 0;                          // the table starts at 0 so the optional 3D intro (frames 1–5) has a sphere too
const DT = 1 / 240, N = Math.ceil((T_OUT + 0.3 - T0) / DT) + 1;
const S = [];
{
  let q = new THREE.Quaternion(), axis = new THREE.Vector3(0, 0, -1), rate = 0, prev = null;
  for (let i = 0; i < N; i++) {
    const t = T0 + i * DT;
    const sg = segs.find(s => t <= s.t1) || segs.at(-1);
    const u = sg.e(Math.min(1, Math.max(0, (t - sg.t0) / (sg.t1 - sg.t0))));
    const r = sg.fn(u);
    const n = r.n ? r.n : r.tan ? surfN(r.tan) : up.clone();        // r.n: contact normal inside the loop
    if (prev) {
      const d = r.p.clone().sub(prev);
      // (a jump across a cut adds no spin)
      if (r.c > 0.5 && d.lengthSq() > 1e-10 && d.lengthSq() < 4) { axis = new THREE.Vector3().crossVectors(n, d).normalize(); rate = d.length() / R; }
      q = new THREE.Quaternion().setFromAxisAngle(axis, rate).multiply(q);
    }
    prev = r.p.clone();
    S.push({ p: r.p, c: r.c, n, q: q.clone(), h: r.h || 0, sc: r.sc ?? 1 });
  }
}
function ballAt(t) {
  const f = Math.min(N - 1.001, Math.max(0, (t - T0) / DT)), i = Math.floor(f), k = f - i;
  const a = S[i], b = S[i + 1];
  if (a.p.distanceToSquared(b.p) > 4) { const s = k < 0.5 ? a : b; return { p: s.p.clone(), c: s.c, n: s.n.clone(), q: s.q.clone(), h: s.h, sc: s.sc }; }
  return { p: a.p.clone().lerp(b.p, k), c: a.c + (b.c - a.c) * k, n: a.n.clone().lerp(b.n, k).normalize(), q: a.q.clone().slerp(b.q, k), h: a.h, sc: a.sc + (b.sc - a.sc) * k };
}

/* =====================================================================
   Camera: non-uniform Catmull-Rom (Hermite) through keys; look can follow the ball
   ===================================================================== */
const RT0 = new THREE.Vector3(-D.z, 0, D.x).normalize();
const camEnd = Q.clone().addScaledVector(D, 2.0).addScaledVector(RT0, 1.7).add(new THREE.Vector3(0, 0.9, 0));
const f0 = landB(hops[0]), fl = landB(hops.at(-1));
const v3a = v => v.toArray();
const sidePos = Q.clone().addScaledVector(D, 4).addScaledVector(RT, 3.4).add(new THREE.Vector3(0, 1.4, 0));
const look10 = RC10.clone().add(new THREE.Vector3(0, 8.0, 0)).addScaledVector(RT, 1.2);
const cam10 = look10.clone().addScaledVector(F, -25).add(new THREE.Vector3(0, 2.5, 0));
const behind = (b, u, r) => v3a(new THREE.Vector3().addScaledVector(F, -b).add(new THREE.Vector3(0, u, 0)).addScaledVector(RT, r));
// key: [t, position, look-at, look-follow (0..1 toward ball), fov, follow (1 = position and look-at are offsets from the ball), roll°]
const SHOT_A = [
  [20.15, [-6, 2.4, 2.4], [0, 0, 0], 1, 46, 1, -28],
  [21.2, [-5.5, 2.6, 3.0], [0, 0, 0], 1, 46, 1, -20],
  [21.95, [-27, 31, 15], [-18, 25, 0], 0.4, 40, 0, 0],
  [22.7, [-20, 22, 22], [-17, 17.5, 0], 0.35, 40, 0, 0],
  [23.5, [-15, 11, 20], [-15, 5, -1], 0.3, 38, 0, 0],
  [24.4, [-10, 6.6, 17], [-6.5, 5.0, -2], 0, 38],
  [26.9, [-2.5, 4.4, 16.5], [-1, 3.2, -2], 0.1, 38],
  [28.4, [8, 1.4, 16], [10.5, -0.6, -2], 0.15, 38],
  [29.6, [f0.x - 2, f0.y + 12, 28], [f0.x - 4, f0.y + 1, WALLZ], 0.3, 38],
  [30.6, [f0.x + 13, f0.y + 9, 23], [f0.x + 2, f0.y - 3, WALLZ], 0.1, 38],
  [33.4, [fl.x + 11, fl.y + 11, 23], [fl.x - 2, fl.y + 1, WALLZ], 0.15, 38],
  [34.6, [C.x + 11, HTOP + 4, 24], [C.x + 7, HTOP - 6, C.z], 0.2, 38],
  [36.4, [camEnd.x - 1, camEnd.y + 5, camEnd.z + 4], [C.x + 7, HBOT - 3, C.z + 4], 0.3, 40],
  [38.4, [camEnd.x, camEnd.y + 0.4, camEnd.z], [C.x + 6, HBOT - 2, C.z + 6], 0.8, 42],
  [39.45, v3a(camEnd), v3a(Q), 1, 42],
  [39.85, v3a(sidePos), v3a(Q), 1, 44],                      // sphere passes; camera whips round
  [40.9, v3a(sidePos.clone().lerp(cam10, 0.6).add(new THREE.Vector3(0, 1, 0))), v3a(look10), 0.9, 41],   // crane back and up
  [41.9, v3a(cam10), v3a(look10), 0.25, 40],
  [42.8, v3a(cam10.clone().addScaledVector(F, 0.8)), v3a(look10), 0.1, 40],
  [43.45, v3a(cam10.clone().addScaledVector(F, 1.5)), v3a(look10), 0, 40],
  [T_CUT, v3a(RC10.clone().addScaledVector(F, 2.5)), v3a(RC10.clone().addScaledVector(F, 14)), 0, 50],
];
const SHOT_B = [                                              // starts inside the exit tunnel, backs out
  [T_CUT, v3a(at11(0, -0.4, -3.5)), v3a(at11(0, -0.4, -14)), 0, 48],
  [45.9, v3a(at11(1.2, 4.0, 24)), v3a(at11(-2.2, -3.3, 0)), 0, 42],
  [48.0, v3a(at11(1.8, 4.1, 25.5)), v3a(at11(-2.0, -3.4, 0)), 0.3, 42],        // follow raised with the smoother (earlier) sphere timing
  [49.2, v3a(at11(4, 4.3, 26)), v3a(at11(10, -4, 6)), 0.35, 42],          // swing round after the sphere
  [50.3, [0, 2.8, -9.5], [0, -2.2, 6], 0, 40, 1],                         // behind it, toward the arched tunnel
  [53.4, [0, 2.4, -7.5], [0, -2.0, 6], 0, 40, 1],
  [54.4, [0, 1.4, -3.0], [0, 1.0, 6], 0, 44, 1],
  [T_CUT2, [0, 1.2, -2.6], [0, 0.9, 6], 0, 50, 1],
];
const SHOT_C = [                                              // out of a pipe, over the bridge, down the ramp, to the doorway
  [T_CUT2, [0, 0.7, -5.5], [0, -0.2, 8], 0, 50, 1],                   // inside the pipe, behind the sphere
  [55.7, [1.5, 1.8, -6], [1, 0, 6], 0, 46, 1],
  [56.9, v3a(o13(-2, 7, 23.5)), v3a(o13(-4.5, 6.5, 4.5)), 0.1, 40],    // side view of the arch bridge
  [58.5, v3a(o13(0, 6.8, 23)), v3a(o13(-2.5, 6, 4.5)), 0.12, 40],
  [59.6, [2, 2.2, 11], [-3, -2, 0], 0, 40, 1],                          // alongside, down the ramp to the left
  [62.6, [2, 2.2, 11], [-3, -2, 0], 0, 40, 1],
  [64.4, [9, 4.5, 13], [-6, -3.4, -4], 0, 40, 1],                     // frame 15: travel with the sphere along the floor run (D15),
  [66.9, [8, 4, 12], [-7, -3.4, -6], 0, 40, 1],                        //   kept in the open right half, clear of the copy and images
  [68.7, v3a(o13(-18 - D15, -13, 15)), v3a(o13(-34 - D15, -15.6, -2)), 0.2, 40],
  [T_CUT3, v3a(o13(-22 - D15, -14, 10)), v3a(o13(-34 - D15, -15, -3)), 0.3, 42],
];
const SHOT_D = [                                              // side-on along the snake track → discs → swirl → sphere fills the frame
  [T_CUT3, v3a(o16(-8, 6, 26)), v3a(o16(-13, 1.5, 0)), 0, 40],
  [72.3, v3a(o16(18, 6, 26)), v3a(o16(13, 1.5, 0)), 0, 40],
  [75.0, v3a(o16(43, 5, 27)), v3a(o16(38, 0.5, 0)), 0, 40],
  [76.2, v3a(o17(11.5, -3, 27)), v3a(o17(12.3, -6.5, 0)), 0, 40],     // pan right: discs on the left third
  [78.0, v3a(o17(11.5, -10.5, 27)), v3a(o17(12.3, -14, 0)), 0, 40],
  [79.9, v3a(o17(10, -18, 26)), v3a(o17(10.5, -22, 0)), 0, 40],
  [81.2, v3a(o17(7, -26, 22)), v3a(o17(7.6, -30, 0)), 0, 40],          // the swirl fills the left half
  [84.2, v3a(o17(6.5, -27, 21.5)), v3a(o17(7, -31, 0)), 0, 40],
  [85.1, v3a(o17(-3, -31.5, 16)), v3a(o17(-6.6, -33.5, 3)), 0.5, 40],   // drop in front of the sphere
  [85.55, [0, 0.6, 4.2], [0, 0, 0], 1, 40, 1],
  [T_CUT4, [0, 0.3, 1.45], [0, 0, 0], 1, 40, 1],
];
const SHOT_E = [                                              // out of the sphere, up over the U-turn, crane down the marble run, into the hole
  [T_CUT4, [0, 0.3, 1.45], [0, 0, 0], 1, 40, 1],
  [86.4, [0.4, 2.2, 6.0], [0, 0, -1], 1, 42, 1],
  [87.5, v3a(o19(17, 21, 17)), v3a(o19(17.5, 0, -2)), 0.12, 40],
  [90.4, v3a(o19(15.5, 20, 18.5)), v3a(o19(16, 0, -1)), 0.12, 40],
  [91.5, v3a(o19(10, 3, 36)), v3a(o19(9, -5, 12)), 0.15, 40],
  [92.3, v3a(o19(15, -4.5, 40)), v3a(o19(14, -6, 13)), 0, 40],
  [94.4, v3a(o19(14, -6, 38)), v3a(o19(13, -7.5, 13)), 0, 40],
  [95.3, v3a(o19(7.2, -9.5, 19)), v3a(o19(7, -16, 13)), 0.2, 42],
  [95.6, v3a(o19(7, -12.5, 13.2)), v3a(o19(7, -20, 12.7)), 0, 46],
  [T_CUT5, v3a(o19(7, -16.2, 13.1)), v3a(o19(7, -26, 12.3)), 0, 50],
];
const SHOT_F = [                                              // the dark halves part; slow pan along the path
  [T_CUT5, v3a(CAM21[0]), v3a(CAM21[1]), 0, 40],
  [96.9, v3a(CAM21[0]), v3a(CAM21[1]), 0, 40],
  [101.2, v3a(o21(6.5, 3.8, 16)), v3a(o21(6.5, 3.0, 0)), 0, 40],
  [101.95, v3a(o21(9.8, -5, 22)), v3a(o21(9.8, -8.5, 0)), 0, 40],      // follow the drop below the track
  [102.7, v3a(o21(10, -9.5, 27)), v3a(o21(10, -10.5, 0)), 0, 40],      // frame 22: rails at top centre, screen over the middle
  [105.2, v3a(o21(12, -9.5, 27)), v3a(o21(12, -10.5, 0)), 0, 40],
  [107.0, v3a(o21(42.5, -9.5, 26.5)), v3a(o21(42.5, -10.5, -1)), 0, 40],   // pan right: frame 23, the loop right of the copy
  [110.6, v3a(o21(46.5, -9.5, 26)), v3a(o21(46.5, -10.5, -1.4)), 0, 40],
  [112.5, v3a(o21(70, -6.5, 23.5)), v3a(o21(70.5, -7.5, LZ)), 0, 40],  // frame 24: over the hump, below the pills
  [115.2, v3a(o21(73, -6.5, 23.5)), v3a(o21(73.5, -7.5, LZ)), 0, 40],
  [116.95, v3a(o21(DX - 2.2, -10.5, 11)), v3a(o21(DX, -12.5, -6)), 0.3, 40],  // swing in toward the doorway as the sphere fades into it
  [117.65, v3a(o21(DX, -12.3, 1.5)), v3a(o21(DX, -12.8, -12)), 0, 42],        // right behind it, fast push in: the doorway fills the frame only
  [T_CUT6, v3a(o21(DX, -12.6, -8)), v3a(o21(DX, -12.8, -20)), 0, 48],         //   for the last ~0.1 s before the cut (user: no long dark hold)
];
const SHOT_G = [                                              // frame 25: backs out of the tunnel dark as the sphere follows
  [T_CUT6, v3a(o25(0, 1.8, -1)), v3a(o25(0, 1.8, -16)), 0, 50],              // fast pull straight back out of the tunnel and its dark ∩,
  [118.1, v3a(o25(0.2, 3.4, 15)), v3a(o25(0.2, 3, -6)), 0, 44],               //   so the dark lasts only ~0.2 s after the cut
  [118.8, v3a(o25(0.4, 4.5, 25)), v3a(o25(0.4, 3.7, 0)), 0, 40],
  [122.0, v3a(o25(3, 4.5, 25)), v3a(o25(3, 3.7, 0)), 0, 40],
  [T_CUT7, v3a(o25(4, 4.5, 25)), v3a(o25(4, 3.7, 0)), 0, 40],
];
const SHOT_H = [                                              // frame 27: slow push while the sphere rolls right to left
  [T_CUT7, v3a(o27(0, 0.5, 26)), v3a(o27(0, 0, 0)), 0, 40],
  [127.6, v3a(o27(-0.65, 0.34, 24.0)), v3a(o27(-0.65, 0, 0)), 0, 40],
  [T_CUT8, v3a(o27(-4, 1.5, 15)), v3a(o27(-3, 0.4, 0)), 0, 40, 0, -6, 'power2.in'],   // pushes and arcs into the circle burst
];
const CUT_OFF = RDn.clone().multiplyScalar(1.45).add(new THREE.Vector3(0, 0.3, 0));   // camera offset from the ball at the match cut
const CAM30 = rampAt(1).addScaledVector(RDn, 1.0).add(new THREE.Vector3(0, 10, 0));    // high enough that the ramp reads as a tall triangle
const b29 = t => ballAt(t).p, CAM29 = new THREE.Vector3(-6.5, 7, 19);
const SHOT_I = [                                              // frame 28 fixed (laid out in stage px), crane down to 29, round to face the ramp (30)
  [T_CUT8, v3a(o28(10, -4, CAM28 + 18)), v3a(o28(3, -1, 0)), 0, 40, 0, -7],   // sweeps in through the circle's opening (from lower right, rolled) …
  [129.2, v3a(o28(0, 0, CAM28)), v3a(o28(0, 0, 0)), 0, 40, 0, 0, 'expo.out'],   // … and locks to the copy layout
  [132.9, v3a(o28(0, 0, CAM28)), v3a(o28(0, 0, 0)), 0, 40],               // two equal keys pin the camera (zero tangents) while
  [133.2, v3a(o28(0, 0, CAM28)), v3a(o28(0, 0, 0)), 0, 40],               // the set lines up with the copy
  [134.5, v3a(b29(134.5).add(CAM29).addScaledVector(RDn, 4)), v3a(b29(134.5).addScaledVector(RDn, 5)), 0.2, 40],   // frame 29: close, from the front left;
  [138.2, v3a(b29(138.2).add(CAM29).addScaledVector(RDn, -7)), v3a(b29(138.2).addScaledVector(RDn, -2)), 0.3, 40], // the camera travels with the sphere but lags it,
                                                                                                                  // so it runs across the frame, upper left → lower right
  [139.3, v3a(CAM30), v3a(RA.clone().add(new THREE.Vector3(0, 2, 0))), 0.35, FOV30],      // swing round to face up the ramp; the look leans toward the sphere
  [140.4, v3a(CAM30.clone().addScaledVector(RDn, -3)), v3a(RA.clone().add(new THREE.Vector3(0, 2, 0))), 0.8, FOV30],     // pushing up the ramp to meet it,
  [140.85, v3a(CAM30.clone().addScaledVector(RDn, -4)), v3a(RA.clone().add(new THREE.Vector3(0, 2, 0))), 1, FOV30 + 6],  // tilting down with it so it never leaves the frame
  [141.3, v3a(RDn.clone().multiplyScalar(5).add(new THREE.Vector3(0, 1.2, 0))), [0, 0, 0], 1, 42, 1],
  [T_CUT9, v3a(CUT_OFF), [0, 0, 0], 1, 40, 1],
];
const SHOT_J = [                                              // frame 31: out of the sphere, back to a flat front view
  [T_CUT9, v3a(CUT_OFF), [0, 0, 0], 1, 40, 1],
  [142.5, v3a(CUT_OFF.clone().multiplyScalar(3).add(new THREE.Vector3(0, 0.6, 0))), [0, 0, 0], 1, 42, 1],
  [143.5, v3a(o31(0, 0.3, 26)), v3a(o31(0, 0, 0)), 0.1, 40],
  [T_OUT + 0.3, v3a(o31(0, 0.2, 24.5)), v3a(o31(0, 0, 0)), 0, 40],
];
// an optional 8th key field (an ease name) makes the segment INTO that key a plain eased move, with
// still tangents either side: for big jumps (the dolly between frames 2 and 3) that a spline would overshoot
const prep = keys => {
  const K = keys.map(([t, p, l, f, fov, pf = 0, roll = 0, e]) => ({ t, v: [...p, ...l, f, fov, pf, roll], e: e && gsap.parseEase(e) }));
  const T = K.map((k, i) => (i === 0 || i === K.length - 1 || k.e || K[i + 1].e) ? k.v.map(() => 0)
    : k.v.map((_, j) => (K[i + 1].v[j] - K[i - 1].v[j]) / (K[i + 1].t - K[i - 1].t)));
  return { K, T };
};
const shots = [prep(SHOT_A), prep(SHOT_B), prep(SHOT_C), prep(SHOT_D), prep(SHOT_E), prep(SHOT_F), prep(SHOT_G), prep(SHOT_H), prep(SHOT_I), prep(SHOT_J), prep(SHOT_P), prep(SHOT_Q)];
function camAt(t) {
  const { K, T } = shots[t < T_CUT0 ? 10 : t < T_IN ? 11 : t < T_CUT ? 0 : t < T_CUT2 ? 1 : t < T_CUT3 ? 2 : t < T_CUT4 ? 3 : t < T_CUT5 ? 4 : t < T_CUT6 ? 5 : t < T_CUT7 ? 6 : t < T_CUT8 ? 7 : t < T_CUT9 ? 8 : 9];
  let i = K.findIndex((k, j) => j < K.length - 1 && t <= K[j + 1].t);
  if (i < 0) i = K.length - 2;
  const a = K[i], b = K[i + 1], h = b.t - a.t, u = Math.min(1, Math.max(0, (t - a.t) / h));
  if (b.e) { const e = b.e(u); return a.v.map((v, j) => v + (b.v[j] - v) * e); }
  const u2 = u * u, u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  return a.v.map((_, j) => h00 * a.v[j] + h10 * h * T[i][j] + h01 * b.v[j] + h11 * h * T[i + 1][j]);
}

/* =====================================================================
   Per-frame render, called from the main render(t)
   ===================================================================== */
const popEase = gsap.parseEase('back.out(2)');
const look = new THREE.Vector3();
window.render3D = td => {
  const t = td >= T6D ? td + SHIFT : td;                       // display → authored time (see T6D)
  const st = document.getElementById('stage').classList, m3 = st.contains('mode3d'), i3 = st.contains('intro3d');
  const intro = i3 && t < T_IN + 0.3;                          // 3D intro (frames 1–5); stays up under a 2D frame 6 fading in
  const on = t < T_OUT && (intro || (m3 ? t >= T_IN : t >= T_2D));
  wrap.style.display = on ? 'block' : 'none';
  if (!on) return;
  wrap.style.opacity = intro || (i3 && m3) ? 1 : m3 ? Math.min(1, (t - T_IN) / 0.3) : Math.min(1, (t - T_2D) / 0.4);   // cross-fade in
  bgAt(t); bgU.t.value = t; bgU.flow.value = flowAmt;

  const b = ballAt(t);
  ball.position.copy(b.p); ball.quaternion.copy(b.q); ball.scale.setScalar(Math.max(0.001, b.sc)); shadow.scale.setScalar(Math.max(0.001, b.sc));
  ball.visible = shadow.visible = !b.h && !st.contains('hide-sphere');
  { // into (or out of) a dark room the sphere dims over its first ~3 units, so it never pops on or off against the black
    let dim = 0;
    for (const r of rooms) {
      const q = r.parent.worldToLocal(b.p.clone());
      if (Math.abs(q.x) < r.w / 2 + R && q.y > -R && q.y < r.h && q.z < 0 && q.z > -r.d) dim = Math.max(dim, Math.min(1, Math.max(0, (-q.z - 0.3) / 3.2)));
    }
    ball.material.uniforms.dim.value = dim; ball.material.transparent = dim > 0;
  }
  shadow.position.copy(b.p).addScaledVector(b.n, -R + 0.08).add(new THREE.Vector3(0.25, 0, 0));   // clear of the paths, which rise up to ~0.05 (RISE)
  shadow.lookAt(shadow.position.clone().add(b.n));
  shadow.material.opacity = 0.8 * b.c * (1 - ball.material.uniforms.dim.value);

  for (const f of animFns) f(t);
  pegs.forEach((p, i) => {
    let s = popEase(Math.min(1, Math.max(0, (t - (29.4 + i * 0.012)) / 0.5)));
    for (const th of p.hit) { const x = t - th; if (x > 0 && x < 0.22) s *= 1 + 0.3 * Math.sin(Math.PI * x / 0.22); }
    p.mesh.scale.setScalar(Math.max(0.0001, s));
  });

  const v = camAt(t);
  camera.position.set(v[0], v[1], v[2]).addScaledVector(b.p, v[8]);
  look.set(v[3], v[4], v[5]).addScaledVector(b.p, v[8]).lerp(b.p, v[6]);
  camera.lookAt(look);
  if (v[9]) camera.rotateZ(v[9] * Math.PI / 180);
  if (camera.fov !== v[7]) { camera.fov = v[7]; camera.updateProjectionMatrix(); }

  FXU.spd.value = FX.sp; FXU.wild.value = FX.wild; FXU.walk.value = FX.walk;
  for (const m of mats) { m.uniforms.t.value = t; m.uniforms.flow.value = flowAmt; }
  renderer.render(scene, camera);
};
// screen position of the sphere (stage px) — handy for checking composition
window.course3dInfo = () => ({ hops: hops.map(h => [pegs[h].x, pegs[h].y]), C: C.toArray(), HTOP, tHelix, A10, V9, Q: Q.toArray(), RC10: RC10.toArray() });
// dev: what the 3D view shows at a stage pixel (display time td): every surface under it, nearest first, with its colours
window.course3dPick = (td, x, y) => {
  window.render3D(td);
  const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(x / 960 - 1, 1 - y / 540), camera);
  const hex = u => u && u.value && u.value.isVector3 ? '#' + u.value.toArray().map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('') : '';
  return rc.intersectObjects(scene.children, true).filter(h => h.object.visible && h.object !== ball).slice(0, 5).map(h => {
    const m = Array.isArray(h.object.material) ? h.object.material[h.face ? h.face.materialIndex : 0] : h.object.material, u = m.uniforms || {};
    const p = h.object.getWorldPosition(new THREE.Vector3());
    return { d: +h.distance.toFixed(4), fi: h.faceIndex, geo: h.object.geometry.type, cols: [hex(u.c0), hex(u.c1), hex(u.c2)].join(' '), lo: u.lo && u.lo.value, hi: u.hi && u.hi.value, pos: p.toArray().map(v => +v.toFixed(2)), n: h.face && h.face.normal.toArray().map(v => +v.toFixed(2)) };
  });
};
// dev: find flicker (z-fighting). At display time td, casts a cols × rows grid of rays and reports the points where the
// visible surface and the next one behind it are parallel and at (almost) the same depth.
window.course3dZScan = (td, cols = 40, rows = 22) => {
  window.render3D(td);
  if (!wrap || wrap.style.display === 'none') return [];
  const rc = new THREE.Raycaster(), out = [], shown = o => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
  const hex = m => { const u = m && m.uniforms; return u && u.c0 ? '#' + u.c0.value.toArray().map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('') : '?'; };
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = (i + 0.5) / cols * 1920, y = (j + 0.5) / rows * 1080;
    rc.setFromCamera(new THREE.Vector2(x / 960 - 1, 1 - y / 540), camera);
    const hs = rc.intersectObjects(scene.children, true).filter(h => shown(h.object) && h.object !== ball && h.object !== shadow && h.object !== bg && h.face && (Array.isArray(h.object.material) || h.object.material.depthWrite));
    if (hs.length < 2) continue;
    const [a, b] = hs, dd = b.distance - a.distance;
    if (dd > Math.max(0.00002, 0.000004 * a.distance)) continue;   // ~10 steps of the logarithmic depth buffer there (flicker risk)
    const na = a.face.normal.clone().transformDirection(a.object.matrixWorld), nb = b.face.normal.clone().transformDirection(b.object.matrixWorld);
    if (Math.abs(na.dot(nb)) < 0.995) continue;                       // meeting at an edge, not overlapping
    if (a.object === b.object && Math.abs(a.faceIndex - b.faceIndex) <= 2) continue;   // two halves of one quad
    const ma = Array.isArray(a.object.material) ? a.object.material[a.face.materialIndex] : a.object.material;
    const mb = Array.isArray(b.object.material) ? b.object.material[b.face.materialIndex] : b.object.material;
    out.push({ x: Math.round(x), y: Math.round(y), d: +a.distance.toFixed(3), dd: +dd.toFixed(5), same: a.object === b.object, a: a.object.geometry.type + ' ' + hex(ma), b: b.object.geometry.type + ' ' + hex(mb), pa: a.object.getWorldPosition(new THREE.Vector3()).toArray().map(v => +v.toFixed(1)), pb: b.object.getWorldPosition(new THREE.Vector3()).toArray().map(v => +v.toFixed(1)) });
  }
  return out;
};
window.course3dCam = t => camAt(t).map(v => +(+v).toFixed(2));    // dev: camera key blend at authored time t
window.course3dCamPos = td => { window.render3D(td); const d = new THREE.Vector3(); camera.getWorldDirection(d); return [camera.position.toArray(), d.toArray()].map(a => a.map(v => +v.toFixed(2))); };   // dev: actual camera at display time
window.course3dBallWorld = t => ballAt(t).p.toArray();          // authored time; dev checks of the sphere's speed
window.course3dBallView = td => {                                   // display time; dev checks of on-screen speed: [x px, y px, radius px, visible]
  window.render3D(td); const c = ball.position.clone(), v = c.clone().project(camera);
  const upW = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1), e = c.addScaledVector(upW, R * ball.scale.x).project(camera);
  return [(v.x + 1) * 960, (1 - v.y) * 540, Math.hypot((e.x - v.x) * 960, (e.y - v.y) * 540), ball.visible && v.z < 1];
};
window.course3dBallScreen = t => { window.render3D(t); const v = ball.position.clone().project(camera); return [Math.round((v.x + 1) * 960), Math.round((1 - v.y) * 540)]; };
window.dispatchEvent(new Event('course3d-ready'));
