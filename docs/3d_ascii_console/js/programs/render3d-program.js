import {
  AUTO_RESUME_MS,
  DEFAULT_VIEW_STATE,
  DRAG_BUTTON,
  PALETTE,
  UI_INSET_LEFT,
  UI_INSET_TOP
} from "../constants.js";
import { figures as figureTemplates } from "./render3d-figures.js";
import { meshLibrary } from "./render3d-mesh-library.js";
import {
  addVec3,
  clamp,
  crossVec3,
  dotVec3,
  formatSigned,
  normalizeVec3,
  quatFromAxisAngle,
  quatFromVectors,
  quatIdentity,
  quatMultiply,
  quatNormalize,
  quatRotateVec3,
  scaleVec3,
  subVec3
} from "./render3d-math3d.js";
import { insetTextLines } from "../text-utils.js";

const figureRenderers = {
  sphere: renderSphere,
  mobius_strip: renderMobiusStrip,
  torus: renderTorus
};

export function createRender3DProgram() {
  return {
    id: "render3d",
    command: "render3d",
    description: "open figure selection",
    createState,
    restoreState,
    serializeState,
    getHelpLines,
    enter,
    render,
    tick,
    onKeyDown,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onWheel,
    onDoubleClick
  };
}

function createState() {
  return {
    mode: "menu",
    figures: cloneFigures(),
    menuIndex: 0,
    helpVisible: false,
    sliderIndex: 0,
    settingsVisible: false,
    currentFigureId: null,
    renderCols: 100,
    renderRows: 28,
    charAspect: 0.5,
    userQuat: quatIdentity(),
    autoQuat: quatIdentity(),
    panX: 0,
    panY: 0,
    zoom: DEFAULT_VIEW_STATE.zoom,
    userInteracting: false,
    dragging: null,
    dragVector: null,
    lastPointerX: 0,
    lastPointerY: 0,
    autoRotateEnabled: true,
    autoRotateResumeAt: 0
  };
}

function restoreState(savedState, options = {}) {
  const state = createState();
  if (savedState && typeof savedState === "object") {
    state.mode = savedState.mode === "render" ? "render" : "menu";
    state.menuIndex = typeof savedState.menuIndex === "number" ? Math.floor(savedState.menuIndex) : 0;
    state.helpVisible = Boolean(savedState.helpVisible);
    state.sliderIndex = typeof savedState.sliderIndex === "number" ? Math.floor(savedState.sliderIndex) : 0;
    state.settingsVisible = Boolean(savedState.settingsVisible);
    state.currentFigureId = typeof savedState.currentFigureId === "string" ? savedState.currentFigureId : null;
    state.userQuat = normalizeSavedQuat(savedState.userQuat);
    state.autoQuat = normalizeSavedQuat(savedState.autoQuat);
    state.panX = typeof savedState.panX === "number" ? savedState.panX : DEFAULT_VIEW_STATE.panX;
    state.panY = typeof savedState.panY === "number" ? savedState.panY : DEFAULT_VIEW_STATE.panY;
    state.zoom = typeof savedState.zoom === "number" ? clamp(3.2, 11.5, savedState.zoom) : DEFAULT_VIEW_STATE.zoom;
    restoreFigureState(state.figures, savedState.figures);
  }

  if (options.legacyFigureSettings && (!savedState || !savedState.figures)) {
    restoreFigureState(state.figures, options.legacyFigureSettings);
  }

  state.menuIndex = clamp(0, Math.max(0, state.figures.length - 1), state.menuIndex);
  const figure = getFigureById(state, state.currentFigureId);
  if (!figure) {
    state.mode = "menu";
    state.currentFigureId = null;
    state.helpVisible = false;
    state.settingsVisible = false;
    state.sliderIndex = 0;
  } else {
    state.sliderIndex = clamp(0, Math.max(0, figure.sliders.length - 1), state.sliderIndex);
  }

  return state;
}

function serializeState(state) {
  return {
    mode: state.mode,
    menuIndex: state.menuIndex,
    helpVisible: state.helpVisible,
    sliderIndex: state.sliderIndex,
    settingsVisible: state.settingsVisible,
    currentFigureId: state.currentFigureId,
    userQuat: state.userQuat.slice(),
    autoQuat: state.autoQuat.slice(),
    panX: state.panX,
    panY: state.panY,
    zoom: state.zoom,
    figures: serializeFigureState(state.figures)
  };
}

function getHelpLines() {
  return [
    "",
    "+----------------+-------------------+",
    "| Menu key       | Action            |",
    "+----------------+-------------------+",
    "| UP / DOWN      | choose figure     |",
    "| ENTER          | render            |",
    "| ESC            | return to shell   |",
    "+----------------+-------------------+",
    "",
    "+----------------+-------------------+",
    "| Figure input   | Action            |",
    "+----------------+-------------------+",
    "| LMB drag       | arcball rotate    |",
    "| RMB or MMB     | pan               |",
    "| Wheel          | zoom              |",
    "| Double LMB     | reset view        |",
    "| M              | open settings     |",
    "| ESC            | close or go back  |",
    "+----------------+-------------------+",
    "",
    "+----------------+-----------------------------------+",
    "| Light param    | Effect                            |",
    "+----------------+-----------------------------------+",
    "| l_yaw          | rotates light 0..360 around the   |",
    "|                | figure on the horizontal plane    |",
    "| l_pit          | tilts light from -90 to 90        |",
    "|                | degrees, bottom to top            |",
    "+----------------+-----------------------------------+",
    ""
  ];
}

