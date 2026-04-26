/* =========================================================
 *  quality.js — 4K / Photorealism boosters for tasamuh-vr
 *  - hdri-environment : loads an HDRI and uses it as PBR env map
 *  - quality-boost    : tier-aware pixel ratio, anisotropy, shadows
 *
 *  Quest 3 / low-tier mobile: shadows OFF, DPR=1 (no over-render)
 *  Mid tier: PCF shadows, autoUpdate=false (one-shot), DPR=1.5
 *  High tier (desktop): PCFSoft shadows, autoUpdate=true, DPR up to 2
 *
 *  Tier is exposed as window.QualityTier ('high'|'mid'|'low').
 *  Force a tier with ?tier=high|mid|low for testing.
 * ========================================================= */

/* global AFRAME, THREE */

// --------- Tier detection (shared with pro-performance.js) -----------
(function () {
  const params = new URLSearchParams(location.search);
  const forced = params.get('tier');
  if (forced === 'high' || forced === 'mid' || forced === 'low') {
    window.QualityTier = forced;
    return;
  }
  const ua = navigator.userAgent || '';
  const isQuest = /OculusBrowser|Quest/i.test(ua);
  const dpr = window.devicePixelRatio || 1;
  const cores = navigator.hardwareConcurrency || 2;
  // Quest 3 needs ultra-conservative defaults (mobile GPU, 90fps target per eye)
  if (isQuest)                       window.QualityTier = 'low';
  else if (dpr >= 2 && cores >= 6)   window.QualityTier = 'high';
  else if (dpr >= 1.5 || cores >= 4) window.QualityTier = 'mid';
  else                               window.QualityTier = 'low';
})();

// --------- quality-boost: pixel ratio + texture anisotropy ----------
AFRAME.registerComponent('quality-boost', {
  init: function () {
    const sceneEl = this.el;
    const tier = window.QualityTier || 'mid';
    const dprCap   = tier === 'high' ? 2 : tier === 'mid' ? 1.5 : 1;
    const wantsShadows = tier === 'high' || tier === 'mid';

    // One-shot shadow update for mid tier (no per-frame cost)
    let _midShadowFlushed = false;

    const apply = () => {
      const r = sceneEl.renderer;
      if (!r) return;

      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));

      r.shadowMap.enabled = wantsShadows;
      if (wantsShadows) {
        r.shadowMap.type = tier === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
        r.shadowMap.autoUpdate = tier === 'high';
      }

      // Tone mapping already ACES via a-scene renderer attr; reinforce
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.toneMappingExposure = 1.4;
      r.outputColorSpace = THREE.SRGBColorSpace || r.outputColorSpace;

      // Max anisotropy on every texture we encounter
      const maxAniso = r.capabilities.getMaxAnisotropy();
      sceneEl.object3D.traverse((o) => {
        if (o.isMesh) {
          if (wantsShadows) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => {
            if (!m) return;
            ['map','normalMap','roughnessMap','metalnessMap','aoMap','emissiveMap']
              .forEach((k) => { if (m[k]) m[k].anisotropy = maxAniso; });
            if (m.emissive && m.emissiveIntensity !== undefined && m.emissiveIntensity > 0) {
              m.emissiveIntensity = Math.max(m.emissiveIntensity, 1.4);
            }
            m.needsUpdate = true;
          });
        }
      });

      // Mid tier: render shadows once after world-build settles, then stop updating
      if (wantsShadows && tier === 'mid' && !_midShadowFlushed) {
        _midShadowFlushed = true;
        r.shadowMap.autoUpdate = true;
        r.shadowMap.needsUpdate = true;
        setTimeout(() => { r.shadowMap.autoUpdate = false; }, 1500);
      }
    };

    if (sceneEl.hasLoaded) apply();
    else sceneEl.addEventListener('loaded', apply);
    sceneEl.addEventListener('model-loaded', apply);
    sceneEl.addEventListener('child-attached', () => setTimeout(apply, 50));
  }
});

// --------- hdri-environment: loads an HDR and sets scene.environment --
AFRAME.registerComponent('hdri-environment', {
  schema: {
    src: {
      type: 'string',
      default: 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/textures/equirectangular/royal_esplanade_1k.hdr'
    },
    asBackground: { type: 'boolean', default: false }
  },
  init: function () {
    const sceneEl = this.el;
    const data = this.data;

    const load = () => {
      const renderer = sceneEl.renderer;
      if (!renderer || !THREE.RGBELoader) {
        // RGBELoader not bundled with A-Frame's three build — fetch from CDN
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/js/loaders/RGBELoader.js';
        s.onload = () => this._loadHDR(data, sceneEl, renderer);
        document.head.appendChild(s);
        return;
      }
      this._loadHDR(data, sceneEl, renderer);
    };

    if (sceneEl.hasLoaded) load();
    else sceneEl.addEventListener('loaded', load);
  },

  _loadHDR: function (data, sceneEl, renderer) {
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();
      new THREE.RGBELoader().load(data.src, (tex) => {
        const envMap = pmrem.fromEquirectangular(tex).texture;
        sceneEl.object3D.environment = envMap;
        if (data.asBackground) sceneEl.object3D.background = envMap;
        tex.dispose();
        pmrem.dispose();
        // Bump PBR materials so reflections show
        sceneEl.object3D.traverse((o) => {
          if (o.isMesh && o.material) {
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach((m) => {
              if ('envMapIntensity' in m) m.envMapIntensity = 1.25;
              m.needsUpdate = true;
            });
          }
        });
        console.log('[quality] HDRI environment applied');
      }, undefined, (err) => console.warn('[quality] HDRI load failed', err));
    } catch (e) {
      console.warn('[quality] HDRI setup failed', e);
    }
  }
});
