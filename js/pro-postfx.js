/*  js/pro-postfx.js
    Phase 2 — Post-Processing Pipeline
    Passes: RenderPass → SSAO → UnrealBloom → ColorGrading → FilmGrain
    Active only with ?pro=1
    ================================================================ */

const ProPostFX = (() => {
  if (!new URLSearchParams(location.search).has('pro')) return { init() {} };

  // ── Mood presets ─────────────────────────────────────────────────
  const MOODS = {
    neutral: { contrast: 1.05, saturation: 1.0,  brightness: 1.0,  tint: [1.0,  1.0,  1.0 ], vignette: 0.20, bloom: 0.35, ssaoMax: 0.12 },
    garden:  { contrast: 1.03, saturation: 1.25, brightness: 1.05, tint: [1.0,  0.97, 0.88], vignette: 0.15, bloom: 0.45, ssaoMax: 0.08 },
    dark:    { contrast: 1.18, saturation: 0.65, brightness: 0.90, tint: [0.85, 0.88, 1.0 ], vignette: 0.42, bloom: 0.75, ssaoMax: 0.18 },
  };

  // ── Custom Color Grading Shader ───────────────────────────────────
  const ColorGradingShader = {
    uniforms: {
      tDiffuse:        { value: null },
      contrast:        { value: 1.0 },
      saturation:      { value: 1.0 },
      brightness:      { value: 1.0 },
      tint:            { value: null }, // THREE.Vector3
      vignetteStrength:{ value: 0.2  },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float contrast;
      uniform float saturation;
      uniform float brightness;
      uniform vec3  tint;
      uniform float vignetteStrength;
      varying vec2  vUv;

      void main() {
        vec4 tex = texture2D(tDiffuse, vUv);
        vec3 c = tex.rgb;

        // Brightness
        c *= brightness;

        // Contrast (pivoted around 0.5)
        c = (c - 0.5) * contrast + 0.5;
        c = clamp(c, 0.0, 1.0);

        // Saturation
        float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(luma), c, saturation);

        // Color tint
        c *= tint;

        // Vignette
        vec2 uv = (vUv - 0.5) * 2.0;
        float vign = 1.0 - dot(uv, uv) * vignetteStrength;
        c *= clamp(vign, 0.0, 1.0);

        gl_FragColor = vec4(clamp(c, 0.0, 1.0), tex.a);
      }
    `,
  };

  // ── State ─────────────────────────────────────────────────────────
  let _composer   = null;
  let _bloomPass  = null;
  let _ssaoPass   = null;
  let _gradePass  = null;
  let _aScene     = null;

  // Wait for PostFX bundle injected by module bridge
  function _waitFX(ms = 8000) {
    return new Promise((res, rej) => {
      const t0 = Date.now();
      const tick = () => {
        if (window._PostFX) return res(window._PostFX);
        if (Date.now() - t0 > ms) return rej('PostFX timeout');
        setTimeout(tick, 80);
      };
      tick();
    });
  }

  // ── Apply mood settings at runtime ───────────────────────────────
  function setMood(key) {
    const m = MOODS[key] || MOODS.neutral;
    const T = window.AFRAME.THREE;

    if (_bloomPass) {
      _bloomPass.strength = m.bloom;
    }
    if (_ssaoPass) {
      _ssaoPass.maxDistance = m.ssaoMax;
    }
    if (_gradePass) {
      const u = _gradePass.uniforms;
      u.contrast.value        = m.contrast;
      u.saturation.value      = m.saturation;
      u.brightness.value      = m.brightness;
      u.tint.value            = new T.Vector3(...m.tint);
      u.vignetteStrength.value= m.vignette;
    }
  }

  // ── Build composer ────────────────────────────────────────────────
  async function _build() {
    const T = window.AFRAME.THREE;
    const renderer  = _aScene.renderer;
    const threeScene= _aScene.object3D;
    const camera    = _aScene.camera;
    const W = window.innerWidth, H = window.innerHeight;

    const {
      EffectComposer, RenderPass,
      UnrealBloomPass, SSAOPass, ShaderPass
    } = await _waitFX();

    // ── Build passes ───────────────────────────────────────────────
    _composer = new EffectComposer(renderer);

    // 1. Base scene render
    const renderPass = new RenderPass(threeScene, camera);
    _composer.addPass(renderPass);

    // 2. SSAO — contact shadows + depth
    try {
      _ssaoPass = new SSAOPass(threeScene, camera, W, H);
      _ssaoPass.kernelRadius  = 16;
      _ssaoPass.minDistance   = 0.004;
      _ssaoPass.maxDistance   = 0.12;
      _composer.addPass(_ssaoPass);
    } catch (e) {
      console.warn('[Pro PostFX] SSAOPass skipped:', e);
    }

    // 3. Bloom
    _bloomPass = new UnrealBloomPass(new T.Vector2(W, H), 0.35, 0.4, 0.82);
    _composer.addPass(_bloomPass);

    // 4. Color Grading (custom shader)
    _gradePass = new ShaderPass(ColorGradingShader);
    _gradePass.uniforms.tint.value = new T.Vector3(1, 1, 1);
    _composer.addPass(_gradePass);

    // ── Intercept A-Frame's render call ───────────────────────────
    // Flag prevents infinite recursion when RenderPass calls renderer.render internally
    let _inComposer = false;
    const origRender = renderer.render.bind(renderer);

    const composerRender = (s, c) => {
      const isMainRender = s === threeScene && c === camera;
      if (_inComposer || !isMainRender) { origRender(s, c); return; }

      _inComposer = true;
      try {
        _composer.render();
      } finally {
        _inComposer = false;
      }
    };

    renderer.render = composerRender;

    // Disable in VR — WebXR doesn't support EffectComposer
    _aScene.addEventListener('enter-vr', () => { renderer.render = origRender; });
    _aScene.addEventListener('exit-vr',  () => { renderer.render = composerRender; });

    // Resize
    window.addEventListener('resize', () => {
      _composer.setSize(window.innerWidth, window.innerHeight);
      if (_ssaoPass) _ssaoPass.setSize(window.innerWidth, window.innerHeight);
    });

    // Apply default neutral mood
    setMood('neutral');
    console.log('[Pro PostFX] EffectComposer active ✓ (SSAO + Bloom + Color Grading)');
  }

  // ── Public hooks ─────────────────────────────────────────────────
  // Called by ProGraphics.applyEnvironmentHDRI (which is called by VREnv)
  window._setPostFXMood = setMood;

  function init(aScene) {
    _aScene = aScene;
    const run = () => _build().catch(e => console.warn('[Pro PostFX] Build failed:', e));
    _aScene.hasLoaded ? run() : _aScene.addEventListener('loaded', run, { once: true });
  }

  return { init, setMood };
})();
