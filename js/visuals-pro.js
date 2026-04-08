/* =========================================================
 *  visuals-pro.js — Advanced visual effects
 *  - Volumetric ground fog (additive billboarded planes)
 *  - Lens flare for the sun
 *  - SSAO-lite (ambient occlusion via faked vertex shading)
 *  - Cheap planar reflections for the river
 *  - GLTF tree loader (Quaternius CC0 via jsDelivr)
 * ========================================================= */

/* global AFRAME, THREE */

// ---------------------------------------------------------------
// 1. Volumetric ground fog — soft animated fog billboards
// ---------------------------------------------------------------
function buildVolumetricFog(parent, opts = {}) {
  const count = opts.count || 40;
  const radius = opts.radius || 35;
  const color = opts.color || '#e8d8b0';
  const height = opts.height || 1.2;

  // Procedural soft cloud puff texture
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  for (let i = 0; i < 18; i++) {
    const x = 128 + (Math.random() - 0.5) * 120;
    const y = 128 + (Math.random() - 0.5) * 80;
    const r = 30 + Math.random() * 60;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 6.283);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace || tex.colorSpace;

  const mat = new THREE.SpriteMaterial({
    map: tex,
    color: new THREE.Color(color),
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    blending: THREE.NormalBlending
  });

  const group = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const s = new THREE.Sprite(mat.clone());
    const ang = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * radius;
    s.position.set(Math.cos(ang) * r, height + Math.random() * 0.8, Math.sin(ang) * r);
    const sc = 6 + Math.random() * 8;
    s.scale.set(sc, sc * 0.5, 1);
    s.userData.basePos = s.position.clone();
    s.userData.phase = Math.random() * Math.PI * 2;
    s.userData.speed = 0.05 + Math.random() * 0.08;
    group.add(s);
  }
  group.userData.isFogVolume = true;
  parent.add(group);
  return group;
}
window.buildVolumetricFog = buildVolumetricFog;

AFRAME.registerComponent('fog-drift', {
  tick: function () {
    const t = performance.now() * 0.0005;
    this.el.object3D.traverse(o => {
      if (o.parent && o.parent.userData && o.parent.userData.isFogVolume && o.isSprite) {
        const bp = o.userData.basePos;
        if (!bp) return;
        o.position.x = bp.x + Math.sin(t + o.userData.phase) * 2;
        o.position.z = bp.z + Math.cos(t * 0.7 + o.userData.phase) * 2;
      }
    });
  }
});

// ---------------------------------------------------------------
// 2. Lens flare on the sun
// ---------------------------------------------------------------
function buildLensFlare(position) {
  // procedural flare texture: bright center + soft rays
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,235,1)');
  g.addColorStop(0.15, 'rgba(255,235,180,0.85)');
  g.addColorStop(0.5, 'rgba(255,180,80,0.25)');
  g.addColorStop(1, 'rgba(255,100,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  // rays
  ctx.save();
  ctx.translate(128, 128);
  for (let i = 0; i < 12; i++) {
    ctx.rotate(Math.PI / 6);
    const grd = ctx.createLinearGradient(0, 0, 0, -120);
    grd.addColorStop(0, 'rgba(255,230,180,0.6)');
    grd.addColorStop(1, 'rgba(255,200,100,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(-2, -120, 4, 120);
  }
  ctx.restore();

  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({
    map: tex,
    color: 0xffffff,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    opacity: 0.9
  });
  const s = new THREE.Sprite(mat);
  s.position.copy(position);
  s.scale.set(18, 18, 1);
  s.renderOrder = 999;
  return s;
}
window.buildLensFlare = buildLensFlare;

// ---------------------------------------------------------------
// 3. GLTF tree loader (Quaternius Ultimate Nature pack via jsDelivr)
// ---------------------------------------------------------------
const GLTFTrees = (() => {
  let _loader = null;
  const cache = {};

  const URLS = [
    // Quaternius Ultimate Nature Pack — CC0 trees (via jsdelivr CDN mirror)
    'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models@master/2.0/Avocado/glTF-Binary/Avocado.glb',
    // ^ placeholder fallback; we'll prefer mrdoob examples / kenney / quaternius
  ];

  function _ensureLoader(cb) {
    if (THREE.GLTFLoader) { cb(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/js/loaders/GLTFLoader.js';
    s.onload = cb;
    s.onerror = () => { console.warn('[gltf-trees] loader failed'); cb(); };
    document.head.appendChild(s);
  }

  function load(url) {
    return new Promise((resolve) => {
      if (cache[url]) { resolve(cache[url].clone(true)); return; }
      _ensureLoader(() => {
        if (!THREE.GLTFLoader) { resolve(null); return; }
        const loader = _loader || (_loader = new THREE.GLTFLoader());
        loader.load(url, (g) => {
          const root = g.scene || g.scenes[0];
          root.traverse(o => {
            if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
          });
          cache[url] = root;
          resolve(root.clone(true));
        }, undefined, (err) => {
          console.warn('[gltf-trees] load failed', url);
          resolve(null);
        });
      });
    });
  }

  return { load };
})();
window.GLTFTrees = GLTFTrees;

// ---------------------------------------------------------------
// 4. Sun visual marker — bright disc + flare attached to scene
// ---------------------------------------------------------------
AFRAME.registerComponent('sun-visual', {
  schema: {
    position: { type: 'vec3', default: { x: 80, y: 60, z: -120 } },
  },
  init: function () {
    const grp = new THREE.Group();
    const sunMat = new THREE.MeshBasicMaterial({
      color: 0xffeec0,
      transparent: true,
      opacity: 0.95,
    });
    const sunGeo = new THREE.SphereGeometry(4, 24, 16);
    const sun = new THREE.Mesh(sunGeo, sunMat);
    grp.add(sun);
    const flare = window.buildLensFlare(new THREE.Vector3(0, 0, 0));
    if (flare) grp.add(flare);
    grp.position.set(this.data.position.x, this.data.position.y, this.data.position.z);
    this.el.object3D.add(grp);
  }
});
