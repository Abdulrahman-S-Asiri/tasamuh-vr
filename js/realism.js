/* =========================================================
 *  realism.js — Phase 1 visual upgrades for tasamuh-vr
 *  - Procedural PBR-like textures (canvas-generated, offline)
 *  - Realistic tree factory (trunk + branches + layered foliage)
 *  - wind-sway component (gentle foliage animation)
 *  - bloom-fx component (Three.js EffectComposer post-processing)
 *  - enhanced directional light with soft shadows
 * ========================================================= */

/* global AFRAME, THREE */

// ---------------------------------------------------------------
// 0. Quality tier — scales counts for weak devices
// ---------------------------------------------------------------
const QUALITY = (() => {
  const ua = navigator.userAgent || '';
  const isMobile = /Android|iPhone|iPad|Mobile|Quest/i.test(ua);
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  let tier = 'high';
  if (isMobile || cores <= 4 || mem <= 4) tier = 'medium';
  if (isMobile && (cores <= 2 || mem <= 2)) tier = 'low';
  const scales = { high: 1, medium: 0.6, low: 0.35 };
  return {
    tier,
    scale: scales[tier],
    n: (count) => Math.max(10, Math.floor(count * scales[tier]))
  };
})();
window.QUALITY = QUALITY;
console.log('[quality] tier =', QUALITY.tier);

// ---------------------------------------------------------------
// 1. Procedural texture factory (cached)
// ---------------------------------------------------------------
const ProcTex = (() => {
  const cache = {};

  function _canvas(size = 512) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    return c;
  }

  function _toTex(canvas, repeat = 1) {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.colorSpace = THREE.SRGBColorSpace || t.colorSpace;
    t.anisotropy = 8;
    return t;
  }

  function _noise(ctx, w, h, alpha = 0.15) {
    const img = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 255 * alpha;
      img.data[i]   = Math.max(0, Math.min(255, img.data[i] + n));
      img.data[i+1] = Math.max(0, Math.min(255, img.data[i+1] + n));
      img.data[i+2] = Math.max(0, Math.min(255, img.data[i+2] + n));
    }
    ctx.putImageData(img, 0, 0);
  }

  // ---- grass (ground) ----
  function grass() {
    if (cache.grass) return cache.grass;
    const c = _canvas(512);
    const ctx = c.getContext('2d');
    // base gradient
    const g = ctx.createLinearGradient(0, 0, 512, 512);
    g.addColorStop(0, '#2f6b2a');
    g.addColorStop(0.5, '#3d7a30');
    g.addColorStop(1, '#26581f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);
    // grass blades via random short strokes
    for (let i = 0; i < 4500; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const len = 2 + Math.random() * 5;
      const hue = 95 + Math.random() * 25;
      const light = 20 + Math.random() * 25;
      ctx.strokeStyle = `hsl(${hue}, ${50 + Math.random()*30}%, ${light}%)`;
      ctx.lineWidth = 0.8 + Math.random() * 0.8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random()-0.5)*2, y - len);
      ctx.stroke();
    }
    // small flower/clover specks
    for (let i = 0; i < 180; i++) {
      ctx.fillStyle = Math.random() < 0.5 ? '#d9e87a' : '#f2c14e';
      ctx.beginPath();
      ctx.arc(Math.random()*512, Math.random()*512, 0.8 + Math.random()*1.2, 0, 6.283);
      ctx.fill();
    }
    _noise(ctx, 512, 512, 0.08);
    cache.grass = _toTex(c, 40);
    return cache.grass;
  }

  // ---- bark ----
  function bark() {
    if (cache.bark) return cache.bark;
    const c = _canvas(256);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#4a2f1e';
    ctx.fillRect(0, 0, 256, 256);
    // vertical bark streaks
    for (let i = 0; i < 300; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const h = 20 + Math.random() * 80;
      const shade = 20 + Math.random() * 40;
      ctx.strokeStyle = `rgb(${shade+30}, ${shade+15}, ${shade})`;
      ctx.lineWidth = 0.6 + Math.random() * 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x+3, y+h*0.3, x-3, y+h*0.6, x+Math.random()*2-1, y+h);
      ctx.stroke();
    }
    // cracks
    for (let i = 0; i < 40; i++) {
      ctx.strokeStyle = 'rgba(10,5,0,0.8)';
      ctx.lineWidth = 0.5 + Math.random()*1;
      ctx.beginPath();
      const x = Math.random()*256;
      ctx.moveTo(x, 0);
      let y = 0;
      while (y < 256) {
        y += 10 + Math.random()*20;
        ctx.lineTo(x + (Math.random()-0.5)*8, y);
      }
      ctx.stroke();
    }
    _noise(ctx, 256, 256, 0.12);
    cache.bark = _toTex(c, 2);
    cache.bark.repeat.set(1, 3); // vertical stretch for trunks
    return cache.bark;
  }

  // ---- leaf cluster (alpha-billboard) ----
  function leaf() {
    if (cache.leaf) return cache.leaf;
    const c = _canvas(256);
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 256, 256);
    // many small leaf dots with varying greens + alpha
    for (let i = 0; i < 600; i++) {
      const x = 128 + (Math.random()-0.5) * 220;
      const y = 128 + (Math.random()-0.5) * 220;
      const d = Math.hypot(x-128, y-128);
      if (d > 120) continue;
      const alpha = 1 - (d/120) * 0.8;
      const hue = 95 + Math.random()*30;
      const light = 22 + Math.random()*28;
      ctx.fillStyle = `hsla(${hue}, ${55 + Math.random()*25}%, ${light}%, ${alpha})`;
      ctx.beginPath();
      ctx.ellipse(x, y, 3 + Math.random()*6, 5 + Math.random()*8,
                  Math.random()*6.28, 0, 6.283);
      ctx.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace || t.colorSpace;
    cache.leaf = t;
    return cache.leaf;
  }

  // ---- rocky mountain ----
  function rock() {
    if (cache.rock) return cache.rock;
    const c = _canvas(256);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#556672';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 600; i++) {
      const s = 20 + Math.random()*40;
      ctx.fillStyle = `hsla(210, 10%, ${25 + Math.random()*35}%, 0.6)`;
      ctx.beginPath();
      ctx.arc(Math.random()*256, Math.random()*256, s, 0, 6.283);
      ctx.fill();
    }
    _noise(ctx, 256, 256, 0.2);
    cache.rock = _toTex(c, 3);
    return cache.rock;
  }

  return { grass, bark, leaf, rock };
})();

