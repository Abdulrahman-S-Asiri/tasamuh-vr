/* ============================================= */
/*  منطق التنقل بين المراحل                       */
/* ============================================= */

const Phases = (() => {

  /**
   * يفعّل مرحلة ويخفي الباقي
   * @param {string} phaseId - معرف المرحلة (بدون #)
   */
  function goTo(phaseId) {
    // أخفِ الكل
    document.querySelectorAll('.phase').forEach(el => {
      el.classList.remove('active');
    });

    // فعّل المرحلة الجديدة
    const phase = document.getElementById(phaseId);
    if (phase) {
      // انتظر frame واحد عشان الانتقال يشتغل
      requestAnimationFrame(() => {
        phase.classList.add('active');
      });
    }
  }

  /**
   * يحدّث شريط التقدم
   */
  function progress(percent) {
    const fill = document.getElementById('progressFill');
    if (fill) fill.style.width = percent + '%';
  }

  return { goTo, progress };
})();
