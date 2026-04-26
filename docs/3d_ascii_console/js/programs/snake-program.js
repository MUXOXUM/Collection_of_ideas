import { UI_INSET_LEFT, UI_INSET_TOP } from "../constants.js";
import { createSnakeState } from "./snake-state.js";

const DIRECTION_VECTORS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};

const OPPOSITE_DIRECTIONS = {
  up: "down",
  down: "up",
  left: "right",
  right: "left"
};

export function createSnakeProgram() {
  return {
    id: "snake",
    command: "snake",
    description: "play snake in ascii",
    createState: createSnakeState,
    getHelpLines,
    enter,
    serializeState,
    restoreState,
    render,
    tick,
    onKeyDown
  };
}

function getHelpLines() {
  return [
    "",
    "usage: snake",
    "",
    "opens an ASCII snake game.",
    "",
    "controls:",
    "- arrows or wasd change direction",
    "- enter or r starts / restarts",
    "- esc returns to shell",
    "",
    "rules:",
    "- eat o to grow",
    "- walls are solid",
    "- hitting yourself ends the round",
    ""
  ];
}

function enter(programState, ctx) {
  ensureBoard(programState, ctx);
  if (!programState.snake.length) {
    resetRound(programState);
  }
  ctx.setActiveProgram("snake");
  ctx.persistProgramState("snake");
  ctx.persistUiState();
}

function serializeState(programState) {
  return {
    cols: programState.cols,
    rows: programState.rows,
    snake: programState.snake.map((segment) => ({ x: segment.x, y: segment.y })),
    direction: programState.direction,
    pendingDirection: programState.pendingDirection,
    food: programState.food ? { x: programState.food.x, y: programState.food.y } : null,
    score: programState.score,
    bestScore: programState.bestScore,
    running: programState.running,
    gameOver: programState.gameOver,
    won: programState.won
  };
}

function restoreState(savedState) {
  const state = createSnakeState();
  if (!savedState || typeof savedState !== "object") {
    return state;
  }

  state.cols = normalizeInt(savedState.cols, 0);
  state.rows = normalizeInt(savedState.rows, 0);
  state.snake = Array.isArray(savedState.snake)
    ? savedState.snake
      .filter((segment) => segment && typeof segment.x === "number" && typeof segment.y === "number")
      .map((segment) => ({ x: Math.floor(segment.x), y: Math.floor(segment.y) }))
    : [];
  state.direction = isDirection(savedState.direction) ? savedState.direction : "right";
  state.pendingDirection = isDirection(savedState.pendingDirection) ? savedState.pendingDirection : state.direction;
  state.food = savedState.food && typeof savedState.food.x === "number" && typeof savedState.food.y === "number"
    ? { x: Math.floor(savedState.food.x), y: Math.floor(savedState.food.y) }
    : null;
  state.score = normalizeInt(savedState.score, 0);
  state.bestScore = normalizeInt(savedState.bestScore, 0);
  state.running = Boolean(savedState.running);
  state.gameOver = Boolean(savedState.gameOver);
  state.won = Boolean(savedState.won);
  return state;
}

function render(programState, ctx) {
  ensureBoard(programState, ctx);
  const lines = [];
  const boardWidth = programState.cols + 2;
  const footerLines = buildFooterLines([
    [`Score: ${programState.score}`, "Move - Arrows/WASD"],
    [`Record: ${programState.bestScore}`, "Restart - Enter/R"],
    ["", "Exit - ESC"]
  ]);
  const statusLine = getStatusLine(programState);
  const infoWidth = Math.max(
    boardWidth,
    ...footerLines.map((line) => line.length)
  );
  const blockHeight = programState.rows + 4 + footerLines.length;
  const topInset = Math.max(UI_INSET_TOP, Math.floor((ctx.viewportRows - blockHeight) / 2));
  const leftInset = Math.max(UI_INSET_LEFT, Math.floor((ctx.viewportCols - infoWidth) / 2));
  const leftPadding = " ".repeat(leftInset);
  const occupied = new Map(programState.snake.map((segment, index) => [`${segment.x}:${segment.y}`, index]));

  for (let i = 0; i < topInset; i += 1) {
    if (statusLine && i === topInset - 2) {
      lines.push(`${leftPadding}${centerText(statusLine, infoWidth)}`);
    } else {
      lines.push("");
    }
  }

  lines.push(`${leftPadding}+${"-".repeat(programState.cols)}+`);
  for (let row = 0; row < programState.rows; row += 1) {
    let line = `${leftPadding}|`;
    for (let col = 0; col < programState.cols; col += 1) {
      const key = `${col}:${row}`;
      if (programState.food && programState.food.x === col && programState.food.y === row) {
        line += "o";
      } else if (occupied.has(key)) {
        line += occupied.get(key) === 0 ? "@" : "#";
      } else {
        line += " ";
      }
    }
    line += "|";
    lines.push(line);
  }
  lines.push(`${leftPadding}+${"-".repeat(programState.cols)}+`);
  lines.push("");
  footerLines.forEach((line) => {
    lines.push(`${leftPadding}${centerText(line, infoWidth)}`);
  });

  return { format: "text", content: lines.join("\n") };
}