function enter(state, ctx) {
  state.mode = "menu";
  state.currentFigureId = null;
  state.helpVisible = false;
  state.settingsVisible = false;
  state.sliderIndex = 0;
  ctx.setActiveProgram("render3d");
  ctx.persistProgramState("render3d");
  ctx.persistUiState();
}

function render(state, ctx) {
  if (state.mode === "menu") {
    return { format: "text", content: renderMenuView(state, ctx) };
  }

  return { format: "text", content: renderRenderView(state, ctx) };
}

function tick(state, ctx, _timestamp, deltaSeconds) {
  if (state.mode !== "render") {
    return;
  }
  updateAutoRotation(state, deltaSeconds, performance.now());
}

function onKeyDown(state, ctx, event) {
  if (state.mode === "menu") {
    handleMenuKeys(state, ctx, event);
    return;
  }

  handleRenderKeys(state, ctx, event);
}

function onPointerDown(state, _ctx, event) {
  if (state.mode !== "render") {
    return;
  }

  if (event.button === DRAG_BUTTON.ROTATE) {
    state.dragging = "rotate";
    state.userInteracting = true;
    state.dragVector = projectArcballVector(event.clientX, event.clientY, event.currentTarget);
    pauseAutoRotate(state);
    return;
  }

  if (event.button === DRAG_BUTTON.PAN_MIDDLE || event.button === DRAG_BUTTON.PAN_RIGHT) {
    state.dragging = "pan";
    state.userInteracting = true;
    state.lastPointerX = event.clientX;
    state.lastPointerY = event.clientY;
    pauseAutoRotate(state);
  }
}

function onPointerMove(state, _ctx, event) {
  if (state.mode !== "render" || !state.dragging) {
    return;
  }

  if (state.dragging === "rotate") {
    const nextVector = projectArcballVector(event.clientX, event.clientY, event.currentTarget || event.target);
    const deltaQuat = quatFromVectors(nextVector, state.dragVector);
    state.userQuat = quatNormalize(quatMultiply(deltaQuat, state.userQuat));
    state.dragVector = nextVector;
    pauseAutoRotate(state);
    return;
  }

  const rect = event.currentTarget.getBoundingClientRect();
  const dx = event.clientX - state.lastPointerX;
  const dy = event.clientY - state.lastPointerY;
  const panFactor = state.zoom / Math.max(120, Math.min(rect.width, rect.height));
  state.panX += dx * panFactor * 0.75;
  state.panY -= dy * panFactor * 0.75;
  state.lastPointerX = event.clientX;
  state.lastPointerY = event.clientY;
  pauseAutoRotate(state);
}

function onPointerUp(state) {
  if (state.dragging) {
    state.userInteracting = false;
    scheduleAutoRotateResume(state);
  }
  state.dragging = null;
  state.dragVector = null;
}

function onWheel(state, _ctx, event) {
  if (state.mode !== "render") {
    return;
  }

  event.preventDefault();
  const delta = Math.sign(event.deltaY);
  state.zoom = clamp(3.2, 11.5, state.zoom + delta * 0.35);
  scheduleAutoRotateResume(state);
}

function onDoubleClick(state) {
  if (state.mode !== "render") {
    return;
  }

  resetView(state);
}

function renderMenuView(state, ctx) {
  const lines = [];
  lines.push("+------------------------------------+");
  lines.push("|             RENDER_3D              |");
  lines.push("+------------------------------------+");
  lines.push("");
  lines.push("+----+-------------------------------+");
  lines.push("| ## | Figure                        |");
  lines.push("+----+-------------------------------+");

  state.figures.forEach((figure, index) => {
    const cursor = index === state.menuIndex ? ">" : " ";
    const rowNumber = String(index + 1).padStart(2, "0");
    const label = `${cursor} ${figure.label}`.padEnd(29, " ");
    lines.push(`| ${rowNumber} | ${label} |`);
  });

  lines.push("+----+-------------------------------+");
  lines.push("");
  lines.push("H for help");
  const width = Math.max(...lines.map((line) => line.length), 0);
  const height = lines.length;
  const topInset = Math.max(UI_INSET_TOP, Math.floor((ctx.viewportRows - height) / 2));
  const leftInset = Math.max(UI_INSET_LEFT, Math.floor((ctx.viewportCols - width) / 2));

  if (!state.helpVisible) {
    return insetTextLines(lines, topInset, leftInset).join("\n");
  }

  const canvas = createTextCanvas(ctx.viewportCols, ctx.viewportRows);
  drawTextBlock(canvas, leftInset, topInset, lines);
  overlayHelpBox(canvas, getHelpLines());
  return canvas.join("\n");
}

