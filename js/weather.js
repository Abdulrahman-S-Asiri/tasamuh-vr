/* =========================================================
 *  weather.js — Dynamic weather + day/night cycle + reflections
 *  - Rain particles (InstancedMesh streaks)
 *  - Snow particles (drifting flakes)
 *  - Day/night cycle: sun position + sky colors interpolated
 *  - Reflector for water (mirror via THREE.Reflector)
 * ========================================================= */

/* global AFRAME, THREE */

// ---------------------------------------------------------------
// 1. Rain — vertical streaks via InstancedMesh
// ---------------------------------------------------------------
function buildRain(parent, count = 1500, area = 30) {
  const geo = new THREE.PlaneGeometry(0.015, 0.45);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xaaccee,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const inst = new THREE.InstancedMesh(geo, mat, count);
  const states = [];
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    states.push({
      x: (Math.random() - 0.5) * area * 2,
      z: (Math.random() - 0.5) * area * 2,
      y: Math.random() * 18,
      vy: 14 + Math.random() * 6,
    });
  }
  inst.userData.isRain = true;
  inst.userData.states = states;
  inst.userData.dummy = dummy;
  inst.userData.area = area;
  parent.add(inst);
  return inst;
}
window.buildRain = buildRain;

// ---------------------------------------------------------------
// 2. Snow — slow drifting flakes
// ---------------------------------------------------------------
function buildSnow(parent, count = 800, area = 30) {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(c);
  const geo = new THREE.PlaneGeometry(0.08, 0.08);
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false,
    side: THREE.DoubleSide
  });
  const inst = new THREE.InstancedMesh(geo, mat, count);
  const states = [];
  for (let i = 0; i < count; i++) {
    states.push({
      x: (Math.random() - 0.5) * area * 2,
      z: (Math.random() - 0.5) * area * 2,
      y: Math.random() * 18,
      vy: 0.6 + Math.random() * 0.6,
      sway: Math.random() * Math.PI * 2,
    });
  }
  inst.userData.isSnow = true;
  inst.userData.states = states;
  inst.userData.dummy = new THREE.Object3D();
  inst.userData.area = area;
  parent.add(inst);
  return inst;
}
window.buildSnow = buildSnow;

// Tick component drives both rain and snow that live anywhere in the scene
AFRAME.registerComponent('weather-tick', {
  init: function () {
    this._cam = null;
  },
  _camPos: function (out) {
    if (!this._cam) {
      const c = document.getElementById('vrCamera');
      if (c) this._cam = c.object3D;
    }
    if (this._cam) this._cam.getWorldPosition(out);
    return out;
  },
  tick: function (time, dt) {
    const step = Math.min(dt, 50) * 0.001;
    const camPos = this._camPos(new THREE.Vector3());
    this.el.object3D.traverse(o => {
      if (o.isInstancedMesh && o.userData.isRain) {
        const { states, dummy, area } = o.userData;
        for (let i = 0; i < states.length; i++) {
          const s = states[i];
          s.y -= s.vy * step;
          if (s.y < 0) {
            s.y = 18 + Math.random() * 4;
            s.x = camPos.x + (Math.random() - 0.5) * area * 2;
            s.z = camPos.z + (Math.random() - 0.5) * area * 2;
          }
          dummy.position.set(s.x, s.y, s.z);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          o.setMatrixAt(i, dummy.matrix);
        }
        o.instanceMatrix.needsUpdate = true;
      } else if (o.isInstancedMesh && o.userData.isSnow) {
        const { states, dummy, area } = o.userData;
        for (let i = 0; i < states.length; i++) {
          const s = states[i];
          s.y -= s.vy * step;
          s.sway += step * 1.5;
          if (s.y < 0) {
            s.y = 16 + Math.random() * 4;
            s.x = camPos.x + (Math.random() - 0.5) * area * 2;
            s.z = camPos.z + (Math.random() - 0.5) * area * 2;
          }
          dummy.position.set(
            s.x + Math.sin(s.sway) * 0.4,
            s.y,
            s.z + Math.cos(s.sway * 0.7) * 0.4
          );
          dummy.updateMatrix();
          o.setMatrixAt(i, dummy.matrix);
        }
        o.instanceMatrix.needsUpdate = true;
      }
    });
  }
});

