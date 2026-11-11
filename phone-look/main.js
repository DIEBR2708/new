import * as THREE from 'three';

const WORLD = 900;
const SEGMENTS = 160;
const MIN_ALT = 8;
// ~consumer-drone cruise (m/s class): fast, not jet-like; accel ramps to top speed
const MAX_SPEED = 16;
const ACCEL = 12;
const DRAG = 1.85;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x7eb6d9);
scene.fog = new THREE.FogExp2(0x9ec5dd, 0.00135);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.5, 2800);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xb8d7ff, 0x4a3a28, 0.55));
const sun = new THREE.DirectionalLight(0xfff0d4, 1.35);
sun.position.set(180, 320, 90);
scene.add(sun);
const fill = new THREE.DirectionalLight(0x8bb7ff, 0.28);
fill.position.set(-120, 80, -160);
scene.add(fill);

// --- procedural height / terrain -------------------------------------------------
function hash2(x, z) {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function smoothNoise(x, z) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi);
  const b = hash2(xi + 1, zi);
  const c = hash2(xi, zi + 1);
  const d = hash2(xi + 1, zi + 1);
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(a, b, u),
    THREE.MathUtils.lerp(c, d, u),
    v
  );
}

function fbm(x, z, octaves = 5) {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    value += amp * smoothNoise(x * freq, z * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return value / norm;
}

function ridged(x, z, octaves = 4) {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(smoothNoise(x * freq, z * freq) * 2 - 1);
    value += amp * n * n;
    norm += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return value / norm;
}

function terrainHeight(x, z) {
  const nx = x / WORLD;
  const nz = z / WORLD;
  const continent = fbm(nx * 2.2 + 10, nz * 2.2 + 4, 4);
  const mountains = ridged(nx * 4.5 + 2, nz * 4.5 + 7, 5);
  const hills = fbm(nx * 8 + 30, nz * 8 + 12, 3);
  const detail = fbm(nx * 22, nz * 22, 2);

  // Deep valleys where continent is low; cliffs where ridge rises steeply
  let h = continent * 55 + mountains * mountains * 175 + hills * 28 + detail * 8;
  h -= Math.pow(Math.max(0, 0.42 - continent), 1.6) * 70; // carve valleys
  const cliff = Math.max(0, mountains - 0.62);
  h += cliff * cliff * 90;

  // Soft falloff toward world edges so the map reads as an island range
  const edge = Math.max(Math.abs(nx), Math.abs(nz));
  const skirt = THREE.MathUtils.smoothstep(0.78, 1.02, edge);
  h = THREE.MathUtils.lerp(h, -18, skirt);
  return h;
}

function colorForHeight(h, slope) {
  const c = new THREE.Color();
  if (h < 4) {
    c.setRGB(0.18, 0.28, 0.2);
  } else if (h < 28) {
    c.setRGB(0.22, 0.42, 0.2);
  } else if (h < 70) {
    c.setRGB(0.34, 0.48, 0.24);
  } else if (h < 115) {
    c.setRGB(0.45, 0.4, 0.3);
  } else if (h < 155) {
    c.setRGB(0.55, 0.52, 0.48);
  } else {
    c.setRGB(0.92, 0.94, 0.97);
  }
  if (slope > 0.55) {
    c.lerp(new THREE.Color(0x5a534c), Math.min(1, (slope - 0.55) * 2.2));
  }
  if (slope > 0.82) {
    c.lerp(new THREE.Color(0x3d3a38), Math.min(1, (slope - 0.82) * 3));
  }
  return c;
}

const terrainGeo = new THREE.PlaneGeometry(WORLD, WORLD, SEGMENTS, SEGMENTS);
terrainGeo.rotateX(-Math.PI / 2);
const pos = terrainGeo.attributes.position;
const colors = new Float32Array(pos.count * 3);
const heightSamples = new Float32Array((SEGMENTS + 1) * (SEGMENTS + 1));

for (let i = 0; i < pos.count; i++) {
  const x = pos.getX(i);
  const z = pos.getZ(i);
  const h = terrainHeight(x, z);
  pos.setY(i, h);
  const ix = i % (SEGMENTS + 1);
  const iz = Math.floor(i / (SEGMENTS + 1));
  heightSamples[iz * (SEGMENTS + 1) + ix] = h;
}

pos.needsUpdate = true;
terrainGeo.computeVertexNormals();
const normals = terrainGeo.attributes.normal;

for (let i = 0; i < pos.count; i++) {
  const h = pos.getY(i);
  const nx = normals.getX(i);
  const ny = normals.getY(i);
  const nz = normals.getZ(i);
  const slope = 1 - Math.max(0, Math.min(1, ny));
  const c = colorForHeight(h, slope + Math.abs(nx) * 0.15 + Math.abs(nz) * 0.1);
  colors[i * 3] = c.r;
  colors[i * 3 + 1] = c.g;
  colors[i * 3 + 2] = c.b;
}
terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

const terrain = new THREE.Mesh(
  terrainGeo,
  new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.02,
    flatShading: false,
  })
);
terrain.receiveShadow = false;
scene.add(terrain);