function renderRenderView(state, ctx) {
  const reservedRows = 0;
  state.renderRows = Math.max(12, ctx.viewportRows - reservedRows);
  state.renderCols = Math.max(42, ctx.viewportCols);
  state.charAspect = ctx.charAspect;

  const frame = createFrameBuffer(state.renderCols, state.renderRows);
  renderCurrentFigure(state, frame);
  if (state.settingsVisible) {
    overlaySettings(state, frame);
  }

  return frame.lines.join("\n");
}

function buildSettingsLines(state) {
  const figure = getCurrentFigure(state);
  const lines = [];
  lines.push(`settings / ${state.currentFigureId}`);
  lines.push("");
  lines.push(`view x=${formatSigned(state.panX)} y=${formatSigned(state.panY)} zoom=${state.zoom.toFixed(2)}`);
  lines.push("");

  figure.sliders.forEach((slider, index) => {
    lines.push(renderSliderLine(state, slider, index === state.sliderIndex));
  });

  return lines;
}

function overlaySettings(state, frame) {
  const content = buildSettingsLines(state);
  const innerWidth = Math.max(...content.map((line) => line.length), 18);
  const boxWidth = Math.min(frame.width - 2, innerWidth + 4);
  const boxHeight = Math.min(frame.height - 2, content.length + 2);
  const startX = Math.max(0, Math.floor((frame.width - boxWidth) / 2));
  const startY = Math.max(0, Math.floor((frame.height - boxHeight) / 2));
  const topBottom = `+${"-".repeat(Math.max(0, boxWidth - 2))}+`;

  drawText(frame, startX, startY, topBottom);
  for (let row = 1; row < boxHeight - 1; row += 1) {
    drawText(frame, startX, startY + row, `|${" ".repeat(Math.max(0, boxWidth - 2))}|`);
  }
  drawText(frame, startX, startY + boxHeight - 1, topBottom);

  const visibleContent = content.slice(0, Math.max(0, boxHeight - 2));
  visibleContent.forEach((line, index) => {
    drawText(frame, startX + 2, startY + 1 + index, line.slice(0, Math.max(0, boxWidth - 4)));
  });

  finalizeFrame(frame);
}

function renderSliderLine(state, slider, selected) {
  const width = Math.max(10, Math.min(24, state.renderCols - 28));
  const ratio = (slider.value - slider.min) / (slider.max - slider.min || 1);
  const fill = Math.round(ratio * width);
  const bar = `${"#".repeat(fill)}${"-".repeat(Math.max(0, width - fill))}`;
  const cursor = selected ? ">" : " ";
  return `${cursor} ${slider.label.padEnd(6, " ")} [${bar}] ${slider.value.toFixed(2)}`;
}

function renderCurrentFigure(state, frame) {
  const renderer = figureRenderers[state.currentFigureId];
  if (renderer) {
    renderer(state, frame);
    return;
  }

  const mesh = meshLibrary[state.currentFigureId];
  if (mesh) {
    renderMesh(state, frame, mesh);
  }
}

function createFrameBuffer(width, height) {
  return {
    width,
    height,
    chars: new Array(width * height).fill(" "),
    depth: new Array(width * height).fill(-Infinity),
    lines: []
  };
}

function renderMesh(state, frame, mesh) {
  const size = getSliderValue(state, "size");
  const resolution = getMeshRenderResolution(state);
  const rotation = getSceneQuaternion(state);
  const light = getLightDirection(state);
  const ambient = getAmbientLight(state);
  const transformed = mesh.vertices.map((vertex) => quatRotateVec3(rotation, scaleVec3(vertex, size)));
  const screenVerts = transformed.map((vertex) => projectPoint(state, vertex));

  mesh.faces.forEach((face) => {
    const a = transformed[face[0]];
    const b = transformed[face[1]];
    const c = transformed[face[2]];
    const normal = normalizeVec3(crossVec3(subVec3(b, a), subVec3(c, a)));
    const isBackFace = normal[2] >= 0;
    if (!mesh.doubleSided && isBackFace) {
      return;
    }

    const lightDot = -dotVec3(normal, light);
    const diffuse = Math.max(0, mesh.doubleSided ? Math.abs(lightDot) : lightDot);
    const brightness = clamp(ambient, 1, ambient + diffuse * (1 - ambient));
    rasterizeTriangle(frame, screenVerts[face[0]], screenVerts[face[1]], screenVerts[face[2]], brightness, resolution);
  });

  finalizeFrame(frame);
}

