/* =========================================================
 *  doors.js — Walk-through energy doors
 *  - EnergyTex: procedural energy-field canvas texture
 *  - DoorFactory.build(): builds an a-entity energy door
 *  - door-energy component: animates texture scroll + pulse
 *  - door-walkthrough component: fires 'walkthrough' event
 *    when the camera physically passes through the door
 * ========================================================= */

/* global AFRAME, THREE */

// ---------------------------------------------------------------
// 1. Procedural energy texture
// ---------------------------------------------------------------
const EnergyTex = (() => {
  let base = null;
  function _base() {
    if (base) return base;
    const c = document.createElement('canvas');
    c.width = 256; c.height = 512;
    const ctx = c.getContext('2d');
    // vertical gradient base (dark center, glow top/bottom)
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0,   'rgba(255,255,255,0.9)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    g.addColorStop(1,   'rgba(255,255,255,0.9)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 512);
    // vertical streaks
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * 256;
      const w = 0.5 + Math.random() * 2.5;
      ctx.fillStyle = `rgba(255,255,255,${0.05 + Math.random() * 0.3})`;
      ctx.fillRect(x, 0, w, 512);
    }
    // noise dots
    for (let i = 0; i < 800; i++) {
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.5})`;
      ctx.fillRect(Math.random() * 256, Math.random() * 512, 1.5, 1.5);
    }
    // horizontal pulse bands
    for (let i = 0; i < 6; i++) {
      const y = Math.random() * 512;
      const bg = ctx.createLinearGradient(0, y - 20, 0, y + 20);
      bg.addColorStop(0, 'rgba(255,255,255,0)');
      bg.addColorStop(0.5, 'rgba(255,255,255,0.5)');
      bg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, y - 20, 256, 40);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace || t.colorSpace;
    base = t;
    return t;
  }
  function make() {
    // clone so each door can animate offset independently
    const b = _base();
    const t = b.clone();
    t.needsUpdate = true;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
  return { make };
})();
window.EnergyTex = EnergyTex;

// ---------------------------------------------------------------
// 2. Door factory
// ---------------------------------------------------------------
const DoorFactory = (() => {
  function build(opts) {
    const {
      id = '',
      color = '#ffffff',
      label = '',
      desc = '',
      width = 1.8,
      height = 3.0,
      position = { x: 0, y: 0, z: 0 }
    } = opts;

    const ent = document.createElement('a-entity');
    ent.setAttribute('id', id ? 'portal-' + id : '');
    ent.classList.add('vr-clickable');
    ent.setAttribute('position', `${position.x} ${position.y} ${position.z}`);
    ent.setAttribute('door-energy', '');
    ent.setAttribute('door-walkthrough',
      `width: ${width}; depth: 0.9; height: ${height}; id: ${id}`);

    ent.addEventListener('loaded', () => {
      const group = new THREE.Group();
      const col = new THREE.Color(color);

      // ---- Energy surface ----
      const energyGeo = new THREE.PlaneGeometry(width, height, 1, 1);
      const energyTex = EnergyTex.make();
      const energyMat = new THREE.MeshBasicMaterial({
        map: energyTex,
        color: col,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const energy = new THREE.Mesh(energyGeo, energyMat);
      energy.position.y = height / 2;
      group.add(energy);
      ent._energyTex = energyTex;
      ent._energyMat = energyMat;

      // ---- Inner glow plane (behind energy) ----
      const glowGeo = new THREE.PlaneGeometry(width * 1.15, height * 1.08);
      const glowMat = new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: 0.25,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.set(0, height / 2, -0.03);
      group.add(glow);

      // ---- Frame (4 thin boxes) ----
      const frameMat = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        emissive: col,
        emissiveIntensity: 0.6,
        metalness: 0.8,
        roughness: 0.3
      });
      const fT = 0.12;
      const fD = 0.18;
      // verticals
      const vGeo = new THREE.BoxGeometry(fT, height + fT * 2, fD);
      const left = new THREE.Mesh(vGeo, frameMat);
      left.position.set(-width / 2 - fT / 2, height / 2, 0);
      const right = left.clone();
      right.position.x = width / 2 + fT / 2;
      // horizontals
      const hGeo = new THREE.BoxGeometry(width + fT * 2, fT, fD);
      const top = new THREE.Mesh(hGeo, frameMat);
      top.position.set(0, height + fT / 2, 0);
      const bot = top.clone();
      bot.position.y = -fT / 2;
      group.add(left, right, top, bot);

      // ---- Point light ----
      const light = new THREE.PointLight(col, 2.0, 10);
      light.position.set(0, height * 0.6, 0.3);
      group.add(light);
      ent._doorLight = light;

      ent.object3D.add(group);

      // ---- Label plane (uses existing Arabic canvas renderer) ----
      if (label) {
        const labelEl = document.createElement('a-plane');
        labelEl.setAttribute('position', `0 ${height + 0.55} 0`);
        labelEl.setAttribute('width', Math.max(3, width + 1.5));
        labelEl.setAttribute('height', 0.85);
        labelEl.setAttribute('material', 'transparent: true; alphaTest: 0.01; shader: flat');
        labelEl.classList.add('ar-label');
        labelEl.dataset.text = label;
        labelEl.dataset.color = '#ffffff';
        ent.appendChild(labelEl);
      }
      if (desc) {
        const descEl = document.createElement('a-plane');
        descEl.setAttribute('position', `0 -0.45 0`);
        descEl.setAttribute('width', Math.max(3.2, width + 1.8));
        descEl.setAttribute('height', 0.55);
        descEl.setAttribute('material', 'transparent: true; alphaTest: 0.01; shader: flat');
        descEl.classList.add('ar-label');
        descEl.dataset.text = desc;
        descEl.dataset.color = '#cbd5e1';
        ent.appendChild(descEl);
      }
      if ((label || desc) && window.renderArabicLabels) {
        setTimeout(window.renderArabicLabels, 100);
      }
    });

    return ent;
  }
  return { build };
})();
window.DoorFactory = DoorFactory;

// ---------------------------------------------------------------
// 3. door-energy component — animates texture scroll + light pulse
// ---------------------------------------------------------------
AFRAME.registerComponent('door-energy', {
  init: function () { this._t0 = performance.now(); },
  tick: function () {
    const el = this.el;
    const t = (performance.now() - this._t0) * 0.001;
    if (el._energyTex) {
      el._energyTex.offset.y = -t * 0.35;
      el._energyTex.offset.x = Math.sin(t * 0.4) * 0.02;
    }
    if (el._energyMat) {
      el._energyMat.opacity = 0.75 + Math.sin(t * 2.3) * 0.15;
    }
    if (el._doorLight) {
      el._doorLight.intensity = 1.6 + Math.sin(t * 2.0) * 0.6;
    }
  }
});

// ---------------------------------------------------------------
// 4. door-walkthrough component — fires event on camera cross
// ---------------------------------------------------------------
AFRAME.registerComponent('door-walkthrough', {
  schema: {
    width: { type: 'number', default: 1.8 },
    depth: { type: 'number', default: 0.9 },
    height: { type: 'number', default: 3.0 },
    id: { type: 'string', default: '' }
  },
  init: function () {
    this._fired = false;
    this._v = new THREE.Vector3();
    this._cam = null;
  },
  _getCam: function () {
    if (this._cam) return this._cam;
    const c = document.getElementById('vrCamera');
    if (c && c.object3D) this._cam = c.object3D;
    return this._cam;
  },
  reset: function () { this._fired = false; },
  tick: function () {
    if (this._fired) return;
    if (!this.el.object3D.visible) return;
    // also skip if parent container is hidden
    let p = this.el.object3D.parent;
    while (p) { if (p.visible === false) return; p = p.parent; }
    const cam = this._getCam();
    if (!cam) return;
    const v = this._v;
    cam.getWorldPosition(v);
    this.el.object3D.worldToLocal(v);
    const d = this.data;
    if (Math.abs(v.x) < d.width / 2 + 0.15 &&
        Math.abs(v.z) < d.depth / 2 &&
        v.y > -0.5 && v.y < d.height + 0.5) {
      this._fired = true;
      this.el.emit('walkthrough', { id: d.id });
    }
  }
});
