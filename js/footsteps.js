/* ============================================= */
/*  أصوات الخطوات - تشتغل مع حركة الكاميرا       */
/* ============================================= */

(function() {
  let raf = null;
  let lastPos = null;
  let accum = 0;

  function start() {
    if (raf) return;
    const cam = document.getElementById('vrCamera');
    if (!cam) return;
    const tick = () => {
      if (cam.object3D) {
        const p = cam.object3D.getWorldPosition(new THREE.Vector3());
        if (lastPos) {
          const d = Math.hypot(p.x - lastPos.x, p.z - lastPos.z);
          accum += d;
          if (accum > 1.2) {
            accum = 0;
            if (typeof Sounds !== 'undefined' && Sounds.play) {
              Sounds.play('footsteps', { volume: 0.4 });
            }
          }
        }
        lastPos = p.clone();
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
  }

  window.addEventListener('load', () => setTimeout(start, 2000));
})();
