import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

// ── RENDERER ──────────────────────────────────────────────
const canvas = document.getElementById('three-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// ── SCENE & CAMERA ────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080808);
scene.fog = new THREE.FogExp2(0x080808, 0.018);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);

// Start far away for cinematic intro
camera.position.set(0, 8, 40);
camera.lookAt(0, 0, 0);

// ── CONTROLS ─────────────────────────────────────────────
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enableZoom = false;
controls.enablePan = false;
controls.autoRotate = false;

// ── HDRI ENVIRONMENT ──────────────────────────────────────
const rgbeLoader = new RGBELoader();
rgbeLoader.load(
  'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_09_1k.hdr',
  (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = texture;         // reflections on car paint
    // Don't set scene.background — keep dark bg
  }
);

// ── LIGHTS ────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0xffffff, 0.5));

const keyLight = new THREE.DirectionalLight(0xfff4e0, 4);
keyLight.position.set(10, 15, 8);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 100;
keyLight.shadow.camera.left = -10;
keyLight.shadow.camera.right = 10;
keyLight.shadow.camera.top = 10;
keyLight.shadow.camera.bottom = -10;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xc9a84c, 1.5);
fillLight.position.set(-8, 2, -5);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xaac4ff, 2);
rimLight.position.set(0, 5, -10);
scene.add(rimLight);

// ── GROUND REFLECTION PLANE ───────────────────────────────
const groundGeo = new THREE.PlaneGeometry(60, 60);
const groundMat = new THREE.MeshStandardMaterial({
  color: 0x111111,
  metalness: 0.8,
  roughness: 0.25,
  envMapIntensity: 0.2,  // was 0.5 — reduce so it doesn't tint
});
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -2.6;
ground.receiveShadow = true;
scene.add(ground);

// Thin gold line on ground — subtle runway feel
const lineGeo = new THREE.PlaneGeometry(0.5, 30);
const lineMat = new THREE.MeshBasicMaterial({ color: 0xc9a84c, transparent: true, opacity: 0.12 });
const groundLine = new THREE.Mesh(lineGeo, lineMat);
groundLine.rotation.x = -Math.PI / 2;
groundLine.position.set(0, -2.59, 0);
scene.add(groundLine);

// ── SCROLL CAMERA KEYFRAMES ───────────────────────────────
const keyframes = [
  { t: 0.00, pos: new THREE.Vector3(0, 1.5, 5),  target: new THREE.Vector3(0, 0, 0) },
  { t: 0.25, pos: new THREE.Vector3(7, 1.5, 2),  target: new THREE.Vector3(0, 0, 0) },
  { t: 0.50, pos: new THREE.Vector3(0, 4, -7),   target: new THREE.Vector3(0, 0, 0) },
  { t: 0.75, pos: new THREE.Vector3(-7, 2, 4),   target: new THREE.Vector3(0, 0, 0) },
  { t: 1.00, pos: new THREE.Vector3(0, 6, 6),    target: new THREE.Vector3(0, 0, 0) },
];

const camPos    = new THREE.Vector3();
const camTarget = new THREE.Vector3();

function getCameraAtScroll(progress) {
  let a = keyframes[0], b = keyframes[keyframes.length - 1];
  for (let i = 0; i < keyframes.length - 1; i++) {
    if (progress >= keyframes[i].t && progress <= keyframes[i + 1].t) {
      a = keyframes[i]; b = keyframes[i + 1];
      break;
    }
  }
  const span  = b.t - a.t;
  const local = span === 0 ? 0 : (progress - a.t) / span;
  const ease  = local < 0.5 ? 2 * local * local : -1 + (4 - 2 * local) * local;
  camPos.lerpVectors(a.pos, b.pos, ease);
  camTarget.lerpVectors(a.target, b.target, ease);
}

// ── CINEMATIC INTRO STATE ─────────────────────────────────
let introComplete  = false;
let introProgress  = 0;         // 0 → 1 over ~2.5s
const INTRO_SPEED  = 0.008;

// ── LOAD MODEL ───────────────────────────────────────────
const loaderEl  = document.getElementById('loader');
const loaderBar = document.getElementById('loader-bar');
const loaderPct = document.getElementById('loader-percent');

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

let model;
let paintMeshes = [];   // meshes we'll recolour

gltfLoader.load(
  '/free_1975_porsche_911_930_turbo1.glb',
  (gltf) => {
    model = gltf.scene;

    // Normalise size
    const box    = new THREE.Box3().setFromObject(model);
    const size   = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale  = 5 / maxDim;
    model.scale.setScalar(scale);
    model.position.sub(center.multiplyScalar(scale));

// Replace the traverse block inside the gltf load callback
model.traverse((child) => {
  if (child.isMesh) {
    child.castShadow = true;
    child.receiveShadow = true;

    const name = child.name.toLowerCase();
    const skip = ['glass', 'window', 'light', 'lens', 'chrome',
                  'rubber', 'tire', 'wheel', 'interior', 'seat',
                  'dash', 'carpet', 'engine'];

    const shouldSkip = skip.some(word => name.includes(word));

    if (!shouldSkip && child.material) {
      paintMeshes.push(child);
    }
  }
});

    scene.add(model);

    // Show color picker
    document.getElementById('color-picker').classList.add('visible');

    // Hide loader, begin intro
    setTimeout(() => {
      loaderEl.classList.add('hidden');
    }, 400);
  },
  (progress) => {
    if (progress.total > 0) {
      const pct = Math.min(100, Math.round((progress.loaded / progress.total) * 100));
      loaderBar.style.width = pct + '%';
      loaderPct.textContent = pct + '%';
    }
  },
  (error) => {
    console.error(error);
    loaderPct.textContent = 'Failed to load model';
  }
);

