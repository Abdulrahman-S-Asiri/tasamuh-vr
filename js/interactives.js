/* ============================================= */
/*  العناصر التفاعلية - يضغطها المستخدم          */
/* ============================================= */

const Interactives = (() => {

  const GARDEN = [
    { id:'rose1', pos:{x:-3,y:0.5,z:-6},  type:'flower', color:'#ec4899', sound:'bell' },
    { id:'rose2', pos:{x:4,y:0.5,z:-7},   type:'flower', color:'#f43f5e', sound:'bell' },
    { id:'rose3', pos:{x:-6,y:0.5,z:-10}, type:'flower', color:'#fb7185', sound:'bell' },
    { id:'bell',  pos:{x:0,y:2.2,z:-15},  type:'bell',   color:'#fbbf24', sound:'bell' },
    { id:'water', pos:{x:7,y:0.1,z:-12},  type:'water',  color:'#38bdf8', sound:'water' },
  ];

  const DARK = [
    { id:'mirror1', pos:{x:-5,y:1.5,z:-8},  type:'mirror', color:'#94a3b8', sound:'glassBreak' },
    { id:'mirror2', pos:{x:6,y:1.5,z:-11},  type:'mirror', color:'#64748b', sound:'glassBreak' },
    { id:'mirror3', pos:{x:0,y:1.5,z:-16},  type:'mirror', color:'#475569', sound:'glassBreak' },
    { id:'candle1', pos:{x:-3,y:0.6,z:-6},  type:'candle', color:'#fcd34d', sound:'thunder' },
    { id:'candle2', pos:{x:4,y:0.6,z:-9},   type:'candle', color:'#fbbf24', sound:'thunder' },
  ];

  function _shape(item) {
    if (item.type === 'flower' || item.type === 'rose') {
      return `<a-sphere radius="0.35" color="${item.color}"
                       material="emissive: ${item.color}; emissiveIntensity: 0.4"
                       animation="property: position; from: 0 0 0; to: 0 0.15 0; dur: 1800; loop: true; dir: alternate"></a-sphere>`;
    }
    if (item.type === 'bell') {
      return `<a-cone radius-top="0.25" radius-bottom="0.5" height="0.7" color="${item.color}"
                     material="emissive: ${item.color}; emissiveIntensity: 0.5; metalness: 0.6"></a-cone>`;
    }
    if (item.type === 'water') {
      return `<a-cylinder radius="0.8" height="0.1" color="${item.color}"
                          material="opacity: 0.7; transparent: true; emissive: ${item.color}; emissiveIntensity: 0.3"
                          rotation="0 0 0"></a-cylinder>`;
    }
    if (item.type === 'mirror') {
      return `<a-plane width="0.9" height="1.4" color="${item.color}"
                      material="metalness: 0.95; roughness: 0.05; emissive: #aaaacc; emissiveIntensity: 0.3"></a-plane>`;
    }
    if (item.type === 'candle') {
      return `<a-cylinder radius="0.1" height="0.5" color="#fff7ed" position="0 0 0"></a-cylinder>
              <a-sphere radius="0.12" color="${item.color}" position="0 0.35 0"
                        material="emissive: ${item.color}; emissiveIntensity: 1.2"
                        animation="property: scale; from: 1 1 1; to: 1.3 1.3 1.3; dur: 600; loop: true; dir: alternate"></a-sphere>`;
    }
    return '';
  }

  function _build(list) {
    const container = document.getElementById('vr-interactives');
    if (!container) return;
    container.innerHTML = '';
    list.forEach(item => {
      const e = document.createElement('a-entity');
      e.setAttribute('class', 'vr-clickable');
      e.setAttribute('position', `${item.pos.x} ${item.pos.y} ${item.pos.z}`);
      e.innerHTML = _shape(item);
      e.addEventListener('click', () => {
        if (typeof Sounds !== 'undefined' && Sounds.play) {
          Sounds.play(item.sound, { position: item.pos, volume: 0.8 });
        }
        // اختفاء/انكسار
        if (item.type === 'mirror') {
          e.setAttribute('animation__break', 'property: scale; to: 0.01 0.01 0.01; dur: 400');
          setTimeout(() => e.parentNode && e.parentNode.removeChild(e), 500);
        } else if (item.type === 'candle') {
          e.setAttribute('animation__out', 'property: scale; to: 1 0.05 1; dur: 500');
        } else if (item.type === 'flower') {
          e.setAttribute('animation__pick', 'property: position; to: ' + item.pos.x + ' 3 ' + item.pos.z + '; dur: 1200');
          setTimeout(() => e.parentNode && e.parentNode.removeChild(e), 1300);
        } else if (item.type === 'bell') {
          e.setAttribute('animation__ring', 'property: rotation; from: 0 0 -10; to: 0 0 10; dur: 200; loop: 6; dir: alternate');
        } else if (item.type === 'water') {
          e.setAttribute('animation__ripple', 'property: scale; from: 1 1 1; to: 1.4 1 1.4; dur: 800; loop: 3; dir: alternate');
        }
      });
      container.appendChild(e);
    });
  }

  function spawn(env) {
    clear();
    if (env === 'garden') _build(GARDEN);
    else if (env === 'dark') _build(DARK);
  }

  function clear() {
    const container = document.getElementById('vr-interactives');
    if (container) container.innerHTML = '';
  }

  return { spawn, clear };
})();