function renderSphere(state, frame) {
  const size = getSliderValue(state, "size");
  const light = getLightDirection(state);
  const ambient = getAmbientLight(state);
  const radius = 1.25 * size;
  const rotation = getSceneQuaternion(state);
  const inverseRotation = quatConjugate(rotation);
  const objectOffset = [state.panX, state.panY, 0];
  const cameraOrigin = getCameraOrigin(state);
  const quality = getSphereRenderResolution(state);

  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      let brightnessSum = 0;
      let hitCount = 0;
      let nearestDepth = Infinity;

      for (let sampleIndex = 0; sampleIndex < quality.samples.length; sampleIndex += 1) {
        const sample = quality.samples[sampleIndex];
        const ray = getCameraRay(state, x + sample[0], y + sample[1]);
        const localOrigin = quatRotateVec3(inverseRotation, subVec3(cameraOrigin, objectOffset));
        const localDirection = normalizeVec3(quatRotateVec3(inverseRotation, ray.direction));
        const hitDistance = intersectSphere(localOrigin, localDirection, radius);
        if (hitDistance === null) {
          continue;
        }

        const localPoint = addVec3(localOrigin, scaleVec3(localDirection, hitDistance));
        const localNormal = normalizeVec3(localPoint);
        const worldNormal = normalizeVec3(quatRotateVec3(rotation, localNormal));
        const worldPoint = addVec3(ray.origin, scaleVec3(ray.direction, hitDistance));
        const viewAlignment = Math.max(0, -dotVec3(worldNormal, ray.direction));
        const diffuse = Math.max(0, -dotVec3(worldNormal, light));
        const rim = Math.pow(1 - viewAlignment, 2.4) * 0.22;
        const brightness = clamp(ambient * 0.72, 1, ambient + diffuse * (1 - ambient) * 0.88 + rim);

        brightnessSum += brightness;
        hitCount += 1;
        nearestDepth = Math.min(nearestDepth, worldPoint[2] + state.zoom);
      }

      if (hitCount === 0) {
        continue;
      }

      plotPoint(frame, x, y, nearestDepth, brightnessSum / hitCount);
    }
  }

  finalizeFrame(frame);
}

function renderTorus(state, frame) {
  const size = getSliderValue(state, "size");
  const light = getLightDirection(state);
  const ambient = getAmbientLight(state);
  const quality = getTorusRenderResolution(state);

  renderImplicitSurface(state, frame, {
    distanceEstimator(point) {
      return torusDistance(point, 1.45 * size, 0.58 * size);
    },
    maxSteps: quality.maxSteps,
    surfaceEpsilon: quality.surfaceEpsilon,
    normalDelta: quality.normalDelta,
    stepScale: quality.stepScale,
    getBrightness({ worldNormal, rayDirection }) {
      const viewAlignment = Math.max(0, -dotVec3(worldNormal, rayDirection));
      const diffuse = Math.max(0, -dotVec3(worldNormal, light));
      const rim = Math.pow(1 - viewAlignment, 3.2) * 0.18;
      const specular = Math.pow(Math.max(0, diffuse), 7) * 0.08;
      return clamp(ambient * 0.58, 1, ambient + diffuse * (1 - ambient) * 0.86 + rim + specular);
    }
  });

  finalizeFrame(frame);
}

function renderMobiusStrip(state, frame) {
  const size = getSliderValue(state, "size");
  const light = getLightDirection(state);
  const ambient = getAmbientLight(state);
  const quality = getMobiusRenderResolution(state);
  const rotation = getSceneQuaternion(state);
  const grid = [];

  for (let uIndex = 0; uIndex < quality.uSteps; uIndex += 1) {
    const row = [];
    for (let vIndex = 0; vIndex <= quality.vSteps; vIndex += 1) {
      const sample = sampleMobiusStripSurface(uIndex / quality.uSteps, vIndex / quality.vSteps, size);
      const worldPoint = quatRotateVec3(rotation, sample.point);
      const worldNormal = normalizeVec3(quatRotateVec3(rotation, sample.normal));
      const lightDot = -dotVec3(worldNormal, light);
      const diffuse = Math.max(0, Math.abs(lightDot));
      const brightness = clamp(ambient * 0.72, 1, ambient + diffuse * (1 - ambient) * 0.84 + 0.05 * Math.sin(sample.angle * 6));
      row.push({
        point: worldPoint,
        normal: worldNormal,
        projected: projectPoint(state, worldPoint),
        brightness
      });
    }
    grid.push(row);
  }

  for (let uIndex = 0; uIndex < quality.uSteps; uIndex += 1) {
    const nextU = (uIndex + 1) % quality.uSteps;
    for (let vIndex = 0; vIndex < quality.vSteps; vIndex += 1) {
      const a = grid[uIndex][vIndex];
      const b = grid[uIndex][vIndex + 1];
      const nextVIndex = nextU === 0 ? quality.vSteps - vIndex : vIndex;
      const c = grid[nextU][nextVIndex];
      const d = grid[nextU][nextVIndex + (nextU === 0 ? -1 : 1)];
      rasterizeSurfaceTriangle(frame, a, c, b, { doubleSided: true, resolution: quality.rasterResolution });
      rasterizeSurfaceTriangle(frame, b, c, d, { doubleSided: true, resolution: quality.rasterResolution });
    }
  }

  finalizeFrame(frame);
}