// ── PAINT COLOR PICKER ────────────────────────────────────
const swatches = document.querySelectorAll('.paint-swatch');

swatches.forEach(swatch => {
  swatch.addEventListener('click', () => {
    swatches.forEach(s => s.classList.remove('active'));
    swatch.classList.add('active');
    const color = new THREE.Color(swatch.dataset.color);

    paintMeshes.forEach(mesh => {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach(m => {
        if (m.color) {
          // Clone material so we don't affect other meshes sharing the same one
          if (!mesh._originalMat) {
            mesh._originalMat = true;
            mesh.material = Array.isArray(mesh.material)
              ? mesh.material.map(x => x.clone())
              : mesh.material.clone();
          }
          const target = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          target.forEach(tm => { if (tm.color) tm.color.set(color); });
        }
      });
    });
  });
});

// ── ANIMATED COUNTERS ─────────────────────────────────────
function animateCounter(el) {
  const target  = parseInt(el.dataset.count, 10);
  const isDecimal = el.hasAttribute('data-decimal');
  const suffix  = el.dataset.suffix || '';
  const duration = 1800;
  const start   = performance.now();

  function tick(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    const value = Math.round(target * ease);
    el.textContent = isDecimal
      ? (value / 10).toFixed(1) + suffix
      : value + suffix;
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// Trigger counters when stat panel enters view
const statObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.querySelectorAll('[data-count]').forEach(animateCounter);
      statObserver.unobserve(e.target);
    }
  });
}, { threshold: 0.5 });

const statPanel = document.querySelector('.stat-panel');
if (statPanel) statObserver.observe(statPanel);

// ── CONTENT BLOCK OBSERVER ────────────────────────────────
const blockObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
}, { threshold: 0.3 });

document.querySelectorAll('[data-animate], [data-cta]').forEach(el => blockObserver.observe(el));

// ── SCROLL ───────────────────────────────────────────────
const scrollProgress = { value: 0, current: 0 };

window.addEventListener('scroll', () => {
  const max = document.body.scrollHeight - window.innerHeight;
  scrollProgress.value = max > 0 ? window.scrollY / max : 0;
});

// ── CUSTOM CURSOR ─────────────────────────────────────────
const cursorDot  = document.getElementById('cursor');
const cursorRing = document.getElementById('cursor-ring');
let mouseX = 0, mouseY = 0;
let ringX = 0, ringY = 0;

document.addEventListener('mousemove', (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
  cursorDot.style.left = mouseX + 'px';
  cursorDot.style.top  = mouseY + 'px';
});

document.querySelectorAll('button, .paint-swatch, a').forEach(el => {
  el.addEventListener('mouseenter', () => document.body.classList.add('cursor-hover'));
  el.addEventListener('mouseleave', () => document.body.classList.remove('cursor-hover'));
});

// ── RESIZE ───────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── ANIMATE LOOP ─────────────────────────────────────────
let elapsed  = 0;
let lastTime = performance.now();

function animate() {
  requestAnimationFrame(animate);

  const now   = performance.now();
  const delta = (now - lastTime) / 1000;
  lastTime    = now;
  elapsed    += delta;

  // Smooth cursor ring lag
  ringX += (mouseX - ringX) * 0.12;
  ringY += (mouseY - ringY) * 0.12;
  cursorRing.style.left = ringX + 'px';
  cursorRing.style.top  = ringY + 'px';

  if (model) {
    // Cinematic intro — fly camera in from far
    if (!introComplete) {
      introProgress = Math.min(introProgress + INTRO_SPEED, 1);
      const ease    = 1 - Math.pow(1 - introProgress, 4);
      const startZ  = 40, targetZ = keyframes[0].pos.z;
      const startY  = 8,  targetY = keyframes[0].pos.y;
      camera.position.x = 0;
      camera.position.y = startY + (targetY - startY) * ease;
      camera.position.z = startZ + (targetZ - startZ) * ease;
      camera.lookAt(0, 0, 0);
      if (introProgress >= 1) introComplete = true;
    } else {
      // Normal scroll-driven camera
      scrollProgress.current += (scrollProgress.value - scrollProgress.current) * 0.06;
      getCameraAtScroll(scrollProgress.current);
      camera.position.lerp(camPos, 0.04);
      controls.target.lerp(camTarget, 0.04);
    }

    // Gentle float
    model.position.y = Math.sin(elapsed * 0.5) * 0.08;
  }

  controls.update();
  renderer.render(scene, camera);
}

animate();