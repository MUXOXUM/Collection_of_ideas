import { UI_INSET_LEFT, UI_INSET_TOP } from "../constants.js";
import { escapeHtml } from "../text-utils.js";
import { createGameOfLifeState } from "./gameoflife-state.js";

export function createGameOfLifeProgram() {
  return {
    id: "gameoflife",
    command: "gameoflife",
    description: "open Conway life editor",
    createState: createGameOfLifeState,
    getHelpLines,
    enter,
    serializeState,
    restoreState,
    render,
    tick,
    onKeyDown,
    onPointerDown,
    onPointerMove,
    onPointerUp
  };
}

function getHelpLines() {
  return [
    "",
    "usage: gameoflife",
    "",
    "opens a toroidal Conway's Game of Life editor.",
    "",
    "edit mode:",
    "- lmb fills a cell",
    "- rmb clears a cell",
    "- del clears the full field",
    "- r fills the field randomly",
    "- enter starts simulation",
    "- esc returns to shell",
    "",
    "run mode:",
    "- e returns to editor",
    "- esc returns to shell",
    ""
  ];
}

function enter(programState, ctx) {
  const state = programState;
  if (!state.cells.length) {
    Object.assign(state, createGameOfLifeState());
  }
  const metrics = getGameOfLifeMetrics(ctx);
  ensureBoard(state, metrics.fieldCols, metrics.fieldRows);
  ctx.setActiveProgram("gameoflife");
  ctx.persistProgramState("gameoflife");
  ctx.persistUiState();
}

function serializeState(programState) {
  return {
    cols: programState.cols,
    rows: programState.rows,
    cells: programState.cells.slice(),
    cursorX: programState.cursorX,
    cursorY: programState.cursorY,
    running: programState.running,
    generation: programState.generation,
    population: programState.population
  };
}

function restoreState(savedState) {
  const state = createGameOfLifeState();
  if (!savedState || typeof savedState !== "object") {
    return state;
  }

  const cols = typeof savedState.cols === "number" ? Math.max(0, Math.floor(savedState.cols)) : 0;
  const rows = typeof savedState.rows === "number" ? Math.max(0, Math.floor(savedState.rows)) : 0;
  const expectedSize = cols * rows;
  const cells = Array.isArray(savedState.cells)
    ? savedState.cells.slice(0, expectedSize).map((cell) => (cell ? 1 : 0))
    : [];

  while (cells.length < expectedSize) {
    cells.push(0);
  }

  state.cols = cols;
  state.rows = rows;
  state.cells = cells;
  state.cursorX = typeof savedState.cursorX === "number" ? Math.floor(savedState.cursorX) : 0;
  state.cursorY = typeof savedState.cursorY === "number" ? Math.floor(savedState.cursorY) : 0;
  state.running = Boolean(savedState.running);
  state.generation = typeof savedState.generation === "number" ? Math.max(0, Math.floor(savedState.generation)) : 0;
  state.population = countPopulation(state);
  return state;
}

function render(programState, ctx) {
  const state = programState;
  const metrics = getGameOfLifeMetrics(ctx);
  ensureBoard(state, metrics.fieldCols, metrics.fieldRows);
  const visibleCols = Math.min(metrics.fieldCols, state.cols);
  const visibleRows = Math.min(metrics.fieldRows, state.rows);
  const frameWidth = visibleCols + 2;
  const footerLines = state.running
    ? buildFooterLines([
      [`Generation: ${state.generation}`, `Edit - E`],
      [`Population: ${state.population}`, `Exit - ESC`]
    ])
    : buildFooterLines([
      ["Fill cell - LMB", "Random fill - R", "Start - Enter"],
      ["Clear cell - RMB", "Clear all - DEL", "Exit - ESC"]
    ]);
  const longestFooter = footerLines.reduce((max, line) => Math.max(max, line.length), 0);
  const blockWidth = Math.max(frameWidth, longestFooter);
  const blockHeight = visibleRows + 5;
  const topInset = Math.max(UI_INSET_TOP, Math.floor((ctx.viewportRows - blockHeight) / 2));
  const leftInset = Math.max(UI_INSET_LEFT, Math.floor((ctx.viewportCols - blockWidth) / 2));
  const leftPadding = " ".repeat(leftInset);
  const lines = [];

  for (let i = 0; i < topInset; i += 1) {
    lines.push("");
  }

  lines.push(`${leftPadding}+${"-".repeat(visibleCols)}+`);
  for (let row = 0; row < visibleRows; row += 1) {
    let line = `${leftPadding}|`;
    for (let col = 0; col < visibleCols; col += 1) {
      const alive = state.cells[row * state.cols + col] === 1;
      const isCursor = !state.running && col === state.cursorX && row === state.cursorY;
      const char = alive ? "@" : " ";
      line += isCursor
        ? `<span class="gol-cursor">${escapeHtml(char)}</span>`
        : escapeHtml(char);
    }
    line += "|";
    lines.push(line);
  }
  lines.push(`${leftPadding}+${"-".repeat(visibleCols)}+`);
  lines.push("");
  footerLines.forEach((line) => {
    lines.push(renderFooterLine(line, blockWidth, leftPadding));
  });

  state.viewport = {
    originX: leftInset + 1,
    originY: topInset + 1,
    cols: visibleCols,
    rows: visibleRows
  };

  return { format: "html", content: lines.join("\n") };
}

