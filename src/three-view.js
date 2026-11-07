/* =====================================================================
   3D VIEW — Three.js scene: manikin mesh, decals, lights, OrbitControls,
   camera presets, 3D stethoscope, surface labels, quiz ring.
   The manikin geometry and all hit tests come from the SDF in body.js.
   ===================================================================== */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import * as B from './body.js';

export function webglAvailable() {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
  catch (e) { return false; }
}

const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const ease = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const TARGET0 = new THREE.Vector3(0, 2, 0);
export const PRESETS = {
  front:  { dir: [0, 0, 1],      ext: [80, 124], label: 'FRONT' },
  back:   { dir: [0, 0, -1],     ext: [80, 124], label: 'BACK' },
  left:   { dir: [1, 0, 0],      ext: [32, 124], label: "PATIENT'S LEFT" },
  right:  { dir: [-1, 0, 0],     ext: [32, 124], label: "PATIENT'S RIGHT" },
  top:    { dir: [0, 1, 0.02],   ext: [80, 34],  label: 'TOP (CRANIAL)' },
  bottom: { dir: [0, -1, 0.02],  ext: [80, 34],  label: 'BOTTOM (CAUDAL)' },
  chest:  { dir: [0.18, 0.1, 1], target: [2.5, 15, 8], dist: 78, label: 'CHEST CLOSE-UP' },
  reset:  { dir: [0.22, 0.12, 1], ext: [80, 124], label: '3D' },
};
export const PRESET_CYCLE = ['front', 'left', 'back', 'right', 'top', 'bottom'];

export class View3D {
  constructor(opts) {
    this.o = opts; // {stage, labelsEl, mesh, attrs, SITES3, siteKeys:{heart,lungs}, decal(view), torsoPath, onChestPiece(cp), onPreset(label)}
    this.stage = opts.stage;
    this.active = false; this.teach = true; this.module = 'heart'; this.head = 'diaphragm';
    this.showRibs = true; this.showLines = false; this.rotateMode = false; this.hold = false;
    this.ctrlPointers = new Set(); this.drag = null; this.anim = null; this.camDirty = true; this.cpDirty = true;
    this.cp = { p: [31, 6, 20], n: [0.3, 0.15, 0.94], down: false, onBody: false, region: '', cos: 0, hitDist: 120 };
    this.initRenderer(); this.initScene(); this.initBody(); this.initStethoscope(); this.initLabels(); this.initEvents();
    this.preset('reset', false);
  }