// Expose globally
window.ProcTex = ProcTex;

// ---------------------------------------------------------------
// 2. Realistic tree factory
// ---------------------------------------------------------------
const TreeFactory = (() => {
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // Build a semi-realistic tree as a THREE.Group (faster than a-entity children)
  function build(opts = {}) {
    const group = new THREE.Group();
    const type = opts.type || (Math.random() < 0.35 ? 'pine' : 'broadleaf');
    const h = opts.height || rand(3.5, 7.5);
    const trunkR = opts.trunkR || rand(0.18, 0.38);

    // prefer real PBR bark if loaded
    const pbrBark = window.Assets ? window.Assets.getCachedPBR('bark') : null;
    const bark = pbrBark && pbrBark.map ? pbrBark.map : ProcTex.bark();

    // Trunk: tapered cylinder
    const trunkGeo = new THREE.CylinderGeometry(trunkR * 0.55, trunkR, h, 10, 1);
    const trunkMat = new THREE.MeshStandardMaterial({
      map: bark,
      normalMap: pbrBark ? pbrBark.normalMap : null,
      roughnessMap: pbrBark ? pbrBark.roughnessMap : null,
      color: new THREE.Color().setHSL(0.08, 0.35, 0.22 + Math.random()*0.08),
      roughness: 0.95,
      metalness: 0
    });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = h / 2;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    group.add(trunk);

    // Branches (2-4 angled cylinders near top)
    const branchCount = 2 + Math.floor(Math.random()*3);
    for (let i = 0; i < branchCount; i++) {
      const bLen = rand(0.8, 1.6);
      const bGeo = new THREE.CylinderGeometry(trunkR*0.25, trunkR*0.4, bLen, 6);
      const branch = new THREE.Mesh(bGeo, trunkMat);
      const ang = (i / branchCount) * Math.PI * 2 + Math.random();
      branch.position.set(
        Math.cos(ang) * bLen * 0.4,
        h * (0.55 + Math.random()*0.35),
        Math.sin(ang) * bLen * 0.4
      );
      branch.rotation.z = Math.cos(ang) * rand(0.6, 1.1);
      branch.rotation.x = Math.sin(ang) * rand(0.6, 1.1);
      branch.castShadow = true;
      group.add(branch);
    }

    // Foliage
    const foliageColors = [
      0x2d6b23, 0x3a7a2d, 0x4a8c33, 0x2a6320, 0x5a9a3d, 0x33691E,
    ];
    const baseColor = pick(foliageColors);

    if (type === 'pine') {
      // stacked cones
      const layers = 3 + Math.floor(Math.random()*2);
      for (let i = 0; i < layers; i++) {
        const t = i / (layers - 1);
        const rTop = (1 - t) * rand(1.0, 1.6);
        const layerH = rand(1.0, 1.6);
        const cGeo = new THREE.ConeGeometry(rTop, layerH, 9, 1);
        const cMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(baseColor).offsetHSL(0, 0, (Math.random()-0.5)*0.1),
          roughness: 0.9,
          metalness: 0,
          flatShading: true,
        });
        const cone = new THREE.Mesh(cGeo, cMat);
        cone.position.y = h * 0.55 + i * layerH * 0.7;
        cone.castShadow = true;
        cone.userData.sway = true;
        group.add(cone);
      }
    } else {
      // broadleaf: 3-5 overlapping icosphere clusters
      const clusters = 3 + Math.floor(Math.random()*3);
      const leafR = rand(1.3, 2.3);
      for (let i = 0; i < clusters; i++) {
        const r = leafR * (0.65 + Math.random()*0.5);
        const fGeo = new THREE.IcosahedronGeometry(r, 1);
        // slight vertex jitter for organic shape
        const pos = fGeo.attributes.position;
        for (let v = 0; v < pos.count; v++) {
          pos.setXYZ(v,
            pos.getX(v) * (0.85 + Math.random()*0.3),
            pos.getY(v) * (0.85 + Math.random()*0.3),
            pos.getZ(v) * (0.85 + Math.random()*0.3));
        }
        fGeo.computeVertexNormals();
        const fMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(baseColor).offsetHSL(0, 0, (Math.random()-0.5)*0.12),
          roughness: 0.85,
          metalness: 0,
          flatShading: true,
        });
        const foliage = new THREE.Mesh(fGeo, fMat);
        foliage.position.set(
          rand(-0.6, 0.6),
          h * 0.85 + rand(-0.4, 0.9),
          rand(-0.6, 0.6)
        );
        foliage.castShadow = true;
        foliage.userData.sway = true;
        group.add(foliage);
      }
    }

    // random scale / rotation
    group.rotation.y = Math.random() * Math.PI * 2;
    const s = rand(0.85, 1.2);
    group.scale.set(s, s, s);
    group.userData.swayPhase = Math.random() * Math.PI * 2;
    return group;
  }

  return { build };
})();