// ---------------------------------------------------------------
// 3. Day/night cycle — interpolates sun position + sky colors
// ---------------------------------------------------------------
const DayNight = (() => {
  let active = false;
  let time = 0.35; // 0..1, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset
  let speed = 0.005; // per second
  let directional = null;
  let ambient = null;

  function _findLights() {
    const scene = document.querySelector('a-scene');
    if (!scene) return;
    scene.object3D.traverse(o => {
      if (o.isDirectionalLight && !directional) directional = o;
      if (o.isAmbientLight && !ambient) ambient = o;
    });
  }

  function _lerp(a, b, t) { return a + (b - a) * t; }
  function _lerpColor(c1, c2, t) {
    const r = _lerp(c1.r, c2.r, t);
    const g = _lerp(c1.g, c2.g, t);
    const b = _lerp(c1.b, c2.b, t);
    return new THREE.Color(r, g, b);
  }

  function start(initialT = 0.35) { active = true; time = initialT; _findLights(); }
  function stop() { active = false; }
  function setSpeed(s) { speed = s; }
  function setTime(t) { time = t; _apply(); }

  function _apply() {
    if (!directional) _findLights();
    // sun azimuth around the player, height = sin(2pi*time)
    const sunY = Math.sin(time * Math.PI * 2);
    const sunX = Math.cos(time * Math.PI * 2);
    if (directional) {
      directional.position.set(sunX * 80, Math.max(1, sunY * 70), -40);
      // intensity: bright at noon, off at midnight
      directional.intensity = Math.max(0.05, sunY) * 1.6;
      // warm at dawn/dusk
      const dawn = 1 - Math.abs(sunY); // close to horizon → 1
      directional.color.setRGB(1, _lerp(1, 0.65, dawn), _lerp(0.9, 0.35, dawn));
    }
    if (ambient) {
      ambient.intensity = 0.15 + Math.max(0, sunY) * 0.55;
    }
    // sky tint (find a-sky)
    const sky = document.getElementById('vrSky');
    if (sky) {
      const noon = new THREE.Color('#87CEEB');
      const dusk = new THREE.Color('#ff8855');
      const night = new THREE.Color('#0a0a25');
      let col;
      if (sunY > 0.2) col = noon;
      else if (sunY > -0.05) col = _lerpColor(dusk, noon, (sunY + 0.05) / 0.25);
      else col = _lerpColor(night, dusk, Math.max(0, (sunY + 0.5) / 0.45));
      sky.setAttribute('color', '#' + col.getHexString());
    }
  }

  function tick(dt) {
    if (!active) return;
    time = (time + speed * dt) % 1;
    _apply();
  }

  return { start, stop, setSpeed, setTime, tick, get time() { return time; } };
})();
window.DayNight = DayNight;

AFRAME.registerComponent('day-night-driver', {
  schema: { speed: { type: 'number', default: 0.01 } },
  init: function () {
    DayNight.setSpeed(this.data.speed);
    DayNight.start(0.35);
  },
  tick: function (time, dt) {
    DayNight.tick(dt * 0.001);
  }
});

// ---------------------------------------------------------------
// 4. Real water reflection via THREE.Reflector
// ---------------------------------------------------------------
function _ensureReflector(cb) {
  if (THREE.Reflector) { cb(); return; }
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/js/objects/Reflector.js';
  s.onload = cb;
  s.onerror = () => { console.warn('[reflector] load failed'); cb(); };
  document.head.appendChild(s);
}