function tick(programState, ctx, timestamp) {
  const state = programState;
  const metrics = getGameOfLifeMetrics(ctx);
  ensureBoard(state, metrics.fieldCols, metrics.fieldRows);

  if (!state.running) {
    return;
  }

  if (!state.lastStepAt) {
    state.lastStepAt = timestamp;
  }

  if (timestamp - state.lastStepAt < state.stepIntervalMs) {
    return;
  }

  const nextCells = new Array(state.cells.length).fill(0);
  let nextPopulation = 0;
  for (let row = 0; row < state.rows; row += 1) {
    for (let col = 0; col < state.cols; col += 1) {
      const index = row * state.cols + col;
      const alive = state.cells[index] === 1;
      const neighbors = countNeighbors(state, col, row);
      const nextAlive = neighbors === 3 || (alive && neighbors === 2);
      nextCells[index] = nextAlive ? 1 : 0;
      nextPopulation += nextCells[index];
    }
  }

  state.cells = nextCells;
  state.population = nextPopulation;
  state.generation += 1;
  if (nextPopulation === 0) {
    state.running = false;
  }
  state.lastStepAt = timestamp;
  ctx.persistProgramState("gameoflife");
}

function onKeyDown(programState, ctx, event) {
  if (event.key === "Escape") {
    event.preventDefault();
    exitToShell(programState, ctx);
    return;
  }

  if (programState.running) {
    if (event.key === "e" || event.key === "E" || event.key === "у" || event.key === "У" || event.key === "Insert") {
      event.preventDefault();
      programState.running = false;
      programState.lastStepAt = 0;
      ctx.persistProgramState("gameoflife");
    }
    return;
  }

  if (event.key === "Delete") {
    event.preventDefault();
    clearBoard(programState, ctx);
    return;
  }

  if (event.key === "r" || event.key === "R" || event.key === "к" || event.key === "К" || event.key === "Home") {
    event.preventDefault();
    randomizeBoard(programState, ctx);
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    programState.running = true;
    programState.lastStepAt = performance.now();
    programState.generation = 0;
    programState.population = countPopulation(programState);
    ctx.persistProgramState("gameoflife");
  }
}

function onPointerDown(programState, ctx, event) {
  const target = getPointerCell(programState, ctx, event.clientX, event.clientY);
  if (!target || programState.running) {
    return;
  }

  programState.cursorX = target.col;
  programState.cursorY = target.row;

  if (event.button === 0) {
    const cellIndex = target.row * programState.cols + target.col;
    const nextAlive = programState.cells[cellIndex] === 0;
    programState.pointerAction = "draw";
    if (nextAlive) {
      setCell(programState, ctx, target.col, target.row, true);
    }
    return;
  }

  if (event.button === 2) {
    programState.pointerAction = "erase";
    setCell(programState, ctx, target.col, target.row, false);
  }
}

function onPointerMove(programState, ctx, event) {
  if (programState.running) {
    return;
  }

  const target = getPointerCell(programState, ctx, event.clientX, event.clientY);
  if (!target) {
    return;
  }

  programState.cursorX = target.col;
  programState.cursorY = target.row;

  if (!programState.pointerAction) {
    return;
  }

  setCell(programState, ctx, target.col, target.row, programState.pointerAction === "draw");
}

function onPointerUp(programState) {
  programState.pointerAction = null;
}

function exitToShell(programState, ctx) {
  programState.running = false;
  programState.lastStepAt = 0;
  programState.viewport = null;
  programState.pointerAction = null;
  ctx.setActiveProgram(null);
  ctx.persistProgramState("gameoflife");
  ctx.persistUiState();
}

function renderFooterLine(text, width, leftPadding) {
  if (text.length >= width) {
    return `${leftPadding}${text}`;
  }
  const offset = Math.floor((width - text.length) / 2);
  return `${leftPadding}${" ".repeat(offset)}${text}`;
}

