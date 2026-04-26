import {
  COMMAND_HISTORY_LIMIT,
  SHELL_STATE_LINE_LIMIT,
  STORAGE_KEYS
} from "./constants.js";
import { createAppState } from "./app-state.js";
import { createGameOfLifeProgram } from "./programs/gameoflife-program.js";
import { createRender3DProgram } from "./programs/render3d-program.js";
import { createSnakeProgram } from "./programs/snake-program.js";
import { createProgramRegistry } from "./program-registry.js";
import {
  buildPrompt,
  handleShellKeyDown,
  normalizeHistory,
  renderShellView,
  trimShellBuffer
} from "./shell.js";
import { clearStorageKey, readStorageJson, writeStorageJson } from "./storage.js";

const terminal = document.getElementById("terminal");
const registry = createProgramRegistry([
  createRender3DProgram(),
  createGameOfLifeProgram(),
  createSnakeProgram()
]);
const state = createAppState(registry.list);
const ctx = createAppContext();

boot();

function boot() {
  loadPersistedSettings();
  state.shell.prompt = buildPrompt();
  terminal.tabIndex = 0;
  terminal.setAttribute("role", "application");
  terminal.setAttribute("aria-label", "ASCII_OS console");
  terminal.addEventListener("contextmenu", preventContextMenu);
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

function createAppContext() {
  return {
    terminal,
    programs: registry.list,
    programCommandMap: registry.commandMap,
    get viewportCols() {
      return state.viewportCols;
    },
    get viewportRows() {
      return state.viewportRows;
    },
    get charAspect() {
      return state.charAspect;
    },
    get measureSpan() {
      return state.measureSpan;
    },
    setActiveProgram(programId) {
      state.activeProgramId = registry.byId[programId] ? programId : null;
    },
    openProgram(programId, args = []) {
      const program = registry.byId[programId];
      if (!program) {
        return;
      }
      program.enter(getProgramState(programId), ctx, args);
    },
    persistProgramState,
    persistUiState,
    persistShellState,
    persistCommandHistory,
    persistConsoleSettings,
    rebootConsole,
    getConsoleColors,
    applyConsoleColors
  };
}

function createMeasureNode() {
  const span = document.createElement("span");
  span.textContent = "M";
  span.style.position = "absolute";
  span.style.visibility = "hidden";
  span.style.pointerEvents = "none";
  span.style.whiteSpace = "pre";
  const style = getComputedStyle(terminal);
  span.style.font = style.font;
  span.style.lineHeight = style.lineHeight;
  document.body.appendChild(span);
  state.measureSpan = span;
}

function handleResize() {
  if (!state.measureSpan) {
    return;
  }

  const style = getComputedStyle(terminal);
  state.measureSpan.style.font = style.font;
  state.measureSpan.style.lineHeight = style.lineHeight;
  const charRect = state.measureSpan.getBoundingClientRect();
  const rect = terminal.getBoundingClientRect();
  const paddingX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const paddingY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  const charWidth = Math.max(1, charRect.width);
  const charHeight = Math.max(1, charRect.height);
  const contentWidth = Math.max(0, rect.width - paddingX);
  const contentHeight = Math.max(0, rect.height - paddingY);
  state.viewportCols = Math.max(52, Math.floor(contentWidth / charWidth));
  state.viewportRows = Math.max(26, Math.floor(contentHeight / charHeight));
  state.charAspect = charWidth / charHeight;
  trimShellBuffer(state.shell, ctx);
  renderScreen();
}

function tick(timestamp) {
  const deltaSeconds = state.lastTimestamp ? Math.min(0.05, (timestamp - state.lastTimestamp) / 1000) : 0.016;
  state.lastTimestamp = timestamp;
  const activeProgram = getActiveProgram();
  if (activeProgram && typeof activeProgram.tick === "function") {
    activeProgram.tick(getProgramState(activeProgram.id), ctx, timestamp, deltaSeconds);
  }
  renderScreen();
  state.animationFrame = requestAnimationFrame(tick);
}

function renderScreen() {
  const activeProgram = getActiveProgram();
  if (!activeProgram) {
    terminal.textContent = renderShellView(state.shell, {
      showCaret: document.activeElement === terminal,
      timestamp: state.lastTimestamp
    });
    return;
  }

  const output = activeProgram.render(getProgramState(activeProgram.id), ctx);
  if (output.format === "html") {
    terminal.innerHTML = output.content;
    return;
  }

  terminal.textContent = output.content;
}

function onKeyDown(event) {
  const activeProgram = getActiveProgram();
  if (activeProgram && typeof activeProgram.onKeyDown === "function") {
    activeProgram.onKeyDown(getProgramState(activeProgram.id), ctx, event);
    renderScreen();
    return;
  }

  handleShellKeyDown(state.shell, ctx, event);
  renderScreen();
}

function onPointerDown(event) {
  terminal.focus();
  const activeProgram = getActiveProgram();
  if (!activeProgram || typeof activeProgram.onPointerDown !== "function") {
    return;
  }

  activeProgram.onPointerDown(getProgramState(activeProgram.id), ctx, withTerminalTarget(event));
  renderScreen();
}

function onPointerMove(event) {
  const activeProgram = getActiveProgram();
  if (!activeProgram || typeof activeProgram.onPointerMove !== "function") {
    return;
  }

  activeProgram.onPointerMove(getProgramState(activeProgram.id), ctx, withTerminalTarget(event));
  renderScreen();
}

function onPointerUp(event) {
  const activeProgram = getActiveProgram();
  if (!activeProgram || typeof activeProgram.onPointerUp !== "function") {
    return;
  }

  activeProgram.onPointerUp(getProgramState(activeProgram.id), ctx, withTerminalTarget(event));
  renderScreen();
}

function onWheel(event) {
  const activeProgram = getActiveProgram();
  if (!activeProgram || typeof activeProgram.onWheel !== "function") {
    return;
  }

  activeProgram.onWheel(getProgramState(activeProgram.id), ctx, withTerminalTarget(event));
  renderScreen();
}

function onDoubleClick(event) {
  const activeProgram = getActiveProgram();
  if (!activeProgram || typeof activeProgram.onDoubleClick !== "function") {
    return;
  }

  activeProgram.onDoubleClick(getProgramState(activeProgram.id), ctx, withTerminalTarget(event));
  renderScreen();
}

function withTerminalTarget(event) {
  return {
    button: event.button,
    clientX: event.clientX,
    clientY: event.clientY,
    currentTarget: terminal,
    deltaY: event.deltaY,
    preventDefault() {
      event.preventDefault();
    },
    target: terminal
  };
}

function preventContextMenu(event) {
  event.preventDefault();
}

function getActiveProgram() {
  return state.activeProgramId ? registry.byId[state.activeProgramId] || null : null;
}

function getProgramState(programId) {
  return state.programs[programId];
}

function loadPersistedSettings() {
  loadConsoleSettings();
  loadShellState();
  loadProgramStates();
  loadUiState();
}

function loadConsoleSettings() {
  const storedConsole = readStorageJson(STORAGE_KEYS.console);
  if (storedConsole && storedConsole.text && storedConsole.background) {
    applyConsoleColors(storedConsole.text, storedConsole.background);
  }
}

function loadShellState() {
  const storedHistory = readStorageJson(STORAGE_KEYS.history);
  if (Array.isArray(storedHistory)) {
    state.shell.history = storedHistory
      .filter((entry) => typeof entry === "string" && entry.trim())
      .slice(-COMMAND_HISTORY_LIMIT);
  }
  normalizeHistory(state.shell);

  const storedShell = readStorageJson(STORAGE_KEYS.shell);
  if (!storedShell || typeof storedShell !== "object") {
    return;
  }

  if (Array.isArray(storedShell.lines)) {
    state.shell.lines = storedShell.lines
      .filter((line) => typeof line === "string")
      .slice(-SHELL_STATE_LINE_LIMIT);
  }
  if (typeof storedShell.input === "string") {
    state.shell.input = storedShell.input;
  }
}

function loadProgramStates() {
  registry.list.forEach((program) => {
    const storageKey = STORAGE_KEYS[program.id];
    const savedState = storageKey ? readStorageJson(storageKey) : null;
    const legacyState = getLegacyProgramState(program.id);
    const initialState = savedState || legacyState.savedState || null;
    if (typeof program.restoreState === "function") {
      state.programs[program.id] = program.restoreState(initialState, legacyState);
    } else if (savedState && typeof savedState === "object") {
      state.programs[program.id] = savedState;
    }
  });
}

function getLegacyProgramState(programId) {
  if (programId === "render3d") {
    const storedUi = readStorageJson(STORAGE_KEYS.ui);
    const storedFigures = readStorageJson(STORAGE_KEYS.figures);
    return {
      legacyFigureSettings: storedFigures,
      savedState: storedUi && typeof storedUi === "object" ? {
        mode: storedUi.mode === "render" ? "render" : storedUi.mode === "menu" ? "menu" : undefined,
        menuIndex: storedUi.menuIndex,
        sliderIndex: storedUi.sliderIndex,
        settingsVisible: storedUi.settingsVisible,
        currentFigureId: storedUi.currentFigureId
      } : null
    };
  }

  if (programId === "gameoflife") {
    return {
      savedState: readStorageJson(STORAGE_KEYS.gameOfLife)
    };
  }

  return {};
}

function loadUiState() {
  const storedUi = readStorageJson(STORAGE_KEYS.ui);
  const savedProgramId = storedUi && typeof storedUi.activeProgramId === "string"
    ? storedUi.activeProgramId
    : mapLegacyModeToProgramId(storedUi && storedUi.mode);

  state.activeProgramId = registry.byId[savedProgramId] ? savedProgramId : null;
}

function mapLegacyModeToProgramId(mode) {
  if (mode === "menu" || mode === "render") {
    return "render3d";
  }
  if (mode === "gameoflife") {
    return "gameoflife";
  }
  return null;
}

function persistProgramState(programId) {
  const program = registry.byId[programId];
  const storageKey = STORAGE_KEYS[programId];
  if (!program || !storageKey) {
    return;
  }

  const programState = getProgramState(programId);
  const payload = typeof program.serializeState === "function"
    ? program.serializeState(programState)
    : programState;
  writeStorageJson(storageKey, payload);
}

function persistUiState() {
  writeStorageJson(STORAGE_KEYS.ui, {
    activeProgramId: state.activeProgramId
  });
}

function persistShellState() {
  writeStorageJson(STORAGE_KEYS.shell, {
    lines: state.shell.lines.slice(-SHELL_STATE_LINE_LIMIT),
    input: state.shell.input
  });
}

function persistCommandHistory() {
  writeStorageJson(STORAGE_KEYS.history, state.shell.history.slice(-COMMAND_HISTORY_LIMIT));
}

function persistConsoleSettings() {
  writeStorageJson(STORAGE_KEYS.console, getConsoleColors());
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

function rebootConsole() {
  Object.values(STORAGE_KEYS).forEach((key) => clearStorageKey(key));
  window.location.reload();
}