function tick(programState, ctx, timestamp) {
  ensureBoard(programState, ctx);
  if (!programState.running || programState.gameOver) {
    return;
  }

  if (!programState.lastStepAt) {
    programState.lastStepAt = timestamp;
  }
  if (timestamp - programState.lastStepAt < programState.stepIntervalMs) {
    return;
  }

  stepSnake(programState);
  programState.lastStepAt = timestamp;
  ctx.persistProgramState("snake");
}

function onKeyDown(programState, ctx, event) {
  if (event.key === "Escape") {
    event.preventDefault();
    exitToShell(programState, ctx);
    return;
  }

  const nextDirection = mapKeyToDirection(event.key);
  if (nextDirection) {
    event.preventDefault();
    if (programState.gameOver || programState.won) {
      return;
    }
    if (canTurn(programState, nextDirection)) {
      programState.pendingDirection = nextDirection;
      if (!programState.running) {
        programState.running = true;
        programState.lastStepAt = performance.now();
      }
      ctx.persistProgramState("snake");
    }
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    resetRound(programState);
    programState.running = true;
    programState.lastStepAt = performance.now();
    ctx.persistProgramState("snake");
    return;
  }

  if (event.key === "r" || event.key === "R" || event.key === "к" || event.key === "К") {
    event.preventDefault();
    resetRound(programState);
    programState.running = true;
    programState.lastStepAt = performance.now();
    ctx.persistProgramState("snake");
  }
}

function ensureBoard(state, ctx) {
  const metrics = getSnakeMetrics(ctx);
  if (state.cols === metrics.cols && state.rows === metrics.rows) {
    return;
  }

  state.cols = metrics.cols;
  state.rows = metrics.rows;
  resetRound(state);
}

function getSnakeMetrics(ctx) {
  return {
    cols: Math.max(18, Math.min(42, ctx.viewportCols - 16)),
    rows: Math.max(10, Math.min(22, ctx.viewportRows - 10))
  };
}

function resetRound(state) {
  const centerX = Math.floor(state.cols / 2);
  const centerY = Math.floor(state.rows / 2);
  state.snake = [
    { x: centerX, y: centerY },
    { x: centerX - 1, y: centerY },
    { x: centerX - 2, y: centerY }
  ];
  state.direction = "right";
  state.pendingDirection = "right";
  state.score = 0;
  state.running = false;
  state.gameOver = false;
  state.won = false;
  state.lastStepAt = 0;
  state.food = spawnFood(state);
}

function stepSnake(state) {
  const direction = canTurn(state, state.pendingDirection) ? state.pendingDirection : state.direction;
  state.direction = direction;
  const vector = DIRECTION_VECTORS[direction];
  const head = state.snake[0];
  const nextHead = {
    x: head.x + vector.x,
    y: head.y + vector.y
  };

  const grows = Boolean(state.food && nextHead.x === state.food.x && nextHead.y === state.food.y);
  const bodyToCheck = grows ? state.snake : state.snake.slice(0, -1);
  const hitsWall = nextHead.x < 0 || nextHead.y < 0 || nextHead.x >= state.cols || nextHead.y >= state.rows;
  const hitsBody = bodyToCheck.some((segment) => segment.x === nextHead.x && segment.y === nextHead.y);

  if (hitsWall || hitsBody) {
    state.running = false;
    state.gameOver = true;
    state.won = false;
    state.bestScore = Math.max(state.bestScore, state.score);
    return;
  }

  state.snake.unshift(nextHead);
  if (grows) {
    state.score += 1;
    state.bestScore = Math.max(state.bestScore, state.score);
    state.food = spawnFood(state);
    return;
  }

  state.snake.pop();
}

function spawnFood(state) {
  const occupied = new Set(state.snake.map((segment) => `${segment.x}:${segment.y}`));
  const available = [];
  for (let row = 0; row < state.rows; row += 1) {
    for (let col = 0; col < state.cols; col += 1) {
      const key = `${col}:${row}`;
      if (!occupied.has(key)) {
        available.push({ x: col, y: row });
      }
    }
  }

  if (!available.length) {
    state.running = false;
    state.gameOver = false;
    state.won = true;
    return null;
  }

  return available[Math.floor(Math.random() * available.length)];
}

function getStatusLine(state) {
  if (state.won) {
    return "WIN";
  }
  if (state.gameOver) {
    return "GAME OVER";
  }
  return "";
}

function exitToShell(programState, ctx) {
  programState.running = false;
  programState.lastStepAt = 0;
  ctx.setActiveProgram(null);
  ctx.persistProgramState("snake");
  ctx.persistUiState();
}

function mapKeyToDirection(key) {
  switch (key) {
    case "ArrowUp":
    case "w":
    case "W":
    case "ц":
    case "Ц":
      return "up";
    case "ArrowDown":
    case "s":
    case "S":
    case "ы":
    case "Ы":
      return "down";
    case "ArrowLeft":
    case "a":
    case "A":
    case "ф":
    case "Ф":
      return "left";
    case "ArrowRight":
    case "d":
    case "D":
    case "в":
    case "В":
      return "right";
    default:
      return null;
  }
}

function canTurn(state, nextDirection) {
  return nextDirection !== OPPOSITE_DIRECTIONS[state.direction] || state.snake.length <= 1;
}

function centerText(text, width) {
  if (text.length >= width) {
    return text;
  }
  const left = Math.floor((width - text.length) / 2);
  return `${" ".repeat(left)}${text}`;
}

function normalizeInt(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
}

function isDirection(value) {
  return value === "up" || value === "down" || value === "left" || value === "right";
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