function buildReflectiveWater(width = 4, length = 80, color = 0x223344) {
  const grp = new THREE.Group();
  const geo = new THREE.PlaneGeometry(width, length);
  // surface (animated) — use existing WaterFactory if present
  let surface = null;
  if (window.WaterFactory) surface = window.WaterFactory.build(width, length, color);
  if (surface) grp.add(surface);

  _ensureReflector(() => {
    if (!THREE.Reflector) return;
    const mirror = new THREE.Reflector(geo, {
      clipBias: 0.003,
      textureWidth: 512,
      textureHeight: 512,
      color: 0x889999,
    });
    mirror.rotation.x = -Math.PI / 2;
    mirror.position.y = -0.02;
    grp.add(mirror);
  });
  return grp;
}
window.buildReflectiveWater = buildReflectiveWater;

// ---------------------------------------------------------------
// 5. Stone path along the existing winding path
// ---------------------------------------------------------------
function buildStonePath(parent, segments = 30) {
  const geo = new THREE.BoxGeometry(0.6, 0.08, 0.55);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x8a7a6a, roughness: 0.95, metalness: 0
  });
  // try real PBR
  const pbr = window.Assets ? window.Assets.getCachedPBR('rock_ground') : null;
  if (pbr && pbr.map) {
    mat.map = pbr.map.clone();
    mat.map.repeat.set(1, 1);
    mat.normalMap = pbr.normalMap;
    mat.roughnessMap = pbr.roughnessMap;
    mat.color.set(0xffffff);
  }
  const inst = new THREE.InstancedMesh(geo, mat, segments * 5);
  const dummy = new THREE.Object3D();
  let n = 0;
  for (let i = 0; i < segments; i++) {
    const z = -i * 1.4;
    const cx = Math.sin(i * 0.4) * 2;
    for (let j = -2; j <= 2; j++) {
      dummy.position.set(cx + j * 0.65, 0.04, z + (Math.random() - 0.5) * 0.2);
      dummy.rotation.y = Math.random() * 0.5;
      const s = 0.85 + Math.random() * 0.4;
      dummy.scale.set(s, 1, s);
      dummy.updateMatrix();
      inst.setMatrixAt(n++, dummy.matrix);
    }
  }
  inst.count = n;
  inst.instanceMatrix.needsUpdate = true;
  inst.receiveShadow = true;
  parent.add(inst);
  return inst;
}
window.buildStonePath = buildStonePath;

// ---------------------------------------------------------------
// 6. Global Weather toggles — call from console or UI
//    Weather.rain(true|false), Weather.snow(true|false)
// ---------------------------------------------------------------
const Weather = (() => {
  let rainObj = null, snowObj = null;
  function _scene() { return document.querySelector('a-scene')?.object3D; }
  function rain(on) {
    const s = _scene(); if (!s) return;
    if (on && !rainObj) rainObj = buildRain(s, (window.QUALITY?window.QUALITY.n(1500):1500), 30);
    else if (!on && rainObj) { s.remove(rainObj); rainObj = null; }
  }
  function snow(on) {
    const s = _scene(); if (!s) return;
    if (on && !snowObj) snowObj = buildSnow(s, (window.QUALITY?window.QUALITY.n(800):800), 30);
    else if (!on && snowObj) { s.remove(snowObj); snowObj = null; }
  }
  function clear() { rain(false); snow(false); }
  return { rain, snow, clear };
})();
window.Weather = Weather;

// Keyboard shortcuts: R = toggle rain, N = toggle snow, T = jump time
window.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') {
    Weather._rainOn = !Weather._rainOn;
    Weather.rain(Weather._rainOn);
  } else if (e.key === 'n' || e.key === 'N') {
    Weather._snowOn = !Weather._snowOn;
    Weather.snow(Weather._snowOn);
  } else if (e.key === 't' || e.key === 'T') {
    if (window.DayNight) window.DayNight.setTime((window.DayNight.time + 0.15) % 1);
  }
});
