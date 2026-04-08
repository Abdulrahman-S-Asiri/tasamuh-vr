/* ============================================= */
/*  التحكم ببيئات الواقع الافتراضي (A-Frame)      */
/*  + مزامنة المستمع الصوتي مع الكاميرا           */
/* ============================================= */

const VREnv = (() => {

  let listenerRAF = null;

  function _setFog(color, density) {
    const scene = document.getElementById('vrScene');
    if (scene) scene.setAttribute('fog', `type: exponential; color: ${color}; density: ${density}`);
  }

  function _setVisible(id, v) {
    const el = document.getElementById(id);
    if (el) el.setAttribute('visible', v ? 'true' : 'false');
  }

  function showNeutral() {
    const sky = document.getElementById('vrSky');
    if (sky) sky.setAttribute('color', '#1a1a25');
    _setVisible('env-neutral', true);
    _setVisible('env-garden', false);
    _setVisible('env-dark', false);
    _setFog('#1a1a25', 0.05);
    if (window.applyEnvironmentHDRI) window.applyEnvironmentHDRI('neutral');
    if (window.AudioPro) window.AudioPro.setEnvironment('neutral');
  }

  function showSilhouette(v) { _setVisible('vr-silhouette', v); }
  function showPortals(v)    { _setVisible('vr-portals', v); }

  function showGarden() {
    const sky = document.getElementById('vrSky');
    if (sky) sky.setAttribute('color', '#87CEEB');
    _setVisible('env-neutral', false);
    _setVisible('env-garden', true);
    _setVisible('env-dark', false);
    _setFog('#cfe8ff', 0.018);
    if (window.applyEnvironmentHDRI) window.applyEnvironmentHDRI('garden');
    if (window.AudioPro) window.AudioPro.setEnvironment('garden');
  }

  function showDark() {
    const sky = document.getElementById('vrSky');
    if (sky) sky.setAttribute('color', '#1a0000');
    _setVisible('env-neutral', false);
    _setVisible('env-garden', false);
    _setVisible('env-dark', true);
    _setFog('#1a0000', 0.06);
    if (window.applyEnvironmentHDRI) window.applyEnvironmentHDRI('dark');
    if (window.AudioPro) window.AudioPro.setEnvironment('dark');
  }

  function reset() {
    const sky = document.getElementById('vrSky');
    const garden = document.getElementById('env-garden');
    const dark = document.getElementById('env-dark');

    if (sky) sky.setAttribute('color', '#0a0a0f');
    if (garden) garden.setAttribute('visible', 'false');
    if (dark) dark.setAttribute('visible', 'false');
    _setFog('#0a0a0f', 0.02);
  }

  // --- مزامنة AudioListener مع كاميرا A-Frame كل إطار ---
  function startListenerSync() {
    const cam = document.getElementById('vrCamera');
    if (!cam) return;
    const tick = () => {
      if (cam.object3D && typeof Audio !== 'undefined' && Audio.updateListener) {
        Audio.updateListener(cam.object3D);
      }
      listenerRAF = requestAnimationFrame(tick);
    };
    const begin = () => tick();
    if (cam.hasLoaded) begin();
    else cam.addEventListener('loaded', begin);
  }

  function stopListenerSync() {
    if (listenerRAF) cancelAnimationFrame(listenerRAF);
    listenerRAF = null;
  }

  return { showGarden, showDark, showNeutral, showSilhouette, showPortals, reset, startListenerSync, stopListenerSync };
})();