// Lake / valley water plate
const water = new THREE.Mesh(
  new THREE.PlaneGeometry(WORLD * 0.72, WORLD * 0.72),
  new THREE.MeshStandardMaterial({
    color: 0x2f6f88,
    roughness: 0.18,
    metalness: 0.35,
    transparent: true,
    opacity: 0.82,
  })
);
water.rotation.x = -Math.PI / 2;
water.position.y = 2.5;
scene.add(water);

function sampleTerrain(x, z) {
  const half = WORLD * 0.5;
  const u = THREE.MathUtils.clamp((x + half) / WORLD, 0, 1);
  const v = THREE.MathUtils.clamp((z + half) / WORLD, 0, 1);
  const fx = u * SEGMENTS;
  const fz = v * SEGMENTS;
  const x0 = Math.floor(fx);
  const z0 = Math.floor(fz);
  const x1 = Math.min(SEGMENTS, x0 + 1);
  const z1 = Math.min(SEGMENTS, z0 + 1);
  const tx = fx - x0;
  const tz = fz - z0;
  const stride = SEGMENTS + 1;
  const h00 = heightSamples[z0 * stride + x0];
  const h10 = heightSamples[z0 * stride + x1];
  const h01 = heightSamples[z1 * stride + x0];
  const h11 = heightSamples[z1 * stride + x1];
  const hx0 = THREE.MathUtils.lerp(h00, h10, tx);
  const hx1 = THREE.MathUtils.lerp(h01, h11, tx);
  return THREE.MathUtils.lerp(hx0, hx1, tz);
}

// Soft sky dome (cheap gradient via vertex colors)
{
  const skyGeo = new THREE.SphereGeometry(2400, 24, 16);
  const skyColors = new Float32Array(skyGeo.attributes.position.count * 3);
  const skyPos = skyGeo.attributes.position;
  const zenith = new THREE.Color(0x5ea6d8);
  const horizon = new THREE.Color(0xd7e8f4);
  const tmp = new THREE.Color();
  for (let i = 0; i < skyPos.count; i++) {
    const y = skyPos.getY(i) / 2400;
    tmp.copy(horizon).lerp(zenith, THREE.MathUtils.clamp(y * 0.85 + 0.35, 0, 1));
    skyColors[i * 3] = tmp.r;
    skyColors[i * 3 + 1] = tmp.g;
    skyColors[i * 3 + 2] = tmp.b;
  }
  skyGeo.setAttribute('color', new THREE.BufferAttribute(skyColors, 3));
  const sky = new THREE.Mesh(
    skyGeo,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false, fog: false })
  );
  scene.add(sky);
}

// --- device orientation (kept) ---------------------------------------------------
const enableBtn = document.getElementById('enable');
const recenterBtn = document.getElementById('recenter');
let orientationEnabled = false;
let deviceAlpha = 0;
let deviceBeta = 0;
let deviceGamma = 0;

const zee = new THREE.Vector3(0, 0, 1);
const euler = new THREE.Euler();
const q0 = new THREE.Quaternion();
const q1 = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);
const qDevice = new THREE.Quaternion();
const qRefInv = new THREE.Quaternion();

async function preferLandscape() {
  try {
    if (screen.orientation && typeof screen.orientation.lock === 'function') {
      await screen.orientation.lock('landscape');
    }
  } catch (_) {
    // Browser may require fullscreen or deny lock; CSS still prefers landscape.
  }
}

preferLandscape();

function screenOrientationRad() {
  const angle = (screen.orientation && typeof screen.orientation.angle === 'number')
    ? screen.orientation.angle
    : (typeof window.orientation === 'number' ? window.orientation : 0);
  return THREE.MathUtils.degToRad(angle);
}

function deviceQuaternionInto(target) {
  const alpha = THREE.MathUtils.degToRad(deviceAlpha);
  const beta = THREE.MathUtils.degToRad(deviceBeta);
  const gamma = THREE.MathUtils.degToRad(deviceGamma);
  const orient = screenOrientationRad();

  euler.set(beta, alpha, -gamma, 'YXZ');
  target.setFromEuler(euler);
  target.multiply(q1);
  target.multiply(q0.setFromAxisAngle(zee, -orient));
}

function applyDeviceOrientation() {
  deviceQuaternionInto(qDevice);
  camera.quaternion.copy(qRefInv).multiply(qDevice);
}

