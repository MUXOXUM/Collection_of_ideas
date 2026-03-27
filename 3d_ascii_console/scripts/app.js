(function () {
  const terminal = document.getElementById("terminal");
  const CHAR_ASPECT = 0.56;
  const PALETTE = " .,-~:;=!*#$@";
  const AUTO_RESUME_MS = 1800;
  const PROMPT = "root@host ~> ";
  const CARET_BLINK_MS = 530;
  const DRAG_BUTTON = {
    ROTATE: 0,
    PAN_MIDDLE: 1,
    PAN_RIGHT: 2
  };

  const figures = [
    {
      id: "torus",
      label: "torus",
      sliders: [
        { id: "size", label: "size", min: 0.7, max: 2.2, step: 0.1, value: 1.2 },
        { id: "speed", label: "speed", min: 0.0, max: 2.0, step: 0.1, value: 0.9 }
      ]
    },
    {
      id: "cube",
      label: "cube",
      sliders: [
        { id: "size", label: "size", min: 0.8, max: 2.4, step: 0.1, value: 1.35 },
        { id: "speed", label: "speed", min: 0.0, max: 2.0, step: 0.1, value: 0.8 }
      ]
    },
    {
      id: "octahedron",
      label: "octahedron",
      sliders: [
        { id: "size", label: "size", min: 0.8, max: 2.4, step: 0.1, value: 1.45 },
        { id: "speed", label: "speed", min: 0.0, max: 2.0, step: 0.1, value: 1.0 }
      ]
    }
  ];

  const meshLibrary = {
    cube: createCubeMesh(),
    octahedron: createOctahedronMesh()
  };

  const state = {
    mode: "shell",
    shellLines: [],
    commandInput: "",
    commandHistory: [],
    historyIndex: 0,
    menuIndex: 0,
    sliderIndex: 0,
    currentFigureId: null,
    viewportCols: 120,
    viewportRows: 44,
    renderCols: 100,
    renderRows: 28,
    userQuat: quatIdentity(),
    autoQuat: quatIdentity(),
    panX: 0,
    panY: 0,
    zoom: 6.5,
    dragging: null,
    dragVector: null,
    lastPointerX: 0,
    lastPointerY: 0,
    animationFrame: 0,
    lastTimestamp: 0,
    autoRotateEnabled: true,
    autoRotateResumeAt: 0,
    measureSpan: null
  };

  function boot() {
    terminal.tabIndex = 0;
    terminal.setAttribute("role", "application");
    terminal.setAttribute("aria-label", "ASCII_OS console");
    terminal.addEventListener("contextmenu", (event) => event.preventDefault());
    terminal.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    terminal.addEventListener("wheel", onWheel, { passive: false });
    terminal.addEventListener("dblclick", onDoubleClick);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", handleResize);
    createMeasureNode();
    handleResize();
    renderScreen();
    state.animationFrame = requestAnimationFrame(tick);
    terminal.focus();
  }

  function createMeasureNode() {
    const span = document.createElement("span");
    span.textContent = "M";
    span.style.position = "absolute";
    span.style.visibility = "hidden";
    span.style.pointerEvents = "none";
    span.style.whiteSpace = "pre";
    span.style.font = getComputedStyle(terminal).font;
    document.body.appendChild(span);
    state.measureSpan = span;
  }

  function handleResize() {
    if (!state.measureSpan) {
      return;
    }

    const style = getComputedStyle(terminal);
    state.measureSpan.style.font = style.font;
    const charRect = state.measureSpan.getBoundingClientRect();
    const rect = terminal.getBoundingClientRect();
    const charWidth = Math.max(1, charRect.width);
    const charHeight = Math.max(1, charRect.height);
    state.viewportCols = Math.max(52, Math.floor(rect.width / charWidth));
    state.viewportRows = Math.max(26, Math.floor(rect.height / charHeight));
    renderScreen();
  }

  function tick(timestamp) {
    const deltaSeconds = state.lastTimestamp ? Math.min(0.05, (timestamp - state.lastTimestamp) / 1000) : 0.016;
    state.lastTimestamp = timestamp;

    if (state.mode === "render") {
      updateAutoRotation(deltaSeconds, timestamp);
    }

    renderScreen(timestamp);
    state.animationFrame = requestAnimationFrame(tick);
  }

  function updateAutoRotation(deltaSeconds, timestamp) {
    if (!state.autoRotateEnabled && timestamp >= state.autoRotateResumeAt) {
      state.autoRotateEnabled = true;
    }

    if (!state.autoRotateEnabled) {
      return;
    }

    const speed = getSliderValue("speed");
    if (speed <= 0) {
      return;
    }

    const yaw = quatFromAxisAngle([0, 1, 0], deltaSeconds * (0.65 + speed * 0.85));
    const pitch = quatFromAxisAngle([1, 0, 0], deltaSeconds * (0.3 + speed * 0.45));
    state.autoQuat = quatNormalize(quatMultiply(yaw, quatMultiply(pitch, state.autoQuat)));
  }

  function renderScreen(timestamp = performance.now()) {
    if (state.mode === "shell") {
      terminal.textContent = renderShellView(timestamp);
      return;
    }

    if (state.mode === "menu") {
      terminal.textContent = renderMenuView();
      return;
    }

    terminal.textContent = renderRenderView();
  }

  function renderShellView(timestamp) {
    const caretVisible = Math.floor(timestamp / CARET_BLINK_MS) % 2 === 0;
    const lines = ["ASCII_OS", ""];
    lines.push(...state.shellLines);
    lines.push(`${PROMPT}${state.commandInput}${caretVisible ? "_" : " "}`);
    return lines.join("\n");
  }

  function renderMenuView() {
    const lines = [];
    lines.push("ASCII_OS / render3d");
    lines.push("");
    lines.push("select figure");
    lines.push("");

    figures.forEach((figure, index) => {
      const cursor = index === state.menuIndex ? ">" : " ";
      lines.push(`${cursor} ${figure.label}`);
    });

    lines.push("");
    lines.push("UP / DOWN : choose figure");
    lines.push("ENTER     : render");
    lines.push("ESC       : return to shell");

    return lines.join("\n");
  }

  function renderRenderView() {
    const headerLines = [
      `ASCII_OS / render / ${state.currentFigureId}`,
      "ESC shell | UP DOWN slider | LEFT RIGHT change | double click reset"
    ];
    const footerLines = buildFooterLines();
    const reservedRows = headerLines.length + footerLines.length + 2;
    state.renderRows = Math.max(12, state.viewportRows - reservedRows);
    state.renderCols = Math.max(42, state.viewportCols);

    const frame = createFrameBuffer(state.renderCols, state.renderRows);
    renderCurrentFigure(frame);

    return [...headerLines, "", ...frame.lines, "", ...footerLines].join("\n");
  }

  function buildFooterLines() {
    const figure = getCurrentFigure();
    const lines = [];
    lines.push(`view x=${formatSigned(state.panX)} y=${formatSigned(state.panY)} zoom=${state.zoom.toFixed(2)} auto=${state.autoRotateEnabled ? "on" : "pause"}`);
    lines.push("");

    figure.sliders.forEach((slider, index) => {
      const selected = index === state.sliderIndex;
      lines.push(renderSliderLine(slider, selected));
    });

    return lines;
  }

  function renderSliderLine(slider, selected) {
    const width = Math.max(10, Math.min(24, state.renderCols - 28));
    const value = slider.value;
    const ratio = (value - slider.min) / (slider.max - slider.min || 1);
    const fill = Math.round(ratio * width);
    const bar = `${"#".repeat(fill)}${"-".repeat(Math.max(0, width - fill))}`;
    const cursor = selected ? ">" : " ";
    return `${cursor} ${slider.label.padEnd(6, " ")} [${bar}] ${value.toFixed(2)}`;
  }

  function renderCurrentFigure(frame) {
    const figureId = state.currentFigureId;
    if (figureId === "torus") {
      renderTorus(frame);
      return;
    }

    const mesh = meshLibrary[figureId];
    if (mesh) {
      renderMesh(frame, mesh);
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

  function renderMesh(frame, mesh) {
    const size = getSliderValue("size");
    const rotation = getSceneQuaternion();
    const transformed = mesh.vertices.map((vertex) => {
      const scaled = scaleVec3(vertex, size);
      return quatRotateVec3(rotation, scaled);
    });

    const screenVerts = transformed.map((vertex) => projectPoint(vertex));
    const light = normalizeVec3([0.55, 0.8, -0.7]);

    mesh.faces.forEach((face) => {
      const a = transformed[face[0]];
      const b = transformed[face[1]];
      const c = transformed[face[2]];
      const normal = normalizeVec3(crossVec3(subVec3(b, a), subVec3(c, a)));
      if (normal[2] >= 0) {
        return;
      }

      const brightness = clamp(0.15, 1, 0.2 + Math.max(0, -dotVec3(normal, light)) * 0.8);
      rasterizeTriangle(
        frame,
        screenVerts[face[0]],
        screenVerts[face[1]],
        screenVerts[face[2]],
        brightness
      );
    });

    finalizeFrame(frame);
  }

  function renderTorus(frame) {
    const size = getSliderValue("size");
    const rotation = getSceneQuaternion();
    const light = normalizeVec3([0.45, 0.8, -0.6]);
    const major = 1.45 * size;
    const minor = 0.58 * size;
    const majorSteps = Math.max(28, Math.floor(state.renderCols * 0.48));
    const minorSteps = Math.max(18, Math.floor(state.renderRows * 0.72));

    for (let i = 0; i < majorSteps; i += 1) {
      const u = (i / majorSteps) * Math.PI * 2;
      const cosU = Math.cos(u);
      const sinU = Math.sin(u);

      for (let j = 0; j < minorSteps; j += 1) {
        const v = (j / minorSteps) * Math.PI * 2;
        const cosV = Math.cos(v);
        const sinV = Math.sin(v);
        const ring = major + minor * cosV;
        const point = [ring * cosU, minor * sinV, ring * sinU];
        const normal = normalizeVec3([cosV * cosU, sinV, cosV * sinU]);
        const worldPoint = quatRotateVec3(rotation, point);
        const worldNormal = normalizeVec3(quatRotateVec3(rotation, normal));
        const projected = projectPoint(worldPoint);
        const brightness = clamp(0.06, 1, 0.15 + Math.max(0, -dotVec3(worldNormal, light)) * 0.85);
        plotPoint(frame, projected.x, projected.y, projected.depth, brightness);
      }
    }

    finalizeFrame(frame);
  }

  function projectPoint(point) {
    const depth = point[2] + state.zoom;
    const scale = Math.min(state.renderCols, state.renderRows) * 0.72;
    const x = state.renderCols / 2 + ((point[0] + state.panX) * scale) / (depth * CHAR_ASPECT);
    const y = state.renderRows / 2 - ((point[1] + state.panY) * scale) / depth;
    return { x, y, depth };
  }

  function rasterizeTriangle(frame, p0, p1, p2, brightness) {
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

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const sample = { x: x + 0.5, y: y + 0.5 };
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
      const line = frame.chars.slice(y * frame.width, (y + 1) * frame.width).join("");
      frame.lines.push(line);
    }
  }

  function onKeyDown(event) {
    if (state.mode === "shell") {
      handleShellKeys(event);
      return;
    }

    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Escape"].includes(event.key)) {
      event.preventDefault();
    }

    if (state.mode === "menu") {
      handleMenuKeys(event);
      return;
    }

    handleRenderKeys(event);
  }

  function handleShellKeys(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    if (event.key === "Backspace") {
      event.preventDefault();
      state.commandInput = state.commandInput.slice(0, -1);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      runCommand(state.commandInput);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (state.commandHistory.length === 0) {
        return;
      }
      state.historyIndex = Math.max(0, state.historyIndex - 1);
      state.commandInput = state.commandHistory[state.historyIndex] || "";
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (state.commandHistory.length === 0) {
        return;
      }
      state.historyIndex = Math.min(state.commandHistory.length, state.historyIndex + 1);
      state.commandInput = state.historyIndex === state.commandHistory.length ? "" : state.commandHistory[state.historyIndex];
      return;
    }

    if (event.key.length === 1) {
      event.preventDefault();
      state.commandInput += event.key;
    }
  }

  function runCommand(rawInput) {
    const input = rawInput.trim();
    state.shellLines.push(`${PROMPT}${rawInput}`);

    if (input) {
      state.commandHistory.push(input);
      state.historyIndex = state.commandHistory.length;
    }

    state.commandInput = "";

    if (!input) {
      trimShellBuffer();
      return;
    }

    if (input === "help") {
      state.shellLines.push("available commands:");
      state.shellLines.push("help      - show this help");
      state.shellLines.push("render3d  - open figure selection");
      state.shellLines.push("");
      state.shellLines.push("render3d controls:");
      state.shellLines.push("LMB drag      - arcball rotate");
      state.shellLines.push("RMB or MMB    - pan");
      state.shellLines.push("wheel         - zoom");
      state.shellLines.push("double LMB    - reset view");
      state.shellLines.push("UP / DOWN     - choose slider");
      state.shellLines.push("LEFT / RIGHT  - change slider");
      trimShellBuffer();
      return;
    }

    if (input === "render3d") {
      state.mode = "menu";
      state.menuIndex = 0;
      return;
    }

    state.shellLines.push(`unknown command: ${input}`);
    state.shellLines.push("type help");
    trimShellBuffer();
  }

  function trimShellBuffer() {
    const maxLines = Math.max(6, state.viewportRows - 3);
    if (state.shellLines.length > maxLines) {
      state.shellLines = state.shellLines.slice(state.shellLines.length - maxLines);
    }
  }

  function handleMenuKeys(event) {
    if (event.key === "ArrowUp") {
      state.menuIndex = (state.menuIndex - 1 + figures.length) % figures.length;
      return;
    }

    if (event.key === "ArrowDown") {
      state.menuIndex = (state.menuIndex + 1) % figures.length;
      return;
    }

    if (event.key === "Enter") {
      startFigure(figures[state.menuIndex].id);
      return;
    }

    if (event.key === "Escape") {
      state.mode = "shell";
      state.currentFigureId = null;
    }
  }

  function handleRenderKeys(event) {
    const figure = getCurrentFigure();
    if (event.key === "Escape") {
      state.mode = "shell";
      state.currentFigureId = null;
      state.sliderIndex = 0;
      return;
    }

    if (event.key === "ArrowUp") {
      state.sliderIndex = (state.sliderIndex - 1 + figure.sliders.length) % figure.sliders.length;
      return;
    }

    if (event.key === "ArrowDown") {
      state.sliderIndex = (state.sliderIndex + 1) % figure.sliders.length;
      return;
    }

    if (event.key === "ArrowLeft") {
      adjustSlider(figure.sliders[state.sliderIndex], -1);
      return;
    }

    if (event.key === "ArrowRight") {
      adjustSlider(figure.sliders[state.sliderIndex], 1);
    }
  }

  function startFigure(figureId) {
    state.currentFigureId = figureId;
    state.mode = "render";
    state.sliderIndex = 0;
    resetView();
  }

  function resetView() {
    state.userQuat = quatIdentity();
    state.autoQuat = quatIdentity();
    state.panX = 0;
    state.panY = 0;
    state.zoom = 6.5;
    state.autoRotateEnabled = true;
    state.autoRotateResumeAt = 0;
  }

  function pauseAutoRotate() {
    state.autoRotateEnabled = false;
    state.autoRotateResumeAt = performance.now() + AUTO_RESUME_MS;
  }

  function onPointerDown(event) {
    terminal.focus();
    if (state.mode !== "render") {
      return;
    }

    if (event.button === DRAG_BUTTON.ROTATE) {
      state.dragging = "rotate";
      state.dragVector = projectArcballVector(event.clientX, event.clientY);
      pauseAutoRotate();
      return;
    }

    if (event.button === DRAG_BUTTON.PAN_MIDDLE || event.button === DRAG_BUTTON.PAN_RIGHT) {
      state.dragging = "pan";
      state.lastPointerX = event.clientX;
      state.lastPointerY = event.clientY;
      pauseAutoRotate();
    }
  }

  function onPointerMove(event) {
    if (state.mode !== "render" || !state.dragging) {
      return;
    }

    if (state.dragging === "rotate") {
      const nextVector = projectArcballVector(event.clientX, event.clientY);
      const deltaQuat = quatFromVectors(state.dragVector, nextVector);
      state.userQuat = quatNormalize(quatMultiply(deltaQuat, state.userQuat));
      state.dragVector = nextVector;
      pauseAutoRotate();
      return;
    }

    const rect = terminal.getBoundingClientRect();
    const dx = event.clientX - state.lastPointerX;
    const dy = event.clientY - state.lastPointerY;
    const panFactor = state.zoom / Math.max(120, Math.min(rect.width, rect.height));
    state.panX += dx * panFactor * 0.75;
    state.panY -= dy * panFactor * 0.75;
    state.lastPointerX = event.clientX;
    state.lastPointerY = event.clientY;
    pauseAutoRotate();
  }

  function onPointerUp() {
    state.dragging = null;
    state.dragVector = null;
  }

  function onWheel(event) {
    if (state.mode !== "render") {
      return;
    }

    event.preventDefault();
    const delta = Math.sign(event.deltaY);
    state.zoom = clamp(3.2, 11.5, state.zoom + delta * 0.35);
    pauseAutoRotate();
  }

  function onDoubleClick() {
    if (state.mode !== "render") {
      return;
    }

    resetView();
  }

  function projectArcballVector(clientX, clientY) {
    const rect = terminal.getBoundingClientRect();
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

  function adjustSlider(slider, direction) {
    slider.value = clamp(slider.min, slider.max, slider.value + slider.step * direction);
  }

  function getCurrentFigure() {
    return figures.find((figure) => figure.id === state.currentFigureId) || figures[0];
  }

  function getSliderValue(id) {
    const figure = getCurrentFigure();
    const slider = figure.sliders.find((item) => item.id === id);
    return slider ? slider.value : 0;
  }

  function getSceneQuaternion() {
    return quatNormalize(quatMultiply(state.userQuat, state.autoQuat));
  }

  function createCubeMesh() {
    const vertices = [
      [-1, -1, -1],
      [1, -1, -1],
      [1, 1, -1],
      [-1, 1, -1],
      [-1, -1, 1],
      [1, -1, 1],
      [1, 1, 1],
      [-1, 1, 1]
    ];

    const faces = [
      [0, 2, 1], [0, 3, 2],
      [4, 5, 6], [4, 6, 7],
      [0, 1, 5], [0, 5, 4],
      [1, 2, 6], [1, 6, 5],
      [2, 3, 7], [2, 7, 6],
      [3, 0, 4], [3, 4, 7]
    ];

    return { vertices, faces };
  }

  function createOctahedronMesh() {
    const vertices = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1]
    ];

    const faces = [
      [0, 2, 4],
      [4, 2, 1],
      [1, 2, 5],
      [5, 2, 0],
      [4, 3, 0],
      [1, 3, 4],
      [5, 3, 1],
      [0, 3, 5]
    ];

    return { vertices, faces };
  }

  function edgeFunction(a, b, c) {
    return (c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x);
  }

  function quatIdentity() {
    return [0, 0, 0, 1];
  }

  function quatMultiply(a, b) {
    return [
      a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
      a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
      a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
      a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
    ];
  }

  function quatNormalize(q) {
    const length = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
    return [q[0] / length, q[1] / length, q[2] / length, q[3] / length];
  }

  function quatFromAxisAngle(axis, angle) {
    const unit = normalizeVec3(axis);
    const half = angle * 0.5;
    const sinHalf = Math.sin(half);
    return quatNormalize([
      unit[0] * sinHalf,
      unit[1] * sinHalf,
      unit[2] * sinHalf,
      Math.cos(half)
    ]);
  }

  function quatFromVectors(from, to) {
    const a = normalizeVec3(from);
    const b = normalizeVec3(to);
    const dot = clamp(-1, 1, dotVec3(a, b));

    if (dot < -0.999999) {
      const axis = normalizeVec3(Math.abs(a[0]) < 0.9 ? crossVec3(a, [1, 0, 0]) : crossVec3(a, [0, 1, 0]));
      return quatFromAxisAngle(axis, Math.PI);
    }

    const cross = crossVec3(a, b);
    return quatNormalize([cross[0], cross[1], cross[2], 1 + dot]);
  }

  function quatRotateVec3(q, v) {
    const x = v[0];
    const y = v[1];
    const z = v[2];
    const qx = q[0];
    const qy = q[1];
    const qz = q[2];
    const qw = q[3];

    const ix = qw * x + qy * z - qz * y;
    const iy = qw * y + qz * x - qx * z;
    const iz = qw * z + qx * y - qy * x;
    const iw = -qx * x - qy * y - qz * z;

    return [
      ix * qw + iw * -qx + iy * -qz - iz * -qy,
      iy * qw + iw * -qy + iz * -qx - ix * -qz,
      iz * qw + iw * -qz + ix * -qy - iy * -qx
    ];
  }

  function dotVec3(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  function crossVec3(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ];
  }

  function normalizeVec3(v) {
    const length = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / length, v[1] / length, v[2] / length];
  }

  function scaleVec3(v, scalar) {
    return [v[0] * scalar, v[1] * scalar, v[2] * scalar];
  }

  function subVec3(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  }

  function clamp(min, max, value) {
    return Math.min(max, Math.max(min, value));
  }

  function formatSigned(value) {
    return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
  }

  boot();
})();
