/* ============================================= */
/*  نظام تحميل الأصوات الحقيقية (ملفات MP3)        */
/*  مع fallback للنغمات المولّدة عند الفشل        */
/* ============================================= */

const Sounds = (() => {
  const BASE = 'assets/sounds/';

  // قائمة الأصوات المتاحة
  const FILES = {
    birds:        BASE + 'birds.mp3',
    wind:         BASE + 'wind.mp3',
    forest:       BASE + 'forest.mp3',
    water:        BASE + 'water.mp3',
    footsteps:    BASE + 'footsteps.mp3',
    heartbeat:    BASE + 'heartbeat.mp3',
    thunder:      BASE + 'thunder.mp3',
    glassBreak:   BASE + 'glass-break.mp3',
    darkAmbient:  BASE + 'dark-ambient.mp3',
    whispers:     BASE + 'whispers.mp3',
    bell:         BASE + 'bell.mp3',
  };

  const loaded = {};   // name -> HTMLAudioElement (المرجع الأصلي)
  const sources = {};  // name -> MediaElementAudioSourceNode
  const playing = [];  // مراجع للعناصر المشغلة الآن (للإيقاف)
  let ctxRef = null;
  let masterGainRef = null;

  function init(ctx, masterGain) {
    ctxRef = ctx;
    masterGainRef = masterGain;
    // فحص وجود الملفات
    Object.keys(FILES).forEach(name => {
      const a = new window.Audio();
      a.preload = 'auto';
      a.src = FILES[name];
      a.addEventListener('canplaythrough', () => { loaded[name] = true; }, { once: true });
      a.addEventListener('loadeddata',     () => { loaded[name] = true; }, { once: true });
      a.addEventListener('error',          () => { loaded[name] = false; }, { once: true });
      a.load();
    });
  }

  function isAvailable(name) { return loaded[name] === true; }

  function _ensureSource(name) {
    if (!loaded[name] || !ctxRef) return null;
    if (sources[name]) return sources[name];
    try {
      const src = ctxRef.createMediaElementSource(loaded[name]);
      sources[name] = src;
      return src;
    } catch (e) { return null; }
  }

  /**
   * شغّل صوتاً حقيقياً من موقع مكاني (HRTF panning)
   * @param {string} name - اسم الصوت
   * @param {object} opts - { position, volume, loop, rate }
   * @returns {HTMLAudioElement|null}
   */
  function play(name, opts = {}) {
    if (loaded[name] !== true) return null;
    const sp = (CONFIG.audio && CONFIG.audio.spatial) || {};

    // عنصر جديد لكل تشغيلة (يسمح بطبقات متعددة)
    const node = new window.Audio(FILES[name]);
    node.volume = opts.volume ?? 0.6;
    node.loop = !!opts.loop;
    if (opts.rate) node.playbackRate = opts.rate;

    // محاولة ربط Web Audio panning (قد تفشل على iOS)
    if (ctxRef && opts.position) {
      try {
        const src = ctxRef.createMediaElementSource(node);
        const gain = ctxRef.createGain();
        gain.gain.value = opts.volume ?? 0.6;
        const panner = ctxRef.createPanner();
        try { panner.panningModel = sp.hrtf === false ? 'equalpower' : 'HRTF'; }
        catch (e) { panner.panningModel = 'equalpower'; }
        panner.distanceModel = 'inverse';
        panner.refDistance = sp.refDistance || 1;
        panner.rolloffFactor = sp.rolloff || 1.5;
        panner.maxDistance = sp.maxDistance || 60;
        const t = ctxRef.currentTime;
        if (panner.positionX) {
          panner.positionX.setValueAtTime(opts.position.x, t);
          panner.positionY.setValueAtTime(opts.position.y, t);
          panner.positionZ.setValueAtTime(opts.position.z, t);
        } else if (panner.setPosition) {
          panner.setPosition(opts.position.x, opts.position.y, opts.position.z);
        }
        src.connect(gain);
        gain.connect(panner);
        panner.connect(masterGainRef || ctxRef.destination);
        node.volume = 1.0; // التحكم بالـ gain بدلاً منه
      } catch (e) {
        // فشل: نشغّل العنصر مباشرة بدون panning (الصوت سيكون ستيريو عادي)
      }
    }

    node.play().catch((err) => { console.warn('[Sounds] play failed:', name, err); });
    playing.push(node);
    if (!opts.loop) {
      node.addEventListener('ended', () => {
        const i = playing.indexOf(node);
        if (i >= 0) playing.splice(i, 1);
      }, { once: true });
    }
    return node;
  }

  function stopAll() {
    playing.forEach(n => { try { n.pause(); n.currentTime = 0; } catch (e) {} });
    playing.length = 0;
  }

  return { init, play, isAvailable, stopAll, FILES };
})();
