/* =========================================================
 *  audio-pro.js — Advanced audio
 *  - Procedural reverb (ConvolverNode with synthesized impulse)
 *  - Per-environment reverb presets (garden=open, dark=cavern)
 *  - Dynamic wind/ambient layer that intensifies with speed
 *  - Procedural music drone (oscillator pads) per environment
 * ========================================================= */

/* global AFRAME, THREE */

const AudioPro = (() => {
  let ctx = null;
  let masterGain = null;
  let convolver = null;
  let convolverWet = null;
  let convolverDry = null;
  let droneNodes = null;
  let droneGain = null;

  function _ctx() {
    if (ctx) return ctx;
    const A = window.AudioContext || window.webkitAudioContext;
    if (!A) return null;
    ctx = (window.Audio && window.Audio.ctx) ? window.Audio.ctx : new A();
    return ctx;
  }

  // Generate a synthetic impulse response (exponential decay noise)
  function _makeIR(durationSec, decay) {
    const c = _ctx();
    if (!c) return null;
    const len = Math.floor(c.sampleRate * durationSec);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  function init() {
    const c = _ctx();
    if (!c) return;
    if (masterGain) return;
    masterGain = c.createGain();
    masterGain.gain.value = 0.85;
    masterGain.connect(c.destination);

    convolver = c.createConvolver();
    convolver.buffer = _makeIR(2.5, 2.0);
    convolverWet = c.createGain();
    convolverWet.gain.value = 0.25;
    convolver.connect(convolverWet).connect(masterGain);
    convolverDry = c.createGain();
    convolverDry.gain.value = 1.0;
    convolverDry.connect(masterGain);

    droneGain = c.createGain();
    droneGain.gain.value = 0;
    droneGain.connect(convolverDry);
    droneGain.connect(convolver);
  }

  // Returns the input node downstream of which sounds should be routed
  function getInputNode() {
    init();
    return convolverDry;
  }
  function getReverbNode() {
    init();
    return convolver;
  }

  // Build a slow drone of detuned sine pads (procedural ambient music)
  function startDrone(rootHz = 110, type = 'sine') {
    init();
    if (!ctx || droneNodes) return;
    droneNodes = [];
    const intervals = [1, 1.5, 2, 2.5]; // octave-friendly
    intervals.forEach((mul, i) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = rootHz * mul;
      const g = ctx.createGain();
      g.gain.value = 0.05 + (i === 0 ? 0.07 : 0);
      // gentle LFO
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.05 + Math.random() * 0.1;
      const lfoG = ctx.createGain();
      lfoG.gain.value = 0.5 + Math.random() * 1.5;
      lfo.connect(lfoG).connect(o.frequency);
      o.connect(g).connect(droneGain);
      o.start();
      lfo.start();
      droneNodes.push({ o, g, lfo });
    });
    // fade in
    droneGain.gain.cancelScheduledValues(ctx.currentTime);
    droneGain.gain.linearRampToValueAtTime(0.7, ctx.currentTime + 4);
  }

  function stopDrone() {
    if (!ctx || !droneNodes) return;
    droneGain.gain.cancelScheduledValues(ctx.currentTime);
    droneGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 2);
    setTimeout(() => {
      droneNodes && droneNodes.forEach(n => { try { n.o.stop(); n.lfo.stop(); } catch(e){} });
      droneNodes = null;
    }, 2200);
  }

  function setEnvironment(env) {
    init();
    if (!ctx) return;
    if (env === 'garden') {
      convolver.buffer = _makeIR(2.5, 2.2);
      convolverWet.gain.linearRampToValueAtTime(0.22, ctx.currentTime + 1);
      stopDrone();
      setTimeout(() => startDrone(98, 'sine'), 300);
    } else if (env === 'dark') {
      convolver.buffer = _makeIR(4.5, 1.4); // longer cavernous tail
      convolverWet.gain.linearRampToValueAtTime(0.45, ctx.currentTime + 1);
      stopDrone();
      setTimeout(() => startDrone(58, 'sawtooth'), 300);
    } else if (env === 'neutral') {
      convolver.buffer = _makeIR(3.0, 1.8);
      convolverWet.gain.linearRampToValueAtTime(0.32, ctx.currentTime + 1);
      stopDrone();
      setTimeout(() => startDrone(73, 'triangle'), 300);
    }
  }

  return {
    init, getInputNode, getReverbNode,
    startDrone, stopDrone, setEnvironment
  };
})();
window.AudioPro = AudioPro;

// Auto-init on first user gesture
window.addEventListener('click', () => AudioPro.init(), { once: true });
window.addEventListener('keydown', () => AudioPro.init(), { once: true });