function renderImplicitSurface(state, frame, options) {
  const rotation = getSceneQuaternion(state);
  const inverseRotation = quatConjugate(rotation);
  const cameraOrigin = getCameraOrigin(state);
  const objectOffset = [state.panX, state.panY, 0];

  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const ray = getCameraRay(state, x + 0.5, y + 0.5);
      const localOrigin = quatRotateVec3(inverseRotation, subVec3(cameraOrigin, objectOffset));
      const localDirection = normalizeVec3(quatRotateVec3(inverseRotation, ray.direction));
      const hitDistance = marchRay(localOrigin, localDirection, options.distanceEstimator, options);
      if (hitDistance === null) {
        continue;
      }

      const localPoint = addVec3(localOrigin, scaleVec3(localDirection, hitDistance));
      const localNormal = estimateImplicitNormal(localPoint, options.distanceEstimator, options.normalDelta || 0.03);
      const worldNormal = normalizeVec3(quatRotateVec3(rotation, localNormal));
      const worldPoint = addVec3(ray.origin, scaleVec3(ray.direction, hitDistance));
      const brightness = options.getBrightness({
        localPoint,
        localNormal,
        worldNormal,
        rayDirection: ray.direction,
        distance: hitDistance
      });

      plotPoint(frame, x, y, worldPoint[2] + state.zoom, brightness);
    }
  }
}

function rasterizeSurfaceTriangle(frame, p0, p1, p2, options) {
  const faceNormal = normalizeVec3(crossVec3(subVec3(p1.point, p0.point), subVec3(p2.point, p0.point)));
  if (faceNormal[0] === 0 && faceNormal[1] === 0 && faceNormal[2] === 0) {
    return;
  }

  const isBackFace = faceNormal[2] >= 0;
  if (!options.doubleSided && isBackFace) {
    return;
  }

  const brightness = (p0.brightness + p1.brightness + p2.brightness) / 3;
  rasterizeTriangle(frame, p0.projected, p1.projected, p2.projected, brightness, options.resolution);
}

function projectPoint(state, point) {
  const depth = point[2] + state.zoom;
  const scale = Math.min(state.renderCols, state.renderRows) * 0.72;
  const centerX = (state.renderCols - 1) / 2;
  const centerY = (state.renderRows - 1) / 2;
  const x = centerX + ((point[0] + state.panX) * scale) / (depth * getCharAspect(state));
  const y = centerY - ((point[1] + state.panY) * scale) / depth;
  return { x, y, depth };
}

function rasterizeTriangle(frame, p0, p1, p2, brightness, resolution = 1) {
  if (p0.depth <= 0 || p1.depth <= 0 || p2.depth <= 0) {
    return;
  }

  const minX = Math.max(0, Math.floor(Math.min(p0.x, p1.x, p2.x)));
  const maxX = Math.min(frame.width - 1, Math.ceil(Math.max(p0.x, p1.x, p2.x)));
  const minY = Math.max(0, Math.floor(Math.min(p0.y, p1.y, p2.y)));
  const maxY = Math.min(frame.height - 1, Math.ceil(Math.max(p0.y, p1.y, p2.y)));
  const area = edgeFunction(p0, p1, p2);

  if (Math.abs(area) < 1e-6) {
    return;
  }

  const sampleStep = clamp(0.35, 1.8, 1.45 / resolution);
  for (let y = minY; y <= maxY; y += sampleStep) {
    for (let x = minX; x <= maxX; x += sampleStep) {
      const sample = { x: x + sampleStep * 0.5, y: y + sampleStep * 0.5 };
      const w0 = edgeFunction(p1, p2, sample);
      const w1 = edgeFunction(p2, p0, sample);
      const w2 = edgeFunction(p0, p1, sample);
      const hasSameSign =
        (w0 >= 0 && w1 >= 0 && w2 >= 0) ||
        (w0 <= 0 && w1 <= 0 && w2 <= 0);

      if (!hasSameSign) {
        continue;
      }

      const b0 = w0 / area;
      const b1 = w1 / area;
      const b2 = w2 / area;
      const depth = b0 * p0.depth + b1 * p1.depth + b2 * p2.depth;
      plotPoint(frame, x, y, depth, brightness);
    }
  }
}

function plotPoint(frame, x, y, depth, brightness) {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || ix >= frame.width || iy < 0 || iy >= frame.height || depth <= 0) {
    return;
  }

  const index = iy * frame.width + ix;
  const invDepth = 1 / depth;
  if (invDepth <= frame.depth[index]) {
    return;
  }

  frame.depth[index] = invDepth;
  const paletteIndex = Math.max(0, Math.min(PALETTE.length - 1, Math.round(brightness * (PALETTE.length - 1))));
  frame.chars[index] = PALETTE[paletteIndex];
}

function finalizeFrame(frame) {
  frame.lines = [];
  for (let y = 0; y < frame.height; y += 1) {
    frame.lines.push(frame.chars.slice(y * frame.width, (y + 1) * frame.width).join(""));
  }
}

function drawText(frame, x, y, text) {
  if (y < 0 || y >= frame.height) {
    return;
  }

  for (let i = 0; i < text.length; i += 1) {
    const px = x + i;
    if (px < 0 || px >= frame.width) {
      continue;
    }

    const index = y * frame.width + px;
    frame.chars[index] = text[i];
    frame.depth[index] = Infinity;
  }
}

function getCameraOrigin(state) {
  return [0, 0, -state.zoom];
}

