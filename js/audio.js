/* ============================================= */
/*  نظام الصوت - مكاني ثلاثي الأبعاد (HRTF)        */
/* ============================================= */

const Audio = (() => {
  let ctx = null;
  let listener = null;
  let masterGain = null;
  let enabled = true;
  let activeIntervals = [];
  let activeNodes = []; // لتتبع الـ oscillators الحية

  function init() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      listener = ctx.listener;
      masterGain = ctx.createGain();
      masterGain.gain.value = 1.0;
      masterGain.connect(ctx.destination);
      // اتجاه افتراضي للمستمع: ينظر لـ -Z، رأسه لـ +Y (نفس A-Frame)
      try {
        if (listener.forwardX) {
          listener.forwardX.value = 0;
          listener.forwardY.value = 0;
          listener.forwardZ.value = -1;
          listener.upX.value = 0;
          listener.upY.value = 1;
          listener.upZ.value = 0;
        } else if (listener.setOrientation) {
          listener.setOrientation(0, 0, -1, 0, 1, 0);
        }
      } catch (e) {}
      // تهيئة نظام الملفات الصوتية الحقيقية
      if (typeof Sounds !== 'undefined') Sounds.init(ctx, masterGain);
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  // --- تحديث موقع/اتجاه المستمع من كاميرا A-Frame ---
  // يُستدعى كل إطار من vr-environment
  const _v = { x: 0, y: 0, z: 0 };
  const _f = { x: 0, y: 0, z: -1 };
  const _u = { x: 0, y: 1, z: 0 };
  function updateListener(object3D) {
    if (!ctx || !listener || !object3D) return;
    try {
      object3D.updateMatrixWorld();
      const m = object3D.matrixWorld.elements;
      // الموضع
      _v.x = m[12]; _v.y = m[13]; _v.z = m[14];
      // forward = -Z من المصفوفة
      _f.x = -m[8]; _f.y = -m[9]; _f.z = -m[10];
      // up = +Y
      _u.x = m[4]; _u.y = m[5]; _u.z = m[6];

      const t = ctx.currentTime;
      if (listener.positionX) {
        listener.positionX.setValueAtTime(_v.x, t);
        listener.positionY.setValueAtTime(_v.y, t);
        listener.positionZ.setValueAtTime(_v.z, t);
        listener.forwardX.setValueAtTime(_f.x, t);
        listener.forwardY.setValueAtTime(_f.y, t);
        listener.forwardZ.setValueAtTime(_f.z, t);
        listener.upX.setValueAtTime(_u.x, t);
        listener.upY.setValueAtTime(_u.y, t);
        listener.upZ.setValueAtTime(_u.z, t);
      } else if (listener.setPosition) {
        listener.setPosition(_v.x, _v.y, _v.z);
        listener.setOrientation(_f.x, _f.y, _f.z, _u.x, _u.y, _u.z);
      }
    } catch (e) {}
  }

  function _makePanner(pos) {
    const sp = (CONFIG.audio && CONFIG.audio.spatial) || {};
    const p = ctx.createPanner();
    try {
      p.panningModel = sp.hrtf === false ? 'equalpower' : 'HRTF';
    } catch (e) { p.panningModel = 'equalpower'; }
    p.distanceModel = 'inverse';
    p.refDistance = sp.refDistance || 1;
    p.rolloffFactor = sp.rolloff || 1.5;
    p.maxDistance = sp.maxDistance || 30;
    const t = ctx.currentTime;
    if (p.positionX) {
      p.positionX.setValueAtTime(pos.x, t);
      p.positionY.setValueAtTime(pos.y, t);
      p.positionZ.setValueAtTime(pos.z, t);
    } else if (p.setPosition) {
      p.setPosition(pos.x, pos.y, pos.z);
    }
    return p;
  }

  // --- نغمة (مكانية إذا تم تمرير position، غير ذلك عامة) ---
  function tone(freq, duration, type = 'sine', volume, position) {
    if (!enabled || !ctx) return;
    const vol = volume ?? CONFIG.audio.toneVolume;
    try {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.08);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);
      osc.connect(gain);
      if (position) {
        const panner = _makePanner(position);
        gain.connect(panner);
        panner.connect(masterGain);
      } else {
        gain.connect(masterGain);
      }
      osc.start();
      osc.stop(ctx.currentTime + duration);
      activeNodes.push(osc);
      osc.onended = () => {
        const i = activeNodes.indexOf(osc);
        if (i >= 0) activeNodes.splice(i, 1);
      };
    } catch (e) { /* silent fail */ }
  }

  // --- أكورد (عدة نغمات) من موقع واحد أو موزع ---
  function chord(notes, duration = 4, position) {
    notes.forEach((freq, i) => {
      setTimeout(() => tone(freq, duration, 'sine', 0.035, position), i * 180);
    });
  }

  // --- نغمة دخول المواجهة - من موقع الشخصية أمام المستخدم ---
  function playConfrontation() {
    if (!enabled) return;
    init();
    const pos = { x: 0, y: 1.6, z: -3 }; // أمام المستخدم
    tone(95, 3.5, 'sine', 0.05, pos);
    tone(143, 3.5, 'sine', 0.03, pos);
  }

  // --- مواقع موزعة في الحديقة لمصادر الصوت ---
  const GARDEN_SOURCES = [
    { x: -4, y: 2.5, z: -6 },  // شجرة يسار
    { x:  5, y: 3.0, z: -8 },  // شجرة يمين
    { x: -6, y: 2.8, z: -10 }, // شجرة بعيدة
    { x:  3, y: 2.5, z: -12 }, // شجرة بعيدة يمين
    { x:  0, y: 5.0, z:   2 }, // فوق وخلف (سماء)
  ];

  // --- أجواء التسامح (حديقة) - أصوات من اتجاهات متعددة ---
  function startForgivenessAmbient(phaseCheck) {
    if (!enabled) return;
    init();

    // إذا الملفات الحقيقية متاحة، استخدمها (تجربة فخمة)
    if (typeof Sounds !== 'undefined') {
      let usedReal = false;
      if (Sounds.isAvailable('forest')) {
        Sounds.play('forest', { loop: true, volume: 0.4, position: { x: 0, y: 4, z: -8 } });
        usedReal = true;
      }
      if (Sounds.isAvailable('birds')) {
        Sounds.play('birds', { loop: true, volume: 0.5, position: GARDEN_SOURCES[0] });
        Sounds.play('birds', { loop: true, volume: 0.35, position: GARDEN_SOURCES[2], rate: 1.1 });
        usedReal = true;
      }
      if (Sounds.isAvailable('wind')) {
        Sounds.play('wind', { loop: true, volume: 0.25, position: { x: 0, y: 6, z: 0 } });
        usedReal = true;
      }
      if (Sounds.isAvailable('water')) {
        Sounds.play('water', { loop: true, volume: 0.3, position: { x: -8, y: 0.5, z: -10 } });
        usedReal = true;
      }
      if (Sounds.isAvailable('bell')) {
        // جرس تأمل كل فترة
        const bellId = setInterval(() => {
          if (!phaseCheck()) { clearInterval(bellId); return; }
          Sounds.play('bell', { volume: 0.3, position: { x: 5, y: 3, z: -6 } });
        }, 12000);
        activeIntervals.push(bellId);
      }
      if (usedReal) return; // نكتفي بالأصوات الحقيقية
    }

    // === fallback: نغمات مولّدة ===
    const chords = [
      [261.63, 329.63, 392.00, 523.25],
      [293.66, 369.99, 440.00, 587.33],
      [349.23, 440.00, 523.25, 698.46],
    ];
    let i = 0;
    // كل نوتة من الأكورد من اتجاه مختلف
    chords[0].forEach((f, k) => {
      setTimeout(() => tone(f, 5, 'sine', 0.035, GARDEN_SOURCES[k % GARDEN_SOURCES.length]), k * 180);
    });

    const id = setInterval(() => {
      if (!phaseCheck()) { clearInterval(id); return; }
      const c = chords[i % chords.length];
      c.forEach((f, k) => {
        setTimeout(() => tone(f, 5, 'sine', 0.035, GARDEN_SOURCES[(k + i) % GARDEN_SOURCES.length]), k * 180);
      });
      // زقزقة عصافير من شجرة عشوائية
      const bird = GARDEN_SOURCES[Math.floor(Math.random() * 4)];
      setTimeout(() => {
        tone(2000 + Math.random() * 1000, 0.15, 'sine', 0.025, bird);
        setTimeout(() => tone(2500 + Math.random() * 800, 0.1, 'sine', 0.02, bird), 120);
      }, 800 + Math.random() * 2000);
      i++;
    }, 4200);

    activeIntervals.push(id);
  }

  // --- مواقع مصادر الانتقام (محيطة بالمستخدم) ---
  const REVENGE_SOURCES = [
    { x: -4, y: 1.0, z: -5 },
    { x:  4, y: 0.8, z: -4 },
    { x: -3, y: 0.5, z:  3 }, // خلف يسار
    { x:  3, y: 0.5, z:  2 }, // خلف يمين
    { x:  0, y: 1.5, z: -7 },
  ];

  // --- أجواء الانتقام (ظلام) ---
  function startRevengeAmbient(phaseCheck) {
    if (!enabled) return;
    init();

    if (typeof Sounds !== 'undefined') {
      let usedReal = false;
      if (Sounds.isAvailable('darkAmbient')) {
        Sounds.play('darkAmbient', { loop: true, volume: 0.55, position: { x: 0, y: 2, z: 0 } });
        usedReal = true;
      }
      if (Sounds.isAvailable('whispers')) {
        Sounds.play('whispers', { loop: true, volume: 0.4, position: REVENGE_SOURCES[2] });
        Sounds.play('whispers', { loop: true, volume: 0.35, position: REVENGE_SOURCES[3], rate: 0.9 });
        usedReal = true;
      }
      if (Sounds.isAvailable('heartbeat')) {
        Sounds.play('heartbeat', { loop: true, volume: 0.5, position: { x: 0, y: 1.5, z: 0 } });
        usedReal = true;
      }
      if (Sounds.isAvailable('glassBreak')) {
        Sounds.play('glassBreak', { volume: 0.6, position: REVENGE_SOURCES[0] });
        usedReal = true;
      }
      if (Sounds.isAvailable('thunder')) {
        const thId = setInterval(() => {
          if (!phaseCheck()) { clearInterval(thId); return; }
          const src = REVENGE_SOURCES[Math.floor(Math.random() * REVENGE_SOURCES.length)];
          Sounds.play('thunder', { volume: 0.5, position: src });
        }, 8000 + Math.random() * 4000);
        activeIntervals.push(thId);
      }
      if (usedReal) return;
    }

    // === fallback: نغمات مولّدة ===
    // تحطم أولي من اتجاهات متعددة
    for (let j = 0; j < 12; j++) {
      const src = REVENGE_SOURCES[j % REVENGE_SOURCES.length];
      setTimeout(() => tone(Math.random() * 3000 + 400, 0.1, 'sawtooth', 0.03, src), j * 40);
    }

    const id = setInterval(() => {
      if (!phaseCheck()) { clearInterval(id); return; }
      // همهمة منخفضة من خلف المستخدم
      const back = REVENGE_SOURCES[2 + Math.floor(Math.random() * 2)];
      tone(75 + Math.random() * 45, 2.2, 'sawtooth', 0.03, back);
      // طبقة أمامية مزعجة
      tone(115 + Math.random() * 55, 1.8, 'square', 0.022, REVENGE_SOURCES[4]);
      // طقطقات عشوائية موزعة
      setTimeout(() => {
        for (let j = 0; j < 4; j++) {
          const src = REVENGE_SOURCES[Math.floor(Math.random() * REVENGE_SOURCES.length)];
          tone(Math.random() * 4000 + 200, 0.04, 'square', 0.01, src);
        }
      }, Math.random() * 1800);
    }, 2800);

    activeIntervals.push(id);
  }

  function toggle() {
    enabled = !enabled;
    const el = document.getElementById('audioToggle');
    el.classList.toggle('muted', !enabled);
    if (!enabled) {
      stopAll();
      if (masterGain) masterGain.gain.setValueAtTime(0, ctx.currentTime);
    } else if (masterGain) {
      masterGain.gain.setValueAtTime(1, ctx.currentTime);
    }
  }

  function isEnabled() { return enabled; }

  // --- إيقاف كل الأصوات ---
  function stopAll() {
    activeIntervals.forEach(id => clearInterval(id));
    activeIntervals = [];
    activeNodes.forEach(o => { try { o.stop(); } catch (e) {} });
    activeNodes = [];
    if (typeof Sounds !== 'undefined') Sounds.stopAll();
  }

  return {
    init, toggle, isEnabled, tone, chord,
    playConfrontation, startForgivenessAmbient, startRevengeAmbient,
    stopAll, updateListener,
  };
})();
