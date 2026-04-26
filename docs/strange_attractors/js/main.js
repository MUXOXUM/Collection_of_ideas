import { attractors } from "./definitions.js";
import { createCameraController } from "./camera.js";

const canvas = document.querySelector("canvas");
const ctx = canvas.getContext("2d");
const labelTitle = document.querySelector(".attractor-label__title");
const labelHint = document.querySelector(".attractor-label__hint");
const cameraModePanel = document.querySelector(".camera-mode-panel");
const cameraModeValues = document.querySelector(".camera-mode-panel__values");

const PARTICLE_COUNT = 1400;
const SUBSTEPS = 4;
const BASE_SCALE = 15.5;
const TRAIL_FADE = 0.16;
const BACKGROUND_COLOR = "#101010";
const SIMULATION_FPS = 60;
const FRAME_TIME_MS = 1000 / SIMULATION_FPS;
const MAX_FRAME_DELTA_MS = 100;
const MAX_SIMULATION_STEPS_PER_FRAME = 12;

let width = 0;
let height = 0;
let dpr = 1;
let centerX = 0;
let centerY = 0;
let scale = 0;
let attractorOffsetX = 0;
let attractorOffsetY = 0;
let currentAttractorIndex = 0;
let simulationAccumulatorMs = 0;
let lastFrameTimeMs = 0;

const particles = [];

function getCurrentAttractor() {
  return attractors[currentAttractorIndex];
}

const camera = createCameraController({
  canvas,
  labelHint,
  cameraModePanel,
  cameraModeValues,
  getCurrentAttractor
});

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  centerX = width / 2;
  centerY = height / 2 - height * 0.04;
  scale = Math.min(width, height) / BASE_SCALE;
}

function createParticle() {
  return getCurrentAttractor().createParticle();
}

function resetParticle(particle) {
  const fresh = createParticle();
  particle.x = fresh.x;
  particle.y = fresh.y;
  particle.z = fresh.z;
  particle.alpha = fresh.alpha;
  particle.size = fresh.size;
  particle.delayedZ = fresh.delayedZ;
  particle.zHistory = fresh.zHistory ? fresh.zHistory.slice() : null;
  particle.zHistoryIndex = fresh.zHistoryIndex ?? 0;
}

function seedParticles() {
  particles.length = 0;
  for (let i = 0; i < PARTICLE_COUNT; i += 1) {
    particles.push(createParticle());
  }
}

function stepAttractor(point) {
  const attractor = getCurrentAttractor();
  const { derivative, dt, beforeStep, afterStep } = attractor;

  if (beforeStep) {
    beforeStep(point);
  }

  const k1 = derivative(point.x, point.y, point.z, point);
  const k2 = derivative(
    point.x + k1.dx * dt * 0.5,
    point.y + k1.dy * dt * 0.5,
    point.z + k1.dz * dt * 0.5,
    point
  );
  const k3 = derivative(
    point.x + k2.dx * dt * 0.5,
    point.y + k2.dy * dt * 0.5,
    point.z + k2.dz * dt * 0.5,
    point
  );
  const k4 = derivative(
    point.x + k3.dx * dt,
    point.y + k3.dy * dt,
    point.z + k3.dz * dt,
    point
  );

  point.x += dt * (k1.dx + 2 * k2.dx + 2 * k3.dx + k4.dx) / 6;
  point.y += dt * (k1.dy + 2 * k2.dy + 2 * k3.dy + k4.dy) / 6;
  point.z += dt * (k1.dz + 2 * k2.dz + 2 * k3.dz + k4.dz) / 6;

  if (afterStep) {
    afterStep(point);
  }
}

function isParticleValid(point) {
  const { escapeRadius } = getCurrentAttractor();

  return Number.isFinite(point.x)
    && Number.isFinite(point.y)
    && Number.isFinite(point.z)
    && Math.abs(point.x) < escapeRadius
    && Math.abs(point.y) < escapeRadius
    && Math.abs(point.z) < escapeRadius;
}

function project(point, cameraMatrix) {
  const x1 = point.x * cameraMatrix[0][0] + point.y * cameraMatrix[0][1] + point.z * cameraMatrix[0][2];
  const y1 = point.x * cameraMatrix[1][0] + point.y * cameraMatrix[1][1] + point.z * cameraMatrix[1][2];
  const z2 = point.x * cameraMatrix[2][0] + point.y * cameraMatrix[2][1] + point.z * cameraMatrix[2][2];
  const depth = Math.max(0.18, 210 / (210 + z2 * 2.2));

  return {
    x: centerX + x1 * scale * depth * 0.4,
    y: centerY + y1 * scale * depth * 0.4,
    depth
  };
}

function updateAttractorOffset(cameraMatrix, viewScale) {
  const { referencePoints } = getCurrentAttractor();

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < referencePoints.length; i += 1) {
    const projected = project(referencePoints[i], cameraMatrix);
    const scaledX = centerX + (projected.x - centerX) * viewScale;
    const scaledY = centerY + (projected.y - centerY) * viewScale;
    minX = Math.min(minX, scaledX);
    maxX = Math.max(maxX, scaledX);
    minY = Math.min(minY, scaledY);
    maxY = Math.max(maxY, scaledY);
  }

  attractorOffsetX = centerX - (minX + maxX) / 2;
  attractorOffsetY = centerY - (minY + maxY) / 2;
}