function getCameraRay(state, sampleX, sampleY) {
  const scale = Math.min(state.renderCols, state.renderRows) * 0.72;
  const centerX = (state.renderCols - 1) / 2;
  const centerY = (state.renderRows - 1) / 2;
  const screenX = ((sampleX - centerX) * getCharAspect(state)) / scale;
  const screenY = (centerY - sampleY) / scale;
  return { origin: getCameraOrigin(state), direction: normalizeVec3([screenX, screenY, 1]) };
}

function quatConjugate(q) {
  return [-q[0], -q[1], -q[2], q[3]];
}

function intersectSphere(origin, direction, radius) {
  const b = 2 * dotVec3(origin, direction);
  const c = dotVec3(origin, origin) - radius * radius;
  const discriminant = b * b - 4 * c;
  if (discriminant < 0) {
    return null;
  }

  const root = Math.sqrt(discriminant);
  const near = (-b - root) * 0.5;
  if (near > 0.001) {
    return near;
  }

  const far = (-b + root) * 0.5;
  return far > 0.001 ? far : null;
}

function marchRay(origin, direction, distanceEstimator, options = {}) {
  const maxSteps = options.maxSteps || 72;
  const maxDistance = options.maxDistance || 32;
  const surfaceEpsilon = options.surfaceEpsilon || 0.02;
  const minStep = options.minStep || 0.012;
  const stepScale = options.stepScale || 0.85;
  let distance = 0;

  for (let step = 0; step < maxSteps && distance <= maxDistance; step += 1) {
    const point = addVec3(origin, scaleVec3(direction, distance));
    const surfaceDistance = distanceEstimator(point);
    if (Math.abs(surfaceDistance) < surfaceEpsilon) {
      return distance;
    }
    distance += Math.max(minStep, surfaceDistance * stepScale);
  }

  return null;
}

function estimateImplicitNormal(point, distanceEstimator, delta) {
  const dx = distanceEstimator([point[0] + delta, point[1], point[2]]) - distanceEstimator([point[0] - delta, point[1], point[2]]);
  const dy = distanceEstimator([point[0], point[1] + delta, point[2]]) - distanceEstimator([point[0], point[1] - delta, point[2]]);
  const dz = distanceEstimator([point[0], point[1], point[2] + delta]) - distanceEstimator([point[0], point[1], point[2] - delta]);
  return normalizeVec3([dx, dy, dz]);
}

function torusDistance(point, majorRadius, minorRadius) {
  const radialDistance = Math.hypot(point[0], point[2]);
  return Math.hypot(radialDistance - majorRadius, point[1]) - minorRadius;
}

function sampleMobiusStripSurface(u, v, size) {
  const angle = u * Math.PI * 2;
  const stripV = (-0.42 + v * 0.84) * size;
  const cosAngle = Math.cos(angle);
  const sinAngle = Math.sin(angle);
  const halfAngle = angle * 0.5;
  const cosHalfAngle = Math.cos(halfAngle);
  const sinHalfAngle = Math.sin(halfAngle);
  const radius = size + stripV * cosHalfAngle;
  const point = [radius * cosAngle, stripV * sinHalfAngle * 1.15, radius * sinAngle];
  const tangentU = [
    -(size + stripV * cosHalfAngle) * sinAngle - 0.5 * stripV * sinHalfAngle * cosAngle,
    0.5 * stripV * cosHalfAngle * 1.15,
    (size + stripV * cosHalfAngle) * cosAngle - 0.5 * stripV * sinHalfAngle * sinAngle
  ];
  const tangentV = [cosHalfAngle * cosAngle, sinHalfAngle * 1.15, cosHalfAngle * sinAngle];
  return { point, normal: normalizeVec3(crossVec3(tangentV, tangentU)), angle };
}

function handleMenuKeys(state, ctx, event) {
  if (event.key === "h" || event.key === "H" || event.key === "р" || event.key === "Р") {
    state.helpVisible = !state.helpVisible;
    ctx.persistProgramState("render3d");
    return;
  }

  if (state.helpVisible && event.key === "Escape") {
    state.helpVisible = false;
    ctx.persistProgramState("render3d");
    return;
  }

  if (state.helpVisible) {
    return;
  }

  if (event.key === "ArrowUp") {
    state.menuIndex = (state.menuIndex - 1 + state.figures.length) % state.figures.length;
    ctx.persistProgramState("render3d");
    return;
  }

  if (event.key === "ArrowDown") {
    state.menuIndex = (state.menuIndex + 1) % state.figures.length;
    ctx.persistProgramState("render3d");
    return;
  }

  if (event.key === "Enter") {
    startFigure(state, ctx, state.figures[state.menuIndex].id);
    return;
  }

  if (event.key === "Escape") {
    state.currentFigureId = null;
    ctx.setActiveProgram(null);
    ctx.persistProgramState("render3d");
    ctx.persistUiState();
  }
}