window.TreeFactory = TreeFactory;

// ---------------------------------------------------------------
// 3. wind-sway component: animates foliage meshes each frame
// ---------------------------------------------------------------
AFRAME.registerComponent('wind-sway', {
  schema: {
    amplitude: { type: 'number', default: 0.035 },
    speed: { type: 'number', default: 0.0012 }
  },
  init: function () {
    this._targets = [];
    this._t0 = performance.now();
    // Collect foliage meshes tagged with userData.sway
    const collect = () => {
      this._targets.length = 0;
      this.el.object3D.traverse((o) => {
        if (o.userData && o.userData.sway) {
          this._targets.push({
            obj: o,
            baseX: o.rotation.x,
            baseZ: o.rotation.z,
            phase: Math.random() * Math.PI * 2
          });
        }
      });
    };
    // Wait a bit for procedural content to load
    setTimeout(collect, 500);
    setTimeout(collect, 2000);
    this._collect = collect;
  },
  tick: function () {
    if (!this._targets.length) return;
    const t = (performance.now() - this._t0) * this.data.speed;
    const a = this.data.amplitude;
    for (let i = 0; i < this._targets.length; i++) {
      const T = this._targets[i];
      T.obj.rotation.x = T.baseX + Math.sin(t + T.phase) * a;
      T.obj.rotation.z = T.baseZ + Math.cos(t * 0.8 + T.phase) * a * 0.6;
    }
  }
});

