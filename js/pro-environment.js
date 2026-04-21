/*  js/pro-environment.js
    Phase 3 — Terrain + Water + Wind + Fog
    Requires ?pro=1
    ================================================================ */

const ProEnvironment = (() => {
  if (!new URLSearchParams(location.search).has('pro')) {
    window.buildReflectiveWater = null;
    return { init() {} };
  }

  let _aScene = null;
  const _windMaterials = []; // { material, shader } pairs for animation
  let _waterMeshes    = [];  // for time tick
  let _clock          = null;

  // ── Wait for Water module bridge ─────────────────────────────────
  function _waitWater(ms = 8000) {
    return new Promise((res, rej) => {
      const t0 = Date.now();
      const tick = () => {
        if (window._WaterClass) return res(window._WaterClass);
        if (Date.now() - t0 > ms) return rej('Water timeout');
        setTimeout(tick, 80);
      };
      tick();
    });
  }

  // ── Procedural Terrain ───────────────────────────────────────────
  function _heightAt(x, z, profile) {
    if (profile === 'garden') {
      // Gentle rolling hills
      return (
        Math.sin(x * 0.04) * Math.cos(z * 0.035) * 1.8 +
        Math.sin(x * 0.10 + 0.7) * Math.cos(z * 0.09 + 0.5) * 0.9 +
        Math.sin(x * 0.22 + 1.4) * Math.sin(z * 0.20 + 1.1) * 0.4 +
        Math.sin(x * 0.45 + 2.3) * Math.cos(z * 0.40 + 1.8) * 0.15
      );
    } else {
      // Dark — jagged, harsh crags
      return (
        Math.sin(x * 0.07 + 0.3) * Math.cos(z * 0.06) * 2.5 +
        Math.abs(Math.sin(x * 0.18 + 1.2)) * Math.cos(z * 0.16 + 0.9) * 1.2 +
        Math.sin(x * 0.35 + 2.1) * Math.abs(Math.sin(z * 0.32 + 1.5)) * 0.5
      );
    }
  }

  function _buildTerrain(envKey) {
    const T     = window.AFRAME.THREE;
    const scene = _aScene.object3D;

    const segments = 96;
    const size     = 220;
    const geo      = new T.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2);

    // Displace vertices
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = _heightAt(x, z, envKey);
      pos.setY(i, h);

      // Vertex colour: mix grass/dirt by height for garden, cracked rock for dark
      if (envKey === 'garden') {
        const t = Math.max(0, Math.min(1, (h + 2) / 4));
        col[i*3]   = 0.15 + t * 0.05;   // R
        col[i*3+1] = 0.35 + t * 0.25;   // G
        col[i*3+2] = 0.10 + t * 0.05;   // B
      } else {
        const t = Math.max(0, Math.min(1, (h + 1) / 5));
        col[i*3]   = 0.18 + t * 0.12;
        col[i*3+1] = 0.04 + t * 0.04;
        col[i*3+2] = 0.04 + t * 0.04;
      }
    }
    geo.setAttribute('color', new T.BufferAttribute(col, 3));
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    const mat = new T.MeshStandardMaterial({
      vertexColors: true,
      roughness: envKey === 'garden' ? 0.92 : 0.98,
      metalness: 0,
    });

    const mesh = new T.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.position.y = -0.02; // Sit just under existing A-Frame floor

    // Hide original flat floor in the env entity
    const envEl = document.getElementById(
      envKey === 'garden' ? 'env-garden' : 'env-dark'
    );
    if (envEl) {
      envEl.querySelectorAll('a-circle, a-plane').forEach(el => {
        const p = el.getAttribute('position');
        const isOrigin = !p || (Math.abs(p.x || 0) < 0.1 && Math.abs(p.y || 0) < 0.1 && Math.abs(p.z || 0) < 0.1);
        if (isOrigin) el.setAttribute('visible', 'false');
      });
    }

    scene.add(mesh);
    console.log(`[Pro Env] Terrain "${envKey}" ✓`);
  }

  // ── Reflective Water (hook used by world-builder.js) ─────────────
  // Called as: river.object3D.add(window.buildReflectiveWater(4, 80, 0x1e88e5))
  window.buildReflectiveWater = function(width, length, colorHex) {
    const T = window.AFRAME.THREE;

    // Fallback: beautiful flat-shaded animated water without Water2 class
    const geo = new T.PlaneGeometry(width, length, 32, 32);
    const mat = new T.MeshStandardMaterial({
      color: colorHex || 0x1e88e5,
      metalness: 0.05,
      roughness: 0.15,
      transparent: true,
      opacity: 0.82,
      envMapIntensity: 1.2,
    });

    // Animated wave displacement via onBeforeCompile
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.waveTime = { value: 0 };
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float wx = sin(position.x * 0.5 + waveTime * 1.2) * 0.06;
        float wz = cos(position.z * 0.45 + waveTime * 0.9) * 0.05;
        transformed.y += wx + wz;`
      );
      mat.userData.waterShader = shader;
    };

    const mesh = new T.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    _waterMeshes.push(mat);

    // Try to upgrade to Water2 class if available
    _waitWater(3000).then(Water => {
      const tl = new T.TextureLoader();
      const n1 = tl.load('assets/images/waternormals1.jpg', t => { t.wrapS = t.wrapT = T.RepeatWrapping; });
      const n2 = tl.load('assets/images/waternormals2.jpg', t => { t.wrapS = t.wrapT = T.RepeatWrapping; });

      const geo2 = new T.PlaneGeometry(width, length);
      const w2 = new Water(geo2, {
        color: new T.Color(colorHex || 0x1e88e5),
        scale: 3,
        flowDirection: new T.Vector2(0.6, 0.4),
        textureWidth: 512,
        textureHeight: 512,
        normalMap0: n1,
        normalMap1: n2,
      });
      w2.rotation.x = -Math.PI / 2;
      w2.receiveShadow = true;
      mesh.parent && mesh.parent.remove(mesh);

      const group = mesh.parent || new T.Group();
      group.add(w2);
      _waterMeshes.push(w2.material);
      console.log('[Pro Env] Water2 (reflective) ✓');
    }).catch(() => {
      console.log('[Pro Env] Water (wave shader) ✓');
    });

    return mesh;
  };

  // ── Wind Shader for all foliage ───────────────────────────────────
  function _addWind(material, isTop) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.windTime  = { value: 0 };
      shader.uniforms.windSpeed = { value: isTop ? 1.2 : 0.6 };
      shader.uniforms.windStr   = { value: isTop ? 0.10 : 0.04 };

      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float wt = windTime * windSpeed;
        float sway = sin(position.x * 1.8 + wt) * cos(position.z * 1.5 + wt * 0.8)
                   * windStr * clamp(transformed.y / 2.5, 0.0, 1.0);
        transformed.x += sway;
        transformed.z += sway * 0.55;`
      );
      material.userData.windShader = shader;
    };
    material.needsUpdate = true;
    _windMaterials.push(material);
  }

  function _applyWindToFoliage() {
    _aScene.object3D.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      const c = obj.material.color;
      if (!c) return;
      // Detect green foliage by hue (G channel dominant)
      if (c.g > c.r * 1.3 && c.g > c.b * 1.4) {
        const isTop = obj.position.y > 5; // upper foliage gets more sway
        _addWind(obj.material, isTop);
      }
    });
    console.log(`[Pro Env] Wind applied to ${_windMaterials.length} foliage materials ✓`);
  }

  // ── Enhanced Fog ──────────────────────────────────────────────────
  function _applyFog(envKey) {
    const T     = window.AFRAME.THREE;
    const scene = _aScene.object3D;

    const fogSettings = {
      neutral: { color: 0x1a1a2e, near: 40, far: 130 },
      garden:  { color: 0xcfe8d8, near: 35, far: 140 },
      dark:    { color: 0x1a0005, near: 15, far:  70 },
    };
    const s = fogSettings[envKey] || fogSettings.neutral;
    scene.fog = new T.Fog(s.color, s.near, s.far);
    console.log(`[Pro Env] Fog "${envKey}" ✓`);
  }

  // ── Animation Loop ────────────────────────────────────────────────
  function _startAnimLoop() {
    const T = window.AFRAME.THREE;
    _clock = new T.Clock();

    function tick() {
      requestAnimationFrame(tick);
      const t = _clock.getElapsedTime();

      // Wind
      _windMaterials.forEach(m => {
        if (m.userData.windShader)
          m.userData.windShader.uniforms.windTime.value = t;
      });

      // Water wave time (fallback shader)
      _waterMeshes.forEach(m => {
        if (m.userData && m.userData.waterShader)
          m.userData.waterShader.uniforms.waveTime.value = t;
        // Water2 class uses its own internal clock — no manual update needed
      });
    }
    tick();
  }

  // ── Public: react to environment changes ─────────────────────────
  window._setEnvFog = _applyFog;
  window._registerWindMaterial = (mat) => { _windMaterials.push(mat); };

  // ── Init ──────────────────────────────────────────────────────────
  function init() {
    _aScene = document.querySelector('a-scene');
    const run = () => {
      // Add Water module to bridge (injected async by module script)
      _buildTerrain('garden');
      _buildTerrain('dark');

      // Wind runs after world-builder finishes spawning trees (~500ms)
      setTimeout(_applyWindToFoliage, 800);

      _applyFog('neutral');
      _startAnimLoop();
    };
    _aScene.hasLoaded ? run() : _aScene.addEventListener('loaded', run, { once: true });
  }

  return { init };
})();
