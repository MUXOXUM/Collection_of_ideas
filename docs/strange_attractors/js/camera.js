const MIN_ZOOM = 0.35;
const MAX_ZOOM = 10;
const ZOOM_SENSITIVITY = 0.0012;
const PAN_SENSITIVITY = 1;
const IDENTITY_MATRIX_3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1]
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeVector3(vector) {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length
  };
}

function crossVector3(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

function dotVector3(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function multiplyMatrix3(a, b) {
  return [
    [
      a[0][0] * b[0][0] + a[0][1] * b[1][0] + a[0][2] * b[2][0],
      a[0][0] * b[0][1] + a[0][1] * b[1][1] + a[0][2] * b[2][1],
      a[0][0] * b[0][2] + a[0][1] * b[1][2] + a[0][2] * b[2][2]
    ],
    [
      a[1][0] * b[0][0] + a[1][1] * b[1][0] + a[1][2] * b[2][0],
      a[1][0] * b[0][1] + a[1][1] * b[1][1] + a[1][2] * b[2][1],
      a[1][0] * b[0][2] + a[1][1] * b[1][2] + a[1][2] * b[2][2]
    ],
    [
      a[2][0] * b[0][0] + a[2][1] * b[1][0] + a[2][2] * b[2][0],
      a[2][0] * b[0][1] + a[2][1] * b[1][1] + a[2][2] * b[2][1],
      a[2][0] * b[0][2] + a[2][1] * b[1][2] + a[2][2] * b[2][2]
    ]
  ];
}

function orthonormalizeMatrix3(matrix) {
  const xAxis = normalizeVector3({
    x: matrix[0][0],
    y: matrix[0][1],
    z: matrix[0][2]
  });
  const ySeed = {
    x: matrix[1][0],
    y: matrix[1][1],
    z: matrix[1][2]
  };
  const zAxis = normalizeVector3(crossVector3(xAxis, ySeed));
  const yAxis = normalizeVector3(crossVector3(zAxis, xAxis));

  return [
    [xAxis.x, xAxis.y, xAxis.z],
    [yAxis.x, yAxis.y, yAxis.z],
    [zAxis.x, zAxis.y, zAxis.z]
  ];
}

function buildAxisAngleMatrix(axis, angle) {
  const normalizedAxis = normalizeVector3(axis);
  const { x, y, z } = normalizedAxis;
  const cosAngle = Math.cos(angle);
  const sinAngle = Math.sin(angle);
  const t = 1 - cosAngle;

  return [
    [
      t * x * x + cosAngle,
      t * x * y - sinAngle * z,
      t * x * z + sinAngle * y
    ],
    [
      t * x * y + sinAngle * z,
      t * y * y + cosAngle,
      t * y * z - sinAngle * x
    ],
    [
      t * x * z - sinAngle * y,
      t * y * z + sinAngle * x,
      t * z * z + cosAngle
    ]
  ];
}

function buildArcballRotation(fromVector, toVector) {
  const dot = clamp(dotVector3(fromVector, toVector), -1, 1);
  const axis = crossVector3(fromVector, toVector);
  const axisLength = Math.hypot(axis.x, axis.y, axis.z);

  if (axisLength < 1e-6) {
    if (dot > 0.9999) {
      return buildAxisAngleMatrix({ x: 0, y: 1, z: 0 }, 0);
    }

    const fallbackAxis = Math.abs(fromVector.x) < 0.9
      ? crossVector3(fromVector, { x: 1, y: 0, z: 0 })
      : crossVector3(fromVector, { x: 0, y: 1, z: 0 });

    return buildAxisAngleMatrix(fallbackAxis, Math.PI);
  }

  return buildAxisAngleMatrix(axis, Math.acos(dot));
}

function projectPointerToArcball(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const radius = Math.min(rect.width, rect.height) * 0.5;
  const localX = (clientX - rect.left - rect.width * 0.5) / radius;
  const localY = (rect.height * 0.5 - (clientY - rect.top)) / radius;
  const lengthSquared = localX * localX + localY * localY;

  if (lengthSquared <= 1) {
    return {
      x: localX,
      y: localY,
      z: Math.sqrt(1 - lengthSquared)
    };
  }

  const normalizedXY = normalizeVector3({ x: localX, y: localY, z: 0 });
  return {
    x: normalizedXY.x,
    y: normalizedXY.y,
    z: 0
  };
}

function getCameraMatrix(camera) {
  if (camera.matrix) {
    return camera.matrix.map((row) => row.slice());
  }

  return IDENTITY_MATRIX_3.map((row) => row.slice());
}

function getCameraPreset(camera) {
  return {
    matrix: getCameraMatrix(camera)
  };
}

function getViewPreset(view) {
  return {
    offsetX: view?.offsetX ?? 0,
    offsetY: view?.offsetY ?? 0,
    scale: view?.scale ?? 1
  };
}

function formatMatrixValue(value) {
  return Number(value.toFixed(6));
}

function formatMatrixForLog(matrix) {
  return [
    "matrix: [",
    `  [${formatMatrixValue(matrix[0][0])}, ${formatMatrixValue(matrix[0][1])}, ${formatMatrixValue(matrix[0][2])}],`,
    `  [${formatMatrixValue(matrix[1][0])}, ${formatMatrixValue(matrix[1][1])}, ${formatMatrixValue(matrix[1][2])}],`,
    `  [${formatMatrixValue(matrix[2][0])}, ${formatMatrixValue(matrix[2][1])}, ${formatMatrixValue(matrix[2][2])}]`,
    "]"
  ].join("\n");
}

export function createCameraController({
  canvas,
  labelHint,
  cameraModePanel,
  cameraModeValues,
  getCurrentAttractor
}) {
  const state = {
    enabled: false,
    matrixOverride: null,
    pointerId: null,
    dragMode: null,
    dragging: false,
    startVector: null,
    startMatrix: null,
    startClientX: 0,
    startClientY: 0,
    offsetX: 0,
    offsetY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
    viewScale: 1
  };

  function getActiveCamera() {
    const { camera } = getCurrentAttractor();
    const matrix = state.matrixOverride || getCameraPreset(camera).matrix;

    return { matrix };
  }

  function getActiveView() {
    return {
      offsetX: state.offsetX,
      offsetY: state.offsetY,
      scale: state.viewScale
    };
  }

  function syncCameraModePanel() {
    document.body.classList.toggle("camera-mode", state.enabled);
    document.body.classList.toggle("is-dragging", state.dragging);

    if (!state.enabled) {
      cameraModePanel.classList.remove("is-visible");
      cameraModePanel.setAttribute("aria-hidden", "true");
      labelHint.textContent = "← → or A/D | C: camera mode";
      return;
    }

    const activeView = getActiveView();

    cameraModePanel.classList.add("is-visible");
    cameraModePanel.setAttribute("aria-hidden", "false");
    labelHint.textContent = "← → or A/D | C: camera mode";
    cameraModeValues.textContent =
      `offsetX ${Number(activeView.offsetX.toFixed(2))}, ` +
      `offsetY ${Number(activeView.offsetY.toFixed(2))}, ` +
      `scale ${Number(activeView.scale.toFixed(3))}`;
  }

  function stopCameraDrag() {
    if (state.pointerId !== null) {
      try {
        canvas.releasePointerCapture(state.pointerId);
      } catch (error) {
        // Ignore release errors when capture was already cleared.
      }
    }

    state.pointerId = null;
    state.dragMode = null;
    state.dragging = false;
    state.startVector = null;
    state.startMatrix = null;
    state.startClientX = 0;
    state.startClientY = 0;
    syncCameraModePanel();
  }

  function resetCameraModeOffsets() {
    const { camera, view } = getCurrentAttractor();
    const cameraPreset = getCameraPreset(camera);
    const viewPreset = getViewPreset(view);

    state.matrixOverride = cameraPreset.matrix;
    state.offsetX = viewPreset.offsetX;
    state.offsetY = viewPreset.offsetY;
    state.viewScale = clamp(viewPreset.scale, MIN_ZOOM, MAX_ZOOM);
    syncCameraModePanel();
  }

  function setCameraModeEnabled(enabled) {
    state.enabled = enabled;

    if (!enabled) {
      stopCameraDrag();
    }

    syncCameraModePanel();
  }

  function logActiveCamera() {
    const activeView = getActiveView();
    console.log(
      `camera: {\n` +
      `${formatMatrixForLog(getActiveCamera().matrix).split("\n").map((line) => `  ${line}`).join("\n")}\n` +
      `},\n` +
      `view: {\n` +
      `  offsetX: ${Number(activeView.offsetX.toFixed(2))},\n` +
      `  offsetY: ${Number(activeView.offsetY.toFixed(2))},\n` +
      `  scale: ${Number(activeView.scale.toFixed(3))}\n` +
      `},`
    );
  }

  function startCameraDrag(event) {
    if (!state.enabled || state.dragging) {
      return;
    }

    event.preventDefault();
    const activeCamera = getActiveCamera();
    const isPanDrag = event.button === 1 || event.button === 2;

    state.pointerId = event.pointerId;
    state.dragMode = isPanDrag ? "pan" : "rotate";
    state.dragging = true;
    state.startClientX = event.clientX;
    state.startClientY = event.clientY;
    state.startOffsetX = state.offsetX;
    state.startOffsetY = state.offsetY;
    state.startVector = isPanDrag ? null : projectPointerToArcball(canvas, event.clientX, event.clientY);
    state.startMatrix = isPanDrag ? null : activeCamera.matrix.map((row) => row.slice());
    canvas.setPointerCapture(event.pointerId);
    syncCameraModePanel();
  }

  function updateCameraDrag(event) {
    if (!state.enabled || !state.dragging || event.pointerId !== state.pointerId) {
      return;
    }

    if (state.dragMode === "pan") {
      state.offsetX = state.startOffsetX + (event.clientX - state.startClientX) * PAN_SENSITIVITY;
      state.offsetY = state.startOffsetY + (event.clientY - state.startClientY) * PAN_SENSITIVITY;
    } else {
      const currentVector = projectPointerToArcball(canvas, event.clientX, event.clientY);
      const deltaRotation = buildArcballRotation(state.startVector, currentVector);
      state.matrixOverride = orthonormalizeMatrix3(multiplyMatrix3(deltaRotation, state.startMatrix));
    }

    syncCameraModePanel();
  }

  function handleCameraWheel(event) {
    if (!state.enabled) {
      return;
    }

    event.preventDefault();
    const zoomFactor = Math.exp(-event.deltaY * ZOOM_SENSITIVITY);
    state.viewScale = clamp(state.viewScale * zoomFactor, MIN_ZOOM, MAX_ZOOM);
    syncCameraModePanel();
  }

  function handleCameraDoubleClick(event) {
    if (!state.enabled || event.button !== 0) {
      return;
    }

    event.preventDefault();
    stopCameraDrag();
    resetCameraModeOffsets();
  }

  function handleCanvasContextMenu(event) {
    if (!state.enabled) {
      return;
    }

    event.preventDefault();
  }

  function handlePointerLeave(event) {
    if (!state.dragging || event.pointerId !== state.pointerId) {
      return;
    }

    stopCameraDrag();
  }

  function isRotationDragActive() {
    return state.enabled && state.dragging && state.dragMode === "rotate";
  }

  return {
    state,
    getActiveCamera,
    getActiveView,
    syncCameraModePanel,
    setCameraModeEnabled,
    resetCameraModeOffsets,
    logActiveCamera,
    startCameraDrag,
    updateCameraDrag,
    stopCameraDrag,
    handleCameraWheel,
    handleCameraDoubleClick,
    handleCanvasContextMenu,
    handlePointerLeave,
    isRotationDragActive
  };
}