// ---------------------------------------------------------------
// 4. bloom-fx component: Three.js EffectComposer post-processing
// ---------------------------------------------------------------
AFRAME.registerComponent('bloom-fx', {
  schema: {
    strength: { type: 'number', default: 0.55 },
    radius: { type: 'number', default: 0.4 },
    threshold: { type: 'number', default: 0.82 },
    enabled: { type: 'boolean', default: true }
  },
  init: function () {
    const sceneEl = this.el;
    const ready = () => this._setup();
    if (sceneEl.hasLoaded) ready();
    else sceneEl.addEventListener('loaded', ready);
  },
  _setup: function () {
    if (!this.data.enabled) return;
    // Load required Three.js post-processing modules from CDN
    const BASE = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/js/';
    const scripts = [
      'postprocessing/EffectComposer.js',
      'postprocessing/RenderPass.js',
      'postprocessing/ShaderPass.js',
      'postprocessing/UnrealBloomPass.js',
      'postprocessing/OutputPass.js',
      'shaders/CopyShader.js',
      'shaders/LuminosityHighPassShader.js',
      'shaders/OutputShader.js'
    ];
    let loaded = 0;
    const loadNext = (i) => {
      if (i >= scripts.length) { this._init(); return; }
      const s = document.createElement('script');
      s.src = BASE + scripts[i];
      s.onload = () => loadNext(i + 1);
      s.onerror = () => { console.warn('[bloom-fx] failed to load', scripts[i]); };
      document.head.appendChild(s);
    };
    // ShaderPass + CopyShader needed first
    loadNext(0);
  },
  _init: function () {
    const sceneEl = this.el;
    const renderer = sceneEl.renderer;
    const scene = sceneEl.object3D;
    const cameraEl = sceneEl.camera;
    if (!THREE.EffectComposer || !THREE.UnrealBloomPass) {
      console.warn('[bloom-fx] post-processing unavailable');
      return;
    }

    // Disable in VR (too expensive, can cause issues with XR render target)
    const composer = new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene, cameraEl));
    const bloom = new THREE.UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      this.data.strength, this.data.radius, this.data.threshold
    );
    composer.addPass(bloom);
    if (THREE.OutputPass) composer.addPass(new THREE.OutputPass());

    this._composer = composer;
    this._bloom = bloom;

    // Hook the render loop
    const origRender = sceneEl.renderer.render.bind(sceneEl.renderer);
    sceneEl.renderer.render = (scn, cam) => {
      // Skip post-processing while in XR (presenting)
      if (sceneEl.renderer.xr && sceneEl.renderer.xr.isPresenting) {
        origRender(scn, cam);
      } else if (this._composer) {
        this._composer.render();
      } else {
        origRender(scn, cam);
      }
    };

    window.addEventListener('resize', () => {
      if (this._composer) {
        this._composer.setSize(window.innerWidth, window.innerHeight);
      }
    });
    console.log('[bloom-fx] active');
  }
});

