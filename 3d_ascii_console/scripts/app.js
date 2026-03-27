(function () {
  const terminal = document.getElementById("terminal");
  const CHAR_ASPECT = 0.56;
  const PALETTE = " .,-~:;=!*#$@";
  const AUTO_RESUME_MS = 0;
  const PROMPT = "root@host ~> ";
  const CARET_BLINK_MS = 530;
  const STORAGE_KEYS = {
    console: "ascii_os_console_settings",
    figures: "ascii_os_figure_settings",
    history: "ascii_os_command_history",
    shell: "ascii_os_shell_screen",
    ui: "ascii_os_ui_state"
  };
  const NAMED_COLORS = {
    green: "#00ff00",
    blue: "#3a7bff",
    gray: "#9a9a9a",
    white: "#ffffff",
    black: "#000000",
    yellow: "#ffe066",
    red: "#ff4d4d"
  };
  const DRAG_BUTTON = {
    ROTATE: 0,
    PAN_MIDDLE: 1,
    PAN_RIGHT: 2
  };

  const figures = [
    {
      id: "torus",
      label: "TORUS",
      sliders: [
        { id: "size", label: "size", min: 0.7, max: 2.2, step: 0.1, value: 1.2 },
        { id: "speed", label: "speed", min: 0.0, max: 2.0, step: 0.1, value: 0.9 },
        { id: "resolution", label: "res", min: 0.2, max: 1.0, step: 0.1, value: 1.0 }
      ]
    },
    {
      id: "cube",
      label: "CUBE",
      sliders: [
        { id: "size", label: "size", min: 0.8, max: 2.4, step: 0.1, value: 1.35 },
        { id: "speed", label: "speed", min: 0.0, max: 2.0, step: 0.1, value: 0.8 },
        { id: "resolution", label: "res", min: 0.2, max: 1.0, step: 0.1, value: 1.0 }
      ]
    },
    {
      id: "octahedron",
      label: "OCTAHEDRON",
      sliders: [
        { id: "size", label: "size", min: 0.8, max: 2.4, step: 0.1, value: 1.45 },
        { id: "speed", label: "speed", min: 0.0, max: 2.0, step: 0.1, value: 1.0 },
        { id: "resolution", label: "res", min: 0.2, max: 1.0, step: 0.1, value: 1.0 }
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
    settingsVisible: false,
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
    userInteracting: false,
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
    loadPersistedSettings();
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
    if (state.userInteracting) {
      return;
    }

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
    const lines = [];
    lines.push(...state.shellLines);
    lines.push(`${PROMPT}${state.commandInput}${caretVisible ? "_" : " "}`);
    return lines.join("\n");
  }

  function renderMenuView() {
    const lines = [];
    lines.push("+------------------------------------+");
    lines.push("|             RENDER_3D              |");
    lines.push("+------------------------------------+");
    lines.push("");
    lines.push("+----+-------------------------------+");
    lines.push("| ## | Figure                        |");
    lines.push("+----+-------------------------------+");

    figures.forEach((figure, index) => {
      const cursor = index === state.menuIndex ? ">" : " ";
      const rowNumber = String(index + 1).padStart(2, "0");
      const label = `${cursor} ${figure.label}`.padEnd(29, " ");
      lines.push(`| ${rowNumber} | ${label} |`);
    });

    lines.push("+----+-------------------------------+");

    lines.push("");
    lines.push("+----------------+-------------------+");
    lines.push("| Menu key       | Action            |");
    lines.push("+----------------+-------------------+");
    lines.push("| UP / DOWN      | choose figure     |");
    lines.push("| ENTER          | render            |");
    lines.push("| ESC            | return to shell   |");
    lines.push("+----------------+-------------------+");
    lines.push("");
    lines.push("+----------------+-------------------+");
    lines.push("| Figure input   | Action            |");
    lines.push("+----------------+-------------------+");
    lines.push("| LMB drag       | arcball rotate    |");
    lines.push("| RMB or MMB     | pan               |");
    lines.push("| Wheel          | zoom              |");
    lines.push("| Double LMB     | reset view        |");
    lines.push("| M              | open settings     |");
    lines.push("| ESC            | close or go back  |");
    lines.push("+----------------+-------------------+");
    return lines.join("\n");
  }

  function renderRenderView() {
    const reservedRows = 0;
    state.renderRows = Math.max(12, state.viewportRows - reservedRows);
    state.renderCols = Math.max(42, state.viewportCols);

    const frame = createFrameBuffer(state.renderCols, state.renderRows);
    renderCurrentFigure(frame);
    if (state.settingsVisible) {
      overlaySettings(frame);
    }

    return frame.lines.join("\n");
  }

  function buildSettingsLines() {
    const figure = getCurrentFigure();
    const lines = [];
    lines.push(`settings / ${state.currentFigureId}`);
    lines.push("");
    lines.push(`view x=${formatSigned(state.panX)} y=${formatSigned(state.panY)} zoom=${state.zoom.toFixed(2)}`);
    lines.push("");

    figure.sliders.forEach((slider, index) => {
      const selected = index === state.sliderIndex;
      lines.push(renderSliderLine(slider, selected));
    });

    return lines;
  }

  function overlaySettings(frame) {
    const content = buildSettingsLines();
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
      const clipped = line.slice(0, Math.max(0, boxWidth - 4));
      drawText(frame, startX + 2, startY + 1 + index, clipped);
    });

    finalizeFrame(frame);
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
    const resolution = getRenderResolution();
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
        brightness,
        resolution
      );
    });

    finalizeFrame(frame);
  }

  function renderTorus(frame) {
    const size = getSliderValue("size");
    const resolution = getRenderResolution();
    const rotation = getSceneQuaternion();
    const light = normalizeVec3([0.45, 0.8, -0.6]);
    const major = 1.45 * size;
    const minor = 0.58 * size;
    const majorSteps = Math.max(18, Math.floor(state.renderCols * 0.34 * resolution));
    const minorSteps = Math.max(12, Math.floor(state.renderRows * 0.5 * resolution));

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
      const line = frame.chars.slice(y * frame.width, (y + 1) * frame.width).join("");
      frame.lines.push(line);
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

  function onKeyDown(event) {
    if (state.mode === "shell") {
      handleShellKeys(event);
      return;
    }

    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Escape", "m", "M"].includes(event.key)) {
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
      persistShellState();
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
      persistShellState();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (state.commandHistory.length === 0) {
        return;
      }
      state.historyIndex = Math.min(state.commandHistory.length, state.historyIndex + 1);
      state.commandInput = state.historyIndex === state.commandHistory.length ? "" : state.commandHistory[state.historyIndex];
      persistShellState();
      return;
    }

    if (event.key.length === 1) {
      event.preventDefault();
      state.commandInput += event.key;
      persistShellState();
    }
  }

  function runCommand(rawInput) {
    const input = rawInput.trim();
    const parts = input ? input.split(/\s+/) : [];
    const command = parts[0] ? parts[0].toLowerCase() : "";
    const args = parts.slice(1);
    state.shellLines.push(`${PROMPT}${rawInput}`);

    if (input) {
      state.commandHistory.push(input);
      if (state.commandHistory.length > 10) {
        state.commandHistory = state.commandHistory.slice(-10);
      }
      state.historyIndex = state.commandHistory.length;
      persistCommandHistory();
    }

    state.commandInput = "";
    persistShellState();

    if (!input) {
      trimShellBuffer();
      return;
    }

    if (command === "help") {
      getHelpLines().forEach((line) => state.shellLines.push(line));
      trimShellBuffer();
      return;
    }

    if (command === "render3d") {
      state.mode = "menu";
      state.menuIndex = 0;
      persistUiState();
      return;
    }

    if (command === "sysinfo") {
      getSystemInfoLines().forEach((line) => state.shellLines.push(line));
      trimShellBuffer();
      return;
    }

    if (command === "clear") {
      clearShellScreen();
      return;
    }

    if (command === "color") {
      handleColorCommand(args);
      trimShellBuffer();
      return;
    }

    if (command === "reboot") {
      rebootConsole();
      return;
    }

    state.shellLines.push(`unknown command: ${input}`);
    state.shellLines.push("type help");
    trimShellBuffer();
  }

  function handleColorCommand(args) {
    if (args.length < 1 || args.length > 2) {
      state.shellLines.push("usage: color <text> [background]");
      state.shellLines.push("colors: green blue gray white black yellow red or #RRGGBB");
      return;
    }

    const textColor = parseColorArgument(args[0]);
    const backgroundColor = args.length === 2 ? parseColorArgument(args[1]) : null;

    if (!textColor || (args.length === 2 && !backgroundColor)) {
      state.shellLines.push("invalid color value");
      state.shellLines.push("colors: green blue gray white black yellow red or #RRGGBB");
      return;
    }

    const finalBackground = backgroundColor || getConsoleColors().background;
    if (normalizeHexColor(textColor) === normalizeHexColor(finalBackground)) {
      state.shellLines.push("text and background colors must be different");
      return;
    }

    applyConsoleColors(textColor, finalBackground);
    persistConsoleSettings();

    state.shellLines.push(
      args.length === 1
        ? `text color changed to ${textColor}`
        : `text/background changed to ${textColor} ${finalBackground}`
    );
  }

  function parseColorArgument(value) {
    const normalized = value.trim().toLowerCase();
    if (NAMED_COLORS[normalized]) {
      return NAMED_COLORS[normalized];
    }

    if (/^#([0-9a-f]{6}|[0-9a-f]{3})$/i.test(normalized)) {
      return normalized;
    }

    return null;
  }

  function normalizeHexColor(value) {
    const hex = value.trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/i.test(hex)) {
      return hex;
    }

    if (/^#[0-9a-f]{3}$/i.test(hex)) {
      return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
    }

    return hex;
  }

  function getHelpLines() {
    return [
      "+----------+--------------------------------------+",
      "| Command  | Description                          |",
      "+----------+--------------------------------------+",
      "| help     | show this help                       |",
      "| render3d | open figure selection                |",
      "| sysinfo  | show browser system info             |",
      "| clear    | clear terminal text                  |",
      "| color    | change text/background colors        |",
      "| reboot   | clear saved browser data             |",
      "+----------+--------------------------------------+",
    ];
  }

  function clearShellScreen() {
    state.shellLines = [];
    state.commandInput = "";
    state.historyIndex = state.commandHistory.length;
    persistShellState();
  }

  function getSystemInfoLines() {
    const nav = window.navigator;
    const screenInfo = window.screen;
    const tz = safeTimeZone();
    const gpuInfo = getGpuInfo();
    const rows = [
      ["screen", `${screenInfo.width}x${screenInfo.height} px`],
      ["viewport", `${window.innerWidth}x${window.innerHeight} px`],
      ["language", nav.language || "unknown"],
      ["platform", nav.platform || "unknown"],
      ["timezone", tz],
      ["cpu cores", String(nav.hardwareConcurrency || "unknown")],
      ["memory", nav.deviceMemory ? `${nav.deviceMemory} GB` : "unknown"],
      ["touch", nav.maxTouchPoints ? `yes (${nav.maxTouchPoints})` : "no"],
      ["online", nav.onLine ? "yes" : "no"],
      ["user agent", nav.userAgent || "unknown"],
      ["gpu", gpuInfo.renderer || gpuInfo.vendor || "unavailable"]
    ];

    const keyWidth = Math.max(...rows.map(([key]) => key.length), 6);
    const valueWidth = Math.max(...rows.map(([, value]) => value.length), 12);
    const border = `+${"-".repeat(keyWidth + 2)}+${"-".repeat(valueWidth + 2)}+`;
    const lines = [
      border,
      `| ${"Field".padEnd(keyWidth, " ")} | ${"Value".padEnd(valueWidth, " ")} |`,
      border
    ];

    rows.forEach(([key, value]) => {
      lines.push(`| ${key.padEnd(keyWidth, " ")} | ${value.padEnd(valueWidth, " ")} |`);
    });

    lines.push(border);
    return lines;
  }

  function safeTimeZone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown";
    } catch {
      return "unknown";
    }
  }

  function getGpuInfo() {
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      if (!gl) {
        return {};
      }

      const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
      if (debugInfo) {
        return {
          vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL),
          renderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
        };
      }

      return {
        vendor: gl.getParameter(gl.VENDOR),
        renderer: gl.getParameter(gl.RENDERER)
      };
    } catch {
      return {};
    }
  }

  function loadPersistedSettings() {
    const storedConsole = readStorageJson(STORAGE_KEYS.console);
    if (storedConsole && storedConsole.text && storedConsole.background) {
      applyConsoleColors(storedConsole.text, storedConsole.background);
    }

    const storedHistory = readStorageJson(STORAGE_KEYS.history);
    if (Array.isArray(storedHistory)) {
      state.commandHistory = storedHistory
        .filter((entry) => typeof entry === "string" && entry.trim())
        .slice(-10);
      state.historyIndex = state.commandHistory.length;
    }

    const storedShell = readStorageJson(STORAGE_KEYS.shell);
    if (storedShell && typeof storedShell === "object") {
      if (Array.isArray(storedShell.lines)) {
        state.shellLines = storedShell.lines
          .filter((line) => typeof line === "string")
          .slice(-Math.max(6, state.viewportRows - 3));
      }
      if (typeof storedShell.input === "string") {
        state.commandInput = storedShell.input;
      }
    }

    const storedUi = readStorageJson(STORAGE_KEYS.ui);
    if (storedUi && typeof storedUi === "object") {
      const savedMenuIndex = typeof storedUi.menuIndex === "number" ? Math.floor(storedUi.menuIndex) : 0;
      state.menuIndex = clamp(0, Math.max(0, figures.length - 1), savedMenuIndex);
      if (storedUi.mode === "menu") {
        state.mode = "menu";
      }
    }

    const storedFigures = readStorageJson(STORAGE_KEYS.figures);
    if (!storedFigures || typeof storedFigures !== "object") {
      return;
    }

    figures.forEach((figure) => {
      const savedFigure = storedFigures[figure.id];
      if (!savedFigure || typeof savedFigure !== "object") {
        return;
      }

      figure.sliders.forEach((slider) => {
        const savedValue = savedFigure[slider.id];
        if (typeof savedValue !== "number" || Number.isNaN(savedValue)) {
          return;
        }

        slider.value = clamp(slider.min, slider.max, savedValue);
      });
    });
  }

  function persistConsoleSettings() {
    const colors = getConsoleColors();
    writeStorageJson(STORAGE_KEYS.console, colors);
  }

  function persistCommandHistory() {
    writeStorageJson(STORAGE_KEYS.history, state.commandHistory.slice(-10));
  }

  function persistShellState() {
    writeStorageJson(STORAGE_KEYS.shell, {
      lines: state.shellLines.slice(-200),
      input: state.commandInput
    });
  }

  function persistUiState() {
    writeStorageJson(STORAGE_KEYS.ui, {
      mode: state.mode === "menu" ? "menu" : "shell",
      menuIndex: state.menuIndex
    });
  }

  function persistFigureSettings() {
    const payload = {};
    figures.forEach((figure) => {
      payload[figure.id] = {};
      figure.sliders.forEach((slider) => {
        payload[figure.id][slider.id] = slider.value;
      });
    });
    writeStorageJson(STORAGE_KEYS.figures, payload);
  }

  function getConsoleColors() {
    const styles = getComputedStyle(document.documentElement);
    return {
      text: styles.getPropertyValue("--text").trim(),
      background: styles.getPropertyValue("--bg").trim()
    };
  }

  function applyConsoleColors(text, background) {
    document.documentElement.style.setProperty("--text", text);
    document.documentElement.style.setProperty("--bg", background);
  }

  function readStorageJson(key) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeStorageJson(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore storage errors and keep the terminal usable.
    }
  }

  function clearPersistedSettings() {
    try {
      Object.values(STORAGE_KEYS).forEach((key) => window.localStorage.removeItem(key));
    } catch {
      // Ignore storage errors and continue with reload.
    }
  }

  function rebootConsole() {
    clearPersistedSettings();
    window.location.reload();
  }

  function trimShellBuffer() {
    const maxLines = Math.max(6, state.viewportRows - 3);
    if (state.shellLines.length > maxLines) {
      state.shellLines = state.shellLines.slice(state.shellLines.length - maxLines);
    }
    persistShellState();
  }

  function handleMenuKeys(event) {
    if (event.key === "ArrowUp") {
      state.menuIndex = (state.menuIndex - 1 + figures.length) % figures.length;
      persistUiState();
      return;
    }

    if (event.key === "ArrowDown") {
      state.menuIndex = (state.menuIndex + 1) % figures.length;
      persistUiState();
      return;
    }

    if (event.key === "Enter") {
      startFigure(figures[state.menuIndex].id);
      return;
    }

    if (event.key === "Escape") {
      state.mode = "shell";
      state.currentFigureId = null;
      persistUiState();
    }
  }

  function handleRenderKeys(event) {
    const figure = getCurrentFigure();
    if (event.key === "m" || event.key === "M") {
      state.settingsVisible = !state.settingsVisible;
      return;
    }

    if (event.key === "Escape") {
      if (state.settingsVisible) {
        state.settingsVisible = false;
        return;
      }
      state.mode = "menu";
      state.currentFigureId = null;
      state.sliderIndex = 0;
      persistUiState();
      return;
    }

    if (!state.settingsVisible) {
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
    state.settingsVisible = false;
    persistUiState();
    resetView();
  }

  function resetView() {
    state.userQuat = quatIdentity();
    state.autoQuat = quatIdentity();
    state.panX = 0;
    state.panY = 0;
    state.zoom = 6.5;
    state.userInteracting = false;
    state.autoRotateEnabled = true;
    state.autoRotateResumeAt = 0;
  }

  function pauseAutoRotate() {
    state.autoRotateEnabled = false;
  }

  function scheduleAutoRotateResume() {
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
      state.userInteracting = true;
      state.dragVector = projectArcballVector(event.clientX, event.clientY);
      pauseAutoRotate();
      return;
    }

    if (event.button === DRAG_BUTTON.PAN_MIDDLE || event.button === DRAG_BUTTON.PAN_RIGHT) {
      state.dragging = "pan";
      state.userInteracting = true;
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
      const deltaQuat = quatFromVectors(nextVector, state.dragVector);
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
    if (state.dragging) {
      state.userInteracting = false;
      scheduleAutoRotateResume();
    }
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
    scheduleAutoRotateResume();
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
    persistFigureSettings();
  }

  function getCurrentFigure() {
    return figures.find((figure) => figure.id === state.currentFigureId) || figures[0];
  }

  function getSliderValue(id) {
    const figure = getCurrentFigure();
    const slider = figure.sliders.find((item) => item.id === id);
    return slider ? slider.value : 0;
  }

  function getRenderResolution() {
    return getSliderValue("resolution") * 2;
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
