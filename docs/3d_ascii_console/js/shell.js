import {
  CARET_BLINK_MS,
  COMMAND_HISTORY_LIMIT,
  DEFAULT_PROMPT,
  NAMED_COLORS,
  SHELL_STATE_LINE_LIMIT,
  UI_INSET_LEFT,
  UI_INSET_TOP
} from "./constants.js";
import { insetTextLines } from "./text-utils.js";

export function renderShellView(shellState, options = {}) {
  const { showCaret = false, timestamp = 0 } = options;
  const lines = [];
  lines.push(...shellState.lines);
  lines.push(`${shellState.prompt}${shellState.input}${getCaretChar(showCaret, timestamp)}`);
  return insetTextLines(lines, UI_INSET_TOP, UI_INSET_LEFT).join("\n");
}

export function handleShellKeyDown(shellState, ctx, event) {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return;
  }

  if (event.key === "Backspace") {
    event.preventDefault();
    shellState.input = shellState.input.slice(0, -1);
    ctx.persistShellState();
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    runShellCommand(shellState, ctx, shellState.input);
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    if (shellState.history.length === 0) {
      return;
    }
    shellState.historyIndex = Math.max(0, shellState.historyIndex - 1);
    shellState.input = shellState.history[shellState.historyIndex] || "";
    ctx.persistShellState();
    return;
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    if (shellState.history.length === 0) {
      return;
    }
    shellState.historyIndex = Math.min(shellState.history.length, shellState.historyIndex + 1);
    shellState.input = shellState.historyIndex === shellState.history.length ? "" : shellState.history[shellState.historyIndex];
    ctx.persistShellState();
    return;
  }

  if (event.key.length === 1) {
    event.preventDefault();
    shellState.input += event.key;
    ctx.persistShellState();
  }
}

export function runShellCommand(shellState, ctx, rawInput) {
  const input = rawInput.trim();
  const parts = input ? input.split(/\s+/) : [];
  const command = parts[0] ? parts[0].toLowerCase() : "";
  const args = parts.slice(1);
  shellState.lines.push(`${shellState.prompt}${rawInput}`);

  if (input) {
    shellState.history.push(input);
    if (shellState.history.length > COMMAND_HISTORY_LIMIT) {
      shellState.history = shellState.history.slice(-COMMAND_HISTORY_LIMIT);
    }
    shellState.historyIndex = shellState.history.length;
    ctx.persistCommandHistory();
  }

  shellState.input = "";
  ctx.persistShellState();

  if (!input) {
    trimShellBuffer(shellState, ctx);
    return;
  }

  const handled = executeShellCommand(shellState, ctx, command, args);
  if (handled) {
    return;
  }

  shellState.lines.push(`unknown command: ${input}`);
  shellState.lines.push("type help");
  trimShellBuffer(shellState, ctx);
}

function executeShellCommand(shellState, ctx, command, args) {
  const builtinHandlers = {
    help() {
      appendShellLines(shellState, getHelpLines(ctx.programs));
      trimShellBuffer(shellState, ctx);
    },
    sysinfo() {
      appendShellLines(shellState, getSystemInfoLines());
      trimShellBuffer(shellState, ctx);
    },
    pwd() {
      shellState.lines.push(window.location.pathname || "/");
      trimShellBuffer(shellState, ctx);
    },
    clear() {
      clearShellScreen(shellState, ctx);
    },
    color() {
      handleColorCommand(shellState, ctx, args);
      trimShellBuffer(shellState, ctx);
    },
    reboot() {
      ctx.rebootConsole();
    }
  };

  if (builtinHandlers[command]) {
    builtinHandlers[command]();
    return true;
  }

  const program = ctx.programCommandMap[command];
  if (!program) {
    return false;
  }

  ctx.openProgram(program.id, args);
  return true;
}

export function buildPrompt() {
  const browser = detectBrowserName();
  const os = detectOsName();
  if (!browser || !os) {
    return DEFAULT_PROMPT;
  }

  return `${browser}@${os} ~> `;
}

export function clearShellScreen(shellState, ctx) {
  shellState.lines = [];
  shellState.input = "";
  shellState.historyIndex = shellState.history.length;
  ctx.persistShellState();
}

export function trimShellBuffer(shellState, ctx) {
  const maxLines = Math.max(6, ctx.viewportRows - 3);
  if (shellState.lines.length > maxLines) {
    shellState.lines = shellState.lines.slice(shellState.lines.length - maxLines);
  }
  ctx.persistShellState();
}

export function normalizeHistory(shellState) {
  shellState.history = shellState.history
    .filter((entry) => typeof entry === "string" && entry.trim())
    .slice(-COMMAND_HISTORY_LIMIT);
  shellState.historyIndex = shellState.history.length;
}

function appendShellLines(shellState, lines) {
  shellState.lines.push(...lines);
}

