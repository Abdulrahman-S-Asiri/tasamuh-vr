/* =========================================================
 *  assets.js — Async loader for real CDN assets (Poly Haven)
 *  - HDRIs (per environment)
 *  - PBR texture sets (diffuse + normal + roughness [+ ao])
 *  - Graceful fallback to procedural if URL fails
 *  - Quest/low-end tier auto-selects 1K, desktop 2K
 * ========================================================= */

/* global AFRAME, THREE */

const Assets = (() => {
  const tier = (window.QUALITY && window.QUALITY.tier) || 'high';
  const RES = (tier === 'high') ? '2k' : '1k';

  // Poly Haven file CDN
  const PH = 'https://dl.polyhaven.org/file/ph-assets';

  // ---------------------------------------------------------
  // URL builders
  // ---------------------------------------------------------
  const hdriUrl = (name) =>
    `${PH}/HDRIs/hdr/${RES}/${name}_${RES}.hdr`;

  const texUrl = (name, kind) =>
    `${PH}/Textures/jpg/${RES}/${name}/${name}_${kind}_${RES}.jpg`;

  // ---------------------------------------------------------
  // Catalog — named asset IDs → Poly Haven slugs
  // ---------------------------------------------------------
  const HDRI_CATALOG = {
    garden:  'kloofendal_48d_partly_cloudy_puresky',
    dark:    'moonless_golf',
    neutral: 'spruit_sunrise',
  };

  const TEX_CATALOG = {
    forest_ground: { slug: 'forest_ground_01', repeat: 40 },
    rock_ground:   { slug: 'rocky_terrain_02', repeat: 35 },
    bark:          { slug: 'bark_brown_02',    repeat: [1, 3] },
    grass_mat:     { slug: 'aerial_grass_rock', repeat: 60 },
  };

  // ---------------------------------------------------------
  // Loaders & cache
  // ---------------------------------------------------------
  const cache = { hdri: {}, tex: {} };
  let _rgbeLoader = null;
  let _pmrem = null;

  function _ensureRGBELoader(cb) {
    if (THREE.RGBELoader) { cb(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/js/loaders/RGBELoader.js';
    s.onload = cb;
    s.onerror = () => { console.warn('[assets] RGBELoader failed'); cb(); };
    document.head.appendChild(s);
  }

  function loadHDRI(id, renderer) {
    return new Promise((resolve) => {
      if (cache.hdri[id]) { resolve(cache.hdri[id]); return; }
      const slug = HDRI_CATALOG[id];
      if (!slug) { resolve(null); return; }
      _ensureRGBELoader(() => {
        if (!THREE.RGBELoader) { resolve(null); return; }
        if (!_pmrem) { _pmrem = new THREE.PMREMGenerator(renderer); _pmrem.compileEquirectangularShader(); }
        const loader = _rgbeLoader || (_rgbeLoader = new THREE.RGBELoader());
        loader.load(
          hdriUrl(slug),
          (tex) => {
            try {
              const env = _pmrem.fromEquirectangular(tex).texture;
              cache.hdri[id] = { env, equirect: tex };
              console.log('[assets] HDRI loaded:', id);
              resolve(cache.hdri[id]);
            } catch (e) { console.warn('[assets] HDRI process fail', e); resolve(null); }
          },
          undefined,
          (err) => { console.warn('[assets] HDRI load fail', id, err); resolve(null); }
        );
      });
    });
  }

  function _loadTex(url, repeat) {
    return new Promise((resolve) => {
      new THREE.TextureLoader().load(
        url,
        (t) => {
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          if (Array.isArray(repeat)) t.repeat.set(repeat[0], repeat[1]);
          else if (typeof repeat === 'number') t.repeat.set(repeat, repeat);
          t.colorSpace = THREE.SRGBColorSpace || t.colorSpace;
          t.anisotropy = 8;
          resolve(t);
        },
        undefined,
        (err) => { console.warn('[assets] texture fail', url); resolve(null); }
      );
    });
  }

  function loadPBR(id) {
    return new Promise(async (resolve) => {
      if (cache.tex[id]) { resolve(cache.tex[id]); return; }
      const info = TEX_CATALOG[id];
      if (!info) { resolve(null); return; }
      const slug = info.slug;
      const [map, normalMap, roughnessMap] = await Promise.all([
        _loadTex(texUrl(slug, 'diff'), info.repeat),
        _loadTex(texUrl(slug, 'nor_gl'), info.repeat),
        _loadTex(texUrl(slug, 'rough'), info.repeat),
      ]);
      // normal/rough should be linear, not sRGB
      if (normalMap) normalMap.colorSpace = THREE.LinearSRGBColorSpace || 'srgb-linear';
      if (roughnessMap) roughnessMap.colorSpace = THREE.LinearSRGBColorSpace || 'srgb-linear';
      const set = map ? { map, normalMap, roughnessMap } : null;
      if (set) {
        cache.tex[id] = set;
        console.log('[assets] PBR loaded:', id);
      }
      resolve(set);
    });
  }

  function getCachedPBR(id) { return cache.tex[id] || null; }
  function getCachedHDRI(id) { return cache.hdri[id] || null; }

  // ---------------------------------------------------------
  // Boot — load everything in parallel on scene ready
  // ---------------------------------------------------------
  function boot(sceneEl) {
    const renderer = sceneEl.renderer;
    if (!renderer) return;

    // HDRIs
    const hdriP = Promise.all([
      loadHDRI('garden', renderer),
      loadHDRI('dark', renderer),
      loadHDRI('neutral', renderer),
    ]);

    // Textures
    const texP = Promise.all([
      loadPBR('forest_ground'),
      loadPBR('rock_ground'),
      loadPBR('bark'),
    ]);

    Promise.all([hdriP, texP]).then(() => {
      // apply default env (garden) to scene for now
      const g = getCachedHDRI('garden');
      if (g && g.env) {
        sceneEl.object3D.environment = g.env;
        // bump envMapIntensity on all PBR mats
        sceneEl.object3D.traverse((o) => {
          if (o.isMesh && o.material && 'envMapIntensity' in o.material) {
            o.material.envMapIntensity = 1.5;
            o.material.needsUpdate = true;
          }
        });
      }
      // Broadcast ready event so world-builder / realism can rebuild / reskin
      sceneEl.emit('assets-ready');
      // Re-run quality-boost so anisotropy + shadows apply to new textures
      sceneEl.emit('child-attached');
      console.log('[assets] boot complete');
    });
  }

  return {
    boot,
    loadHDRI,
    loadPBR,
    getCachedPBR,
    getCachedHDRI,
    tier,
    RES,
  };
})();
window.Assets = Assets;

// ---------------------------------------------------------
// env-swap helper — swaps scene HDRI by id with smooth transition
// ---------------------------------------------------------
window.applyEnvironmentHDRI = function (id) {
  const sceneEl = document.querySelector('a-scene');
  if (!sceneEl) return;
  const data = Assets.getCachedHDRI(id);
  if (!data) return;
  sceneEl.object3D.environment = data.env;
  sceneEl.object3D.traverse((o) => {
    if (o.isMesh && o.material && 'envMapIntensity' in o.material) {
      o.material.envMapIntensity = 1.5;
      o.material.needsUpdate = true;
    }
  });
};

// ---------------------------------------------------------
// Auto-boot on scene loaded
// ---------------------------------------------------------
AFRAME.registerComponent('assets-boot', {
  init: function () {
    const sceneEl = this.el;
    const go = () => Assets.boot(sceneEl);
    if (sceneEl.hasLoaded) go();
    else sceneEl.addEventListener('loaded', go);
  }
});
