/*  js/pro-performance.js
    Phase 6 — GPU Instancing + LOD + Shadow Tracking + Mobile Scaling
    Requires ?pro=1
    ================================================================ */

const ProPerformance = (() => {
  if (!new URLSearchParams(location.search).has('pro')) return { init() {} };

  let _aScene = null;
  let _sunLight = null;   // ref to sun DirectionalLight from pro-graphics

  // ── Device tier detection ────────────────────────────────────────
  // Returns 'high' | 'mid' | 'low'.
  // Defers to window.QualityTier (set in quality.js) when available so
  // the whole app uses one source of truth.
  function _tier() {
    if (window.QualityTier) return window.QualityTier;
    const dpr = window.devicePixelRatio || 1;
    const cores = navigator.hardwareConcurrency || 2;
    if (dpr >= 2 && cores >= 6) return 'high';
    if (dpr >= 1.5 || cores >= 4) return 'mid';
    return 'low';
  }

  // Particle count multipliers per tier
  const PARTICLE_SCALE = { high: 1.0, mid: 0.55, low: 0.25 };

  // ── Replace individual pro-trees with InstancedMesh ──────────────
  // pro-graphics.js already spawned trees as Group objects.
  // Here we scan the scene, collect all trunk/foliage meshes by material
  // colour, remove them, and rebuild as InstancedMesh batches.

  function _instanceTrees() {
    const T     = window.AFRAME.THREE;
    const scene = _aScene.object3D;

    // Colour signatures from pro-graphics _spawnProTree
    const TRUNK_COLOR   = 0x4E342E;
    const FOLIAGE_COLS  = new Set([0x1B5E20, 0x2E7D32, 0x388E3C, 0x43A047]);

    // Collect Groups named 'pro-silhouette' must be skipped
    const trunkInstances  = [];  // { matrix }
    const foliageInstances = []; // { matrix, colorHex }

    // Walk top-level children to find tree groups
    const toRemove = [];
    scene.children.forEach(obj => {
      if (obj.type !== 'Group' || obj.name === 'pro-silhouette') return;
      let isTrunk = false;
      obj.traverse(m => {
        if (!m.isMesh || !m.material) return;
        const hex = m.material.color.getHex();
        if (hex === TRUNK_COLOR) isTrunk = true;
      });
      if (!isTrunk) return;

      // It's a tree group — harvest meshes
      obj.traverse(m => {
        if (!m.isMesh || !m.material) return;
        const hex = m.material.color.getHex();
        const mat4 = new T.Matrix4();
        m.updateWorldMatrix(true, false);
        mat4.copy(m.matrixWorld);

        if (hex === TRUNK_COLOR) {
          trunkInstances.push(mat4);
        } else if (FOLIAGE_COLS.has(hex)) {
          // Bake foliage radius into instance matrix (geometry is normalised to 1.0)
          const r = (m.geometry.parameters && m.geometry.parameters.radius) || 1.0;
          mat4.scale(new T.Vector3(r, r, r));
          foliageInstances.push({ matrix: mat4, colorHex: hex });
        }
      });
      toRemove.push(obj);
    });

    if (trunkInstances.length === 0) {
      // World may not have built yet — caller schedules a retry
      return false;
    }

    // Remove originals
    toRemove.forEach(obj => scene.remove(obj));

    // ── Instanced trunks ─────────────────────────────────────────
    // Shared wind reapplication — mirrors pro-environment.js _addWind logic
    function _applyWind(material, isTop) {
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
      // Register with pro-environment's wind list if available
      if (window._registerWindMaterial) window._registerWindMaterial(material);
    }

    const trunkGeo = new T.CylinderGeometry(0.19, 0.28, 4.8, 8);
    const trunkMat = new T.MeshStandardMaterial({ color: TRUNK_COLOR, roughness: 0.95, metalness: 0 });
    _applyWind(trunkMat, false);
    const trunkMesh = new T.InstancedMesh(trunkGeo, trunkMat, trunkInstances.length);
    trunkMesh.castShadow = true;
    trunkInstances.forEach((m4, i) => trunkMesh.setMatrixAt(i, m4));
    trunkMesh.instanceMatrix.needsUpdate = true;
    scene.add(trunkMesh);

    // ── Instanced foliage (one InstancedMesh per unique colour) ──
    const byColor = {};
    foliageInstances.forEach(({ matrix, colorHex }) => {
      (byColor[colorHex] = byColor[colorHex] || []).push(matrix);
    });

    const leafGeo = new T.SphereGeometry(1.0, 8, 7);
    Object.entries(byColor).forEach(([hexStr, matrices]) => {
      const leafMat = new T.MeshStandardMaterial({
        color: parseInt(hexStr), roughness: 0.86, metalness: 0,
      });
      _applyWind(leafMat, true);
      const leafMesh = new T.InstancedMesh(leafGeo, leafMat, matrices.length);
      leafMesh.castShadow = leafMesh.receiveShadow = true;
      matrices.forEach((m4, i) => leafMesh.setMatrixAt(i, m4));
      leafMesh.instanceMatrix.needsUpdate = true;
      scene.add(leafMesh);
    });

    console.log(`[Pro Perf] Instanced ${trunkInstances.length} trunks + ${foliageInstances.length} foliage ✓`);
    return true;
  }

  // ── LOD for NPCs — hide beyond threshold distance ────────────────
  function _applyNpcLOD() {
    const T     = window.AFRAME.THREE;
    const scene = _aScene.object3D;
    const camera = _aScene.camera;
    if (!camera) return;

    const tier       = _tier();
    const HIDE_DIST  = tier === 'low' ? 22 : tier === 'mid' ? 35 : 50;
    const HIDE_DIST2 = HIDE_DIST * HIDE_DIST;

    const _tmp = new T.Vector3();

    function lodTick() {
      requestAnimationFrame(lodTick);
      // Skip when tab/scene hidden (battery on mobile, no-op work in 2D phases)
      if (document.hidden) return;
      camera.getWorldPosition(_tmp);
      scene.children.forEach(obj => {
        if (obj.type !== 'Group' || obj.name === 'pro-silhouette') return;
        const dist2 = obj.position.distanceToSquared(_tmp);
        if (obj.name && obj.name.startsWith('npc-')) {
          obj.visible = dist2 < HIDE_DIST2;
        }
      });
    }
    requestAnimationFrame(lodTick);
    console.log(`[Pro Perf] NPC LOD enabled (hide > ${HIDE_DIST}m, tier: ${tier}) ✓`);
  }

  // ── Shadow frustum follows camera ────────────────────────────────
  // Keeps shadow camera centred on player to maximise shadow map texel density.
  function _trackShadow() {
    const T      = window.AFRAME.THREE;
    const scene  = _aScene.object3D;
    const camera = _aScene.camera;
    if (!camera) return;

    // Find the DirectionalLight added by pro-graphics
    let sun = null;
    scene.traverse(obj => {
      if (obj.isDirectionalLight && obj.castShadow && !sun) sun = obj;
    });
    if (!sun) { console.warn('[Pro Perf] Sun light not found for shadow tracking'); return; }
    _sunLight = sun;

    const _camPos = new T.Vector3();
    const OFFSET  = new T.Vector3(15, 30, -20).normalize().multiplyScalar(35);

    let _lastUpdate = 0;
    function shadowTick(now) {
      requestAnimationFrame(shadowTick);
      if (document.hidden) return;
      if (now - _lastUpdate < 250) return; // update 4×/s — shadow moves slowly
      _lastUpdate = now;

      camera.getWorldPosition(_camPos);
      sun.position.copy(_camPos).add(OFFSET);
      sun.target.position.copy(_camPos);
      sun.target.updateMatrixWorld();
    }
    requestAnimationFrame(shadowTick);
    console.log('[Pro Perf] Shadow frustum tracking camera ✓');
  }

  // ── Scale particle counts on mobile/low-end ──────────────────────
  function _scaleParticles() {
    const scale = PARTICLE_SCALE[_tier()];
    if (scale >= 1.0) return; // nothing to do on high-end

    // pro-particles.js already created Points objects.
    // We can't resize BufferGeometry after creation, so just reduce opacity
    // and visible count via drawRange on low/mid tier.
    const scene = _aScene.object3D;
    scene.traverse(obj => {
      if (obj.type !== 'Points' || !obj.geometry) return;
      const count = obj.geometry.attributes.position.count;
      obj.geometry.setDrawRange(0, Math.ceil(count * scale));
    });
    console.log(`[Pro Perf] Particle draw range scaled to ${Math.round(scale*100)}% (tier: ${_tier()}) ✓`);
  }

  // ── Renderer micro-optimisations ─────────────────────────────────
  function _optimiseRenderer() {
    const r    = _aScene.renderer;
    const tier = _tier();

    // Shadow map size: 2K on high, 1K on mid/low
    if (tier !== 'high') {
      _aScene.object3D.traverse(obj => {
        if (obj.isDirectionalLight && obj.castShadow) {
          obj.shadow.mapSize.set(1024, 1024);
          obj.shadow.map = null; // force rebuild
        }
      });
    }

    // Pixel ratio cap: mobile Quest renders at high DPR — cap to 1.5
    const maxDPR = tier === 'low' ? 1.0 : 1.5;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDPR));

    console.log(`[Pro Perf] Renderer optimised (tier: ${tier}, DPR cap: ${maxDPR}) ✓`);
  }

  // ── Init ──────────────────────────────────────────────────────────
  function init() {
    _aScene = document.querySelector('a-scene');
    const run = () => {
      _optimiseRenderer();
      _trackShadow();
      _applyNpcLOD();
      _scaleParticles();

      // Instancing runs after world-builder trees are placed.
      // World-builder is async on slow phones — retry once if first attempt
      // finds no trees.
      setTimeout(() => {
        if (_instanceTrees() === false) {
          setTimeout(() => {
            if (_instanceTrees() === false) {
              console.warn('[Pro Perf] instancing skipped — no pro-trees found after retry');
            }
          }, 1800);
        }
      }, 1200);
    };
    _aScene.hasLoaded ? run() : _aScene.addEventListener('loaded', run, { once: true });
  }

  return { init };
})();
