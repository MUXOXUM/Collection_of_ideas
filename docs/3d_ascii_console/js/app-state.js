import { DEFAULT_PROMPT } from "./constants.js";

export function createShellState() {
  return {
    lines: [],
    input: "",
    history: [],
    historyIndex: 0,
    prompt: DEFAULT_PROMPT
  };
}

export function createAppState(programs) {
  const programStates = {};
  programs.forEach((program) => {
    programStates[program.id] = program.createState();
  });

  return {
    shell: createShellState(),
    activeProgramId: null,
    viewportCols: 120,
    viewportRows: 44,
    charAspect: 0.5,
    animationFrame: 0,
    lastTimestamp: 0,
    measureSpan: null,
    programs: programStates
  };
}
