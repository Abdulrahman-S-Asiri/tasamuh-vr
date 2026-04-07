/* ============================================= */
/*  نظام الحركة - Joystick جوال + WASD + VR        */
/* ============================================= */

const Movement = (() => {

  let joyState = { active: false, dx: 0, dy: 0 };
  let speed = 4; // متر/ثانية
  let lookYaw = 0;

  // -------- Joystick على الشاشة --------
  function _buildJoystick() {
    if (document.getElementById('joystick')) return;
    const wrap = document.createElement('div');
    wrap.id = 'joystick';
    wrap.innerHTML = `
      <div id="joystick-base">
        <div id="joystick-knob"></div>
      </div>
    `;
    Object.assign(wrap.style, {
      position: 'fixed', left: '20px', bottom: '20px',
      width: '140px', height: '140px',
      zIndex: '9999', userSelect: 'none', touchAction: 'none',
      display: 'block',
    });
    const base = wrap.querySelector('#joystick-base');
    Object.assign(base.style, {
      position: 'absolute', inset: '0',
      borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(255,255,255,0.18), rgba(255,255,255,0.06))',
      border: '2px solid rgba(255,255,255,0.4)',
      backdropFilter: 'blur(8px)',
    });
    const knob = wrap.querySelector('#joystick-knob');
    Object.assign(knob.style, {
      position: 'absolute', left: '50%', top: '50%',
      width: '55px', height: '55px',
      marginLeft: '-27px', marginTop: '-27px',
      borderRadius: '50%',
      background: 'radial-gradient(circle, #fff, rgba(255,255,255,0.5))',
      boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
      transition: 'transform 0.05s',
    });
    document.body.appendChild(wrap);

    let cx = 0, cy = 0;
    const radius = 50;

    function start(e) {
      const t = e.touches ? e.touches[0] : e;
      const r = base.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      joyState.active = true;
      window._joyTouches = (window._joyTouches || 0) + 1;
      if (window.App && window.App._dbg) window.App._dbg('joy start #' + window._joyTouches);
      move(e);
    }
    function move(e) {
      if (!joyState.active) return;
      const t = e.touches ? e.touches[0] : e;
      let dx = t.clientX - cx;
      let dy = t.clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > radius) { dx = dx / dist * radius; dy = dy / dist * radius; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      joyState.dx = dx / radius;
      joyState.dy = dy / radius;
      e.preventDefault && e.preventDefault();
    }
    function end() {
      joyState.active = false;
      joyState.dx = 0; joyState.dy = 0;
      knob.style.transform = 'translate(0,0)';
    }

    wrap.addEventListener('touchstart', start, { passive: false });
    wrap.addEventListener('touchmove',  move,  { passive: false });
    wrap.addEventListener('touchend',   end);
    wrap.addEventListener('mousedown',  start);
    window.addEventListener('mousemove',(e) => joyState.active && move(e));
    window.addEventListener('mouseup',  end);
  }

  function showJoystick() {
    const j = document.getElementById('joystick');
    if (j) j.style.display = 'block';
  }
  function hideJoystick() {
    const j = document.getElementById('joystick');
    if (j) j.style.display = 'none';
  }

  // -------- WASD للسطح المكتب --------
  const keys = {};
  function _bindKeys() {
    window.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; });
    window.addEventListener('keyup',   (e) => { keys[e.key.toLowerCase()] = false; });
  }

  // -------- حلقة التحديث --------
  let rig = null, cam = null, lastT = 0;
  const _dir = { x: 0, y: 0, z: 0 };
  function _tick(t) {
    requestAnimationFrame(_tick);
    if (!rig || !cam) return;
    const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0.016;
    lastT = t;

    // دمج إدخالات joystick + WASD
    let mx = joyState.dx;
    let mz = joyState.dy;
    if (keys['w'] || keys['arrowup'])    mz -= 1;
    if (keys['s'] || keys['arrowdown'])  mz += 1;
    if (keys['a'] || keys['arrowleft'])  mx -= 1;
    if (keys['d'] || keys['arrowright']) mx += 1;

    if (mx === 0 && mz === 0) return;
    const len = Math.hypot(mx, mz);
    mx /= len; mz /= len;
    mz = -mz; // dy السالب = للأمام

    // اتجاه الكاميرا الحقيقي من matrixWorld (يدعم look-controls و VR HMD)
    const obj = cam.object3D;
    obj.updateMatrixWorld();
    const m = obj.matrixWorld.elements;
    // forward (المسطّح أفقياً) = -Z column
    let fx = -m[8], fz = -m[10];
    const flen = Math.hypot(fx, fz) || 1;
    fx /= flen; fz /= flen;
    // right = perpendicular (دوران 90° يمين)
    const rx = -fz, rz = fx;

    // تحويل إدخال 2D إلى اتجاه عالمي
    const wx = rx * mx + fx * mz;
    const wz = rz * mx + fz * mz;

    const pos = rig.object3D.position;
    pos.x += wx * speed * dt;
    pos.z += wz * speed * dt;
    // حدود الحركة
    const limit = 140;
    pos.x = Math.max(-limit, Math.min(limit, pos.x));
    pos.z = Math.max(-limit, Math.min(limit, pos.z));
  }

  function init() {
    _buildJoystick();
    _bindKeys();
    const tryBind = () => {
      rig = document.getElementById('vrRig');
      cam = document.getElementById('vrCamera');
      if (rig && cam) {
        requestAnimationFrame(_tick);
      } else {
        setTimeout(tryBind, 200);
      }
    };
    tryBind();
  }

  return { init, showJoystick, hideJoystick };
})();
