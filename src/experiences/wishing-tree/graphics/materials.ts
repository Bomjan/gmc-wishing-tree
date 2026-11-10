import * as THREE from "three";
import { random } from "./nature";
function canvasTexture(
  size: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function leafTexture() {
  return canvasTexture(256, (c) => {
    const r = random(408),
      g = c.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0, "#829765");
    g.addColorStop(0.48, "#a3b980");
    g.addColorStop(0.52, "#7e9d60");
    g.addColorStop(1, "#687e44");
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 11000; i++) {
      c.fillStyle = r() > 0.5 ? "#d5d6a015" : "#273d2511";
      c.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2);
    }
    c.strokeStyle = "#c5cf9266";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(128, 256);
    c.lineTo(128, 0);
    c.stroke();
    for (let i = 0; i < 13; i++)
      for (const side of [-1, 1]) {
        const y = 18 + i * 18;
        c.strokeStyle = "#bed28b45";
        c.lineWidth = 0.65;
        c.beginPath();
        c.moveTo(128, y + 20);
        c.quadraticCurveTo(128 + side * 35, y + 2, 128 + side * 121, y - 25);
        c.stroke();
      }
  });
}
/** Only the tree's materials are loaded; landscape assets remain available for future work. */
export function createNatureMaterials() {
  const owned: THREE.Texture[] = [];
  const leafMap = leafTexture();
  owned.push(leafMap);
  const bark = new THREE.MeshStandardMaterial({
    color: "#b3aaa0",
    roughness: 0.95,
  });
  const leaf = new THREE.MeshStandardMaterial({
    map: leafMap,
    side: THREE.DoubleSide,
    roughness: 0.78,
    color: "white",
    emissive: "#30411c",
    emissiveIntensity: 0.055,
  });
  let closed = false;
  const loader = new THREE.TextureLoader();
  const ready = Promise.all(
    (["color", "normal", "roughness"] as const).map(
      (kind) =>
        new Promise<void>((resolve) => {
          loader.load(
            `/textures/sanctuary/bark-${kind}.jpg`,
            (texture) => {
              if (closed) {
                texture.dispose();
                resolve();
                return;
              }
              owned.push(texture);
              texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
              texture.anisotropy = 4;
              if (kind === "color") {
                texture.colorSpace = THREE.SRGBColorSpace;
                bark.map = texture;
              } else if (kind === "normal") {
                bark.normalMap = texture;
                bark.normalScale.setScalar(0.7);
              } else bark.roughnessMap = texture;
              bark.needsUpdate = true;
              resolve();
            },
            undefined,
            () => resolve(),
          );
        }),
    ),
  );
  return {
    bark,
    leaf,
    ready,
    dispose() {
      closed = true;
      bark.dispose();
      leaf.dispose();
      owned.forEach((t) => t.dispose());
    },
  };
}
export type NatureMaterials = ReturnType<typeof createNatureMaterials>;
