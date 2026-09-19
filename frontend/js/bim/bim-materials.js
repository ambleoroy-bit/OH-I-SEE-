import * as THREE from 'three';

function canvasTexture(drawFn, size = 256, repeat = 2) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  drawFn(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function drawBrick(ctx, size) {
  ctx.fillStyle = '#c4a574';
  ctx.fillRect(0, 0, size, size);
  const bw = size / 8;
  const bh = size / 16;
  for (let row = 0; row < 16; row++) {
    const offset = (row % 2) * (bw / 2);
    for (let col = -1; col < 9; col++) {
      ctx.fillStyle = row % 2 === 0 ? '#b8956a' : '#d4b88a';
      ctx.fillRect(col * bw + offset, row * bh, bw - 2, bh - 2);
      ctx.strokeStyle = '#8a6d4a';
      ctx.lineWidth = 1;
      ctx.strokeRect(col * bw + offset, row * bh, bw - 2, bh - 2);
    }
  }
}

function drawPlaster(ctx, size) {
  ctx.fillStyle = '#f0ebe3';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.04})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
}

function drawWood(ctx, size) {
  ctx.fillStyle = '#8b5a2b';
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 4) {
    ctx.strokeStyle = `rgba(60,30,10,${0.15 + Math.random() * 0.1})`;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y + Math.sin(y * 0.1) * 2);
    ctx.stroke();
  }
}

function drawTile(ctx, size) {
  ctx.fillStyle = '#e8e0d5';
  ctx.fillRect(0, 0, size, size);
  const t = size / 8;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      ctx.fillStyle = (r + c) % 2 ? '#ddd5ca' : '#f2ece4';
      ctx.fillRect(c * t, r * t, t - 1, t - 1);
    }
  }
}

function drawGrass(ctx, size) {
  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, '#4a7c3f');
  g.addColorStop(1, '#2d5a27');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 600; i++) {
    ctx.strokeStyle = `rgba(255,255,255,${Math.random() * 0.15})`;
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 1, y - 3 - Math.random() * 4);
    ctx.stroke();
  }
}

function drawRoof(ctx, size) {
  ctx.fillStyle = '#8b3a2a';
  ctx.fillRect(0, 0, size, size);
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 12; col++) {
      ctx.fillStyle = (row + col) % 2 ? '#7a3224' : '#9c4535';
      ctx.beginPath();
      const x = col * (size / 12);
      const y = row * (size / 12);
      const w = size / 12;
      ctx.moveTo(x, y + w / 2);
      ctx.lineTo(x + w / 2, y);
      ctx.lineTo(x + w, y + w / 2);
      ctx.lineTo(x + w / 2, y + w);
      ctx.closePath();
      ctx.fill();
    }
  }
}

const cache = new Map();

function getTex(key, drawFn, repeat) {
  if (!cache.has(key)) cache.set(key, canvasTexture(drawFn, 256, repeat));
  return cache.get(key);
}

export function materialForType(type, mode = 'technical') {
  const home = mode === 'home';
  switch (type) {
    case 'Wall':
      return new THREE.MeshStandardMaterial({
        map: getTex(home ? 'brick' : 'plaster', home ? drawBrick : drawPlaster, home ? 3 : 2),
        roughness: home ? 0.85 : 0.7,
        metalness: 0.05,
      });
    case 'Door':
      return new THREE.MeshStandardMaterial({
        map: getTex('wood', drawWood, 2),
        roughness: 0.6,
        metalness: 0.02,
      });
    case 'Window':
      return new THREE.MeshPhysicalMaterial({
        color: 0x88ccff,
        transparent: true,
        opacity: 0.45,
        roughness: 0.05,
        metalness: 0.1,
        transmission: 0.6,
        thickness: 0.05,
      });
    case 'Slab':
    case 'Room':
      return new THREE.MeshStandardMaterial({
        map: getTex(home ? 'tile' : 'tile', drawTile, 4),
        roughness: 0.4,
        metalness: 0.05,
      });
    case 'Site':
      return new THREE.MeshStandardMaterial({
        map: getTex('grass', drawGrass, 6),
        roughness: 0.95,
        side: THREE.DoubleSide,
      });
    case 'Roof':
      return new THREE.MeshStandardMaterial({
        map: getTex('roof', drawRoof, 3),
        roughness: 0.8,
      });
    default:
      return new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.7 });
  }
}

export function applyHomeScene(scene, renderer) {
  scene.background = new THREE.Color(0x87b8d8);
  scene.fog = new THREE.Fog(0x87b8d8, 30, 120);
  if (renderer) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
  }
}

export function addHomeLighting(scene) {
  const hemi = new THREE.HemisphereLight(0xddeeff, 0x445533, 0.6);
  const sun = new THREE.DirectionalLight(0xfff5e0, 1.2);
  sun.position.set(15, 25, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  return [hemi, sun];
}