function drawLabel() {
  labelTitle.textContent = getCurrentAttractor().name;
  camera.syncCameraModePanel();
}

function clearCanvas() {
  ctx.fillStyle = BACKGROUND_COLOR;
  ctx.fillRect(0, 0, width, height);
}

function switchAttractor(direction) {
  currentAttractorIndex = (currentAttractorIndex + direction + attractors.length) % attractors.length;
  simulationAccumulatorMs = 0;
  camera.resetCameraModeOffsets();
  seedParticles();
  drawLabel();
  clearCanvas();
}

function updateSimulation() {
  for (let i = 0; i < particles.length; i += 1) {
    const particle = particles[i];

    for (let step = 0; step < SUBSTEPS; step += 1) {
      stepAttractor(particle);
    }

    if (!isParticleValid(particle)) {
      resetParticle(particle);
    }
  }
}

function renderFrame(cameraMatrix, viewScale, offsetX, offsetY) {
  updateAttractorOffset(cameraMatrix, viewScale);

  ctx.fillStyle = `rgba(16, 16, 16, ${TRAIL_FADE})`;
  ctx.fillRect(0, 0, width, height);

  const projected = [];

  for (let i = 0; i < particles.length; i += 1) {
    const particle = particles[i];
    const point = project(particle, cameraMatrix);

    projected.push({
      x: centerX + (point.x - centerX) * viewScale,
      y: centerY + (point.y - centerY) * viewScale,
      depth: point.depth,
      alpha: particle.alpha,
      size: particle.size
    });
  }

  projected.sort((a, b) => a.depth - b.depth);

  for (let i = 0; i < projected.length; i += 1) {
    const point = projected[i];
    const radius = point.size * point.depth;
    const x = point.x + attractorOffsetX + offsetX;
    const y = point.y + attractorOffsetY + offsetY;

    ctx.beginPath();
    ctx.fillStyle = `rgba(255, 255, 255, ${0.05 * point.alpha * point.depth})`;
    ctx.arc(x, y, radius * 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = `rgba(255, 255, 255, ${0.9 * point.alpha})`;
    ctx.arc(x, y, Math.max(0.45, radius), 0, Math.PI * 2);
    ctx.fill();
  }

  requestAnimationFrame(render);
}

function render(frameTimeMs) {
  if (lastFrameTimeMs === 0) {
    lastFrameTimeMs = frameTimeMs;
  }

  const frameDeltaMs = Math.min(frameTimeMs - lastFrameTimeMs, MAX_FRAME_DELTA_MS);
  lastFrameTimeMs = frameTimeMs;

  if (!camera.isRotationDragActive()) {
    simulationAccumulatorMs += frameDeltaMs;

    let simulationSteps = 0;
    while (
      simulationAccumulatorMs >= FRAME_TIME_MS
      && simulationSteps < MAX_SIMULATION_STEPS_PER_FRAME
    ) {
      updateSimulation();
      simulationAccumulatorMs -= FRAME_TIME_MS;
      simulationSteps += 1;
    }

    if (simulationSteps === MAX_SIMULATION_STEPS_PER_FRAME) {
      simulationAccumulatorMs = 0;
    }
  }

  const activeCamera = camera.getActiveCamera();
  const activeView = camera.getActiveView();
  renderFrame(
    activeCamera.matrix,
    activeView.scale,
    activeView.offsetX,
    activeView.offsetY
  );
}

function handleKeydown(event) {
  const key = event.key.toLowerCase();

  if (key === "c" || key === "с") {
    camera.setCameraModeEnabled(!camera.state.enabled);
  } else if (event.key === "ArrowLeft" || key === "a" || key === "ф") {
    switchAttractor(-1);
  } else if (event.key === "ArrowRight" || key === "d" || key === "в") {
    switchAttractor(1);
  } else if (camera.state.enabled && event.key === "Enter") {
    camera.logActiveCamera();
  }
}

function bindEvents() {
  window.addEventListener("resize", resize);
  canvas.addEventListener("contextmenu", camera.handleCanvasContextMenu);
  canvas.addEventListener("pointerdown", camera.startCameraDrag);
  canvas.addEventListener("pointermove", camera.updateCameraDrag);
  canvas.addEventListener("pointerup", camera.stopCameraDrag);
  canvas.addEventListener("pointercancel", camera.stopCameraDrag);
  canvas.addEventListener("wheel", camera.handleCameraWheel, { passive: false });
  canvas.addEventListener("dblclick", camera.handleCameraDoubleClick);
  canvas.addEventListener("pointerleave", camera.handlePointerLeave);
  window.addEventListener("keydown", handleKeydown);
}

function initialize() {
  resize();
  simulationAccumulatorMs = 0;
  lastFrameTimeMs = 0;
  camera.resetCameraModeOffsets();
  seedParticles();
  drawLabel();
  clearCanvas();
  bindEvents();
  requestAnimationFrame(render);
}

initialize();