function buildFooterLines(rows) {
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const columnWidths = new Array(columnCount).fill(0);
  const labelWidths = new Array(columnCount).fill(0);
  const parsedRows = rows.map((row) => row.map(parseFooterCell));

  parsedRows.forEach((row) => {
    row.forEach((cell, index) => {
      labelWidths[index] = Math.max(labelWidths[index], cell.label.length);
    });
  });

  const formattedRows = parsedRows.map((row) => row.map((cell, index) => {
    if (!cell.shortcut) {
      return cell.label;
    }
    return `${cell.label.padEnd(labelWidths[index], " ")} - ${cell.shortcut}`;
  }));

  formattedRows.forEach((row) => {
    row.forEach((cell, index) => {
      columnWidths[index] = Math.max(columnWidths[index], cell.length);
    });
  });

  return formattedRows.map((row) => row
    .map((cell, index) => cell.padEnd(columnWidths[index], " "))
    .join(" | "));
}

function parseFooterCell(cell) {
  const parts = cell.split(" - ");
  if (parts.length !== 2) {
    return { label: cell, shortcut: "" };
  }
  return {
    label: parts[0],
    shortcut: parts[1]
  };
}

function getGameOfLifeMetrics(ctx) {
  const fieldCols = Math.max(16, ctx.viewportCols - UI_INSET_LEFT - 12);
  const reservedBottom = 8;
  const fieldRows = Math.max(8, ctx.viewportRows - UI_INSET_TOP - reservedBottom);
  return { fieldCols, fieldRows };
}

function ensureBoard(state, cols, rows) {
  if (state.cols === cols && state.rows === rows && state.cells.length === cols * rows) {
    return;
  }

  const nextCells = new Array(cols * rows).fill(0);
  const copyCols = Math.min(cols, state.cols);
  const copyRows = Math.min(rows, state.rows);
  for (let row = 0; row < copyRows; row += 1) {
    for (let col = 0; col < copyCols; col += 1) {
      nextCells[row * cols + col] = state.cells[row * state.cols + col] || 0;
    }
  }

  state.cols = cols;
  state.rows = rows;
  state.cells = nextCells;
  state.cursorX = wrapCoord(state.cursorX, cols);
  state.cursorY = wrapCoord(state.cursorY, rows);
  state.population = countPopulation(state);
}

function setCell(state, ctx, col, row, alive) {
  const wrappedCol = wrapCoord(col, state.cols);
  const wrappedRow = wrapCoord(row, state.rows);
  state.cells[wrappedRow * state.cols + wrappedCol] = alive ? 1 : 0;
  state.population = countPopulation(state);
  ctx.persistProgramState("gameoflife");
}

function clearBoard(state, ctx) {
  state.cells.fill(0);
  state.generation = 0;
  state.population = 0;
  state.lastStepAt = 0;
  ctx.persistProgramState("gameoflife");
}

function randomizeBoard(state, ctx) {
  for (let i = 0; i < state.cells.length; i += 1) {
    state.cells[i] = Math.random() > 0.72 ? 1 : 0;
  }
  state.generation = 0;
  state.population = countPopulation(state);
  state.lastStepAt = 0;
  ctx.persistProgramState("gameoflife");
}

function countPopulation(state) {
  return state.cells.reduce((sum, cell) => sum + (cell ? 1 : 0), 0);
}

function countNeighbors(state, col, row) {
  let neighbors = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }
      const wrappedCol = wrapCoord(col + dx, state.cols);
      const wrappedRow = wrapCoord(row + dy, state.rows);
      neighbors += state.cells[wrappedRow * state.cols + wrappedCol];
    }
  }
  return neighbors;
}

function getPointerCell(state, ctx, clientX, clientY) {
  if (!state.viewport || !ctx.measureSpan) {
    return null;
  }

  const rect = ctx.terminal.getBoundingClientRect();
  const style = getComputedStyle(ctx.terminal);
  const paddingLeft = parseFloat(style.paddingLeft) || 0;
  const paddingTop = parseFloat(style.paddingTop) || 0;
  const charRect = ctx.measureSpan.getBoundingClientRect();
  const charWidth = Math.max(1, charRect.width);
  const charHeight = Math.max(1, charRect.height);
  const localX = clientX - rect.left - paddingLeft;
  const localY = clientY - rect.top - paddingTop;
  const col = Math.floor(localX / charWidth);
  const row = Math.floor(localY / charHeight);
  const fieldCol = col - state.viewport.originX;
  const fieldRow = row - state.viewport.originY;

  if (fieldCol < 0 || fieldCol >= state.viewport.cols || fieldRow < 0 || fieldRow >= state.viewport.rows) {
    return null;
  }

  return { col: fieldCol, row: fieldRow };
}

function wrapCoord(value, size) {
  if (size <= 0) {
    return 0;
  }
  const normalized = value % size;
  return normalized < 0 ? normalized + size : normalized;
}