// ---------------------------------------------------------------
// 5. sun-light: one sharp directional light + shadows for the garden
// ---------------------------------------------------------------
// ---------------------------------------------------------------
// 6. Humanoid NPC factory — simple body/head/arms/legs + cape
// ---------------------------------------------------------------
const NpcFactory = (() => {
  const rand = (a, b) => a + Math.random() * (b - a);

  function build(opts = {}) {
    const g = new THREE.Group();
    const h = opts.height || 1.8;
    const skin = new THREE.Color(opts.skin || '#e8c9a0');
    const robe = new THREE.Color(opts.color || '#e0d4a8');
    const dark = opts.dark || false;

    const robeMat = new THREE.MeshStandardMaterial({
      color: robe, roughness: 0.85, metalness: 0,
      emissive: dark ? new THREE.Color(0x110000) : new THREE.Color(0x000000),
      emissiveIntensity: dark ? 0.4 : 0
    });
    const skinMat = new THREE.MeshStandardMaterial({
      color: skin, roughness: 0.7, metalness: 0
    });

    // legs (tapered cylinders)
    const legGeo = new THREE.CylinderGeometry(0.08, 0.1, h * 0.45, 8);
    const legL = new THREE.Mesh(legGeo, robeMat);
    legL.position.set(-0.08, h * 0.225, 0);
    const legR = legL.clone();
    legR.position.x = 0.08;
    g.add(legL, legR);

    // torso (tapered, wider at shoulders)
    const torsoGeo = new THREE.CylinderGeometry(0.22, 0.16, h * 0.42, 10);
    const torso = new THREE.Mesh(torsoGeo, robeMat);
    torso.position.y = h * 0.45 + h * 0.21;
    g.add(torso);

    // robe skirt (cone flare below torso)
    const skirtGeo = new THREE.ConeGeometry(0.3, h * 0.45, 12, 1, true);
    const skirt = new THREE.Mesh(skirtGeo, robeMat);
    skirt.position.y = h * 0.45 - 0.02;
    skirt.material.side = THREE.DoubleSide;
    g.add(skirt);

    // arms
    const armGeo = new THREE.CylinderGeometry(0.055, 0.07, h * 0.4, 8);
    const armL = new THREE.Mesh(armGeo, robeMat);
    armL.position.set(-0.26, h * 0.62, 0);
    armL.rotation.z = 0.15;
    const armR = armL.clone();
    armR.position.x = 0.26;
    armR.rotation.z = -0.15;
    g.add(armL, armR);

    // head
    const headGeo = new THREE.SphereGeometry(0.14, 16, 12);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = h * 0.88 + 0.08;
    g.add(head);

    // hair/hood
    const hoodGeo = new THREE.SphereGeometry(0.17, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6);
    const hood = new THREE.Mesh(hoodGeo, robeMat);
    hood.position.y = h * 0.88 + 0.11;
    g.add(hood);

    // glowing eyes for dark npcs
    if (dark) {
      const eyeMat = new THREE.MeshStandardMaterial({
        color: 0xff2200, emissive: 0xff0000, emissiveIntensity: 2
      });
      const eyeGeo = new THREE.SphereGeometry(0.018, 8, 6);
      const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
      eyeL.position.set(-0.045, h * 0.88 + 0.09, 0.12);
      const eyeR = eyeL.clone();
      eyeR.position.x = 0.045;
      g.add(eyeL, eyeR);
    }

    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.userData.idleBase = h * 0.45 + h * 0.21;
    g.userData.idlePhase = Math.random() * Math.PI * 2;
    return g;
  }

  return { build };
})();
window.NpcFactory = NpcFactory;