function getCaretChar(showCaret, timestamp) {
  if (!showCaret) {
    return " ";
  }
  return Math.floor(timestamp / CARET_BLINK_MS) % 2 === 0 ? "_" : " ";
}

function getHelpLines(programs) {
  const utilityRows = [
    ["help", "", "show this help"],
    ["pwd", "", "show current pathname"],
    ["sysinfo", "", "show browser system info"],
    ["clear", "", "clear terminal text"],
    ["color", "-h", "change text/background colors"],
    ["reboot", "", "clear saved browser data"]
  ];
  const commandRows = programs.map((program) => [program.command, "", program.description]);

  return [
    ...buildHelpTable(commandRows),
    "",
    ...buildHelpTable(utilityRows)
  ];
}

function buildHelpTable(rows) {
  const commandWidth = Math.max("Command".length, ...rows.map(([command]) => command.length));
  const flagsWidth = Math.max("Flags".length, ...rows.map(([, flags]) => flags.length));
  const descriptionWidth = Math.max("Description".length, ...rows.map(([, , description]) => description.length));
  const border = `+${"-".repeat(commandWidth + 2)}+${"-".repeat(flagsWidth + 2)}+${"-".repeat(descriptionWidth + 2)}+`;
  const lines = [
    border,
    `| ${"Command".padEnd(commandWidth, " ")} | ${"Flags".padEnd(flagsWidth, " ")} | ${"Description".padEnd(descriptionWidth, " ")} |`,
    border
  ];

  rows.forEach(([command, flags, description]) => {
    lines.push(`| ${command.padEnd(commandWidth, " ")} | ${flags.padEnd(flagsWidth, " ")} | ${description.padEnd(descriptionWidth, " ")} |`);
  });

  lines.push(border);
  return lines;
}

function handleColorCommand(shellState, ctx, args) {
  if (hasHelpFlag(args)) {
    appendShellLines(shellState, getColorHelpLines());
    return;
  }

  if (args.length < 1 || args.length > 2) {
    shellState.lines.push("usage: color <text> [background]");
    shellState.lines.push("tip: color -h");
    return;
  }

  const textColor = parseColorArgument(args[0]);
  const backgroundColor = args.length === 2 ? parseColorArgument(args[1]) : null;

  if (!textColor || (args.length === 2 && !backgroundColor)) {
    shellState.lines.push("invalid color value");
    shellState.lines.push("tip: color -h");
    return;
  }

  const finalBackground = backgroundColor || ctx.getConsoleColors().background;
  if (normalizeHexColor(textColor) === normalizeHexColor(finalBackground)) {
    shellState.lines.push("text and background colors must be different");
    return;
  }

  ctx.applyConsoleColors(textColor, finalBackground);
  ctx.persistConsoleSettings();
  shellState.lines.push(
    args.length === 1
      ? `text color changed to ${textColor}`
      : `text/background changed to ${textColor} ${finalBackground}`
  );
}

function getColorHelpLines() {
  return [
    "",
    "usage: color <text> [background]",
    "",
    "changes terminal text color and optional background color.",
    "supported values:",
    "- green blue gray white black yellow red",
    "- #RRGGBB or #RGB",
    "",
    "examples:",
    "- color green",
    "- color #00ff00 #000000",
    ""
  ];
}

function hasHelpFlag(args) {
  return args.includes("-h");
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

function detectBrowserName() {
  const ua = window.navigator.userAgent || "";
  const brands = window.navigator.userAgentData && Array.isArray(window.navigator.userAgentData.brands)
    ? window.navigator.userAgentData.brands.map((brand) => brand.brand).join(" ")
    : "";
  const source = `${brands} ${ua}`.toLowerCase();

  if (source.includes("firefox")) {
    return "firefox";
  }
  if (source.includes("edg")) {
    return "edge";
  }
  if (source.includes("opr") || source.includes("opera")) {
    return "opera";
  }
  if (source.includes("chrome") || source.includes("chromium")) {
    return "chrome";
  }
  if (source.includes("safari") && !source.includes("chrome") && !source.includes("chromium")) {
    return "safari";
  }

  return null;
}

function detectOsName() {
  const nav = window.navigator;
  const platform = (nav.userAgentData && nav.userAgentData.platform) || nav.platform || "";
  const ua = nav.userAgent || "";
  const source = `${platform} ${ua}`.toLowerCase();

  if (source.includes("windows")) {
    return "windows";
  }
  if (source.includes("android")) {
    return "android";
  }
  if (source.includes("iphone") || source.includes("ipad") || source.includes("ios")) {
    return "ios";
  }
  if (source.includes("mac") || source.includes("darwin")) {
    return "macos";
  }
  if (source.includes("linux") || source.includes("x11")) {
    return "linux";
  }

  return null;
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
