export function createSnakeState() {
  return {
    cols: 0,
    rows: 0,
    snake: [],
    direction: "right",
    pendingDirection: "right",
    food: null,
    score: 0,
    bestScore: 0,
    running: false,
    gameOver: false,
    won: false,
    lastStepAt: 0,
    stepIntervalMs: 120
  };
}
