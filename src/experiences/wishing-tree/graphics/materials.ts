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
function sceneryTexture() {
  return canvasTexture(256, (c) => {
    const r = random(799);
    c.clearRect(0, 0, 256, 256);
    c.strokeStyle = "#524c33";
    c.lineWidth = 2;
    for (let twig = 0; twig < 8; twig++) {
      const angle = twig * 2.4,
        len = 38 + r() * 58,
        ex = 128 + Math.cos(angle) * len,
        ey = 150 + Math.sin(angle) * len;
      c.beginPath();
      c.moveTo(128, 252);
      c.quadraticCurveTo(128, 170, ex, ey);
      c.stroke();
      for (let leaf = 0; leaf < 13; leaf++) {
        const t = leaf / 13,
          x = 128 + (ex - 128) * t + (r() - 0.5) * 42,
          y = 245 + (ey - 245) * t + (r() - 0.5) * 26;
        c.fillStyle = `hsl(${83 + r() * 18} ${17 + r() * 15}% ${27 + r() * 19}%)`;
        c.beginPath();
        c.ellipse(
          x,
          y,
          5 + r() * 6,
          2.5 + r() * 4,
          angle + r(),
          0,
          Math.PI * 2,
        );
        c.fill();
      }
    }
  });
}
export function createNatureMaterials() {
  const owned: THREE.Texture[] = [];
  const leafMap = leafTexture(),
    spray = sceneryTexture();
  owned.push(leafMap, spray);
  const bark = new THREE.MeshStandardMaterial({
    color: "#b3aaa0",
    roughness: 0.95,
  });
  const ground = new THREE.MeshStandardMaterial({
    color: "#d1d1b5",
    roughness: 1,
    vertexColors: true,
  });
  // Art-direct the dry photographed ground toward a living meadow while
  // retaining its real microdetail and physical normal/roughness response.
  ground.onBeforeCompile = (shader) => {
    shader.vertexShader =
      "varying float vSanctuaryHeight;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n vSanctuaryHeight=position.y;",
      );
    shader.fragmentShader =
      "varying float vSanctuaryHeight;\n" +
      shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
      float luminance=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
      vec3 meadow=vec3(luminance*.85,luminance*1.36,luminance*.63)*1.65;
      vec3 rockTone=vec3(luminance*1.13,luminance*1.18,luminance*1.12);
      vec3 grade=mix(meadow,rockTone,smoothstep(16.,38.,vSanctuaryHeight));
      diffuseColor.rgb=mix(diffuseColor.rgb,grade,.78);
    `,
      );
  };
  ground.customProgramCacheKey = () => "sanctuary-meadow-grade-v1";
  const rock = new THREE.MeshStandardMaterial({
    color: "#b1b3a3",
    roughness: 0.98,
  });
  const leaf = new THREE.MeshStandardMaterial({
    map: leafMap,
    side: THREE.DoubleSide,
    roughness: 0.78,
    color: "white",
    emissive: "#30411c",
    emissiveIntensity: 0.055,
  });
  const scenery = new THREE.MeshStandardMaterial({
    map: spray,
    alphaTest: 0.42,
    side: THREE.DoubleSide,
    color: "#b8c5a2",
    roughness: 1,
  });
  const grass = new THREE.MeshStandardMaterial({
    color: "#a8b28a",
    roughness: 1,
    side: THREE.DoubleSide,
  });
  const stem = new THREE.MeshStandardMaterial({
    color: "#3b3427",
    roughness: 1,
  });
  const wind = { value: 0 };
  grass.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = wind;
    shader.vertexShader =
      "uniform float uWindTime;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
 vec3 anchor = position;
 #ifdef USE_INSTANCING
 anchor = instanceMatrix[3].xyz;
 #endif
 transformed.x += sin(uWindTime*.9 + anchor.x*.4 + anchor.z*.3)*position.y*position.y*.075;
 transformed.z += cos(uWindTime*.7+anchor.x*.3)*position.y*position.y*.04;
 `,
      );
  };
  grass.customProgramCacheKey = () => "sanctuary-grass-wind-v1";
  let closed = false;
  const loader = new THREE.TextureLoader();
  const entries = [
    ["bark", bark],
    ["ground", ground],
    ["rock", rock],
  ] as const;
  const pending: Promise<void>[] = [];
  for (const [name, material] of entries)
    for (const kind of ["color", "normal", "roughness"] as const) {
      pending.push(
        new Promise((resolve) => {
          loader.load(
            `/textures/sanctuary/${name}-${kind}.jpg`,
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
                material.map = texture;
              } else if (kind === "normal") {
                material.normalMap = texture;
                material.normalScale.setScalar(name === "ground" ? 0.45 : 0.7);
              } else material.roughnessMap = texture;
              material.needsUpdate = true;
              resolve();
            },
            undefined,
            () => resolve(),
          ); // Keep the surface rendering if a local texture is unavailable.
        }),
      );
    }
  return {
    bark,
    ground,
    rock,
    leaf,
    scenery,
    grass,
    stem,
    wind,
    ready: Promise.all(pending),
    dispose() {
      closed = true;
      [bark, ground, rock, leaf, scenery, grass, stem].forEach((m) =>
        m.dispose(),
      );
      owned.forEach((t) => t.dispose());
    },
  };
}
export type NatureMaterials = ReturnType<typeof createNatureMaterials>;
