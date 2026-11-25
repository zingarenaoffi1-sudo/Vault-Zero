import * as THREE from 'three';

/**
 * Generates procedural concrete chamber floor albedo + bump textures (zero 404s).
 */
export function createConcreteFloorTextures(maxAnisotropy: number): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = 512;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const ctx = colorCanvas.getContext('2d')!;

  // Base dark architectural slate-concrete
  ctx.fillStyle = '#1b2128';
  ctx.fillRect(0, 0, size, size);

  // Subtle speckle grain
  for (let i = 0; i < 4500; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const v = 22 + Math.floor(Math.random() * 24);
    ctx.fillStyle = `rgb(${v}, ${v + 4}, ${v + 8})`;
    ctx.fillRect(x, y, 2, 2);
  }

  // Recessed concrete slab expansion joints
  ctx.strokeStyle = '#0f1419';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, size - 4, size - 4);
  ctx.beginPath();
  ctx.moveTo(size / 2, 0);
  ctx.lineTo(size / 2, size);
  ctx.moveTo(0, size / 2);
  ctx.lineTo(size, size / 2);
  ctx.stroke();

  // Subtle brass inlay cross-hair at tile centers
  ctx.strokeStyle = 'rgba(184, 138, 68, 0.16)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(size / 2 - 14, size / 2);
  ctx.lineTo(size / 2 + 14, size / 2);
  ctx.moveTo(size / 2, size / 2 - 14);
  ctx.lineTo(size / 2, size / 2 + 14);
  ctx.stroke();

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(8, 6);
  map.anisotropy = maxAnisotropy;

  // Grayscale bump map
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d')!;
  bCtx.fillStyle = '#909090';
  bCtx.fillRect(0, 0, size, size);
  for (let i = 0; i < 3200; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const g = 115 + Math.floor(Math.random() * 45);
    bCtx.fillStyle = `rgb(${g},${g},${g})`;
    bCtx.fillRect(x, y, 2, 2);
  }
  bCtx.strokeStyle = '#202020';
  bCtx.lineWidth = 5;
  bCtx.strokeRect(2, 2, size - 4, size - 4);
  bCtx.beginPath();
  bCtx.moveTo(size / 2, 0);
  bCtx.lineTo(size / 2, size);
  bCtx.moveTo(0, size / 2);
  bCtx.lineTo(size, size / 2);
  bCtx.stroke();

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(8, 6);
  bumpMap.anisotropy = maxAnisotropy;

  return { map, bumpMap };
}

/**
 * Generates brushed steel micro-grain bump texture for armored vault doors.
 */
export function createBrushedSteelBump(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y += 2) {
    const shade = 112 + Math.floor(Math.random() * 34);
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.fillRect(0, y, size, 1);
  }

  // Machined rivet border
  ctx.fillStyle = '#e0e0e0';
  for (let i = 16; i < size; i += 32) {
    ctx.beginPath();
    ctx.arc(i, 12, 3, 0, Math.PI * 2);
    ctx.arc(i, size - 12, 3, 0, Math.PI * 2);
    ctx.arc(12, i, 3, 0, Math.PI * 2);
    ctx.arc(size - 12, i, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Crisp brass/steel jackpot plaque mounted above every 3D vault door.
 */
export function createVaultPlaqueTexture(
  code: string,
  jackpot: number,
  multiplier: number,
  accentHex: string,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const w = 512;
  const h = 192;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Matte dark cast-iron face
  ctx.fillStyle = '#12161b';
  ctx.fillRect(0, 0, w, h);

  // Brass beveled outer frame
  ctx.strokeStyle = multiplier > 1 ? '#f59e0b' : '#b88a44';
  ctx.lineWidth = 10;
  ctx.strokeRect(8, 8, w - 16, h - 16);

  // Corner screw dots
  ctx.fillStyle = '#d4a95e';
  const corners: readonly (readonly [number, number])[] = [
    [24, 24],
    [w - 24, 24],
    [24, h - 24],
    [w - 24, h - 24],
  ];
  for (const [cx, cy] of corners) {
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Left badge band with vault code
  ctx.fillStyle = accentHex;
  ctx.fillRect(28, 32, 118, h - 64);

  ctx.fillStyle = '#0d1014';
  ctx.font = '800 84px "Barlow Condensed", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(code, 87, h / 2 + 4);

  // Right bullion readout
  ctx.fillStyle = '#f5f0e2';
  ctx.font = '700 72px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`${(jackpot * multiplier).toLocaleString()}g`, w - 36, multiplier > 1 ? 82 : h / 2 + 4);

  if (multiplier > 1) {
    ctx.fillStyle = '#f59e0b';
    ctx.font = '700 32px "Barlow Condensed", sans-serif';
    ctx.fillText('2X BONUS VAULT', w - 38, 144);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Analog circular pressure gauge face mounted above each vault.
 */
export function createGaugeDialTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;

  ctx.fillStyle = '#14181d';
  ctx.beginPath();
  ctx.arc(cx, cy, 122, 0, Math.PI * 2);
  ctx.fill();

  // Safe / caution / overload redline arcs
  const drawArc = (start: number, end: number, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.arc(cx, cy, 94, start, end);
    ctx.stroke();
  };
  drawArc(Math.PI * 0.78, Math.PI * 1.38, '#22c55e');
  drawArc(Math.PI * 1.38, Math.PI * 1.78, '#f59e0b');
  drawArc(Math.PI * 1.78, Math.PI * 2.22, '#e63946');

  // Tick marks
  ctx.strokeStyle = '#ece8df';
  ctx.lineWidth = 4;
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * 0.78 + (i / 10) * Math.PI * 1.44;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 74, cy + Math.sin(a) * 74);
    ctx.lineTo(cx + Math.cos(a) * 106, cy + Math.sin(a) * 106);
    ctx.stroke();
  }

  ctx.fillStyle = '#9ca3af';
  ctx.font = '700 22px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('LOAD', cx, cy + 54);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Soft radial contact shadow decal texture for grounded 3D weight.
 */
export function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 6, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.28)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}
