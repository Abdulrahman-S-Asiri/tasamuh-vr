/* =========================================================
 *  quality.js — 4K / Photorealism boosters for tasamuh-vr
 *  - hdri-environment : loads an HDRI and uses it as PBR env map
 *  - quality-boost    : raises pixel ratio, anisotropy, shadows
 * ========================================================= */

/* global AFRAME, THREE */

// --------- quality-boost: pixel ratio + texture anisotropy ----------
AFRAME.registerComponent('quality-boost', {
  init: function () {
    const sceneEl = this.el;
    const apply = () => {
      const r = sceneEl.renderer;
      if (!r) return;

      // Near-4K per eye on Quest 3 / retina desktops
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      r.setPixelRatio(dpr);

      // High-quality shadows
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFSoftShadowMap;

      // Tone mapping already ACES via a-scene renderer attr; reinforce
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.toneMappingExposure = 1.4;
      r.outputColorSpace = THREE.SRGBColorSpace || r.outputColorSpace;

      // Max anisotropy on every texture we encounter
      const maxAniso = r.capabilities.getMaxAnisotropy();
      sceneEl.object3D.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => {
            if (!m) return;
            ['map','normalMap','roughnessMap','metalnessMap','aoMap','emissiveMap']
              .forEach((k) => { if (m[k]) m[k].anisotropy = maxAniso; });
            // Make emissives pop alongside HDRI lighting
            if (m.emissive && m.emissiveIntensity !== undefined && m.emissiveIntensity > 0) {
              m.emissiveIntensity = Math.max(m.emissiveIntensity, 1.4);
            }
            m.needsUpdate = true;
          });
        }
      });
    };

    if (sceneEl.hasLoaded) apply();
    else sceneEl.addEventListener('loaded', apply);
    // Re-apply when new models load (procedural world-builder)
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
