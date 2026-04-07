/* ============================================= */
/*  نظام الجسيمات والتأثيرات البصرية              */
/* ============================================= */

const Particles = (() => {

  // --- جسيمات البداية ---
  function createIntro() {
    const c = document.getElementById('introParticles');
    if (!c) return;
    const count = CONFIG.particles.introCount;
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      const s = Math.random() * 4 + 1;
      Object.assign(p.style, {
        width: s + 'px',
        height: s + 'px',
        left: Math.random() * 100 + '%',
        background: `rgba(${140 + Math.random() * 50}, ${130 + Math.random() * 50}, 255, 0.35)`,
        animationDuration: (Math.random() * 10 + 8) + 's',
        animationDelay: (Math.random() * 8) + 's',
      });
      c.appendChild(p);
    }
  }

  // --- جسيمات الحديقة (تسامح) ---
  function createGarden() {
    const c = document.getElementById('resultParticles');
    if (!c) return;
    c.innerHTML = '';
    const colors = [
      'rgba(52,211,153,0.45)',
      'rgba(110,231,183,0.35)',
      'rgba(254,240,138,0.35)',
      'rgba(253,186,116,0.3)',
      'rgba(196,181,253,0.3)',
    ];
    const count = CONFIG.particles.gardenCount;
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      const s = Math.random() * 6 + 2;
      Object.assign(p.style, {
        width: s + 'px',
        height: s + 'px',
        left: Math.random() * 100 + '%',
        background: colors[Math.floor(Math.random() * colors.length)],
        animationDuration: (Math.random() * 8 + 6) + 's',
        animationDelay: (Math.random() * 4) + 's',
      });
      c.appendChild(p);
    }
  }

  // --- تأثير التحطم (انتقام) ---
  function createShatter() {
    const c = document.getElementById('shatterFx');
    if (!c) return;
    c.innerHTML = '';

    // قطع الحطام
    const count = CONFIG.particles.shardCount;
    for (let i = 0; i < count; i++) {
      const el = document.createElement('div');
      el.className = 'shard';
      const s = Math.random() * 55 + 15;
      Object.assign(el.style, {
        width: s + 'px',
        height: s + 'px',
        left: Math.random() * 100 + '%',
        top: Math.random() * 50 + '%',
        '--sx': (Math.random() * 200 - 100) + 'px',
        '--sr': (Math.random() * 720) + 'deg',
        animationDuration: (Math.random() * 3.5 + 2) + 's',
        animationDelay: (Math.random() * 0.8) + 's',
      });
      c.appendChild(el);
    }

    // نصوص مشفرة عائمة
    CONFIG.particles.glitchTexts.forEach(txt => {
      const el = document.createElement('div');
      el.className = 'glitch-float';
      el.textContent = txt;
      Object.assign(el.style, {
        left: (Math.random() * 80 + 10) + '%',
        top: (Math.random() * 80 + 10) + '%',
        animationDelay: (Math.random() * 3) + 's',
      });
      c.appendChild(el);
    });
  }

  // --- جسيمات الخاتمة ---
  function createClosing() {
    const c = document.getElementById('closingParticles');
    if (!c) return;
    c.innerHTML = '';
    for (let i = 0; i < 20; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      const s = Math.random() * 3 + 1;
      Object.assign(p.style, {
        width: s + 'px',
        height: s + 'px',
        left: Math.random() * 100 + '%',
        background: `rgba(255, 215, 0, ${Math.random() * 0.3 + 0.1})`,
        animationDuration: (Math.random() * 12 + 8) + 's',
        animationDelay: (Math.random() * 6) + 's',
      });
      c.appendChild(p);
    }
  }

  // --- تنظيف ---
  function clearResult() {
    const rp = document.getElementById('resultParticles');
    const sf = document.getElementById('shatterFx');
    if (rp) rp.innerHTML = '';
    if (sf) sf.innerHTML = '';
  }

  return { createIntro, createGarden, createShatter, createClosing, clearResult };
})();
