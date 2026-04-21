/*  js/pro-particles.js
    Phase 5A — GPU Particle Systems (everything on GPU, zero CPU per frame)
    Systems:  fireflies | pollen | petals (garden)
              embers    | wisps  | sparks  (dark)
              orbs                         (neutral)
    Requires ?pro=1
    ================================================================ */

const ProParticles = (() => {
  if (!new URLSearchParams(location.search).has('pro')) {
    window._setParticleMood = () => {};
    return { init() {} };
  }

  let _aScene = null;
  const _systems = {}; // name → { points, material }

  // ── Shared vertex shader (all systems) ───────────────────────────
  const VERT = `
    attribute float phase;
    attribute float speed;
    attribute float size;
    attribute vec3  basePos;
    uniform   float time;
    uniform   float spread;
    uniform   float lift;
    uniform   float pointScale;

    void main() {
      vec3 p = basePos;

      // Drift animation — different per system via uniforms
      p.x += sin(time * speed        + phase)          * spread;
      p.y += cos(time * speed * 0.7  + phase * 1.3)    * lift
           + sin(time * speed * 0.4  + phase * 0.6)    * lift * 0.5;
      p.z += sin(time * speed * 0.55 + phase * 0.9)    * spread * 0.8;

      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_PointSize  = size * pointScale * (200.0 / -mv.z);
      gl_PointSize  = clamp(gl_PointSize, 1.0, 32.0);
      gl_Position   = projectionMatrix * mv;
    }
  `;

  // ── Fragment shaders ─────────────────────────────────────────────
  const FRAG_GLOW = `
    uniform vec3  color;
    uniform float opacity;
    void main() {
      vec2  uv = gl_PointCoord - 0.5;
      float d  = dot(uv, uv);
      if (d > 0.25) discard;
      float g  = pow(1.0 - d * 4.0, 2.2);
      gl_FragColor = vec4(color * (1.0 + g * 0.8), g * opacity);
    }
  `;

  const FRAG_EMBER = `
    uniform vec3  color;
    uniform float opacity;
    uniform float time;
    void main() {
      vec2  uv = gl_PointCoord - 0.5;
      float d  = dot(uv, uv);
      if (d > 0.25) discard;
      float g  = 1.0 - d * 4.0;
      // Flicker
      float f  = 0.85 + sin(time * 12.0 + gl_FragCoord.x * 0.1) * 0.15;
      gl_FragColor = vec4(color * g * f, g * g * opacity);
    }
  `;

  const FRAG_PETAL = `
    uniform vec3  color;
    uniform float opacity;
    void main() {
      vec2  uv = gl_PointCoord - 0.5;
      float d  = uv.x*uv.x * 5.0 + uv.y*uv.y * 14.0;
      if (d > 1.0) discard;
      float a  = 1.0 - d;
      gl_FragColor = vec4(color, a * a * opacity);
    }
  `;

  // ── Geometry builder ─────────────────────────────────────────────
  function _makeGeo(count, xRange, yRange, zRange) {
    const T      = window.AFRAME.THREE;
    const geo    = new T.BufferGeometry();
    const base   = new Float32Array(count * 3);
    const phase  = new Float32Array(count);
    const spd    = new Float32Array(count);
    const sz     = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      base[i*3]   = (Math.random() - 0.5) * xRange;
      base[i*3+1] = Math.random()          * yRange;
      base[i*3+2] = (Math.random() - 0.5) * zRange;
      phase[i]    = Math.random() * Math.PI * 2;
      spd[i]      = 0.3 + Math.random() * 0.7;
      sz[i]       = 0.5 + Math.random();
    }

    geo.setAttribute('position', new T.BufferAttribute(base.slice(), 3));
    geo.setAttribute('basePos',  new T.BufferAttribute(base,         3));
    geo.setAttribute('phase',    new T.BufferAttribute(phase, 1));
    geo.setAttribute('speed',    new T.BufferAttribute(spd,   1));
    geo.setAttribute('size',     new T.BufferAttribute(sz,    1));
    return geo;
  }

  // ── System factory ───────────────────────────────────────────────
  function _make(name, {
    count, xRange, yRange, zRange,
    color, opacity,
    spread, lift, pointScale,
    frag, blend,
    offsetY = 0, offsetZ = 0,
  }) {
    const T   = window.AFRAME.THREE;
    const geo = _makeGeo(count, xRange, yRange, zRange);

    const mat = new T.ShaderMaterial({
      uniforms: {
        time:       { value: 0 },
        color:      { value: new T.Color(color) },
        opacity:    { value: opacity },
        spread:     { value: spread },
        lift:       { value: lift },
        pointScale: { value: pointScale },
      },
      vertexShader:   VERT,
      fragmentShader: frag || FRAG_GLOW,
      transparent:    true,
      depthWrite:     false,
      blending:       blend !== undefined ? blend : T.AdditiveBlending,
    });

    const pts = new T.Points(geo, mat);
    pts.position.set(0, offsetY, offsetZ);
    pts.visible = false;

    _aScene.object3D.add(pts);
    _systems[name] = { points: pts, mat };
    return { points: pts, mat };
  }

  // ── Build all particle systems ────────────────────────────────────
  function _buildAll() {
    const T = window.AFRAME.THREE;

    // ── GARDEN ────────────────────────────────────────────────────
    // Fireflies — glowing yellow-green dots, slow lazy drift
    _make('fireflies', {
      count: 800, xRange: 60, yRange: 8, zRange: 60,
      color: 0xeeff88, opacity: 0.9,
      spread: 2.5, lift: 1.2, pointScale: 4.5,
      frag: FRAG_GLOW,
      offsetY: 0.5, offsetZ: -10,
    });

    // Pollen — tiny gold motes, Brownian drift
    _make('pollen', {
      count: 1800, xRange: 80, yRange: 10, zRange: 80,
      color: 0xffdd44, opacity: 0.5,
      spread: 1.5, lift: 0.8, pointScale: 2.2,
      frag: FRAG_GLOW,
      offsetY: 1.0,
    });

    // Cherry petals — ellipse-shaped, spiral fall
    _make('petals', {
      count: 400, xRange: 50, yRange: 12, zRange: 50,
      color: 0xffb5c8, opacity: 0.75,
      spread: 3.5, lift: -0.9,    // negative lift = slowly falling
      pointScale: 6.0,
      frag: FRAG_PETAL,
      blend: T.NormalBlending,
      offsetY: 6,
    });

    // ── DARK ──────────────────────────────────────────────────────
    // Embers — orange/red sparks rising from ground
    _make('embers', {
      count: 700, xRange: 40, yRange: 6, zRange: 40,
      color: 0xff4400, opacity: 0.85,
      spread: 1.2, lift: 2.2,     // rising
      pointScale: 3.8,
      frag: FRAG_EMBER,
      offsetY: 0.2,
    });

    // Wisps — dark purple smoke, slow swirl
    _make('wisps', {
      count: 500, xRange: 50, yRange: 8, zRange: 50,
      color: 0x440033, opacity: 0.35,
      spread: 4.0, lift: 0.6,
      pointScale: 12.0,
      frag: FRAG_GLOW,
      blend: T.NormalBlending,
      offsetY: 1.0,
    });

    // Red sparks — fast tiny bits
    _make('sparks', {
      count: 400, xRange: 30, yRange: 4, zRange: 30,
      color: 0xff2200, opacity: 0.9,
      spread: 0.8, lift: 3.0,
      pointScale: 2.5,
      frag: FRAG_EMBER,
      offsetY: 0.1,
    });

    // ── NEUTRAL ───────────────────────────────────────────────────
    // Ethereal orbs — blue-white glow, very slow
    _make('orbs', {
      count: 600, xRange: 30, yRange: 12, zRange: 30,
      color: 0x8899ff, opacity: 0.6,
      spread: 1.8, lift: 0.9,
      pointScale: 5.5,
      frag: FRAG_GLOW,
      offsetY: 1.0,
    });

    console.log('[Pro Particles] All systems built ✓');
  }

  // ── Mood switching ────────────────────────────────────────────────
  const MOOD_MAP = {
    neutral: ['orbs'],
    garden:  ['fireflies', 'pollen', 'petals'],
    dark:    ['embers', 'wisps', 'sparks'],
  };

  function setMood(key) {
    const active = new Set(MOOD_MAP[key] || []);
    for (const [name, sys] of Object.entries(_systems)) {
      sys.points.visible = active.has(name);
    }
  }

  window._setParticleMood = setMood;

  // ── Animation loop ────────────────────────────────────────────────
  function _startLoop() {
    function tick(now) {
      requestAnimationFrame(tick);
      const t = now / 1000;
      for (const { mat } of Object.values(_systems)) {
        if (mat.uniforms.time) mat.uniforms.time.value = t;
      }
    }
    requestAnimationFrame(tick);
  }

  // ── Init ──────────────────────────────────────────────────────────
  function init() {
    _aScene = document.querySelector('a-scene');
    const run = () => {
      _buildAll();
      setMood('neutral');
      _startLoop();
    };
    _aScene.hasLoaded ? run() : _aScene.addEventListener('loaded', run, { once: true });
  }

  return { init, setMood };
})();