  /* ---------- renderer / scene ---------- */
  initRenderer() {
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.setClearColor(0x000000, 0);
    r.domElement.className = 'gl3d';
    r.domElement.style.touchAction = 'none';
    this.stage.insertBefore(r.domElement, this.stage.firstChild);
    this.camera = new THREE.PerspectiveCamera(30, 1, 2, 3000);
    this.controls = new OrbitControls(this.camera, r.domElement);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.085, rotateSpeed: 0.8, zoomSpeed: 0.9, panSpeed: 0.9,
      minDistance: 22, maxDistance: 520, minPolarAngle: 0.01, maxPolarAngle: Math.PI - 0.01, screenSpacePanning: true });
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    this.controls.addEventListener('change', () => { this.camDirty = true; this.cpDirty = true; });
    this.controls.addEventListener('start', () => { this.anim = null; this.o.onPreset && this.o.onPreset(null); });
    new ResizeObserver(() => this.resize()).observe(this.stage);
    this.resize();
  }
  resize() {
    const w = this.stage.clientWidth || 1, h = this.stage.clientHeight || 1;
    this.renderer.setSize(w, h, false); this.renderer.domElement.style.width = w + 'px'; this.renderer.domElement.style.height = h + 'px';
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.camDirty = true; this.cpDirty = true;
  }
  initScene() {
    const s = this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.env = pm.fromScene(new RoomEnvironment(this.renderer), 0.04).texture;
    s.add(new THREE.HemisphereLight(0xffffff, 0x8a7266, 1.15));
    const key = new THREE.DirectionalLight(0xffffff, 1.55); key.position.set(70, 110, 130); s.add(key);
    const fill = new THREE.DirectionalLight(0xfff4ec, 0.4); fill.position.set(-110, 20, 70); s.add(fill);
    const rim1 = new THREE.DirectionalLight(0xe4ecff, 1.0); rim1.position.set(-60, 70, -130); s.add(rim1);
    const rim2 = new THREE.DirectionalLight(0xe4ecff, 0.6); rim2.position.set(80, 20, -110); s.add(rim2);
    const under = new THREE.DirectionalLight(0xffffff, 0.25); under.position.set(0, -120, 40); s.add(under);
    // soft contact shadow under the base of the manikin
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    this.blob = new THREE.CanvasTexture(c);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.blob, transparent: true, depthWrite: false, opacity: .45 }));
    sh.rotation.x = -Math.PI / 2; sh.scale.set(70, 34, 1); sh.position.set(0, B.BOX[1] + 1.2, 0.5); s.add(sh); this.groundShadow = sh;
  }

  /* ---------- manikin mesh with decals + breathing ---------- */
  initBody() {
    const { mesh, attrs } = this.o, g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
    g.setAttribute('aUvF', new THREE.BufferAttribute(attrs.uvF, 2));
    g.setAttribute('aUvB', new THREE.BufferAttribute(attrs.uvB, 2));
    g.setAttribute('aMask', new THREE.BufferAttribute(attrs.mask, 3));
    g.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    g.computeBoundingSphere();
    this.texF = this.makeDecalTexture(); this.texB = this.makeDecalTexture();
    const mat = this.skinMat = new THREE.MeshStandardMaterial({ color: 0xedc9ad, roughness: 0.62, metalness: 0 });
    this.uniforms = { uTexF: { value: this.texF }, uTexB: { value: this.texB }, uBreath: { value: 0 } };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 aUvF; attribute vec2 aUvB; attribute vec3 aMask; uniform float uBreath; varying vec2 vUvF; varying vec2 vUvB; varying vec2 vMaskFB;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normal * aMask.z * uBreath; vUvF = aUvF; vUvB = aUvB; vMaskFB = aMask.xy;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uTexF; uniform sampler2D uTexB; varying vec2 vUvF; varying vec2 vUvB; varying vec2 vMaskFB;')
        .replace('#include <color_fragment>', '#include <color_fragment>\nvec4 dF = texture2D(uTexF, vUvF) * vMaskFB.x; vec4 dB = texture2D(uTexB, vUvB) * vMaskFB.y;\ndiffuseColor.rgb = diffuseColor.rgb * (1.0 - dF.a) + dF.rgb; diffuseColor.rgb = diffuseColor.rgb * (1.0 - dB.a) + dB.rgb;');
    };
    this.body = new THREE.Mesh(g, mat); this.scene.add(this.body);
    this.paintDecals();
  }
  makeDecalTexture() {
    const c = document.createElement('canvas'); c.width = 1200; c.height = 1980;
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.premultiplyAlpha = true; t.anisotropy = 4; t.flipY = true;
    return t;
  }
  /** Rasterise the same rib / ICS / landmark-line geometry used by the 2D view into front & back textures. */
  paintDecals() {
    for (const [view, tex] of [['front', this.texF], ['back', this.texB]]) {
      const c = tex.image, g = c.getContext('2d'), geo = this.o.decal(view);
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); g.setTransform(2, 0, 0, 2, 0, 0);
      g.lineCap = 'round';
      if (view === 'front') { // subtle areola tint
        g.fillStyle = 'rgba(150,90,70,.22)'; for (const x of [218, 382]) { g.beginPath(); g.arc(x, 362, 8, 0, 7); g.fill(); }
      }
      if (this.showRibs) {
        g.save(); g.clip(new Path2D(this.o.torsoPath));
        for (const d of geo.ribs) {
          const p = new Path2D(d);
          g.strokeStyle = 'rgba(143,95,70,.20)'; g.lineWidth = 6.5; g.stroke(p);
          g.save(); g.translate(0, 3.5); g.strokeStyle = 'rgba(143,95,70,.26)'; g.lineWidth = 1; g.stroke(p); g.restore();
        }
        g.restore();
        g.fillStyle = 'rgba(120,75,55,.9)'; g.textAlign = 'center';
        for (const t of geo.ics) { g.font = `600 ${t.size || 9}px system-ui,sans-serif`; g.textAlign = t.anchor || 'center'; g.fillText(t.t, t.x, t.y); }
      }
      if (this.showLines) {
        g.setLineDash([5, 4]); g.strokeStyle = 'rgba(37,99,235,.75)'; g.lineWidth = 1.4;
        for (const l of geo.lines) { g.beginPath(); g.moveTo(l.x1, l.y1); g.lineTo(l.x2, l.y2); g.stroke(); }
        g.setLineDash([]); g.font = '700 9.5px system-ui,sans-serif'; g.lineJoin = 'round';
        for (const l of geo.lines) if (l.lab) { g.textAlign = l.anc === 'start' ? 'left' : 'center'; g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 3; g.strokeText(l.lab, l.lx, l.ly); g.fillStyle = '#1d4ed8'; g.fillText(l.lab, l.lx, l.ly); }
      }
      tex.needsUpdate = true;
    }
  }
  setRibs(b) { this.showRibs = b; this.paintDecals(); }
  setLines(b) { this.showLines = b; this.paintDecals(); }

  /* ---------- stethoscope ---------- */
  initStethoscope() {
    const chrome = this.chromeMat = new THREE.MeshStandardMaterial({ color: 0xe3e7ea, metalness: 1, roughness: 0.2, envMap: this.env, envMapIntensity: 1.2 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a1f24, roughness: 0.5, metalness: 0.1 });
    this.tubeMat = new THREE.MeshStandardMaterial({ color: 0x2b3137, roughness: 0.45, metalness: 0.05, envMap: this.env, envMapIntensity: 0.4 });
    const cp = this.cpGroup = new THREE.Group();
    // diaphragm head
    const dia = this.cpDia = new THREE.Group();
    const d1 = new THREE.Mesh(new THREE.CylinderGeometry(2.25, 2.3, 1.0, 56), chrome); d1.position.y = 0.62;
    const d2 = new THREE.Mesh(new THREE.CylinderGeometry(2.32, 2.32, 0.24, 56), dark); d2.position.y = 0.12;
    const d3 = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.6, 0.5, 40), chrome); d3.position.y = 1.36;
    dia.add(d1, d2, d3);
    // bell head
    const bell = this.cpBell = new THREE.Group();
    const b1 = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.5, 1.7, 48), chrome); b1.position.y = 1.0;
    const b2 = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.17, 12, 48), dark); b2.rotation.x = Math.PI / 2; b2.position.y = 0.16;
    bell.add(b1, b2);
    // stem
    const stemL = 3.2, stem = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, stemL, 20), chrome);
    stem.rotation.z = -Math.PI / 2 + 0.32; stem.position.set(2.0 + stemL / 2 * Math.cos(0.32), 0.9 + stemL / 2 * Math.sin(0.32), 0);
    this.stemEndLocal = new THREE.Vector3(2.0 + stemL * Math.cos(0.32), 0.9 + stemL * Math.sin(0.32), 0);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 14), chrome); knob.position.set(2.1, 0.95, 0);
    cp.add(dia, bell, stem, knob); bell.visible = false;
    cp.traverse(o => { if (o.isMesh) o.userData.cp = true; });
    this.scene.add(cp);
    // soft shadow under the chest piece
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.blob, transparent: true, depthWrite: false, opacity: .5, polygonOffset: true, polygonOffsetFactor: -2 }));
    this.cpShadow = sm; this.scene.add(sm);
    this.tube = new THREE.Mesh(new THREE.BufferGeometry(), this.tubeMat); this.scene.add(this.tube);
  }
  setHead(h) { this.head = h; this.cpDia.visible = h === 'diaphragm'; this.cpBell.visible = h === 'bell'; this.cpDirty = true; }
  updateStethoscope() {
    const cp = this.cp, n = V3(cp.n).normalize(), p = V3(cp.p);
    const lift = cp.down ? 0.02 : (cp.onBody ? 2.2 : 0);
    const pos = p.clone().addScaledVector(n, lift);
    // orient: local +Y = surface normal, stem (local +X) towards the tube exit (top-right of the screen, off-view)
    const zN = pos.clone().project(this.camera).z, far = new THREE.Vector3(1.45, 1.35, Math.min(0.9999, zN)).unproject(this.camera);
    const toFar = far.clone().sub(pos); const tang = toFar.clone().addScaledVector(n, -toFar.dot(n));
    if (tang.lengthSq() < 1e-6) tang.set(1, 0, 0).addScaledVector(n, -n.x);
    tang.normalize(); const bin = new THREE.Vector3().crossVectors(tang, n).normalize();
    const m = new THREE.Matrix4().makeBasis(tang, n, bin);
    this.cpGroup.quaternion.setFromRotationMatrix(m); this.cpGroup.position.copy(pos);
    this.cpGroup.updateMatrixWorld(true);
    // shadow
    const r = this.head === 'diaphragm' ? 2.4 : 1.7, sc = cp.onBody ? (cp.down ? r * 2.5 : r * 3.4) : 0.001;
    this.cpShadow.position.copy(p).addScaledVector(n, 0.08); this.cpShadow.lookAt(p.clone().add(n)); this.cpShadow.scale.set(sc, sc, 1);
    this.cpShadow.material.opacity = cp.down ? 0.55 : 0.3;
    // tube along a smooth curve out of view
    const s0 = this.stemEndLocal.clone().applyMatrix4(this.cpGroup.matrixWorld);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
    const c1 = s0.clone().addScaledVector(tang, 5).addScaledVector(n, 4);
    const mid = s0.clone().lerp(far, 0.4).addScaledVector(n, 8).addScaledVector(up, -6);
    const curve = new THREE.CatmullRomCurve3([s0, c1, mid, far], false, 'centripetal');
    const old = this.tube.geometry; this.tube.geometry = new THREE.TubeGeometry(curve, 90, 0.42, 10, false); old.dispose();
  }

  /* ---------- surface labels & markers ---------- */
  initLabels() {
    this.markers = new THREE.Group(); this.scene.add(this.markers);
    this._axis = new THREE.Vector3(); this.labels = []; this.dotMat = new THREE.MeshBasicMaterial({ color: 0x0e7c74 });
    this.radMat = new THREE.MeshBasicMaterial({ color: 0x0e7c74, side: THREE.DoubleSide });
    this.ring = new THREE.Group();
    const rm = new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide, transparent: true, depthTest: false });
    this.ringA = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.1, 48), rm);
    this.ringB = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.0, 48), rm.clone());
    this.ring.add(this.ringA, this.ringB); this.ring.visible = false; this.ring.renderOrder = 10; this.scene.add(this.ring);
    this.buildSiteLabels();
  }
  buildSiteLabels() {
    for (const l of this.labels) l.el.remove();
    this.markers.clear(); this.labels = [];
    const keys = this.o.siteKeys[this.module], S3 = this.o.SITES3;
    for (const k of keys) {
      const s = S3[k], p = V3(s.p), n = V3(s.n);
      const m = s.rad ? new THREE.Mesh(new THREE.RingGeometry(0.34, 0.5, 28), this.radMat) : new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 12), this.dotMat);
      m.position.copy(p).addScaledVector(n, 0.12); if (s.rad) m.lookAt(p.clone().add(n));
      this.markers.add(m);
      const el = document.createElement('div'); el.className = 'lab3' + (s.rad ? ' rad' : ''); el.textContent = s.lab; this.o.labelsEl.appendChild(el);
      this.labels.push({ el, p, n, vis: false });
    }
    this.markers.visible = this.teach; this.camDirty = true;
  }
  setModule(m) { this.module = m; this.buildSiteLabels(); }
  setTeach(b) { this.teach = b; this.markers.visible = b; for (const l of this.labels) l.el.style.display = b ? '' : 'none'; this.camDirty = true; }
  updateLabels() {
    if (!this.teach) return;
    const w = this.stage.clientWidth, h = this.stage.clientHeight, cam = this.camera.position, v = new THREE.Vector3();
    for (const l of this.labels) {
      if (this.camDirty) { // visibility: facing the camera and not occluded by the body
        const to = cam.clone().sub(l.p), dist = to.length(); to.normalize();
        let vis = to.dot(l.n) > 0.12;
        if (vis) { const o = [cam.x, cam.y, cam.z], d = [-to.x, -to.y, -to.z], t = B.raymarch(o, d); vis = !(t > 0 && t < dist - 1.2); }
        l.vis = vis;
      }
      v.copy(l.p).project(this.camera);
      const on = l.vis && v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      l.el.style.opacity = on ? '1' : '0';
      if (on) { // label on the outer side of the point (away from the body's midline on screen)
        const ax = this._axis.set(0, l.p.y, B.zc(l.p.y)).project(this.camera).x, left = v.x < ax - 0.004;
        l.el.classList.toggle('left', left);
        l.el.style.transform = `translate(${((v.x + 1) / 2 * w).toFixed(1)}px,${((1 - v.y) / 2 * h).toFixed(1)}px)${left ? ' translateX(-100%)' : ''}`; }
    }
  }
  showMarker(p, n) {
    const P = V3(p), N = V3(n).normalize();
    this.ring.position.copy(P).addScaledVector(N, 0.25); this.ring.lookAt(P.clone().add(N)); this.ring.visible = true;
    const dir = N.clone().add(new THREE.Vector3(0, 0.15, 0)).normalize();
    this.flyTo(P, dir, Math.max(70, this.fitDistance([30, 30]))); this.o.onPreset && this.o.onPreset('MAXIMAL INTENSITY');
  }
  clearMarker() { this.ring.visible = false; }

  /* ---------- camera ---------- */
  fitDistance(ext) {
    const t = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    return Math.max(ext[1] / 2 / t, ext[0] / 2 / (t * this.camera.aspect)) * 1.1 + 15;
  }
  preset(name, animate = true) {
    const pr = PRESETS[name]; if (!pr) return;
    const target = pr.target ? V3(pr.target) : TARGET0.clone(), dir = V3(pr.dir).normalize();
    const dist = pr.dist ? Math.max(pr.dist, this.fitDistance([34, 30])) : this.fitDistance(pr.ext);
    this.flyTo(target, dir, dist, animate);
    this.currentPreset = name; this.o.onPreset && this.o.onPreset(pr.label);
  }
  flyTo(target, dir, dist, animate = true) {
    const c = this.controls;
    const from = { t: c.target.clone(), dir: this.camera.position.clone().sub(c.target).normalize(), dist: this.camera.position.distanceTo(c.target) };
    const to = { t: target.clone(), dir: dir.clone().normalize(), dist };
    if (!animate) { c.target.copy(to.t); this.camera.position.copy(to.t).addScaledVector(to.dir, to.dist); c.update(); this.camera.updateMatrixWorld(); this.camDirty = true; this.cpDirty = true; return; }
    this.anim = { from, to, t0: performance.now(), dur: 700 };
  }
  stepAnim() {
    const a = this.anim; if (!a) return;
    const k = Math.min(1, (performance.now() - a.t0) / a.dur), e = ease(k);
    const q0 = new THREE.Quaternion(), q = new THREE.Quaternion().setFromUnitVectors(a.from.dir, a.to.dir);
    if (a.from.dir.dot(a.to.dir) < -0.999) q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    const dir = a.from.dir.clone().applyQuaternion(q0.slerp(q, e));
    const t = a.from.t.clone().lerp(a.to.t, e), dist = a.from.dist + (a.to.dist - a.from.dist) * e;
    this.controls.target.copy(t); this.camera.position.copy(t).addScaledVector(dir, dist);
    this.camDirty = true; this.cpDirty = true;
    if (k >= 1) this.anim = null;
  }
  keepCameraOutside() { // the camera must never enter the body
    const p = this.camera.position;
    for (let i = 0; i < 4; i++) {
      const d = B.sdf(p.x, p.y, p.z); if (d >= 4) break;
      const n = B.gradient(B.sdf, p.x, p.y, p.z, 0.5); p.x += n[0] * (4.2 - d); p.y += n[1] * (4.2 - d); p.z += n[2] * (4.2 - d);
    }
    const t = this.controls.target; t.x = THREE.MathUtils.clamp(t.x, -60, 60); t.y = THREE.MathUtils.clamp(t.y, -70, 75); t.z = THREE.MathUtils.clamp(t.z, -40, 40);
  }

  /* ---------- pointer handling: drag on body = chest piece, elsewhere = orbit ---------- */
  rayFrom(clientX, clientY) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster = this.raycaster || new THREE.Raycaster(); this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.ray;
  }
  hitBody(ray) {
    const o = ray.origin.toArray(), d = ray.direction.toArray(), t = B.raymarch(o, d);
    if (t < 0) return null;
    const p = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
    return { p, n: B.gradient(B.sdf, p[0], p[1], p[2], 0.2), t };
  }
  hitChestPiece(ray) { this.raycaster.ray.copy(ray); return this.raycaster.intersectObject(this.cpGroup, true).length > 0; }
  setCp(hit, ray) {
    const cp = this.cp;
    if (hit) {
      cp.p = hit.p; cp.n = hit.n; cp.onBody = true; cp.hitDist = hit.t;
      cp.region = B.regionAt(...hit.p); cp.cos = B.to2D(...hit.p).cos;
    } else if (ray) { // follow the pointer in the air at the last depth
      const p = ray.origin.clone().addScaledVector(ray.direction, cp.hitDist || 100);
      cp.p = p.toArray(); cp.n = ray.direction.clone().negate().toArray(); cp.onBody = false; cp.region = '';
    }
    this.cpDirty = true; this.o.onChestPiece(cp);
  }
  initEvents() {
    const st = this.stage;
    const down = (e) => {
      if (!this.active) return;
      if (e.pointerType === 'mouse' && e.button !== 0) { this.ctrlPointers.add(e.pointerId); return; }
      if (this.rotateMode || this.hold || e.altKey || this.ctrlPointers.size > 0 || this.drag) { this.ctrlPointers.add(e.pointerId); if (this.drag) { e.stopPropagation(); } return; }
      const ray = this.rayFrom(e.clientX, e.clientY), onCp = this.hitChestPiece(ray), hit = this.hitBody(ray);
      if (!onCp && !hit) { this.ctrlPointers.add(e.pointerId); return; } // background → OrbitControls
      e.stopPropagation(); e.preventDefault();
      this.drag = { id: e.pointerId }; st.setPointerCapture(e.pointerId); st.classList.add('dragging');
      this.cp.down = true; this.anim = null;
      if (hit) this.setCp(hit); else { this.cpDirty = true; this.o.onChestPiece(this.cp); }
    };
    const move = (e) => {
      if (!this.active) return;
      if (this.drag && e.pointerId === this.drag.id) {
        e.stopPropagation(); const ray = this.rayFrom(e.clientX, e.clientY); this.setCp(this.hitBody(ray), ray); return;
      }
      if (e.buttons === 0 && e.pointerType === 'mouse') this.hoverXY = [e.clientX, e.clientY];
    };
    const up = (e) => {
      this.ctrlPointers.delete(e.pointerId);
      if (this.drag && e.pointerId === this.drag.id) {
        e.stopPropagation(); this.drag = null; st.classList.remove('dragging');
        this.cp.down = !!this.o.keepPlaced(); this.cpDirty = true; this.o.onChestPiece(this.cp);
      }
    };
    st.addEventListener('pointerdown', down, { capture: true });
    st.addEventListener('pointermove', move, { capture: true });
    st.addEventListener('pointerup', up, { capture: true });
    st.addEventListener('pointercancel', up, { capture: true });
    st.addEventListener('contextmenu', e => { if (this.active) e.preventDefault(); });
  }
  setRotateMode(b) { this.rotateMode = b; this.updateCursor(true); }
  setHold(b) { if (this.hold !== b) { this.hold = b; this.updateCursor(true); } }
  updateCursor(force) {
    const c = this.renderer.domElement;
    if (this.drag) return;
    if (this.rotateMode || this.hold) { c.style.cursor = 'move'; return; }
    if (!this.hoverXY && !force) return;
    if (this.hoverXY) { const ray = this.rayFrom(...this.hoverXY); c.style.cursor = (this.hitBody(ray) || this.hitChestPiece(ray)) ? 'grab' : 'move'; this.hoverXY = null; }
  }
  /** Keyboard: move the chest piece by screen pixels over the surface. */
  nudge(dx, dy) {
    const v = V3(this.cp.p).project(this.camera), r = this.renderer.domElement.getBoundingClientRect();
    const x = r.left + (v.x + 1) / 2 * r.width + dx, y = r.top + (1 - v.y) / 2 * r.height + dy;
    const ray = this.rayFrom(x, y), hit = this.hitBody(ray);
    this.cp.down = true; if (hit) this.setCp(hit); else this.setCp(null, ray);
  }
  toggleLift() { this.cp.down = !this.cp.down; this.cpDirty = true; this.o.onChestPiece(this.cp); }

  /* ---------- theme ---------- */
  refreshTheme(skinCss, dark) {
    try { this.skinMat.color.setStyle(skinCss || '#edc9ad'); } catch (e) {}
    this.groundShadow.material.opacity = dark ? 0.6 : 0.42;
    const acc = getComputedStyle(document.documentElement).getPropertyValue('--dot').trim() || '#0e7c74';
    try { this.dotMat.color.setStyle(acc); this.radMat.color.setStyle(acc); } catch (e) {}
  }

  setActive(b) {
    this.active = b; this.renderer.domElement.style.display = b ? '' : 'none'; this.o.labelsEl.style.display = b ? '' : 'none';
    if (b) { this.resize(); this.camDirty = this.cpDirty = true; this.o.onChestPiece(this.cp); }
  }
  /** Called every animation frame by the app. */
  update(breathV) {
    if (!this.active) return;
    this.stepAnim(); this.controls.update(); this.keepCameraOutside(); this.camera.updateMatrixWorld();
    this.uniforms.uBreath.value = breathV * 0.7;
    if (this.cpDirty) { this.cpDirty = false; this.updateStethoscope(); }
    this.updateLabels(); this.camDirty = false; this.updateCursor(false);
    if (this.ring.visible) { const f = (performance.now() % 1400) / 1400; this.ringB.scale.setScalar(1 + f * 1.3); this.ringB.material.opacity = 1 - f; }
    this.renderer.render(this.scene, this.camera);
  }
}