// ---------------------------------------------------------------
// 7. Water factory — shader-based animated water with normal waves
// ---------------------------------------------------------------
const WaterFactory = (() => {
  function build(width = 4, length = 80, color = 0x1e88e5) {
    const geo = new THREE.PlaneGeometry(width, length, 20, 100);
    const mat = new THREE.MeshStandardMaterial({
      color, metalness: 0.85, roughness: 0.15,
      transparent: true, opacity: 0.88,
      envMapIntensity: 2
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;

    // Vertex wave animation stored on geometry
    const posAttr = geo.attributes.position;
    const basePositions = new Float32Array(posAttr.array);
    mesh.userData.wave = (t) => {
      for (let i = 0; i < posAttr.count; i++) {
        const x = basePositions[i*3];
        const y = basePositions[i*3+1];
        const wave = Math.sin(y * 0.6 + t * 1.6) * 0.08
                   + Math.cos(x * 1.2 + t * 2.1) * 0.05;
        posAttr.setZ(i, wave);
      }
      posAttr.needsUpdate = true;
      geo.computeVertexNormals();
    };
    return mesh;
  }
  return { build };
})();
window.WaterFactory = WaterFactory;

// wave-animator component: drives water.userData.wave
AFRAME.registerComponent('water-waves', {
  init: function () { this._t0 = performance.now(); },
  tick: function () {
    const obj = this.el.getObject3D('mesh') || this.el.object3D.children[0];
    const t = (performance.now() - this._t0) * 0.001;
    this.el.object3D.traverse(o => {
      if (o.userData && typeof o.userData.wave === 'function') o.userData.wave(t);
    });
  }
});

// ---------------------------------------------------------------
// 8. Grass instanced mesh — many blades around the camera
// ---------------------------------------------------------------
function buildGrassField(parent, count = 3000, radius = 25) {
  const bladeGeo = new THREE.PlaneGeometry(0.08, 0.35, 1, 2);
  // anchor at bottom
  bladeGeo.translate(0, 0.175, 0);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x3d7a30, side: THREE.DoubleSide,
    roughness: 1, metalness: 0,
    alphaTest: 0.3
  });
  const mesh = new THREE.InstancedMesh(bladeGeo, mat, count);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * radius;
    dummy.position.set(Math.cos(ang)*r, 0, Math.sin(ang)*r);
    dummy.rotation.y = Math.random() * Math.PI;
    const s = 0.6 + Math.random() * 0.8;
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
window.buildGrassField = buildGrassField;

// ---------------------------------------------------------------
// 9. Butterfly sprite factory — procedural wing texture
// ---------------------------------------------------------------
const ButterflyFactory = (() => {
  let tex = null;
  function _tex() {
    if (tex) return tex;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
    // wings
    ctx.fillStyle = '#FFD93D';
    ctx.beginPath();
    ctx.ellipse(42, 55, 28, 40, -0.3, 0, 6.283);
    ctx.ellipse(86, 55, 28, 40, 0.3, 0, 6.283);
    ctx.fill();
    ctx.fillStyle = '#FF6B9D';
    ctx.beginPath();
    ctx.ellipse(40, 80, 20, 22, 0, 0, 6.283);
    ctx.ellipse(88, 80, 20, 22, 0, 0, 6.283);
    ctx.fill();
    // black border
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(42, 55, 28, 40, -0.3, 0, 6.283);
    ctx.ellipse(86, 55, 28, 40, 0.3, 0, 6.283);
    ctx.stroke();
    // body
    ctx.fillStyle = '#222';
    ctx.fillRect(62, 35, 4, 70);
    tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace || tex.colorSpace;
    return tex;
  }
  function build() {
    const mat = new THREE.SpriteMaterial({ map: _tex(), transparent: true });
    const s = new THREE.Sprite(mat);
    s.scale.set(0.4, 0.4, 0.4);
    return s;
  }
  return { build };
})();
window.ButterflyFactory = ButterflyFactory;

// ---------------------------------------------------------------
// 10. Wavy terrain — displaced plane replacing the flat circle
// ---------------------------------------------------------------
function buildWavyTerrain(radius = 150, segments = 120, texId = 'forest_ground') {
  const geo = new THREE.CircleGeometry(radius, segments);
  // displace vertices (keep center flat for player comfort)
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const d = Math.hypot(x, y);
    const flatZone = Math.min(1, Math.max(0, (d - 8) / 20));
    const h = (Math.sin(x * 0.08) * Math.cos(y * 0.08) * 1.5
             + Math.sin(x * 0.25 + y * 0.18) * 0.6) * flatZone;
    pos.setZ(i, h);
  }
  geo.computeVertexNormals();
  // Try real PBR texture first; fallback to procedural grass
  let mat;
  const pbr = window.Assets ? window.Assets.getCachedPBR(texId) : null;
  if (pbr && pbr.map) {
    mat = new THREE.MeshStandardMaterial({
      map: pbr.map, normalMap: pbr.normalMap, roughnessMap: pbr.roughnessMap,
      color: 0xffffff, roughness: 1, metalness: 0
    });
  } else {
    mat = new THREE.MeshStandardMaterial({
      map: window.ProcTex ? window.ProcTex.grass() : null,
      color: 0xffffff, roughness: 1, metalness: 0
    });
    // upgrade later when assets arrive
    document.querySelector('a-scene')?.addEventListener('assets-ready', () => {
      const p = window.Assets && window.Assets.getCachedPBR(texId);
      if (p && p.map) {
        mat.map = p.map;
        mat.normalMap = p.normalMap;
        mat.roughnessMap = p.roughnessMap;
        mat.needsUpdate = true;
      }
    }, { once: true });
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return mesh;
}
window.buildWavyTerrain = buildWavyTerrain;

// ---------------------------------------------------------------
// 11. God rays — additive light shafts from the sun direction
// ---------------------------------------------------------------
function buildGodRays(origin = new THREE.Vector3(30, 45, -15), count = 14) {
  const g = new THREE.Group();
  // procedural shaft texture
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const ctx = c.getContext('2d');
  const grd = ctx.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, 'rgba(255,240,200,0.7)');
  grd.addColorStop(0.5, 'rgba(255,230,180,0.25)');
  grd.addColorStop(1, 'rgba(255,220,160,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 64, 256);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({
    map: tex, blending: THREE.AdditiveBlending,
    transparent: true, depthWrite: false, opacity: 0.55
  });
  for (let i = 0; i < count; i++) {
    const s = new THREE.Sprite(mat.clone());
    const ang = (i / count) * Math.PI * 2 + Math.random();
    const r = 8 + Math.random() * 18;
    s.position.set(
      Math.cos(ang) * r,
      6 + Math.random() * 8,
      Math.sin(ang) * r - 12
    );
    s.scale.set(1.5 + Math.random()*1.5, 10 + Math.random()*6, 1);
    s.userData.baseOpacity = 0.3 + Math.random() * 0.35;
    s.userData.phase = Math.random() * Math.PI * 2;
    g.add(s);
  }
  g.userData.isGodRays = true;
  return g;
}
window.buildGodRays = buildGodRays;