function recenter() {
  preferLandscape();
  deviceQuaternionInto(qDevice);
  qRefInv.copy(qDevice).invert();
  applyDeviceOrientation();
}

recenterBtn.addEventListener('click', recenter);

function onDeviceOrientation(event) {
  if (event.alpha == null || event.beta == null || event.gamma == null) return;
  deviceAlpha = event.alpha;
  deviceBeta = event.beta;
  deviceGamma = event.gamma;
  orientationEnabled = true;
  enableBtn.style.display = 'none';
}

function needsOrientationPermission() {
  return typeof DeviceOrientationEvent !== 'undefined'
    && typeof DeviceOrientationEvent.requestPermission === 'function';
}

async function enableOrientation() {
  try {
    await preferLandscape();
    if (needsOrientationPermission()) {
      const state = await DeviceOrientationEvent.requestPermission();
      if (state !== 'granted') return;
    }
    window.addEventListener('deviceorientation', onDeviceOrientation, true);
    enableBtn.style.display = 'none';
  } catch (_) {
    // Permission denied or unavailable — keep the tap control.
  }
}

if (needsOrientationPermission()) {
  enableBtn.style.display = 'flex';
  enableBtn.addEventListener('click', enableOrientation, { once: true });
} else if (typeof DeviceOrientationEvent !== 'undefined') {
  window.addEventListener('deviceorientation', onDeviceOrientation, true);
}

// --- flight stick (single move stick; climb/descend via look pitch) --------------
const moveInput = { x: 0, y: 0 };

function bindStick(el, state) {
  const knob = el.querySelector('.stick-knob');
  const radius = 34;
  let activeId = null;

  function setKnob(x, y) {
    knob.style.transform = `translate(${x}px, ${y}px)`;
  }

  function updateFromEvent(e) {
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const len = Math.hypot(dx, dy) || 1;
    const clamped = Math.min(len, radius);
    dx = (dx / len) * clamped;
    dy = (dy / len) * clamped;
    state.x = dx / radius;
    state.y = -dy / radius;
    setKnob(dx, dy);
  }

  function clear() {
    state.x = 0;
    state.y = 0;
    setKnob(0, 0);
    activeId = null;
  }

  el.addEventListener('pointerdown', (e) => {
    activeId = e.pointerId;
    el.setPointerCapture(e.pointerId);
    updateFromEvent(e);
    e.preventDefault();
  });
  el.addEventListener('pointermove', (e) => {
    if (activeId !== e.pointerId) return;
    updateFromEvent(e);
  });
  el.addEventListener('pointerup', (e) => {
    if (activeId !== e.pointerId) return;
    clear();
  });
  el.addEventListener('pointercancel', clear);
}

bindStick(document.getElementById('stick-move'), moveInput);

// --- drone state -----------------------------------------------------------------
const velocity = new THREE.Vector3();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const wish = new THREE.Vector3();
const dronePos = new THREE.Vector3(0, 90, 140);

// Start above a scenic overlook
dronePos.y = Math.max(sampleTerrain(dronePos.x, dronePos.z) + 55, 70);
camera.position.copy(dronePos);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let lastT = performance.now();

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;

  if (orientationEnabled) applyDeviceOrientation();

  // Move relative to current look (device orientation = drone attitude)
  camera.getWorldDirection(forward);
  right.crossVectors(forward, camera.up).normalize();
  // Strafe stays horizontal; forward uses full look vector (pitch climbs/descends)
  const rightFlat = right.clone().setY(0);
  if (rightFlat.lengthSq() > 1e-6) rightFlat.normalize();
  else rightFlat.set(1, 0, 0);

  wish.set(0, 0, 0);
  wish.addScaledVector(forward, moveInput.y);
  wish.addScaledVector(rightFlat, moveInput.x);
  if (wish.lengthSq() > 1) wish.normalize();

  velocity.addScaledVector(wish, ACCEL * dt);

  const damp = Math.exp(-DRAG * dt);
  velocity.multiplyScalar(damp);

  const speed = velocity.length();
  if (speed > MAX_SPEED) velocity.multiplyScalar(MAX_SPEED / speed);

  dronePos.addScaledVector(velocity, dt);

  const ground = sampleTerrain(dronePos.x, dronePos.z);
  const floorY = ground + MIN_ALT;
  if (dronePos.y < floorY) {
    dronePos.y = floorY;
    if (velocity.y < 0) velocity.y = 0;
  }
  // Soft world bounds
  const bound = WORLD * 0.46;
  dronePos.x = THREE.MathUtils.clamp(dronePos.x, -bound, bound);
  dronePos.z = THREE.MathUtils.clamp(dronePos.z, -bound, bound);
  dronePos.y = Math.min(dronePos.y, 320);

  camera.position.copy(dronePos);
  renderer.render(scene, camera);
}

animate(performance.now());
