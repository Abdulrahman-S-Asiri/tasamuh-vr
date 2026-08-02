/* ============================================= */
/*  نظام النطق - ملفات صوت إنسان حقيقي + TTS احتياطي */
/*                                                     */
/*  ضع تسجيلات M4A في:                                 */
/*    assets/voices/male/1.m4a   (الجملة الأولى ذكر)  */
/*    assets/voices/male/2.m4a                         */
/*    assets/voices/male/3.m4a                         */
/*    assets/voices/female/1.m4a (الجملة الأولى أنثى) */
/*    assets/voices/female/2.m4a                       */
/*    assets/voices/female/3.m4a                       */
/*    assets/voices/closing.m4a  (الخاتمة)            */
/*                                                     */
/*  مصادر صوت بشري واقعي (مدفوع/مجاني):              */
/*  - ElevenLabs (أفضل صوت عربي اصطناعي)              */
/*  - Fiverr/Khamsat: علّق صوتي عربي بـ$5-20         */
/*  - سجّل بنفسك بميكروفون                            */
/* ============================================= */

const Speech = (() => {

  let voicesLoaded = false;
  let textToFile = {}; // map: نص → [قائمة مسارات مرشّحة بالأولوية]
  let currentAudio = null;
  const available = {}; // path → bool

  // يجرّب كلا الامتدادين (.m4a و .mp3) لكل اسم أساسي
  function _variants(basePathNoExt) {
    return [basePathNoExt + '.m4a', basePathNoExt + '.mp3'];
  }

  function _probe(path) {
    return new Promise((resolve) => {
      const a = new window.Audio();
      a.addEventListener('canplaythrough', () => { available[path] = true; resolve(true); }, { once: true });
      a.addEventListener('error', () => { available[path] = false; resolve(false); }, { once: true });
      a.src = path;
      a.load();
    });
  }

  // يختار أول ملف متاح من قائمة مرشّحين، أو null لو ما فيه شي
  function _pickAvailable(candidates) {
    if (!candidates) return null;
    if (typeof candidates === 'string') return available[candidates] ? candidates : null;
    for (const p of candidates) {
      if (available[p]) return p;
    }
    return null;
  }

  function _buildMap() {
    // اربط كل جملة في CONFIG بقائمة مرشّحين (m4a ثم mp3)
    const m = CONFIG.text.confrontation_male || [];
    const f = CONFIG.text.confrontation_female || [];
    m.forEach((line, i) => { textToFile[line] = _variants(`assets/voices/male/${i + 1}`); });
    f.forEach((line, i) => { textToFile[line] = _variants(`assets/voices/female/${i + 1}`); });
    if (CONFIG.text.closingVoice) {
      textToFile[CONFIG.text.closingVoice] = _variants('assets/voices/closing');
    }
    // intro بعد دخول البوابة الأولى
    const tree = (CONFIG.decisionTree || {});
    if (tree.forgive && tree.forgive.intro) {
      textToFile[tree.forgive.intro] = _variants('assets/voices/forgive_intro');
    }
    if (tree.revenge && tree.revenge.intro) {
      textToFile[tree.revenge.intro] = _variants('assets/voices/revenge_intro');
    }
    // رسائل القرار الفرعي
    ['forgive', 'revenge'].forEach(key => {
      const node = tree[key];
      if (!node || !node.sub) return;
      node.sub.forEach(s => {
        if (s.message) textToFile[s.message] = _variants(`assets/voices/${key}_${s.id}`);
      });
    });
    // افحص كل المرشّحين بصمت
    Object.values(textToFile).forEach(paths => {
      (Array.isArray(paths) ? paths : [paths]).forEach(p => _probe(p));
    });
  }

  function init() {
    if ('speechSynthesis' in window) {
      speechSynthesis.getVoices();
      speechSynthesis.onvoiceschanged = () => {
        speechSynthesis.getVoices();
        voicesLoaded = true;
      };
    }
    _buildMap();
  }

  // boost لكل ملف — female القديمة ضعيفة، ElevenLabs طبيعية
  // نختار التضخيم حسب المسار
  function _gainFor(path) {
    // الملفات الأنثوية القديمة (.m4a) كانت ضعيفة جداً — تحتاج تضخيم عالي
    if (/\/female\/\d+\.m4a$/.test(path)) return { pre: 12.0, post: 1.5 };
    // باقي الملفات (ElevenLabs MP3 أو ملفات طبيعية المستوى) — تضخيم خفيف
    return { pre: 2.0, post: 1.2 };
  }

  function _playFile(path, onEnd, position) {
    try {
      currentAudio = new window.Audio(path);
      currentAudio.volume = 1.0;
      currentAudio.crossOrigin = 'anonymous';
      currentAudio.addEventListener('ended', () => { if (onEnd) onEnd(); }, { once: true });
      currentAudio.addEventListener('error', () => _fallbackTTS(null, onEnd), { once: true });

      // دائماً مرّر عبر Web Audio لتضخيم الصوت بقوة — حتى بدون موقع مكاني
      let webAudioOK = false;
      try {
        const ctx = window._sharedAudioCtx || (window._sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)());
        if (ctx.state === 'suspended') ctx.resume();
        const src = ctx.createMediaElementSource(currentAudio);

        const g = _gainFor(path);
        // preGain: تضخيم أولي حسب الملف
        const preGain = ctx.createGain(); preGain.gain.value = g.pre;
        // limiter ناعم: يمسك الذُرى فقط بدون تشويه
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -3; comp.knee.value = 4;
        comp.ratio.value = 8; comp.attack.value = 0.005; comp.release.value = 0.2;
        // postGain: makeup خفيف
        const postGain = ctx.createGain(); postGain.gain.value = g.post;

        src.connect(preGain); preGain.connect(comp); comp.connect(postGain);

        if (position) {
          const panner = ctx.createPanner();
          try { panner.panningModel = 'HRTF'; } catch (e) { panner.panningModel = 'equalpower'; }
          panner.distanceModel = 'inverse';
          panner.refDistance = 1; panner.rolloffFactor = 1.2; panner.maxDistance = 30;
          const t = ctx.currentTime;
          if (panner.positionX) {
            panner.positionX.setValueAtTime(position.x, t);
            panner.positionY.setValueAtTime(position.y, t);
            panner.positionZ.setValueAtTime(position.z, t);
          } else if (panner.setPosition) {
            panner.setPosition(position.x, position.y, position.z);
          }
          postGain.connect(panner); panner.connect(ctx.destination);
        } else {
          postGain.connect(ctx.destination);
        }
        webAudioOK = true;
      } catch (e) {
        // إذا فشل Web Audio (نادراً) — نرجع لتشغيل بدون تضخيم
      }

      // لو Web Audio ما اشتغل، احتياط: نشغل مباشرة بـ volume 1.0
      currentAudio.play().catch(() => _fallbackTTS(null, onEnd));
      return true;
    } catch (e) {
      return false;
    }
  }

  function _fallbackTTS(text, onEnd) {
    // مدة احتياطية مقدّرة بناء على طول النص (لتقدّم المسلسل حتى لو TTS ما اشتغل)
    const estimated = Math.max(1500, (text || '').length * 90);
    let done = false;
    const finish = () => { if (done) return; done = true; if (onEnd) onEnd(); };
    const failsafe = setTimeout(finish, estimated + 800);

    if (!text || !('speechSynthesis' in window)) {
      return; // failsafe سيتولى الإنهاء
    }
    try {
      speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang  = CONFIG.audio.speechLang;
      utt.rate  = CONFIG.audio.speechRate;
      utt.pitch = CONFIG.audio.speechPitch;
      const voices = speechSynthesis.getVoices();
      const arabic = voices.find(v => v.lang.startsWith('ar'));
      if (arabic) utt.voice = arabic;
      utt.onend   = () => { clearTimeout(failsafe); finish(); };
      utt.onerror = () => { clearTimeout(failsafe); finish(); };
      speechSynthesis.speak(utt);
    } catch (e) {
      // failsafe سيتولى الإنهاء
    }
  }

  function speak(text, onEnd, opts) {
    if (!Audio.isEnabled()) {
      if (onEnd) setTimeout(onEnd, 2500);
      return;
    }
    stop();
    opts = opts || {};

    const file = _pickAvailable(textToFile[text]);
    if (file) {
      _playFile(file, onEnd, opts.position);
      return;
    }
    _fallbackTTS(text, onEnd);
  }

  function stop() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    if (currentAudio) { try { currentAudio.pause(); } catch (e) {} currentAudio = null; }
  }

  return { init, speak, stop };
})();