function handleRenderKeys(state, ctx, event) {
  const figure = getCurrentFigure(state);
  if (event.key === "m" || event.key === "M" || event.key === "ь" || event.key === "Ь") {
    state.settingsVisible = !state.settingsVisible;
    ctx.persistProgramState("render3d");
    return;
  }

  if (event.key === "Escape") {
    if (state.settingsVisible) {
      state.settingsVisible = false;
      ctx.persistProgramState("render3d");
      return;
    }
    state.mode = "menu";
    state.currentFigureId = null;
    state.sliderIndex = 0;
    state.settingsVisible = false;
    ctx.persistProgramState("render3d");
    ctx.persistUiState();
    return;
  }

  if (!state.settingsVisible) {
    return;
  }

  if (event.key === "ArrowUp") {
    state.sliderIndex = (state.sliderIndex - 1 + figure.sliders.length) % figure.sliders.length;
    ctx.persistProgramState("render3d");
    return;
  }

  if (event.key === "ArrowDown") {
    state.sliderIndex = (state.sliderIndex + 1) % figure.sliders.length;
    ctx.persistProgramState("render3d");
    return;
  }

  if (event.key === "ArrowLeft") {
    adjustSlider(state, ctx, figure.sliders[state.sliderIndex], -1);
    return;
  }

  if (event.key === "ArrowRight") {
    adjustSlider(state, ctx, figure.sliders[state.sliderIndex], 1);
  }
}

function startFigure(state, ctx, figureId) {
  state.currentFigureId = figureId;
  state.mode = "render";
  state.helpVisible = false;
  state.sliderIndex = 0;
  state.settingsVisible = false;
  resetView(state);
  ctx.persistProgramState("render3d");
  ctx.persistUiState();
}

function createTextCanvas(width, height) {
  return new Array(height).fill(null).map(() => " ".repeat(Math.max(0, width)));
}

function drawTextBlock(canvas, startX, startY, lines) {
  lines.forEach((line, index) => {
    const y = startY + index;
    if (y < 0 || y >= canvas.length) {
      return;
    }
    canvas[y] = replaceAt(canvas[y], startX, line);
  });
}

function overlayHelpBox(canvas, content) {
  const normalized = content.filter((line, index, source) => {
    if (index === 0 || index === source.length - 1) {
      return line.trim().length > 0;
    }
    return true;
  });
  const innerWidth = Math.max(...normalized.map((line) => line.length), 20);
  const boxWidth = Math.min(canvas[0].length - 2, innerWidth + 4);
  const boxHeight = Math.min(canvas.length - 2, normalized.length + 2);
  const startX = Math.max(0, Math.floor((canvas[0].length - boxWidth) / 2));
  const startY = Math.max(0, Math.floor((canvas.length - boxHeight) / 2));
  const border = `+${"-".repeat(Math.max(0, boxWidth - 2))}+`;

  canvas[startY] = replaceAt(canvas[startY], startX, border);
  for (let row = 1; row < boxHeight - 1; row += 1) {
    canvas[startY + row] = replaceAt(
      canvas[startY + row],
      startX,
      `|${" ".repeat(Math.max(0, boxWidth - 2))}|`
    );
  }
  canvas[startY + boxHeight - 1] = replaceAt(canvas[startY + boxHeight - 1], startX, border);

  normalized.slice(0, Math.max(0, boxHeight - 2)).forEach((line, index) => {
    canvas[startY + 1 + index] = replaceAt(
      canvas[startY + 1 + index],
      startX + 2,
      line.slice(0, Math.max(0, boxWidth - 4))
    );
  });
}

function replaceAt(line, startX, fragment) {
  if (startX >= line.length || fragment.length === 0) {
    return line;
  }
  const prefix = line.slice(0, Math.max(0, startX));
  const clipped = fragment.slice(0, Math.max(0, line.length - startX));
  const suffix = line.slice(startX + clipped.length);
  return `${prefix}${clipped}${suffix}`;
}

function resetView(state) {
  state.userQuat = quatIdentity();
  state.autoQuat = quatIdentity();
  state.panX = DEFAULT_VIEW_STATE.panX;
  state.panY = DEFAULT_VIEW_STATE.panY;
  state.zoom = DEFAULT_VIEW_STATE.zoom;
  state.userInteracting = false;
  state.autoRotateEnabled = true;
  state.autoRotateResumeAt = 0;
}

function updateAutoRotation(state, deltaSeconds, timestamp) {
  if (state.userInteracting) {
    return;
  }

  if (!state.autoRotateEnabled && timestamp >= state.autoRotateResumeAt) {
    state.autoRotateEnabled = true;
  }

  if (!state.autoRotateEnabled) {
    return;
  }

  const speed = getSliderValue(state, "speed");
  if (speed <= 0) {
    return;
  }

  const yaw = quatFromAxisAngle([0, 1, 0], deltaSeconds * (0.65 + speed * 0.85));
  const pitch = quatFromAxisAngle([1, 0, 0], deltaSeconds * (0.3 + speed * 0.45));
  state.autoQuat = quatNormalize(quatMultiply(yaw, quatMultiply(pitch, state.autoQuat)));
}

function pauseAutoRotate(state) {
  state.autoRotateEnabled = false;
}

function scheduleAutoRotateResume(state) {
  state.autoRotateEnabled = false;
  state.autoRotateResumeAt = performance.now() + AUTO_RESUME_MS;
}

