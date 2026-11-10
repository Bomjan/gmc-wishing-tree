import * as THREE from "three";

export function random(seed: number) {
  let n = seed >>> 0;
  return () => (n = (Math.imul(n, 1664525) + 1013904223) >>> 0) / 4294967296;
}
const hash = (x: number, y: number) => {
  const a = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return a - Math.floor(a);
};
export function noise(x: number, y: number) {
  const i = Math.floor(x),
    j = Math.floor(y),
    a = x - i,
    b = y - j;
  const u = a * a * (3 - 2 * a),
    v = b * b * (3 - 2 * b);
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(hash(i, j), hash(i + 1, j), u),
    THREE.MathUtils.lerp(hash(i, j + 1), hash(i + 1, j + 1), u),
    v,
  );
}
export function fractal(x: number, z: number) {
  let value = 0,
    amplitude = 0.5;
  for (let i = 0; i < 4; i++) {
    value += noise(x, z) * amplitude;
    const nextX = x * 1.73 - z * 0.87 + 13.1;
    z = x * 0.87 + z * 1.73 + 7.3;
    x = nextX;
    amplitude *= 0.5;
  }
  return value;
}
/** One continuous surface shared by terrain, tree roots and camera collision. */
export function terrainHeight(x: number, z: number) {
  let y = -0.45 + (fractal(x * 0.09, z * 0.09) - 0.48) * 2.8;
  for (let layer = 0; layer < 3; layer++) {
    const centre = -95 - layer * 75,
      width = 35 + layer * 22;
    const profile = Math.exp(-Math.pow((z - centre) / width, 2));
    const crest =
      0.43 +
      fractal(x * (0.028 - layer * 0.005) + layer * 11, z * 0.007) * 1.05;
    y += profile * (13 + layer * 15) * crest;
  }
  return y;
}
export function bladeGeometry() {
  const geometry = new THREE.BufferGeometry(),
    vertices: number[] = [],
    uv: number[] = [];
  for (let blade = 0; blade < 4; blade++) {
    const angle = blade * 2.399963,
      dx = Math.cos(angle),
      dz = Math.sin(angle);
    const height = 0.48 + (blade % 3) * 0.13;
    const points = [
      [-0.025, 0, 0],
      [0.025, 0, 0],
      [-0.014, height * 0.55, 0.07],
      [0.014, height * 0.55, 0.07],
      [0, height, 0.15],
    ];
    for (const i of [0, 1, 2, 1, 3, 2, 2, 3, 4]) {
      const [x, y, z] = points[i];
      vertices.push(x * dx - z * dz, y, x * dz + z * dx);
      uv.push(i % 2, y / height);
    }
  }
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}
export function foliageSprayGeometry() {
  const parts = new THREE.BufferGeometry();
  const positions: number[] = [],
    uv: number[] = [];
  for (let side = 0; side < 3; side++) {
    const a = (side * Math.PI) / 3,
      c = Math.cos(a),
      s = Math.sin(a);
    for (const [x, y, u, v] of [
      [-0.5, 0, 0, 0],
      [0.5, 0, 1, 0],
      [-0.5, 1, 0, 1],
      [0.5, 0, 1, 0],
      [0.5, 1, 1, 1],
      [-0.5, 1, 0, 1],
    ]) {
      positions.push(x * c, y, x * s);
      uv.push(u, v);
    }
  }
  parts.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  parts.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  parts.computeVertexNormals();
  return parts;
}
export function rockGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 3),
    p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    const r = 0.82 + noise(x * 4 + 7, z * 4 + y * 2) * 0.32;
    p.setXYZ(i, x * r, y * r * 0.72, z * r);
  }
  g.computeVertexNormals();
  return g;
}
export function leafGeometry(detailed = true) {
  const g = new THREE.PlaneGeometry(
      0.68,
      1.18,
      detailed ? 8 : 2,
      detailed ? 16 : 3,
    ),
    p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) + 0.59) / 1.18;
    const width =
      Math.pow(Math.max(0, Math.sin(Math.PI * t)), 0.78) *
      (1 + 0.025 * Math.sin(t * Math.PI * 32));
    const x = p.getX(i) * width;
    p.setXYZ(
      i,
      x,
      t * 1.18,
      Math.sin(t * Math.PI) * 0.065 + Math.abs(x) * 0.3 + t * t * 0.045,
    );
  }
  g.computeVertexNormals();
  return g;
}
export function leafEdgeGeometry() {
  const points: THREE.Vector3[] = [];
  for (const side of [-1, 1])
    for (let i = 0; i <= 32; i++) {
      const t = side === -1 ? i / 32 : 1 - i / 32;
      const width =
        Math.pow(Math.max(0, Math.sin(Math.PI * t)), 0.78) *
        (1 + 0.025 * Math.sin(t * Math.PI * 32));
      const x = side * 0.34 * width;
      points.push(
        new THREE.Vector3(
          x,
          t * 1.18,
          Math.sin(t * Math.PI) * 0.065 +
            Math.abs(x) * 0.3 +
            t * t * 0.045 +
            0.006,
        ),
      );
    }
  return new THREE.BufferGeometry().setFromPoints(points);
}
/** Tapered wood tubes with bark UVs aligned with the direction of growth. */
export function woodTube(
  curve: THREE.Curve<THREE.Vector3>,
  radius: number,
  segments = 12,
  sides = 7,
) {
  const g = new THREE.TubeGeometry(curve, segments, radius, sides, false),
    p = g.attributes.position,
    uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const t = Math.floor(i / (sides + 1)) / segments,
      centre = curve.getPointAt(t);
    const point = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i))
      .sub(centre)
      .multiplyScalar(1 - t * 0.88)
      .add(centre);
    p.setXYZ(i, point.x, point.y, point.z);
    uv.setXY(i, uv.getY(i) * 1.4, t * curve.getLength() * 1.8);
  }
  g.computeVertexNormals();
  return g;
}
