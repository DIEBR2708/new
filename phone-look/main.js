import * as THREE from 'three';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a2230);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1.6, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.45));
const sun = new THREE.DirectionalLight(0xffffff, 0.9);
sun.position.set(3, 8, 2);
scene.add(sun);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.MeshStandardMaterial({ color: 0x2d3a4a })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const objects = [
  { geo: new THREE.BoxGeometry(1, 1, 1), color: 0xd96b4c, pos: [-2, 0.5, -4] },
  { geo: new THREE.SphereGeometry(0.6, 24, 16), color: 0x4cb5d9, pos: [2, 0.6, -5] },
  { geo: new THREE.BoxGeometry(0.8, 1.6, 0.8), color: 0x6bd94c, pos: [0, 0.8, -6] },
  { geo: new THREE.SphereGeometry(0.45, 20, 14), color: 0xd9c44c, pos: [-1.5, 0.45, -2.5] },
  { geo: new THREE.BoxGeometry(1.4, 0.4, 1.4), color: 0x9b6bd9, pos: [2.5, 0.2, -3] },
];

for (const o of objects) {
  const mesh = new THREE.Mesh(o.geo, new THREE.MeshStandardMaterial({ color: o.color }));
  mesh.position.set(...o.pos);
  scene.add(mesh);
}

const enableBtn = document.getElementById('enable');
let orientationEnabled = false;
let deviceAlpha = 0;
let deviceBeta = 0;
let deviceGamma = 0;

const zee = new THREE.Vector3(0, 0, 1);
const euler = new THREE.Euler();
const q0 = new THREE.Quaternion();
const q1 = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);

function screenOrientationRad() {
  const angle = (screen.orientation && typeof screen.orientation.angle === 'number')
    ? screen.orientation.angle
    : (typeof window.orientation === 'number' ? window.orientation : 0);
  return THREE.MathUtils.degToRad(angle);
}

function applyDeviceOrientation() {
  const alpha = THREE.MathUtils.degToRad(deviceAlpha);
  const beta = THREE.MathUtils.degToRad(deviceBeta);
  const gamma = THREE.MathUtils.degToRad(deviceGamma);
  const orient = screenOrientationRad();

  euler.set(beta, alpha, -gamma, 'YXZ');
  camera.quaternion.setFromEuler(euler);
  camera.quaternion.multiply(q1);
  camera.quaternion.multiply(q0.setFromAxisAngle(zee, -orient));
}

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

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  if (orientationEnabled) applyDeviceOrientation();
  renderer.render(scene, camera);
}

animate();