AFRAME.registerComponent('godrays-pulse', {
  tick: function () {
    const t = performance.now() * 0.001;
    this.el.object3D.traverse(o => {
      if (o.isSprite && o.userData.baseOpacity) {
        o.material.opacity = o.userData.baseOpacity *
          (0.75 + Math.sin(t + o.userData.phase) * 0.25);
      }
    });
  }
});

// ---------------------------------------------------------------
// 12. Petal particles — instanced falling petals (GPU-friendly)
// ---------------------------------------------------------------
function buildPetals(parent, count = 400, area = 25) {
  const geo = new THREE.PlaneGeometry(0.12, 0.12);
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 28);
  grad.addColorStop(0, '#fff5f7');
  grad.addColorStop(0.6, '#ff9ec1');
  grad.addColorStop(1, 'rgba(255,100,160,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(32, 32, 26, 20, 0, 0, 6.283);
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, side: THREE.DoubleSide,
    depthWrite: false, opacity: 0.9
  });
  const inst = new THREE.InstancedMesh(geo, mat, count);
  const states = [];
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    states.push({
      x: (Math.random() - 0.5) * area * 2,
      z: (Math.random() - 0.5) * area * 2,
      y: Math.random() * 10,
      vy: 0.1 + Math.random() * 0.25,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.05,
      sway: Math.random() * Math.PI * 2
    });
  }
  inst.userData.states = states;
  inst.userData.area = area;
  inst.userData.dummy = dummy;
  parent.add(inst);
  return inst;
}
window.buildPetals = buildPetals;

AFRAME.registerComponent('petals-tick', {
  tick: function (time, dt) {
    const step = Math.min(dt, 50) * 0.001;
    this.el.object3D.traverse(o => {
      if (!(o.isInstancedMesh && o.userData.states)) return;
      const { states, area, dummy } = o.userData;
      for (let i = 0; i < states.length; i++) {
        const s = states[i];
        s.y -= s.vy * step;
        s.rot += s.vrot;
        s.sway += step * 2;
        if (s.y < 0) { s.y = 8 + Math.random() * 4; }
        dummy.position.set(s.x + Math.sin(s.sway) * 0.3, s.y, s.z + Math.cos(s.sway) * 0.3);
        dummy.rotation.set(s.rot, s.rot * 0.7, s.rot * 0.5);
        dummy.updateMatrix();
        o.setMatrixAt(i, dummy.matrix);
      }
      o.instanceMatrix.needsUpdate = true;
    });
  }
});

