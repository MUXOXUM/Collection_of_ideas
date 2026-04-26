function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function createDelayBuffer(length, value) {
  return Array.from({ length }, () => value);
}

function createParticleVisuals() {
  return {
    alpha: randomRange(0.18, 0.95),
    size: randomRange(0.7, 2.2)
  };
}

function createSphericalParticle({
  minRadius,
  radiusRange,
  radiusBiasPower,
  zJitter
}) {
  const distanceBias = Math.random() ** radiusBiasPower;
  const radius = minRadius + distanceBias * radiusRange;
  const theta = randomRange(0, Math.PI * 2);
  const phi = Math.acos(randomRange(-1, 1));

  return {
    x: radius * Math.sin(phi) * Math.cos(theta),
    y: radius * Math.sin(phi) * Math.sin(theta),
    z: radius * Math.cos(phi) + randomRange(-zJitter, zJitter),
    ...createParticleVisuals()
  };
}

export const attractors = [
  {
    name: "Lorenz Attractor",
    dt: 0.0025,
    escapeRadius: 180,
    camera: {
      matrix: [
        [0.991035, 0, 0.133599],
        [-0.039098, 0.956219, 0.290029],
        [-0.12775, -0.292653, 0.947647]
      ]
    },
    view: {
      offsetX: -61,
      offsetY: -45,
      scale: 0.854
    },
    createParticle() {
      return createSphericalParticle({
        minRadius: 24,
        radiusRange: 66,
        radiusBiasPower: 0.55,
        zJitter: 18
      });
    },
    derivative(x, y, z) {
      const sigma = 10;
      const rho = 28;
      const beta = 8 / 3;

      return {
        dx: sigma * (y - x),
        dy: x * (rho - z) - y,
        dz: x * y - beta * z
      };
    },
    referencePoints: [
      { x: -18, y: -22, z: 10 },
      { x: -18, y: 22, z: 10 },
      { x: 18, y: -22, z: 10 },
      { x: 18, y: 22, z: 10 },
      { x: 0, y: 0, z: 40 },
      { x: 0, y: 0, z: -2 },
      { x: -10, y: 0, z: 20 },
      { x: 10, y: 0, z: 20 }
    ]
  },
  {
    name: "Rossler Attractor",
    dt: 0.01,
    escapeRadius: 120,
    camera: {
      matrix: [
        [0.210527, -0.976222, 0.051656],
        [-0.40336, -0.134876, -0.905046],
        [0.890494, 0.169701, -0.422164]
      ]
    },
    view: {
      offsetX: -100,
      offsetY: 38,
      scale: 1.172
    },
    createParticle() {
      const angle = randomRange(0, Math.PI * 2);
      const radius = randomRange(2, 18);

      return {
        x: Math.cos(angle) * radius + randomRange(-3, 3),
        y: Math.sin(angle) * radius + randomRange(-3, 3),
        z: randomRange(0, 24),
        ...createParticleVisuals()
      };
    },
    derivative(x, y, z) {
      const a = 0.2;
      const b = 0.2;
      const c = 5.7;

      return {
        dx: -y - z,
        dy: x + a * y,
        dz: b + z * (x - c)
      };
    },
    referencePoints: [
      { x: -14, y: -18, z: 0 },
      { x: -14, y: 18, z: 0 },
      { x: 14, y: -18, z: 0 },
      { x: 14, y: 18, z: 0 },
      { x: 0, y: 0, z: 28 },
      { x: 8, y: 0, z: 12 },
      { x: -8, y: 0, z: 12 }
    ]
  },
  {
    name: "Modified Lu-Chen attractor",
    dt: 0.002,
    escapeRadius: 220,
    camera: {
      matrix: [
        [-0.643825, -0.765091, 0.011151],
        [0.114938, -0.111108, -0.987139],
        [0.756491, -0.634264, 0.159473]
      ]
    },
    view: {
      offsetX: -24,
      offsetY: 79,
      scale: 0.656
    },
    createParticle() {
      const particle = createSphericalParticle({
        minRadius: 18,
        radiusRange: 54,
        radiusBiasPower: 0.6,
        zJitter: 12
      });
      const delayLength = 100;

      return {
        ...particle,
        delayedZ: particle.z,
        zHistory: createDelayBuffer(delayLength, particle.z),
        zHistoryIndex: 0
      };
    },
    derivative(x, y, z, point) {
      const a = 35;
      const b = 3;
      const c = 28;
      const d0 = 1;
      const d1 = 1;
      const d2 = 0;
      const delayedZ = point.delayedZ ?? z;
      const f = d0 * z + d1 * delayedZ - d2 * Math.sin(delayedZ);

      return {
        dx: a * (y - x),
        dy: (c - a) * x - x * f + c * y,
        dz: x * y - b * z
      };
    },
    beforeStep(point) {
      point.delayedZ = point.zHistory[point.zHistoryIndex];
    },
    afterStep(point) {
      point.zHistory[point.zHistoryIndex] = point.z;
      point.zHistoryIndex = (point.zHistoryIndex + 1) % point.zHistory.length;
      point.delayedZ = point.zHistory[point.zHistoryIndex];
    },
    referencePoints: [
      { x: -28, y: -32, z: 0 },
      { x: -28, y: 32, z: 0 },
      { x: 28, y: -32, z: 0 },
      { x: 28, y: 32, z: 0 },
      { x: 0, y: 0, z: 55 },
      { x: 0, y: 0, z: -8 },
      { x: -16, y: 0, z: 24 },
      { x: 16, y: 0, z: 24 }
    ]
  },
  {
    name: "Thomas' Cyclically Symmetric Attractor",
    dt: 0.02,
    escapeRadius: 24,
    camera: {
      matrix: [
        [-0.257482, 0.691585, 0.674843],
        [0.833224, 0.512574, -0.207379],
        [-0.489327, 0.508899, -0.708224]
      ]
    },
    view: {
      offsetX: 175,
      offsetY: 216,
      scale: 3.749
    },
    createParticle() {
      return createSphericalParticle({
        minRadius: 0.12,
        radiusRange: 2.6,
        radiusBiasPower: 0.9,
        zJitter: 0.4
      });
    },
    derivative(x, y, z) {
      const b = 0.208186;

      return {
        dx: Math.sin(y) - b * x,
        dy: Math.sin(z) - b * y,
        dz: Math.sin(x) - b * z
      };
    },
    referencePoints: [
      { x: -1.5, y: -1.5, z: -1.5 },
      { x: -1.5, y: 4.1, z: 4.1 },
      { x: 4.1, y: -1.5, z: 4.1 },
      { x: 4.1, y: 4.1, z: -1.5 },
      { x: 4.1, y: 4.1, z: 4.1 },
      { x: 1.4, y: 1.4, z: 1.4 },
      { x: 3.6, y: 0.4, z: 0.4 },
      { x: 0.4, y: 3.6, z: 0.4 },
      { x: 0.4, y: 0.4, z: 3.6 }
    ]
  },
  {
    name: "Aizawa Attractor",
    dt: 0.005,
    escapeRadius: 24,
    camera: {
      matrix: [
        [0.906308, -0.422618, 0],
        [0.231681, 0.496732, -0.836462],
        [0.353553, 0.758062, 0.547998]
      ]
    },
    view: {
      offsetX: 0,
      offsetY: 0,
      scale: 10
    },
    createParticle() {
      const angle = randomRange(0, Math.PI * 2);
      const radius = randomRange(0.35, 1.25);

      return {
        x: Math.cos(angle) * radius + randomRange(-0.08, 0.08),
        y: Math.sin(angle) * radius + randomRange(-0.08, 0.08),
        z: randomRange(-0.2, 1.4),
        ...createParticleVisuals()
      };
    },
    derivative(x, y, z) {
      const a = 0.95;
      const b = 0.7;
      const c = 0.6;
      const d = 3.5;
      const e = 0.25;
      const f = 0.1;

      return {
        dx: (z - b) * x - d * y,
        dy: d * x + (z - b) * y,
        dz: c + a * z - (z ** 3) / 3 - (x * x + y * y) * (1 + e * z) + f * z * x ** 3
      };
    },
    beforeStep(point) {
      const axisDistance = Math.hypot(point.x, point.y);

      if (axisDistance < 0.08) {
        const kickAngle = randomRange(0, Math.PI * 2);
        const kickStrength = randomRange(0.03, 0.08);
        point.x += Math.cos(kickAngle) * kickStrength;
        point.y += Math.sin(kickAngle) * kickStrength;
      }
    },
    referencePoints: [
      { x: -1.8, y: -1.8, z: -0.5 },
      { x: -1.8, y: 1.8, z: -0.5 },
      { x: 1.8, y: -1.8, z: -0.5 },
      { x: 1.8, y: 1.8, z: -0.5 },
      { x: -1.8, y: -1.8, z: 2.1 },
      { x: -1.8, y: 1.8, z: 2.1 },
      { x: 1.8, y: -1.8, z: 2.1 },
      { x: 1.8, y: 1.8, z: 2.1 },
      { x: 0, y: 0, z: 1.9 }
    ]
  }
];
