/* ============================================= */
/*  شخصيات NPC - يتكلمون عند الاقتراب           */
/* ============================================= */

const Npcs = (() => {

  const GARDEN_NPCS = [
    { id:'sage',    pos:{x:0,y:0,z:-18},  color:'#e0d4a8', height:1.9,
      lines:['السلام عليك أيها الزائر…','من يعفو فاللهُ يُحبّه.','اجلس قليلاً وتأمّل.'] },
    { id:'child',   pos:{x:-14,y:0,z:-12}, color:'#fde68a', height:1.2,
      lines:['انظر للورد كيف يفرح بالشمس!','تعالَ نلعب حول النهر.'] },
    { id:'traveler',pos:{x:12,y:0,z:-22}, color:'#a3a3a3', height:1.85,
      lines:['طُفتُ البلاد فما رأيت أجمل من قلبٍ سامح.','الطريق طويل لكنه يستحقّ.'] },
  ];

  const DARK_NPCS = [
    { id:'ghost1', pos:{x:-8,y:1,z:-10}, color:'#475569', height:1.8,
      lines:['لن تجد راحة هنا…','الانتقام يأكلك من الداخل.'] },
    { id:'ghost2', pos:{x:9,y:1,z:-14},  color:'#334155', height:1.8,
      lines:['كم مرة فكرت في هذه اللحظة؟','لن يعود شيء كما كان.'] },
    { id:'ghost3', pos:{x:0,y:1,z:-22},  color:'#1e293b', height:1.8,
      lines:['الندم ثقيل…','لو عدتَ بالزمن، هل كنت ستختار نفس الطريق؟'] },
  ];

  let active = [];
  let lastSpoken = {};

  function _build(list, isDark) {
    const container = document.getElementById('vr-npcs');
    if (!container) return;
    container.innerHTML = '';
    list.forEach(n => {
      const e = document.createElement('a-entity');
      e.setAttribute('id', 'npc-' + n.id);
      e.setAttribute('position', `${n.pos.x} ${n.pos.y} ${n.pos.z}`);
      // point light halo
      const light = document.createElement('a-light');
      light.setAttribute('type', 'point');
      light.setAttribute('color', n.color);
      light.setAttribute('intensity', isDark ? 0.4 : 0.6);
      light.setAttribute('distance', 4);
      light.setAttribute('position', `0 ${n.height * 0.7} 0`);
      e.appendChild(light);
      e._npc = n;
      container.appendChild(e);
      // Attach humanoid mesh once entity is ready
      e.addEventListener('loaded', () => {
        if (window.NpcFactory) {
          const mesh = window.NpcFactory.build({
            height: n.height,
            color: n.color,
            dark: isDark,
            skin: isDark ? '#4a3333' : '#e8c9a0'
          });
          e.object3D.add(mesh);
          e._mesh = mesh;
        }
      });
      active.push(e);
    });
  }

  function spawn(env) {
    clear();
    if (env === 'garden') _build(GARDEN_NPCS, false);
    else if (env === 'dark') _build(DARK_NPCS, true);
    _startProximity();
  }

  function clear() {
    const container = document.getElementById('vr-npcs');
    if (container) container.innerHTML = '';
    active = []; lastSpoken = {};
  }

  let raf = null;
  function _startProximity() {
    if (raf) cancelAnimationFrame(raf);
    const cam = document.getElementById('vrCamera');
    if (!cam) return;
    const tick = () => {
      if (!cam.object3D) { raf = requestAnimationFrame(tick); return; }
      const cp = cam.object3D.getWorldPosition(new THREE.Vector3());
      const now = Date.now();
      const ts = now * 0.002;
      active.forEach(e => {
        if (e._mesh) {
          e._mesh.position.y = Math.sin(ts + (e._mesh.userData.idlePhase||0)) * 0.02;
          const dir = new THREE.Vector3().subVectors(cp, e.object3D.position);
          e._mesh.rotation.y = Math.atan2(dir.x, dir.z);
        }
        const np = e.object3D.getWorldPosition(new THREE.Vector3());
        const d = cp.distanceTo(np);
        const id = e._npc.id;
        if (d < 4 && (!lastSpoken[id] || now - lastSpoken[id] > 12000)) {
          lastSpoken[id] = now;
          const line = e._npc.lines[Math.floor(Math.random() * e._npc.lines.length)];
          const hud = document.getElementById('vrHud');
          const txt = document.getElementById('vrHudText');
          if (hud && txt) { txt.textContent = line; hud.classList.add('active'); }
          if (typeof Speech !== 'undefined') Speech.speak(line, null, { position: e._npc.pos });
          setTimeout(() => { if (hud) hud.classList.remove('active'); }, 5000);
        }
      });
      raf = requestAnimationFrame(tick);
    };
    tick();
  }

  return { spawn, clear };
})();
