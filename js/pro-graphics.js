/*  js/pro-graphics.js
    Phase 1 — Enhanced VR Graphics
    Activated by:  ?pro=1  in the URL
    Safe guarantee: NOTHING here runs or loads without that flag.
    ============================================================ */

const ProGraphics = (() => {
  const ENABLED = new URLSearchParams(location.search).has('pro');

  // When not in pro mode: expose a no-op so VREnv calls don't throw
  if (!ENABLED) {
    window.applyEnvironmentHDRI = () => {};
    return { init() {} };
  }

  // ── Config ────────────────────────────────────────────────────────
  const ENV_PATHS = {
    neutral: 'assets/images/env_neutral.hdr',
    garden:  'assets/images/env_garden.hdr',
    dark:    'assets/images/env_dark.hdr',
  };

  const ENV_EXPOSURE = { neutral: 0.65, garden: 1.15, dark: 0.35 };

  let _currentEnvTex = null;
  let _aScene        = null;

  // ── RGBELoader bridge ─────────────────────────────────────────────
  // Injected from <script type="module"> in index.html → window._RGBELoader
  function _waitLoader(ms = 6000) {
    return new Promise((res, rej) => {
      const t0 = Date.now();
      const tick = () => {
        if (window._RGBELoader) return res(window._RGBELoader);
        if (Date.now() - t0 > ms) return rej('RGBELoader not ready');
        setTimeout(tick, 80);
      };
      tick();
    });
  }

  // ── HDRI Environment ──────────────────────────────────────────────
  async function _applyHDRI(key) {
    if (!_aScene || !_aScene.hasLoaded) return;
    const path = ENV_PATHS[key] || ENV_PATHS.neutral;
    const T    = window.AFRAME.THREE;

    try {
      const RGBELoader = await _waitLoader();
      new RGBELoader().load(
        path,
        (hdrTex) => {
          const pmrem = new T.PMREMGenerator(_aScene.renderer);
          pmrem.compileEquirectangularShader();
          const envMap = pmrem.fromEquirectangular(hdrTex).texture;
          hdrTex.dispose();
          pmrem.dispose();

          if (_currentEnvTex) _currentEnvTex.dispose();
          _currentEnvTex = envMap;

          const threeScene        = _aScene.object3D;
          threeScene.environment  = envMap;   // IBL on all PBR materials
          threeScene.background   = envMap;   // panoramic sky

          _aScene.renderer.toneMappingExposure = ENV_EXPOSURE[key] ?? 1.0;

          // Hide A-Frame sky element (conflicts with three.js background)
          const sky = document.getElementById('vrSky');
          if (sky) sky.setAttribute('visible', 'false');

          console.log(`[Pro] HDRI "${key}" ✓`);
        },
        undefined,
        () => {
          console.warn(`[Pro] HDRI "${key}" failed — using enhanced lights`);
          _fallbackLights(key);
        }
      );
    } catch (e) {
      console.warn('[Pro] RGBELoader unavailable:', e);
      _fallbackLights(key);
    }
  }

  // Fallback when HDRI file can't load
  function _fallbackLights(key) {
    const T = window.AFRAME.THREE;
    const sc = _aScene.object3D;
    const palettes = {
      neutral: [0x445566, 0.5],
      garden:  [0xfff8dc, 0.7],
      dark:    [0x220000, 0.25],
    };
    const [col, intensity] = palettes[key] || palettes.neutral;
    sc.add(new T.AmbientLight(col, intensity));
    sc.add(new T.HemisphereLight(col, 0x111111, 0.3));
  }

  // ── Enhanced Renderer Settings ────────────────────────────────────
  function _boostRenderer() {
    const r = _aScene.renderer;
    const T = window.AFRAME.THREE;
    r.toneMapping          = T.ACESFilmicToneMapping;
    r.toneMappingExposure  = 1.1;
    r.shadowMap.enabled    = true;
    r.shadowMap.type       = T.PCFSoftShadowMap;
    if (T.SRGBColorSpace) r.outputColorSpace = T.SRGBColorSpace;
    console.log('[Pro] Renderer enhanced ✓');
  }

  // ── Pro Trees (improved procedural, placed at new positions) ──────
  function _spawnProTree(x, z) {
    const T     = window.AFRAME.THREE;
    const scene = _aScene.object3D;
    const group = new T.Group();

    // Trunk — tapered cylinder with slight organic warp
    const trunkGeo = new T.CylinderGeometry(0.10, 0.28, 4.8, 10, 5);
    const posAttr  = trunkGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const y = posAttr.getY(i);
      if (y > 0.5) {
        posAttr.setX(i, posAttr.getX(i) + y * 0.018 * (Math.random() - 0.5));
        posAttr.setZ(i, posAttr.getZ(i) + y * 0.018 * (Math.random() - 0.5));
      }
    }
    trunkGeo.computeVertexNormals();

    const trunk = new T.Mesh(
      trunkGeo,
      new T.MeshStandardMaterial({ color: 0x4E342E, roughness: 0.95, metalness: 0 })
    );
    trunk.position.y = 2.4;
    trunk.castShadow = trunk.receiveShadow = true;
    group.add(trunk);

    // 4-layer foliage
    [
      { y: 5.6, r: 2.3, c: 0x1B5E20 },
      { y: 6.7, r: 1.9, c: 0x2E7D32 },
      { y: 7.6, r: 1.3, c: 0x388E3C },
      { y: 8.4, r: 0.8, c: 0x43A047 },
    ].forEach(({ y, r, c }) => {
      const mesh = new T.Mesh(
        new T.SphereGeometry(r, 12, 10),
        new T.MeshStandardMaterial({ color: c, roughness: 0.86, metalness: 0 })
      );
      mesh.position.set(
        (Math.random() - 0.5) * 0.5,
        y,
        (Math.random() - 0.5) * 0.5
      );
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    });

    group.position.set(x, 0, z);
    group.rotation.y = Math.random() * Math.PI * 2;
    scene.add(group);
  }

  // ── Sun Light (casts sharp real-time shadows) ─────────────────────
  function _addSunLight() {
    const T     = window.AFRAME.THREE;
    const scene = _aScene.object3D;

    const sun = new T.DirectionalLight(0xfff5e0, 1.8);
    sun.position.set(15, 30, -20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near   = 0.5;
    sun.shadow.camera.far    = 120;
    sun.shadow.camera.left   = -40;
    sun.shadow.camera.right  = 40;
    sun.shadow.camera.top    = 40;
    sun.shadow.camera.bottom = -40;
    sun.shadow.bias          = -0.001;
    scene.add(sun);
    console.log('[Pro] Sun light + 2K shadows ✓');
  }

  // ── Public hook (called by VREnv.showGarden / showDark / showNeutral)
  window.applyEnvironmentHDRI = (key) => {
    _applyHDRI(key);
    if (window._setPostFXMood) window._setPostFXMood(key); // Phase 2 mood sync
  };

  // ── Init ──────────────────────────────────────────────────────────
  function init() {
    _aScene = document.querySelector('a-scene');
    const run = () => {
      _boostRenderer();
      _addSunLight();
      _applyHDRI('neutral');
      // Spawn pro trees at clear visible spots (extras, don't replace world-builder)
      [[-5, -8], [7, -10], [-9, -15], [4, -18], [-12, -12], [10, -20]]
        .forEach(([x, z]) => _spawnProTree(x, z));
    };
    _aScene.hasLoaded ? run() : _aScene.addEventListener('loaded', run, { once: true });
  }

  return { init };
})();
