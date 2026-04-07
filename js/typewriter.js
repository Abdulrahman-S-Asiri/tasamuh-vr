/* ============================================= */
/*  تأثير الكتابة حرف بحرف                        */
/* ============================================= */

const Typewriter = (() => {

  let activeInterval = null;

  /**
   * يكتب النص حرف بحرف في العنصر المحدد
   * @param {HTMLElement} el - العنصر
   * @param {string} text - النص
   * @param {Function} onDone - بعد الانتهاء
   */
  function type(el, text, onDone) {
    if (activeInterval) clearInterval(activeInterval);
    el.textContent = '';
    let i = 0;
    activeInterval = setInterval(() => {
      if (i >= text.length) {
        clearInterval(activeInterval);
        activeInterval = null;
        if (onDone) onDone();
        return;
      }
      el.textContent += text[i];
      i++;
    }, CONFIG.typewriterSpeed);
  }

  function stop() {
    if (activeInterval) {
      clearInterval(activeInterval);
      activeInterval = null;
    }
  }

  return { type, stop };
})();
