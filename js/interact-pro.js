/* =========================================================
 *  interact-pro.js — Advanced interaction & controls
 *  - Run modifier (Shift on desktop, grip on Quest)
 *  - Tree-touch reaction (rustle + petal burst)
 *  - Haptic pulse on Quest controllers
 *  - Pickup/throw of small interactive objects via right hand
 * ========================================================= */

/* global AFRAME, THREE */

// ---------------------------------------------------------------
// 1. Run modifier — multiplies movement speed
// ---------------------------------------------------------------
AFRAME.registerComponent('run-modifier', {
  schema: {
    base: { type: 'number', default: 1.0 },
    multiplier: { type: 'number', default: 2.4 }
  },
  init: function () {
    this._running = false;
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Shift') this._setRunning(true);
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'Shift') this._setRunning(false);
    });
    // Quest grip buttons
    const left = document.getElementById('leftHand');
    const right = document.getElementById('rightHand');
    [left, right].forEach(h => {
      if (!h) return;
      h.addEventListener('gripdown', () => this._setRunning(true));
      h.addEventListener('gripup',   () => this._setRunning(false));
    });
  },
  _setRunning: function (run) {
    if (this._running === run) return;
    this._running = run;
    // Movement.js exposes a setSpeedMultiplier? otherwise patch directly
    if (window.Movement && typeof window.Movement.setSpeedMultiplier === 'function') {
      window.Movement.setSpeedMultiplier(run ? this.data.multiplier : 1);
    } else {
      // try to bump wasd-controls / movement-controls speed if present
      const cam = document.getElementById('vrCamera');
      const rig = document.getElementById('vrRig');
      [cam, rig].forEach(el => {
        if (!el) return;
        const wasd = el.components && el.components['wasd-controls'];
        if (wasd) {
          wasd.data.acceleration = (run ? 240 : 100);
          el.setAttribute('wasd-controls', 'acceleration', wasd.data.acceleration);
        }
        const mc = el.components && el.components['movement-controls'];
        if (mc) {
          mc.data.speed = (run ? 0.4 : 0.16);
          el.setAttribute('movement-controls', 'speed', mc.data.speed);
        }
      });
    }
  }
});

// ---------------------------------------------------------------
// 2. Haptic pulse helper
// ---------------------------------------------------------------
function hapticPulse(handId, intensity = 0.5, ms = 60) {
  const h = document.getElementById(handId);
  if (!h || !h.components) return;
  const tc = h.components['oculus-touch-controls'] || h.components['tracked-controls'];
  if (!tc || !tc.controller || !tc.controller.gamepad) return;
  const gp = tc.controller.gamepad;
  if (gp.hapticActuators && gp.hapticActuators[0]) {
    try { gp.hapticActuators[0].pulse(intensity, ms); } catch (e) {}
  }
}
window.hapticPulse = hapticPulse;

// ---------------------------------------------------------------
// 3. Tree-touch reaction — radius check around camera/hands
// ---------------------------------------------------------------
AFRAME.registerComponent('tree-touch', {
  schema: { radius: { type: 'number', default: 1.4 } },
  init: function () {
    this._lastTouch = 0;
    this._v = new THREE.Vector3();
    this._cam = null;
  },
  _getCam: function () {
    if (this._cam) return this._cam;
    const c = document.getElementById('vrCamera');
    if (c) this._cam = c.object3D;
    return this._cam;
  },
  tick: function (time) {
    if (time - this._lastTouch < 800) return;
    const cam = this._getCam();
    if (!cam) return;
    const camPos = cam.getWorldPosition(this._v);
    const trees = document.getElementById('garden-trees');
    if (!trees || !trees.object3D) return;
    let touched = null;
    trees.object3D.children.forEach(tree => {
      if (touched) return;
      const d = tree.position.distanceTo(camPos);
      if (d < this.data.radius) touched = tree;
    });
    if (touched) {
      this._lastTouch = time;
      this._rustle(touched);
    }
  },
  _rustle: function (tree) {
    // brief amplified sway
    tree.userData._rustleT = 600;
    tree.traverse(o => {
      if (o.userData && o.userData.sway) {
        o.userData._origRot = o.userData._origRot || { x: o.rotation.x, z: o.rotation.z };
      }
    });
    const t0 = performance.now();
    const animate = () => {
      const dt = performance.now() - t0;
      if (dt > 600) return;
      const k = (1 - dt / 600) * 0.18;
      tree.traverse(o => {
        if (o.userData && o.userData.sway && o.userData._origRot) {
          o.rotation.x = o.userData._origRot.x + Math.sin(dt * 0.03) * k;
          o.rotation.z = o.userData._origRot.z + Math.cos(dt * 0.025) * k * 0.8;
        }
      });
      requestAnimationFrame(animate);
    };
    animate();
    // haptic + sound
    hapticPulse('rightHand', 0.4, 80);
    hapticPulse('leftHand', 0.4, 80);
    if (window.Sounds && window.Sounds.play) {
      try { window.Sounds.play('forest', 0.3); } catch (e) {}
    }
  }
});

// ---------------------------------------------------------------
// 4. Right-hand pickup/throw
// ---------------------------------------------------------------
AFRAME.registerComponent('hand-grab', {
  init: function () {
    const hand = this.el;
    this._held = null;
    this._lastPos = new THREE.Vector3();
    this._velocity = new THREE.Vector3();

    const tryPick = () => {
      if (this._held) { this._release(); return; }
      const ray = hand.components && hand.components.raycaster;
      const targets = ray ? ray.intersections : null;
      if (targets && targets.length) {
        const t = targets[0].object;
        // walk up to a tagged grabbable
        let g = t;
        while (g && !(g.el && g.el.classList && g.el.classList.contains('grabbable'))) g = g.parent;
        if (g && g.el) this._grab(g.el);
      }
    };

    hand.addEventListener('triggerdown', tryPick);
    hand.addEventListener('triggerup', () => this._release());
    hand.addEventListener('click', tryPick);
  },
  _grab: function (el) {
    this._held = el;
    el._origParent = el.object3D.parent;
    this.el.object3D.attach(el.object3D);
    hapticPulse(this.el.id, 0.6, 50);
  },
  _release: function () {
    if (!this._held) return;
    const el = this._held;
    const parent = el._origParent || document.querySelector('a-scene').object3D;
    parent.attach(el.object3D);
    // toss with hand velocity
    if (el.components && el.components['dynamic-body']) {
      // not used here
    }
    hapticPulse(this.el.id, 0.3, 30);
    this._held = null;
  },
  tick: function () {
    if (!this._held) return;
    const cur = this.el.object3D.getWorldPosition(new THREE.Vector3());
    this._velocity.subVectors(cur, this._lastPos);
    this._lastPos.copy(cur);
  }
});
