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

  function _build(list) {
    const container = document.getElementById('vr-npcs');
    if (!container) return;
    container.innerHTML = '';
    list.forEach(n => {
      const e = document.createElement('a-entity');
      e.setAttribute('id', 'npc-' + n.id);
      e.setAttribute('position', `${n.pos.x} ${n.pos.y} ${n.pos.z}`);
      e.innerHTML = `
        <a-cylinder height="${n.height}" radius="0.3" color="${n.color}"
                    material="opacity: 0.85; transparent: true"
                    position="0 ${n.height/2} 0"></a-cylinder>
        <a-sphere radius="0.3" color="${n.color}" position="0 ${n.height + 0.25} 0"></a-sphere>
        <a-light type="point" color="${n.color}" intensity="0.6" distance="3"></a-light>
      `;
      e._npc = n;
      container.appendChild(e);
      active.push(e);
    });
  }

  function spawn(env) {
    clear();
    if (env === 'garden') _build(GARDEN_NPCS);
    else if (env === 'dark') _build(DARK_NPCS);
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
      active.forEach(e => {
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
