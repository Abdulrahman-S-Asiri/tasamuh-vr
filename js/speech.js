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
  let textToFile = {}; // map: نص → مسار ملف
  let currentAudio = null;
  const available = {}; // path → bool

  function _probe(path) {
    return new Promise((resolve) => {
      const a = new window.Audio();
      a.addEventListener('canplaythrough', () => { available[path] = true; resolve(true); }, { once: true });
      a.addEventListener('error', () => { available[path] = false; resolve(false); }, { once: true });
      a.src = path;
      a.load();
    });
  }

  function _buildMap() {
    // اربط كل جملة في CONFIG بملفها
    const m = CONFIG.text.confrontation_male || [];
    const f = CONFIG.text.confrontation_female || [];
    m.forEach((line, i) => { textToFile[line] = `assets/voices/male/${i + 1}.m4a`; });
    f.forEach((line, i) => { textToFile[line] = `assets/voices/female/${i + 1}.m4a`; });
    if (CONFIG.text.closingVoice) {
      textToFile[CONFIG.text.closingVoice] = 'assets/voices/closing.m4a';
    }
    // افحص كل الملفات بصمت
    Object.values(textToFile).forEach(p => _probe(p));
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

  // boost موحّد للتسجيلات البشرية (بعضها منخفض المستوى)
  // female voices recorded quietly; boost via GainNode + Compressor to keep it safe
  const VOICE_BOOST = 3.5;

  function _playFile(path, onEnd, position) {
    try {
      currentAudio = new window.Audio(path);
      currentAudio.volume = 1.0;
      currentAudio.crossOrigin = 'anonymous';
      currentAudio.addEventListener('ended', () => { if (onEnd) onEnd(); }, { once: true });
      currentAudio.addEventListener('error', () => _fallbackTTS(null, onEnd), { once: true });

      // دائماً مرّر عبر Web Audio لتضخيم الصوت (boost) — حتى بدون موقع مكاني
      try {
        const ctx = window._sharedAudioCtx || (window._sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)());
        if (ctx.state === 'suspended') ctx.resume();
        const src = ctx.createMediaElementSource(currentAudio);
        const gain = ctx.createGain(); gain.gain.value = VOICE_BOOST;
        // Compressor يمنع التشويه عند رفع الـ gain
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -18; comp.knee.value = 20;
        comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.25;

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
          src.connect(gain); gain.connect(comp); comp.connect(panner); panner.connect(ctx.destination);
        } else {
          src.connect(gain); gain.connect(comp); comp.connect(ctx.destination);
        }
      } catch (e) {
        // إذا فشل Web Audio (مثلاً، src مُستخدم من قبل) — تشغيل عادي بدون boost
      }

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

    const file = textToFile[text];
    if (file && available[file]) {
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