// ---------------------------------------------------------------
// 13. Gradient sky dome — replaces flat a-sky color
// ---------------------------------------------------------------
function buildGradientSky(topColor = '#87ceeb', bottomColor = '#fde8c0') {
  const geo = new THREE.SphereGeometry(500, 32, 20);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: new THREE.Color(topColor) },
      bottomColor: { value: new THREE.Color(bottomColor) },
      offset: { value: 33 },
      exponent: { value: 0.6 }
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition + offset).y;
        gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
      }
    `,
    side: THREE.BackSide
  });
  return new THREE.Mesh(geo, mat);
}
window.buildGradientSky = buildGradientSky;

// ---------------------------------------------------------------
// 14. Ember particles (dark env) — rising glowing embers
// ---------------------------------------------------------------
function buildEmbers(parent, count = 250, area = 30) {
  const geo = new THREE.PlaneGeometry(0.08, 0.08);
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, '#ffdd88');
  g.addColorStop(0.3, '#ff6622');
  g.addColorStop(1, 'rgba(80,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const inst = new THREE.InstancedMesh(geo, mat, count);
  const states = [];
  for (let i = 0; i < count; i++) {
    states.push({
      x: (Math.random() - 0.5) * area * 2,
      z: (Math.random() - 0.5) * area * 2,
      y: Math.random() * 6,
      vy: 0.3 + Math.random() * 0.5,
      sway: Math.random() * Math.PI * 2,
      life: Math.random()
    });
  }
  inst.userData.states = states;
  inst.userData.isEmber = true;
  inst.userData.dummy = new THREE.Object3D();
  parent.add(inst);
  return inst;
}
window.buildEmbers = buildEmbers;

AFRAME.registerComponent('embers-tick', {
  tick: function (time, dt) {
    const step = Math.min(dt, 50) * 0.001;
    this.el.object3D.traverse(o => {
      if (!(o.isInstancedMesh && o.userData.isEmber)) return;
      const { states, dummy } = o.userData;
      for (let i = 0; i < states.length; i++) {
        const s = states[i];
        s.y += s.vy * step;
        s.sway += step * 3;
        s.life -= step * 0.15;
        if (s.life <= 0 || s.y > 8) {
          s.y = 0.2; s.life = 1;
          s.x = (Math.random() - 0.5) * 60;
          s.z = (Math.random() - 0.5) * 60;
        }
        dummy.position.set(s.x + Math.sin(s.sway) * 0.4, s.y, s.z);
        const sc = 0.6 + s.life * 0.6;
        dummy.scale.set(sc, sc, sc);
        dummy.updateMatrix();
        o.setMatrixAt(i, dummy.matrix);
      }
      o.instanceMatrix.needsUpdate = true;
    });
  }
});

// ---------------------------------------------------------------
// 15. Rocky mountain ring — textured displaced cones
// ---------------------------------------------------------------
function buildMountainRing(count = 14, dist = 130, dark = false) {
  const g = new THREE.Group();
  const tex = window.ProcTex ? window.ProcTex.rock() : null;
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.2;
    const h = 22 + Math.random() * 28;
    const r = 16 + Math.random() * 12;
    const geo = new THREE.ConeGeometry(r, h, 10, 4);
    // jitter for organic silhouette
    const pos = geo.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      pos.setX(v, pos.getX(v) * (0.85 + Math.random() * 0.3));
      pos.setZ(v, pos.getZ(v) * (0.85 + Math.random() * 0.3));
      if (pos.getY(v) < h * 0.4) pos.setY(v, pos.getY(v) + (Math.random() - 0.5) * 1.5);
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      color: dark ? 0x1a0a0a : 0xffffff,
      roughness: 1, metalness: 0,
      flatShading: true
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(Math.cos(ang) * dist, h / 2 - 2, Math.sin(ang) * dist);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
  }
  return g;
}
window.buildMountainRing = buildMountainRing;

// ---------------------------------------------------------------
// 16. Soft cloud sprites
// ---------------------------------------------------------------
function buildClouds(count = 18) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);
  for (let i = 0; i < 30; i++) {
    const x = 128 + (Math.random() - 0.5) * 160;
    const y = 128 + (Math.random() - 0.5) * 100;
    const r = 30 + Math.random() * 50;
    const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.8)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 6.283);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false, opacity: 0.85
  });
  const g = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const s = new THREE.Sprite(mat.clone());
    const ang = Math.random() * Math.PI * 2;
    const d = 60 + Math.random() * 70;
    s.position.set(Math.cos(ang) * d, 35 + Math.random() * 20, Math.sin(ang) * d);
    const sc = 18 + Math.random() * 20;
    s.scale.set(sc, sc * 0.5, 1);
    g.add(s);
  }
  return g;
}
window.buildClouds = buildClouds;

AFRAME.registerComponent('sun-light', {
  init: function () {
    const el = this.el;
    const setup = () => {
      const obj = el.getObject3D('light');
      if (!obj || !obj.isDirectionalLight) { setTimeout(setup, 200); return; }
      obj.castShadow = true;
      obj.shadow.mapSize.set(2048, 2048);
      obj.shadow.camera.near = 0.5;
      obj.shadow.camera.far = 200;
      obj.shadow.camera.left = -60;
      obj.shadow.camera.right = 60;
      obj.shadow.camera.top = 60;
      obj.shadow.camera.bottom = -60;
      obj.shadow.bias = -0.0002;
      obj.shadow.normalBias = 0.02;
      obj.shadow.radius = 4;
    };
    setup();
  }
});