function adjustSlider(state, ctx, slider, direction) {
  slider.value = clamp(slider.min, slider.max, slider.value + slider.step * direction);
  ctx.persistProgramState("render3d");
}

function getCurrentFigure(state) {
  return getFigureById(state, state.currentFigureId) || state.figures[0];
}

function getFigureById(state, figureId) {
  return state.figures.find((figure) => figure.id === figureId) || null;
}

function getSliderValue(state, sliderId, figure = getCurrentFigure(state)) {
  const slider = figure.sliders.find((item) => item.id === sliderId);
  return slider ? slider.value : 0;
}

function getLightDirection(state) {
  const yaw = (normalizeAngle360(getSliderValue(state, "light_yaw")) * Math.PI) / 180;
  const pitch = (clamp(-90, 90, getSliderValue(state, "light_pitch")) * Math.PI) / 180;
  const cosPitch = Math.cos(pitch);
  return normalizeVec3([-Math.sin(yaw) * cosPitch, -Math.sin(pitch), Math.cos(yaw) * cosPitch]);
}

function getAmbientLight(state) {
  return clamp(0, 0.8, getSliderValue(state, "ambient"));
}

function getCharAspect(state) {
  return clamp(0.1, 2, state.charAspect || 0.5);
}

function getSphereRenderResolution(state) {
  const resolution = getSliderValue(state, "resolution");
  const sampleGrid = resolution >= 0.9 ? 3 : resolution >= 0.55 ? 2 : 1;
  return { sampleGrid, samples: createSubpixelOffsets(sampleGrid) };
}

function getTorusRenderResolution(state) {
  const resolution = getSliderValue(state, "resolution");
  return {
    maxSteps: Math.round(42 + resolution * 74),
    surfaceEpsilon: 0.038 - resolution * 0.02,
    normalDelta: 0.045 - resolution * 0.018,
    stepScale: 0.78 + resolution * 0.1
  };
}

function getMobiusRenderResolution(state) {
  const resolution = getSliderValue(state, "resolution");
  return {
    uSteps: Math.round(52 + resolution * 92),
    vSteps: Math.round(6 + resolution * 18),
    rasterResolution: 0.65 + resolution * 1.7
  };
}

function getMeshRenderResolution(state) {
  return getSliderValue(state, "resolution") * 2;
}

function createSubpixelOffsets(sampleGrid) {
  const offsets = [];
  for (let y = 0; y < sampleGrid; y += 1) {
    for (let x = 0; x < sampleGrid; x += 1) {
      offsets.push([(x + 0.5) / sampleGrid, (y + 0.5) / sampleGrid]);
    }
  }
  return offsets;
}

function getSceneQuaternion(state) {
  return quatNormalize(quatMultiply(state.userQuat, state.autoQuat));
}

function edgeFunction(a, b, c) {
  return (c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x);
}

function projectArcballVector(clientX, clientY, target) {
  const rect = target.getBoundingClientRect();
  const size = Math.max(1, Math.min(rect.width, rect.height));
  const x = ((clientX - rect.left) / rect.width) * 2 - 1;
  const y = 1 - ((clientY - rect.top) / rect.height) * 2;
  const scaledX = (x * rect.width) / size;
  const scaledY = (y * rect.height) / size;
  const lengthSq = scaledX * scaledX + scaledY * scaledY;

  if (lengthSq > 1) {
    const invLength = 1 / Math.sqrt(lengthSq);
    return [scaledX * invLength, scaledY * invLength, 0];
  }

  return [scaledX, scaledY, Math.sqrt(1 - lengthSq)];
}

function cloneFigures() {
  return figureTemplates.map((figure) => ({
    ...figure,
    sliders: figure.sliders.map((slider) => ({ ...slider }))
  }));
}

function serializeFigureState(figures) {
  const payload = {};
  figures.forEach((figure) => {
    payload[figure.id] = {};
    figure.sliders.forEach((slider) => {
      payload[figure.id][slider.id] = slider.value;
    });
  });
  return payload;
}

function restoreFigureState(figures, savedFigures) {
  if (!savedFigures || typeof savedFigures !== "object") {
    return;
  }

  figures.forEach((figure) => {
    const savedFigure = savedFigures[figure.id];
    if (!savedFigure || typeof savedFigure !== "object") {
      return;
    }

    figure.sliders.forEach((slider) => {
      const savedValue = savedFigure[slider.id];
      if (typeof savedValue !== "number" || Number.isNaN(savedValue)) {
        return;
      }
      slider.value = clamp(slider.min, slider.max, normalizeSliderValue(slider.id, savedValue));
    });
  });
}

function normalizeSliderValue(id, value) {
  if (id === "light_yaw") {
    return normalizeAngle360(value);
  }

  if (id === "light_pitch") {
    return clamp(-90, 90, value);
  }

  return value;
}

function normalizeAngle360(value) {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function normalizeSavedQuat(value) {
  if (!Array.isArray(value) || value.length !== 4 || value.some((item) => typeof item !== "number" || Number.isNaN(item))) {
    return quatIdentity();
  }
  return quatNormalize(value);
}
