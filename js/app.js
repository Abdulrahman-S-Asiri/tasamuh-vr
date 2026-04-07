/* ============================================= */
/*  التطبيق الرئيسي - المتحكم بكل شي              */
/* ============================================= */

const App = (() => {

  // ===== الحالة =====
  let state = {
    gender: null,       // 'male' | 'female'
    phase: 'intro',     // المرحلة الحالية
    choice1: null,      // 'forgive' | 'revenge' | 'just' | 'ignore'
    choice2: null,      // الخيار الفرعي
  };

  // ===== Debug overlay (للجوال) =====
  function _debug(msg) {
    let el = document.getElementById('debugLog');
    if (!el) {
      el = document.createElement('div');
      el.id = 'debugLog';
      Object.assign(el.style, {
        position: 'fixed', top: '5px', right: '5px',
        zIndex: '99999', maxWidth: '60vw', maxHeight: '40vh', overflow: 'auto',
        background: 'rgba(0,0,0,0.75)', color: '#0f0',
        font: '11px monospace', padding: '6px', borderRadius: '4px',
        pointerEvents: 'none', whiteSpace: 'pre-wrap', direction: 'ltr',
      });
      document.body.appendChild(el);
    }
    el.textContent += msg + '\n';
    if (el.scrollHeight > 400) el.textContent = el.textContent.split('\n').slice(-20).join('\n');
  }
  window.addEventListener('error', (e) => _debug('ERR: ' + e.message + ' @' + (e.filename || '?') + ':' + e.lineno));

  // ===== التهيئة =====
  function init() {
    _debug('init started');
    // اسم المشروع
    setProjectName(CONFIG.projectName);

    // الجسيمات
    Particles.createIntro();

    // النطق
    Speech.init();

    // زر الصوت
    document.getElementById('audioToggle').addEventListener('click', Audio.toggle);

    // مزامنة المستمع الصوتي مع كاميرا VR (للصوت المكاني 360°)
    if (VREnv.startListenerSync) VREnv.startListenerSync();

    // بناء العالم الضخم إجرائياً
    if (typeof WorldBuilder !== 'undefined') {
      const scene = document.getElementById('vrScene');
      if (scene && scene.hasLoaded) WorldBuilder.buildAll();
      else if (scene) scene.addEventListener('loaded', () => WorldBuilder.buildAll());
    }

    // نظام الحركة
    if (typeof Movement !== 'undefined') { Movement.init(); _debug('Movement.init OK'); }
    _debug('Sounds=' + (typeof Sounds) + ' WB=' + (typeof WorldBuilder));

    // شريط التقدم
    Phases.progress(20);

    // أخفِ شاشة التحميل
    setTimeout(() => {
      document.getElementById('loading').classList.add('done');
    }, 1200);
  }

  // ===== تغيير اسم المشروع =====
  function setProjectName(name) {
    const el1 = document.getElementById('projectName');
    const el2 = document.getElementById('closingProject');
    if (el1) el1.textContent = name;
    if (el2) el2.textContent = name;
    document.title = name + ' - تجربة التسامح';
  }

  // موقع silhouette في العالم (يطابق index.html)
  const SILH_POS = { x: 0, y: 1.7, z: -5 };

  // ===== المرحلة 1 → داخل العالم =====
  function selectGender(g) {
    state.gender = g;
    state.phase = 'confrontation';
    Audio.init();
    Phases.progress(40);

    // أخفِ كل طبقات HTML الكبيرة
    document.querySelectorAll('.phase').forEach(el => el.classList.remove('active'));

    // ابدأ العالم المحايد + أظهر الـ joystick
    if (VREnv.showNeutral) VREnv.showNeutral();
    if (typeof Movement !== 'undefined') Movement.showJoystick();

    setTimeout(() => startConfrontation(), 600);
  }

  // ===== المواجهة داخل العالم =====
  function startConfrontation() {
    Audio.playConfrontation();
    if (VREnv.showSilhouette) VREnv.showSilhouette(true);

    const hud = document.getElementById('vrHud');
    const txt = document.getElementById('vrHudText');
    if (hud) hud.classList.add('active');

    const lines = CONFIG.text['confrontation_' + state.gender];
    let idx = 0;

    function next() {
      if (idx >= lines.length) {
        setTimeout(() => {
          if (hud) hud.classList.remove('active');
          if (VREnv.showSilhouette) VREnv.showSilhouette(false);
          Phases.progress(60);
          showDecision();
        }, CONFIG.timing.afterLastLine);
        return;
      }
      const line = lines[idx];
      Typewriter.type(txt, line, () => {
        Speech.speak(line, () => {
          idx++;
          setTimeout(next, CONFIG.timing.betweenLines);
        }, { position: SILH_POS });
      });
    }
    setTimeout(next, CONFIG.timing.confrontationStart);
  }

  // ===== القرار - الجولة 1 (4 بوّابات) =====
  function showDecision() {
    state.phase = 'decision1';
    if (VREnv.showPortals) VREnv.showPortals(true);

    const hud = document.getElementById('vrHud');
    const txt = document.getElementById('vrHudText');
    if (hud && txt) {
      txt.textContent = 'القرار بيدك — اختر البوّابة التي تمثّل موقفك';
      hud.classList.add('active');
    }

    const ids = ['just', 'forgive', 'ignore', 'revenge'];
    ids.forEach(id => {
      const el = document.getElementById('portal-' + id);
      if (!el) return;
      const cb = () => makeChoice1(id);
      el.addEventListener('click', cb, { once: true });
      el._cb = cb;
    });
  }

  // ===== الاختيار الأول → جولة وسيطة → جولة 2 =====
  function makeChoice1(choice) {
    _debug('choice1: ' + choice);
    state.choice1 = choice;
    state.phase = 'intermediate';
    if (VREnv.showPortals) VREnv.showPortals(false);

    const tree = CONFIG.decisionTree[choice];
    const hud = document.getElementById('vrHud');
    const txt = document.getElementById('vrHudText');
    if (hud && txt && tree) {
      txt.textContent = tree.intro;
      hud.classList.add('active');
    }
    Speech.speak(tree.intro, () => setTimeout(() => showDecision2(choice), 600));
    setTimeout(() => showDecision2(choice), 4500); // failsafe
  }

  // ===== القرار - الجولة 2 (3 بوّابات فرعية) =====
  let _decision2Shown = false;
  function showDecision2(parent) {
    if (_decision2Shown) return;
    _decision2Shown = true;
    state.phase = 'decision2';

    const tree = CONFIG.decisionTree[parent];
    if (!tree) return;
    const container = document.getElementById('vr-portals-2');
    if (!container) return;
    container.innerHTML = '';

    const positions = [{x:-5,z:-8},{x:0,z:-9},{x:5,z:-8}];
    tree.sub.forEach((opt, i) => {
      const p = positions[i] || positions[0];
      const ent = document.createElement('a-entity');
      ent.setAttribute('position', `${p.x} 1.7 ${p.z}`);
      ent.innerHTML = `
        <a-torus class="vr-clickable" radius="1.2" radius-tubular="0.07" color="${tree.color}"
                 material="emissive: ${tree.color}; emissiveIntensity: 0.85; metalness: 0.3"
                 animation="property: rotation; to: 0 360 0; loop: true; dur: 13000"></a-torus>
        <a-circle class="vr-clickable" radius="1.15"
                  material="color: #000; opacity: 0.5; transparent: true; emissive: ${tree.color}; emissiveIntensity: 0.35"></a-circle>
        <a-plane position="0 2.1 0" width="3.4" height="0.85"
                 material="transparent: true; alphaTest: 0.01; shader: flat" class="ar-label"
                 data-text="${opt.title}" data-color="#ffffff"></a-plane>
        <a-plane position="0 -1.7 0" width="3.6" height="0.55"
                 material="transparent: true; alphaTest: 0.01; shader: flat" class="ar-label"
                 data-text="${opt.desc}" data-color="#cbd5e1"></a-plane>
        <a-light type="point" color="${tree.color}" intensity="1.2" distance="7"
                 animation="property: intensity; from: 0.8; to: 1.6; dur: 1500; loop: true; dir: alternate"></a-light>
      `;
      const cb = () => makeChoice2(parent, opt.id);
      ent.addEventListener('click', cb);
      container.appendChild(ent);
    });
    container.setAttribute('visible', 'true');
    if (window.renderArabicLabels) setTimeout(window.renderArabicLabels, 100);

    const hud = document.getElementById('vrHud');
    const txt = document.getElementById('vrHudText');
    if (hud && txt) {
      txt.textContent = tree.intro + ' — اختر طريقتك';
      hud.classList.add('active');
    }
  }

  // ===== الاختيار الثاني → النتيجة النهائية =====
  function makeChoice2(parent, subId) {
    _debug('choice2: ' + parent + '/' + subId);
    state.choice2 = subId;
    const container = document.getElementById('vr-portals-2');
    if (container) container.setAttribute('visible', 'false');
    const tree = CONFIG.decisionTree[parent];
    const sub = tree.sub.find(s => s.id === subId);
    const result = {
      icon: tree.icon,
      title: tree.title + ' — ' + sub.title,
      quote: sub.quote,
      message: sub.message,
      env: tree.env,
    };
    _renderResult(result);
  }

  // alias للتوافق العكسي (tryOther)
  function makeChoice(choice) { makeChoice1(choice); }

  // ===== رسم النتيجة النهائية =====
  function _renderResult(t) {
    state.phase = 'result';
    Phases.progress(90);
    Particles.clearResult();
    Audio.stopAll();
    Speech.stop();
    const hud = document.getElementById('vrHud');
    if (hud) hud.classList.remove('active');

    if (t.env === 'garden') {
      VREnv.showGarden();
      Particles.createGarden();
      Audio.startForgivenessAmbient(() => state.phase === 'result');
    } else {
      VREnv.showDark();
      Particles.createShatter();
      Audio.startRevengeAmbient(() => state.phase === 'result');
    }
    // تفعيل NPCs والعناصر التفاعلية
    if (typeof Npcs !== 'undefined') Npcs.spawn(t.env);
    if (typeof Interactives !== 'undefined') Interactives.spawn(t.env);

    const inner = document.getElementById('resultHudInner');
    if (inner) {
      inner.innerHTML = `
        <h3>${t.icon} ${t.title}</h3>
        <p>${t.quote}</p>
        <p style="font-size:1rem;opacity:0.85">${t.message || ''}</p>
        <div class="hud-actions">
          <button class="hud-btn primary" onclick="App.restart()">${CONFIG.text.btnRestart}</button>
          <button class="hud-btn" onclick="App.showClosing()">${CONFIG.text.btnNext}</button>
        </div>
      `;
    }
    const resultHud = document.getElementById('resultHud');
    if (resultHud) resultHud.classList.add('active');
  }

  // ===== تجربة الخيار الآخر =====
  function tryOther() {
    restart();
  }

  // ===== المرحلة 5: الخاتمة =====
  function showClosing() {
    state.phase = 'closing';
    Phases.progress(100);

    Audio.stopAll();
    Speech.stop();
    VREnv.reset();
    Particles.createClosing();

    Phases.goTo('phase-closing');
    if (typeof Movement !== 'undefined') Movement.hideJoystick();

    setTimeout(() => {
      Speech.speak(CONFIG.text.closingVoice);
    }, CONFIG.timing.closingSpeechDelay);
  }

  // ===== إعادة التجربة =====
  function restart() {
    state = { gender: null, phase: 'intro', choice1: null, choice2: null };
    _decision2Shown = false;
    const c2 = document.getElementById('vr-portals-2');
    if (c2) { c2.innerHTML = ''; c2.setAttribute('visible','false'); }
    if (typeof Npcs !== 'undefined') Npcs.clear();
    if (typeof Interactives !== 'undefined') Interactives.clear();
    const rh = document.getElementById('resultHud');
    if (rh) rh.classList.remove('active');
    Phases.progress(20);

    Audio.stopAll();
    Speech.stop();
    Typewriter.stop();
    VREnv.reset();
    Particles.clearResult();

    Phases.goTo('phase-intro');
  }

  // ===== ابدأ =====
  window.addEventListener('DOMContentLoaded', init);

  // واجهة عامة
  return { selectGender, makeChoice, tryOther, showClosing, restart, setProjectName, _dbg: _debug };
})();
