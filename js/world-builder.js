/* ============================================= */
/*  بناء عالم ضخم إجرائياً (Procedural)            */
/*  - حديقة ضخمة (مئات الأشجار، الزهور، الجبال)  */
/*  - بيئة الانتقام (حطام، بنايات مدمرة)          */
/* ============================================= */

const WorldBuilder = (() => {

  const rand = (min, max) => Math.random() * (max - min) + min;

  function _create(tag, attrs) {
    const el = document.createElement(tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  // -------- بيئة الحديقة الضخمة --------
  function _buildGardenExtras(root) {
    // معبد سلام (4 أعمدة + سقف)
    const temple = _create('a-entity', { position: '0 0 -18' });
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2;
      temple.appendChild(_create('a-cylinder', {
        position: `${Math.cos(ang)*2} 1.8 ${Math.sin(ang)*2}`,
        radius: 0.25, height: 3.6,
        material: 'color: #f5f5dc; metalness: 0.3; roughness: 0.5',
      }));
    }
    temple.appendChild(_create('a-cylinder', {
      position: '0 3.7 0', radius: 2.6, height: 0.2,
      material: 'color: #e8e3c0; metalness: 0.3',
    }));
    temple.appendChild(_create('a-light', {
      type: 'point', position: '0 3 0', color: '#fff7d6',
      intensity: '1.2', distance: '12',
    }));
    root.appendChild(temple);

    // نهر — ماء بتأثير موجات shader
    const river = _create('a-entity', {
      position: '8 0.05 -12',
      'water-waves': '',
    });
    river.addEventListener('loaded', () => {
      if (window.buildReflectiveWater) {
        river.object3D.add(window.buildReflectiveWater(4, 80, 0x1e88e5));
      } else if (window.WaterFactory) {
        river.object3D.add(window.WaterFactory.build(4, 80, 0x1e88e5));
      }
    });
    root.appendChild(river);

    // جسر فوق النهر
    const bridge = _create('a-entity', { position: '8 0.5 -10' });
    bridge.appendChild(_create('a-box', {
      position: '0 0.1 0', width: 6, height: 0.2, depth: 1.6,
      material: 'color: #6b4423; roughness: 0.9',
    }));
    for (let i = -2; i <= 2; i++) {
      bridge.appendChild(_create('a-cylinder', {
        position: `${i*1.4} 0.6 0.7`, radius: 0.06, height: 1,
        material: 'color: #4a2f15',
      }));
      bridge.appendChild(_create('a-cylinder', {
        position: `${i*1.4} 0.6 -0.7`, radius: 0.06, height: 1,
        material: 'color: #4a2f15',
      }));
    }
    root.appendChild(bridge);

    // شلال صغير (نهاية النهر)
    const fall = _create('a-plane', {
      position: '8 1.5 -50', rotation: '0 0 0',
      width: 4, height: 3,
      material: 'color: #90caf9; opacity: 0.7; transparent: true; emissive: #64b5f6; emissiveIntensity: 0.3',
    });
    fall.setAttribute('animation', 'property: material.opacity; from: 0.5; to: 0.85; dur: 1500; loop: true; dir: alternate');
    root.appendChild(fall);

    // حقل لافندر
    for (let i = 0; i < 60; i++) {
      const x = -15 + Math.random() * -8;
      const z = -8 - Math.random() * 14;
      root.appendChild(_create('a-cylinder', {
        position: `${x} 0.4 ${z}`, radius: 0.05, height: 0.8,
        material: 'color: #7e57c2',
      }));
      root.appendChild(_create('a-sphere', {
        position: `${x} 0.9 ${z}`, radius: 0.18,
        material: 'color: #b39ddb; emissive: #9575cd; emissiveIntensity: 0.3',
      }));
    }

    // ضوء directional لظلال
    root.appendChild(_create('a-light', {
      type: 'directional', position: '20 30 10',
      color: '#fff5e0', intensity: '0.9',
    }));
  }

  function buildGarden() {
    const root = document.getElementById('env-garden');
    if (!root || root.dataset.built === '1') return;

    // أرض مموّجة (wavy terrain) مع نسيج عشب + سماء تدرجية + god rays + بتلات
    const worldHost = _create('a-entity', {
      id: 'garden-world-host',
      'godrays-pulse': '',
      'petals-tick': '',
    });
    root.appendChild(worldHost);
    worldHost.addEventListener('loaded', () => {
      const parent = worldHost.object3D;
      if (window.buildWavyTerrain) parent.add(window.buildWavyTerrain(150, 140));
      if (window.buildGradientSky) parent.add(window.buildGradientSky('#87ceeb', '#ffe4b5'));
      if (window.buildGodRays) parent.add(window.buildGodRays());
      if (window.buildPetals) window.buildPetals(parent, (window.QUALITY?window.QUALITY.n(350):350), 22);
      // Volumetric ground fog + lens-flared sun
      if (window.buildVolumetricFog) window.buildVolumetricFog(parent, { count: (window.QUALITY?window.QUALITY.n(50):50), radius: 35, color: '#f0e0b0', height: 1.0 });
      if (window.buildLensFlare) {
        const sun = window.buildLensFlare(new THREE.Vector3(80, 70, -120));
        sun.scale.set(35, 35, 1);
        parent.add(sun);
      }
    });

    // ممر حجري بـ InstancedMesh
    const pathHost = _create('a-entity');
    root.appendChild(pathHost);
    pathHost.addEventListener('loaded', () => {
      if (window.buildStonePath) window.buildStonePath(pathHost.object3D, 30);
    });

    // 200 شجرة شبه واقعية عبر TreeFactory (THREE.Group مباشر = أسرع)
    const treesRoot = _create('a-entity', { id: 'garden-trees', 'wind-sway': '' });
    root.appendChild(treesRoot);
    treesRoot.addEventListener('loaded', () => {
      const parent = treesRoot.object3D;
      if (!window.TreeFactory) return;
      const TREE_COUNT = window.QUALITY ? window.QUALITY.n(200) : 200;
      for (let i = 0; i < TREE_COUNT; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 8 + Math.random() * 130;
        const x = Math.cos(angle) * dist;
        const z = Math.sin(angle) * dist;
        const tree = window.TreeFactory.build({
          height: rand(3.5, 7.5),
          trunkR: rand(0.18, 0.38),
          type: Math.random() < 0.3 ? 'pine' : 'broadleaf'
        });
        tree.position.set(x, 0, z);
        parent.add(tree);
      }
    });

    // 300 زهرة قريبة من الممر
    const flowerColors = ['#FF6B9D', '#FFD93D', '#FF8A5C', '#A388EE', '#6DD5ED', '#FF477E', '#FFC857'];
    for (let i = 0; i < 300; i++) {
      const x = rand(-30, 30);
      const z = rand(-100, 10);
      root.appendChild(_create('a-sphere', {
        position: `${x} ${rand(0.1, 0.3)} ${z}`,
        radius: rand(0.1, 0.25),
        color: flowerColors[Math.floor(Math.random() * flowerColors.length)],
        material: 'emissive: #221100; emissiveIntensity: 0.2',
      }));
    }

    // جبال صخرية بتكستشر + سحب ناعمة — تُضاف إلى worldHost
    worldHost.addEventListener('loaded', () => {
      const p = worldHost.object3D;
      if (window.buildMountainRing) p.add(window.buildMountainRing(14, 130, false));
      if (window.buildClouds) p.add(window.buildClouds(18));
    }, { once: true });

    // 30 فراشة متحركة (sprites)
    for (let i = 0; i < 30; i++) {
      const x = rand(-15, 15);
      const z = rand(-25, 5);
      const y = rand(1.5, 3.5);
      const ent = _create('a-entity', {
        position: `${x} ${y} ${z}`,
        animation: `property: position; to: ${x + rand(-2, 2)} ${y + rand(-0.5, 0.5)} ${z + rand(-2, 2)}; dur: ${4000 + Math.random() * 3000}; easing: easeInOutSine; loop: true; dir: alternate`,
      });
      ent.addEventListener('loaded', () => {
        if (window.ButterflyFactory) ent.object3D.add(window.ButterflyFactory.build());
      });
      root.appendChild(ent);
    }

    // حقل عشب كثيف حول الكاميرا (InstancedMesh)
    const grassHost = _create('a-entity');
    root.appendChild(grassHost);
    grassHost.addEventListener('loaded', () => {
      if (window.buildGrassField) window.buildGrassField(grassHost.object3D, (window.QUALITY?window.QUALITY.n(4000):4000), 30);
    });

    // (السحب الآن تُبنى عبر buildClouds في worldHost أعلاه)

    // إضاءة قوية — الشمس مع ظلال ناعمة
    root.appendChild(_create('a-light', { type: 'ambient', color: '#FFF8DC', intensity: '0.55' }));
    root.appendChild(_create('a-light', {
      type: 'directional', color: '#FFE4B5', intensity: '1.35',
      position: '30 45 -15',
      'sun-light': '',
    }));
    root.appendChild(_create('a-light', {
      type: 'hemisphere', color: '#87CEEB', 'ground-color': '#1a5c2a', intensity: '0.5',
    }));

    _buildGardenExtras(root);

    root.dataset.built = '1';
  }

  // -------- بيئة الانتقام الضخمة --------
  function buildDark() {
    const root = document.getElementById('env-dark');
    if (!root || root.dataset.built === '1') return;

    // أرض متشققة مموّجة + سماء مظلمة + جمرات + جبال سوداء
    const darkHost = _create('a-entity', {
      id: 'dark-world-host',
      'embers-tick': '',
    });
    root.appendChild(darkHost);
    darkHost.addEventListener('loaded', () => {
      const p = darkHost.object3D;
      if (window.buildWavyTerrain) {
        const t = window.buildWavyTerrain(150, 120);
        // tint dark red
        t.material.color.set('#4a1a1a');
        t.material.map = null;
        p.add(t);
      }
      if (window.buildGradientSky) p.add(window.buildGradientSky('#1a0000', '#4a0000'));
      if (window.buildMountainRing) p.add(window.buildMountainRing(14, 130, true));
      if (window.buildEmbers) window.buildEmbers(p, (window.QUALITY?window.QUALITY.n(220):220), 30);
      if (window.buildVolumetricFog) window.buildVolumetricFog(p, { count: (window.QUALITY?window.QUALITY.n(60):60), radius: 35, color: '#3a0808', height: 0.8 });
    });

    // 80 قطعة حطام موزعة
    for (let i = 0; i < 80; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 4 + Math.random() * 60;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      const colors = ['#2d0a0a', '#3b0f0f', '#1a0000', '#4a0000', '#0d0000'];
      root.appendChild(_create('a-box', {
        position: `${x} ${rand(0.2, 1.5)} ${z}`,
        width: rand(0.5, 2.5), height: rand(0.3, 2), depth: rand(0.1, 0.4),
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: `${rand(-30, 30)} ${rand(0, 360)} ${rand(-30, 30)}`,
        material: 'roughness: 1; opacity: 0.7',
      }));
    }

    // 15 بناية مدمرة (هياكل عالية مكسورة)
    for (let i = 0; i < 15; i++) {
      const angle = (i / 15) * Math.PI * 2 + rand(-0.2, 0.2);
      const dist = 25 + Math.random() * 60;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      const h = rand(8, 25);
      root.appendChild(_create('a-box', {
        position: `${x} ${h / 2} ${z}`,
        width: rand(3, 7), height: h, depth: rand(3, 7),
        color: '#1a0000',
        rotation: `${rand(-15, 15)} ${rand(0, 360)} ${rand(-15, 15)}`,
        material: 'roughness: 1',
      }));
    }

    // 20 شخصية عدائية بعيدة
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 6 + Math.random() * 30;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      const ent = _create('a-entity', {
        position: `${x} 0 ${z}`,
        animation: `property: position; to: ${x + rand(-1, 1)} 0 ${z + rand(-1, 1)}; dur: ${1500 + Math.random() * 1500}; easing: easeInOutSine; loop: true; dir: alternate`,
      });
      ent.appendChild(_create('a-cylinder', {
        height: 1.8, radius: 0.3, color: '#4A0000',
        position: '0 0.9 0', material: 'roughness: 1',
      }));
      ent.appendChild(_create('a-sphere', {
        radius: 0.35, color: '#3b0f0f',
        position: '0 2.1 0', material: 'roughness: 1; emissive: #220000; emissiveIntensity: 0.4',
      }));
      root.appendChild(ent);
    }

    // (الجبال الآن تُبنى عبر buildMountainRing في darkHost أعلاه)

    // أضواء حمراء وامضة موزعة
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const dist = 15 + Math.random() * 20;
      root.appendChild(_create('a-light', {
        type: 'point',
        color: '#ff2200',
        intensity: 0.4,
        distance: 25,
        position: `${Math.cos(angle) * dist} ${rand(2, 8)} ${Math.sin(angle) * dist}`,
        animation: `property: intensity; from: 0.2; to: 0.7; dur: ${1200 + Math.random() * 1500}; loop: true; dir: alternate`,
      }));
    }

    // إضاءة محيطية مظلمة
    root.appendChild(_create('a-light', { type: 'ambient', color: '#220000', intensity: '0.3' }));
    root.appendChild(_create('a-light', {
      type: 'directional', color: '#660000', intensity: '0.4', position: '0 30 -10',
    }));

    root.dataset.built = '1';
  }

  // -------- بيئة المواجهة المحايدة (السينمائية) --------
  function buildNeutral() {
    const root = document.getElementById('env-neutral');
    if (!root || root.dataset.built === '1') return;

    // أرض حجرية مموّجة + سماء ليلية متدرجة + ضباب خفيف
    const host = _create('a-entity', {
      id: 'neutral-world-host',
      'embers-tick': '',
    });
    root.appendChild(host);
    host.addEventListener('loaded', () => {
      const p = host.object3D;
      if (window.buildWavyTerrain) {
        const t = window.buildWavyTerrain(120, 100);
        t.material.color.set('#1a1a2a');
        t.material.map = null;
        t.material.metalness = 0.2;
        t.material.roughness = 0.9;
        p.add(t);
      }
      if (window.buildGradientSky) p.add(window.buildGradientSky('#0a0a1a', '#2a1a3a'));
      if (window.buildMountainRing) {
        const m = window.buildMountainRing(14, 120, true);
        m.traverse(o => { if (o.isMesh) o.material.color.set('#14141f'); });
        p.add(m);
      }
      // ذرات غبار متصاعدة بدل الجمرات (نفس embers-tick ولكن بألوان باردة)
      if (window.buildEmbers) {
        const emb = window.buildEmbers(p, 180, 25);
        emb.material.color.set('#8899cc');
      }
    });

    root.dataset.built = '1';
  }

  function buildAll() {
    buildGarden();
    buildDark();
    buildNeutral();
  }

  return { buildAll, buildGarden, buildDark, buildNeutral };
})();
