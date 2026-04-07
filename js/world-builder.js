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

    // نهر (شريط أزرق طويل بـ animation)
    const river = _create('a-plane', {
      position: '8 0.05 -12', rotation: '-90 0 0',
      width: 4, height: 80,
      material: 'color: #1e88e5; opacity: 0.85; transparent: true; metalness: 0.7; roughness: 0.2',
    });
    river.setAttribute('animation', 'property: material.opacity; from: 0.75; to: 0.95; dur: 3000; loop: true; dir: alternate');
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

    // أرض ضخمة (300x300)
    const ground = _create('a-circle', {
      radius: 150, position: '0 0 0', rotation: '-90 0 0',
      material: 'color: #2d6e33; roughness: 0.9; metalness: 0',
    });
    root.appendChild(ground);

    // ممر متعرج
    for (let i = 0; i < 30; i++) {
      const z = -i * 4;
      const x = Math.sin(i * 0.4) * 2;
      root.appendChild(_create('a-plane', {
        position: `${x} 0.02 ${z}`, rotation: '-90 0 0',
        width: 2.5, height: 4,
        material: 'color: #d4a76a; roughness: 0.8; opacity: 0.85',
      }));
    }

    // 200 شجرة موزعة في كل الاتجاهات
    for (let i = 0; i < 200; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 8 + Math.random() * 130;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      const h = rand(2.5, 6);
      const r = rand(0.15, 0.35);
      const leafR = rand(1.2, 2.5);
      const leafColors = ['#2E7D32', '#388E3C', '#43A047', '#1B5E20', '#558B2F', '#33691E'];
      const trunkColors = ['#5D4037', '#4E342E', '#3E2723', '#6D4C41'];

      const tree = _create('a-entity', { position: `${x} 0 ${z}` });
      tree.appendChild(_create('a-cylinder', {
        height: h, radius: r,
        color: trunkColors[Math.floor(Math.random() * trunkColors.length)],
        position: `0 ${h / 2} 0`,
        material: 'roughness: 0.9',
      }));
      // عدة كرات للأوراق لشكل أكثر طبيعية
      for (let j = 0; j < 3; j++) {
        tree.appendChild(_create('a-sphere', {
          radius: leafR * (0.7 + Math.random() * 0.4),
          color: leafColors[Math.floor(Math.random() * leafColors.length)],
          position: `${rand(-0.5, 0.5)} ${h + rand(-0.3, 0.6)} ${rand(-0.5, 0.5)}`,
          material: 'roughness: 0.85',
        }));
      }
      root.appendChild(tree);
    }

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

    // جبال بعيدة (12 جبل حول المحيط)
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const dist = 130;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      const h = rand(20, 45);
      root.appendChild(_create('a-cone', {
        position: `${x} ${h / 2} ${z}`,
        radius: rand(15, 25), height: h,
        color: '#5a7a8a',
        material: 'roughness: 1; flatShading: true',
      }));
    }

    // 30 فراشة متحركة
    const flutter = ['#FFD93D', '#FF6B9D', '#A388EE', '#6DD5ED', '#FFC857'];
    for (let i = 0; i < 30; i++) {
      const x = rand(-15, 15);
      const z = rand(-25, 5);
      const y = rand(1.5, 3.5);
      const c = flutter[i % flutter.length];
      const ent = _create('a-entity', {
        position: `${x} ${y} ${z}`,
        animation: `property: position; to: ${x + rand(-2, 2)} ${y + rand(-0.5, 0.5)} ${z + rand(-2, 2)}; dur: ${4000 + Math.random() * 3000}; easing: easeInOutSine; loop: true; dir: alternate`,
      });
      ent.appendChild(_create('a-sphere', { radius: 0.08, color: c, material: 'shader: flat' }));
      root.appendChild(ent);
    }

    // غيوم بيضاء بعيدة
    for (let i = 0; i < 20; i++) {
      root.appendChild(_create('a-sphere', {
        position: `${rand(-100, 100)} ${rand(35, 55)} ${rand(-100, 100)}`,
        radius: rand(5, 12),
        color: '#ffffff',
        material: 'opacity: 0.7; flatShading: true',
      }));
    }

    // إضاءة قوية
    root.appendChild(_create('a-light', { type: 'ambient', color: '#FFF8DC', intensity: '0.7' }));
    root.appendChild(_create('a-light', {
      type: 'directional', color: '#FFE4B5', intensity: '1.2',
      position: '20 30 -10',
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

    // أرض متشققة
    root.appendChild(_create('a-circle', {
      radius: 150, position: '0 0 0', rotation: '-90 0 0',
      material: 'color: #1a0505; roughness: 1',
    }));

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

    // جبال سوداء حول المحيط
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const dist = 130;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      const h = rand(25, 50);
      root.appendChild(_create('a-cone', {
        position: `${x} ${h / 2} ${z}`,
        radius: rand(15, 25), height: h,
        color: '#0a0000',
        material: 'roughness: 1; flatShading: true',
      }));
    }

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

  function buildAll() {
    buildGarden();
    buildDark();
  }

  return { buildAll, buildGarden, buildDark };
})();
