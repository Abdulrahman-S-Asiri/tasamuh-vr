/*  js/pro-characters.js
    Phase 4 — Pro Silhouette + GLTF NPCs
    Requires ?pro=1
    ================================================================ */

const ProCharacters = (() => {
  if (!new URLSearchParams(location.search).has('pro')) return { init() {} };

  let _aScene      = null;
  let _proGroup    = null;   // Three.js group for pro silhouette
  let _auraGeo     = null;   // particle aura geometry ref
  let _auraBase    = null;   // base positions snapshot
  let _eyeLight    = null;   // pulsing red point light
  let _mixers      = [];     // GLTF animation mixers

  // ── Wait for GLTF loader ──────────────────────────────────────────
  function _waitGLTF(ms = 8000) {
    return new Promise((res, rej) => {
      const t0 = Date.now();
      const tick = () => {
        if (window._GLTFLoader) return res(window._GLTFLoader);
        if (Date.now() - t0 > ms) return rej('GLTFLoader timeout');
        setTimeout(tick, 80);
      };
      tick();
    });
  }

  // ── Pro Silhouette Construction ───────────────────────────────────
  function _buildProSilhouette() {
    const T     = window.AFRAME.THREE;
    const scene = _aScene.object3D;

    const silEl = document.getElementById('vr-silhouette');
    if (!silEl) return;

    // Hide original primitives — keep the entity itself for phase logic
    silEl.querySelectorAll('a-cylinder,a-sphere,a-ring').forEach(c =>
      c.setAttribute('visible', 'false')
    );

    // ── Materials ────────────────────────────────────────────────
    const bodyMat = new T.MeshStandardMaterial({
      color: 0x050005,
      emissive: 0x1a0000,
      emissiveIntensity: 0.4,
      roughness: 0.85,
      metalness: 0.15,
    });
    const eyeMat = new T.MeshStandardMaterial({
      color: 0xff1100,
      emissive: 0xff3300,
      emissiveIntensity: 5.0,
    });

    const g = new T.Group();

    // ── Body (human proportions) ──────────────────────────────────
    function mesh(geo, mat, px=0, py=0, pz=0, rx=0, ry=0, rz=0) {
      const m = new T.Mesh(geo, mat);
      m.position.set(px, py, pz);
      m.rotation.set(rx, ry, rz);
      m.castShadow = true;
      g.add(m); return m;
    }

    // Head
    mesh(new T.SphereGeometry(0.28, 20, 16), bodyMat, 0, 1.85, 0);
    // Neck
    mesh(new T.CylinderGeometry(0.10, 0.12, 0.22, 8), bodyMat, 0, 1.56, 0);
    // Torso
    mesh(new T.BoxGeometry(0.62, 0.88, 0.28), bodyMat, 0, 1.10, 0);
    // Hips
    mesh(new T.BoxGeometry(0.58, 0.28, 0.25), bodyMat, 0, 0.66, 0);

    // Left arm
    mesh(new T.CylinderGeometry(0.09, 0.08, 0.72, 8), bodyMat, -0.43, 1.10, 0.02,  0, 0,  0.22);
    mesh(new T.CylinderGeometry(0.08, 0.07, 0.68, 8), bodyMat, -0.53, 0.62, 0.04,  0, 0,  0.5);
    // Right arm
    mesh(new T.CylinderGeometry(0.09, 0.08, 0.72, 8), bodyMat,  0.43, 1.10, 0.02,  0, 0, -0.22);
    mesh(new T.CylinderGeometry(0.08, 0.07, 0.68, 8), bodyMat,  0.53, 0.62, 0.04,  0, 0, -0.5);

    // Legs
    mesh(new T.CylinderGeometry(0.11, 0.10, 1.0, 8), bodyMat, -0.18, 0.16, 0);
    mesh(new T.CylinderGeometry(0.11, 0.10, 1.0, 8), bodyMat,  0.18, 0.16, 0);
    // Shins
    mesh(new T.CylinderGeometry(0.09, 0.08, 0.9, 8), bodyMat, -0.18, -0.66, 0.04, 0.1, 0, 0);
    mesh(new T.CylinderGeometry(0.09, 0.08, 0.9, 8), bodyMat,  0.18, -0.66, 0.04, 0.1, 0, 0);

    // Eyes (glowing)
    mesh(new T.SphereGeometry(0.048, 10, 10), eyeMat, -0.10, 1.90, 0.24);
    mesh(new T.SphereGeometry(0.048, 10, 10), eyeMat,  0.10, 1.90, 0.24);

    // ── Red Eye Light (lights up environment) ─────────────────────
    _eyeLight = new T.PointLight(0xff1100, 2.5, 10);
    _eyeLight.position.set(0, 1.85, 0.3);
    g.add(_eyeLight);

    // Ambient red halo light on ground
    const halo = new T.PointLight(0x440000, 1.2, 6);
    halo.position.set(0, 0.1, 0);
    g.add(halo);

    // ── Ground shadow projection ──────────────────────────────────
    const shadow = new T.Mesh(
      new T.CircleGeometry(1.8, 32),
      new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    g.add(shadow);

    // ── Dark particle aura ────────────────────────────────────────
    const COUNT = 1000;
    const pos   = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.random() * Math.PI;
      const r     = 0.5 + Math.random() * 1.6;
      pos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
      pos[i*3+1] = r * Math.cos(phi) * 0.85 + 1.1;
      pos[i*3+2] = r * Math.sin(phi) * Math.sin(theta);
    }
    _auraGeo  = new T.BufferGeometry();
    _auraGeo.setAttribute('position', new T.BufferAttribute(pos, 3));
    _auraBase = pos.slice();

    const auraMat = new T.PointsMaterial({
      color: 0x550000, size: 0.072, transparent: true, opacity: 0.6, depthWrite: false,
    });
    g.add(new T.Points(_auraGeo, auraMat));

    // ── Rotating energy ring ──────────────────────────────────────
    const ring = new T.Mesh(
      new T.TorusGeometry(1.0, 0.04, 8, 48),
      new T.MeshStandardMaterial({ color: 0x660000, emissive: 0x440000, emissiveIntensity: 1.5 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.1;
    ring.name = 'energy-ring';
    g.add(ring);

    // ── Position matches A-Frame silhouette ───────────────────────
    const aPos = silEl.getAttribute('position') || { x: 0, y: 0, z: -5 };
    g.position.set(
      parseFloat(aPos.x || 0),
      parseFloat(aPos.y || 0),
      parseFloat(aPos.z || -5)
    );
    g.visible = false;
    g.name    = 'pro-silhouette';
    scene.add(g);
    _proGroup = g;

    // ── Mirror A-Frame visibility changes ─────────────────────────
    const observer = new MutationObserver(() => {
      const v = silEl.getAttribute('visible') !== 'false';
      g.visible = v;
      if (v) silEl.querySelectorAll('a-cylinder,a-sphere,a-ring')
                  .forEach(c => c.setAttribute('visible', 'false'));
    });
    observer.observe(silEl, { attributes: true, attributeFilter: ['visible'] });
    // Also poll (in case Three.js updates object3D.visible directly)
    setInterval(() => {
      g.visible = silEl.object3D ? silEl.object3D.visible : g.visible;
    }, 200);

    console.log('[Pro Characters] Pro silhouette built ✓');
  }

  // ── GLTF NPCs ─────────────────────────────────────────────────────
  async function _loadGLTFNpcs() {
    const T = window.AFRAME.THREE;
    const scene = _aScene.object3D;

    let Loader;
    try { Loader = await _waitGLTF(5000); }
    catch (e) { console.warn('[Pro Characters] GLTFLoader unavailable'); return; }

    // Shared clone helper (works for non-skinned meshes)
    function cloneSimple(src) { return src.clone(true); }

    // Load the robot model once, then clone per NPC
    const loader = new Loader();
    loader.load('assets/models/npc_robot.glb', (gltf) => {
      const proto = gltf.scene;

      // Garden NPC positions (from npcs.js)
      const gardenSpots = [
        { x:  0, y: 0, z: -18, color: 0xd4c59a, scale: 1.0  },  // sage
        { x: -14, y: 0, z: -12, color: 0xfde68a, scale: 0.68 },  // child
        { x:  12, y: 0, z: -22, color: 0xa3a3a3, scale: 0.95 },   // traveler
      ];

      const envGarden = document.getElementById('env-garden');
      gardenSpots.forEach((sp) => {
        const npc = cloneSimple(proto);
        npc.position.set(sp.x, sp.y, sp.z);
        npc.rotation.y = Math.random() * Math.PI * 2;
        npc.scale.setScalar(sp.scale);

        // Tint all meshes
        npc.traverse(obj => {
          if (obj.isMesh) {
            obj.material = obj.material.clone();
            obj.material.color.setHex(sp.color);
            obj.castShadow = obj.receiveShadow = true;
          }
        });

        // Idle animation
        if (gltf.animations && gltf.animations.length) {
          const mixer = new T.AnimationMixer(npc);
          const idle = T.AnimationClip.findByName(gltf.animations, 'Idle')
                    || gltf.animations[0];
          mixer.clipAction(idle).play();
          _mixers.push(mixer);
        }

        scene.add(npc);
      });
      console.log('[Pro Characters] Garden NPCs (GLTF) ✓');
    }, undefined, err => console.warn('[Pro Characters] GLTF load error:', err));

    // Dark NPCs — same robot, desaturated + red tint
    loader.load('assets/models/npc_robot.glb', (gltf) => {
      const proto = gltf.scene;
      const darkSpots = [
        { x: -8, y: 1, z: -10, color: 0x220011, scale: 1.05 },
        { x:  9, y: 1, z: -14, color: 0x1a0008, scale: 1.0  },
        { x:  0, y: 1, z: -22, color: 0x0d0005, scale: 1.1  },
      ];

      darkSpots.forEach((sp) => {
        const npc = cloneSimple(proto);
        npc.position.set(sp.x, sp.y, sp.z);
        npc.rotation.y = Math.random() * Math.PI * 2;
        npc.scale.setScalar(sp.scale);

        npc.traverse(obj => {
          if (obj.isMesh) {
            obj.material = obj.material.clone();
            obj.material.color.setHex(sp.color);
            obj.material.emissive  = new T.Color(0x330000);
            obj.material.emissiveIntensity = 0.6;
            obj.castShadow = obj.receiveShadow = true;
          }
        });

        if (gltf.animations && gltf.animations.length) {
          const mixer = new T.AnimationMixer(npc);
          const idle  = T.AnimationClip.findByName(gltf.animations, 'Idle')
                     || gltf.animations[0];
          mixer.clipAction(idle).play();
          _mixers.push(mixer);
        }

        scene.add(npc);
      });
      console.log('[Pro Characters] Dark NPCs (GLTF) ✓');
    }, undefined, () => {});
  }

  // ── Animation Loop ────────────────────────────────────────────────
  function _startAnimLoop() {
    let _lastNow = 0;

    function tick(now) {
      requestAnimationFrame(tick);
      const t     = now / 1000;
      const delta = Math.min((now - _lastNow) / 1000, 0.05);
      _lastNow = now;

      // ── Silhouette animations ──────────────────────────────────
      if (_proGroup && _proGroup.visible) {
        // Float
        _proGroup.position.y = Math.sin(t * 0.55) * 0.14;
        // Subtle lean
        _proGroup.rotation.z = Math.sin(t * 0.38) * 0.022;

        // Pulsing eyes
        if (_eyeLight)
          _eyeLight.intensity = 2.0 + Math.sin(t * 3.0) * 0.8;

        // Rotating energy ring
        const ring = _proGroup.getObjectByName('energy-ring');
        if (ring) ring.rotation.z = t * 0.9;

        // Aura orbit
        if (_auraGeo && _auraBase) {
          const pos   = _auraGeo.attributes.position.array;
          const count = pos.length / 3;
          const spin  = t * 0.45;
          for (let i = 0; i < count; i++) {
            const bx = _auraBase[i*3];
            const bz = _auraBase[i*3+2];
            const r  = Math.sqrt(bx*bx + bz*bz);
            const a  = Math.atan2(bz, bx) + spin + (i * 0.008);
            pos[i*3]   = Math.cos(a) * r;
            pos[i*3+2] = Math.sin(a) * r;
            pos[i*3+1] = _auraBase[i*3+1] + Math.sin(t * 0.9 + i * 0.02) * 0.18;
          }
          _auraGeo.attributes.position.needsUpdate = true;
        }
      }

      // ── GLTF animation mixers ──────────────────────────────────
      if (delta > 0) _mixers.forEach(m => m.update(delta));
    }

    requestAnimationFrame(tick);
  }

  // ── Init ──────────────────────────────────────────────────────────
  function init() {
    _aScene = document.querySelector('a-scene');
    const run = () => {
      _buildProSilhouette();
      _loadGLTFNpcs();
      _startAnimLoop();
    };
    _aScene.hasLoaded ? run() : _aScene.addEventListener('loaded', run, { once: true });
  }

  return { init };
})();
