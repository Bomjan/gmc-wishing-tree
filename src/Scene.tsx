import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { OrbitControls as OrbitImpl } from "three-stdlib";
import {
  ground,
  leafPoint,
  treeScale,
  forestBounds,
  type Tree,
} from "./shared";
import { useSanctuary } from "./state";
const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
const reduced = () => motionPreference.matches;
let developmentCamera: THREE.Camera | null = null;
export function getCameraPosition() {
  return developmentCamera?.position.toArray();
}
function noise(x: number, z: number) {
  return (
    Math.sin(x * 0.12 + Math.sin(z * 0.16)) * Math.cos(z * 0.1) * 2 +
    Math.sin(x * 0.48 + z * 0.31) * 0.16
  );
}
function ridge(x: number, z: number) {
  return (
    ground(x, z) +
    Math.max(0, (-z - 55) * 0.11) *
      (1.2 + Math.sin(x * 0.067) * 0.5 + Math.cos(x * 0.18 + z * 0.07) * 0.3) +
    noise(x, z) * Math.min(1, Math.max(0, (-z - 12) / 15))
  );
}
function sceneryGround(x: number, z: number) {
  let y = ridge(x, z);
  for (let layer = 0; layer < 3; layer++) {
    const local = z + 105 + layer * 40;
    if (Math.abs(local) > 42.5) continue;
    const peak =
      10 +
      layer * 5 +
      Math.sin(x * 0.037 + layer * 3) * 5 +
      Math.sin(x * 0.083 + layer) * 3 +
      Math.cos(x * 0.19) * 1.1;
    y = Math.max(
      y,
      -3 + Math.pow(Math.max(0, Math.cos((local / 85) * Math.PI)), 1.5) * peak,
    );
  }
  return y;
}
function Terrain({ bounds }: { bounds: number }) {
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(
      Math.max(260, bounds * 2 + 100),
      Math.max(230, bounds * 2 + 160),
      180,
      160,
    );
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position,
      colors = [];
    const a = new THREE.Color(),
      green = new THREE.Color("#596c3c"),
      stone = new THREE.Color("#8d967b");
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        z = p.getZ(i) - 55,
        y = ridge(x, z);
      p.setXYZ(i, x, y, z);
      a.copy(green)
        .lerp(stone, Math.min(0.8, Math.max(0, (y - 4) / 32)))
        .multiplyScalar(0.91 + 0.12 * Math.sin(x * 2.3 + z * 1.4));
      colors.push(a.r, a.g, a.b);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, [bounds]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors roughness={1} />
    </mesh>
  );
}
function Bark() {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#756556";
    ctx.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 350; i++) {
      const x = (i * 31.71) % 128,
        y = (i * 71.37) % 256;
      ctx.strokeStyle = i % 2 ? "#55483b" : "#91816c";
      ctx.lineWidth = 0.5 + (i % 3);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + 4, y + 8, x - 3, y + 26, x + 1, y + 44);
      ctx.stroke();
    }
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <meshStandardMaterial
      map={texture}
      bumpMap={texture}
      roughness={0.98}
      bumpScale={0.1}
    />
  );
}
function branchGeometry(seed: number, slots: number[]) {
  const geometries: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.13, 1.6, 0),
    new THREE.Vector3(-0.08, 3.3, 0.05),
    new THREE.Vector3(0.12, 5.05, 0),
  ]);
  const trunkGeo = new THREE.TubeGeometry(trunk, 16, 0.15, 7, false);
  const tp = trunkGeo.attributes.position;
  for (let i = 0; i < tp.count; i++) {
    const t = Math.floor(i / 8) / 16,
      center = trunk.getPointAt(t),
      v = new THREE.Vector3(tp.getX(i), tp.getY(i), tp.getZ(i));
    v.sub(center)
      .multiplyScalar(1 - t * 0.93)
      .add(center);
    tp.setXYZ(i, v.x, v.y, v.z);
  }
  trunkGeo.computeVertexNormals();
  geometries.push(trunkGeo);
  for (const group of new Set(slots.map((slot) => Math.floor(slot / 6)))) {
    const p = new THREE.Vector3(...leafPoint(group * 6, seed));
    p.multiply(new THREE.Vector3(0.84, 0.96, 0.84));
    const start = new THREE.Vector3(0, 1.5 + (group % 4) * 0.25, 0);
    const mid = new THREE.Vector3(p.x * 0.36, p.y * 0.7, p.z * 0.36);
    geometries.push(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([start, mid, p]),
        10,
        0.045,
        6,
        false,
      ),
    );
  }
  for (const i of slots) {
    const p = new THREE.Vector3(...leafPoint(i, seed)),
      base = new THREE.Vector3(
        ...leafPoint(Math.floor(i / 6) * 6, seed),
      ).multiply(new THREE.Vector3(0.84, 0.96, 0.84));
    geometries.push(
      new THREE.TubeGeometry(new THREE.LineCurve3(base, p), 1, 0.012, 4, false),
    );
  }
  return geometries;
}
function leafGeometry() {
  const g = new THREE.PlaneGeometry(1, 1.8, 6, 10),
    p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i),
      t = (y + 0.9) / 1.8,
      x = p.getX(i) * Math.pow(Math.sin(Math.PI * t), 0.7);
    p.setXYZ(i, x, y, Math.sin(t * Math.PI) * 0.13 + Math.abs(x) * 0.13);
  }
  g.computeVertexNormals();
  return g;
}
function WishTree({ tree }: { tree: Tree }) {
  const ref = useRef<THREE.Group>(null),
    leaves = useRef<THREE.InstancedMesh>(null),
    outline = useRef<THREE.Mesh>(null),
    age = useRef(0),
    births = useRef(
      new Map<number, number>(
        tree.leaves.map((l) => [l.slot, l.state === "pending" ? 0 : -10]),
      ),
    ),
    distance = useRef(0);
  const [detailed, setDetailed] = useState(
    Math.hypot(tree.x - 12, tree.z - 19) < 80,
  );
  const detailRef = useRef(detailed);
  const n = tree.leaves.length,
    targetScale = treeScale(n),
    selection = useSanctuary((s) => s.selection);
  const geo = useMemo(
      () => (detailed ? leafGeometry() : new THREE.PlaneGeometry(0.7, 1.2)),
      [detailed],
    ),
    branches = useMemo(() => {
      const parts = branchGeometry(
        tree.seed,
        detailed ? tree.leaves.map((l) => l.slot) : [],
      );
      const merged = mergeGeometries(parts)!;
      parts.forEach((g) => g.dispose());
      return merged;
    }, [tree.seed, tree.leaves.map((l) => l.slot).join(","), detailed]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#7f9e5b",
        roughness: 0.7,
        side: THREE.DoubleSide,
      }),
    [],
  );
  const color = useMemo(() => new THREE.Color(), []);
  useEffect(() => () => geo.dispose(), [geo]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => branches.dispose(), [branches]);
  useEffect(() => {
    for (const slot of births.current.keys())
      if (!tree.leaves.some((l) => l.slot === slot))
        births.current.delete(slot);
  }, [tree.leaves]);
  useFrame(({ clock, camera }, delta) => {
    if (!ref.current || !leaves.current) return;
    age.current += delta;
    const scale = THREE.MathUtils.damp(
      ref.current.scale.x,
      targetScale,
      3,
      delta,
    );
    ref.current.scale.setScalar(scale);
    distance.current = camera.position.distanceTo(ref.current.position);
    const nextDetail = detailRef.current
      ? distance.current < 85
      : distance.current < 65;
    if (nextDetail !== detailRef.current) {
      detailRef.current = nextDetail;
      setDetailed(nextDetail);
    }
    leaves.current.visible = distance.current < 150;
    const wood = ref.current.children[0];
    if (wood) wood.visible = distance.current < 150;
    if (distance.current > 150) return;
    tree.leaves.forEach((leaf, i) => {
      const p = leafPoint(leaf.slot, tree.seed);
      dummy.position.set(...p);
      dummy.rotation.set(
        0.28 + Math.sin(leaf.slot) * 0.7,
        leaf.slot * 2.4 + tree.seed,
        Math.sin(leaf.slot) * 0.55 +
          (reduced()
            ? 0
            : Math.sin(clock.elapsedTime * 1.1 + leaf.slot) * 0.035),
      );
      if (!births.current.has(leaf.slot)) {
        const queue = useSanctuary.getState().animations;
        const index = queue.findIndex(
          (l) => l.treeId === tree.id && l.slot === leaf.slot,
        );
        if (
          index <= 0 ||
          (selection?.treeId === tree.id && selection.slot === leaf.slot)
        )
          births.current.set(leaf.slot, age.current);
      }
      const grow = reduced()
        ? 1
        : Math.min(
            1,
            (births.current.has(leaf.slot)
              ? age.current - births.current.get(leaf.slot)!
              : 0) * 1.7,
          );
      dummy.scale.setScalar((0.45 + (leaf.slot % 3) * 0.07) * grow);
      dummy.updateMatrix();
      leaves.current!.setMatrixAt(i, dummy.matrix);
      color.set(
        leaf.state === "pending"
          ? "#b5bd62"
          : leaf.slot % 4 === 0
            ? "#92a75a"
            : "#7e9a56",
      );
      leaves.current!.setColorAt(i, color);
    });
    leaves.current.instanceMatrix.needsUpdate = true;
    if (leaves.current.instanceColor)
      leaves.current.instanceColor.needsUpdate = true;
    if (outline.current) {
      const selected =
        selection?.treeId === tree.id &&
        tree.leaves.some((l) => l.slot === selection.slot);
      outline.current.visible = !!selected;
      if (selected) {
        outline.current.position.set(...leafPoint(selection!.slot, tree.seed));
        outline.current.rotation.set(
          0.28 + Math.sin(selection!.slot) * 0.7,
          selection!.slot * 2.4 + tree.seed,
          Math.sin(selection!.slot) * 0.55,
        );
        outline.current.scale.setScalar(0.72);
      }
    }
  });
  const click = () => {
    const s = useSanctuary.getState();
    if (s.view === "mountain") {
      s.set({ selection: null });
      s.go("mountain", tree.id);
    }
  };
  return (
    <group
      position={[tree.x, ridge(tree.x, tree.z), tree.z]}
      scale={targetScale}
      ref={ref}
      onClick={(e) => {
        e.stopPropagation();
        click();
      }}
    >
      <mesh geometry={branches} castShadow>
        <Bark />
      </mesh>
      <instancedMesh
        ref={leaves}
        args={[geo, material, 108]}
        dispose={null}
        count={n}
        castShadow
        frustumCulled={false}
      />
      <mesh ref={outline} geometry={geo} visible={false}>
        <meshBasicMaterial
          color="#f1da8b"
          side={THREE.DoubleSide}
          wireframe
          transparent
          opacity={0.8}
        />
      </mesh>
    </group>
  );
}
function Vegetation() {
  const grass = useRef<THREE.InstancedMesh>(null),
    trunks = useRef<THREE.InstancedMesh>(null),
    crowns = useRef<THREE.InstancedMesh>(null),
    rocks = useRef<THREE.InstancedMesh>(null);
  const quality = useSanctuary((s) => s.quality);
  const count = quality === "high" ? 7000 : 2500;
  useEffect(() => {
    let seed = 812;
    const rand = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      },
      d = new THREE.Object3D(),
      c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const x = (rand() - 0.5) * 95,
        z = (rand() - 0.5) * 65;
      if (Math.hypot(x, z) < 2.5) {
        d.scale.setScalar(0);
      } else {
        d.scale.set(
          0.04 + rand() * 0.06,
          0.12 + rand() * 0.35,
          0.04 + rand() * 0.06,
        );
      }
      d.position.set(x, sceneryGround(x, z), z);
      d.rotation.set(0, rand() * 6.28, (rand() - 0.5) * 0.3);
      d.updateMatrix();
      grass.current?.setMatrixAt(i, d.matrix);
      c.setHSL(0.2 + rand() * 0.07, 0.2 + rand() * 0.2, 0.2 + rand() * 0.16);
      grass.current?.setColorAt(i, c);
    }
    if (grass.current) grass.current.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < 400; i++) {
      let x = (rand() - 0.5) * 200,
        z = -42 - rand() * 110;
      const height = 1.2 + rand() * 2.8;
      d.position.set(x, sceneryGround(x, z) + height * 0.5, z);
      d.rotation.set(0, rand() * 6, 0);
      d.scale.set(0.12, height, 0.12);
      d.updateMatrix();
      trunks.current?.setMatrixAt(i, d.matrix);
      for (let j = 0; j < 6; j++) {
        const angle = j * 2.4;
        d.position.set(
          x + Math.cos(angle) * height * 0.26,
          sceneryGround(x, z) + height * (0.7 + (j % 3) * 0.15),
          z + Math.sin(angle) * height * 0.26,
        );
        d.scale.set(
          height * (0.3 + rand() * 0.13),
          height * (0.28 + rand() * 0.25),
          height * (0.28 + rand() * 0.1),
        );
        d.rotation.set(rand() * 0.4, rand() * 6, rand() * 0.3);
        d.updateMatrix();
        crowns.current?.setMatrixAt(i * 6 + j, d.matrix);
        c.setHSL(0.23 + rand() * 0.05, 0.14, 0.25 + rand() * 0.1);
        crowns.current?.setColorAt(i * 6 + j, c);
      }
    }
    if (trunks.current) trunks.current.instanceMatrix.needsUpdate = true;
    if (crowns.current) crowns.current.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < 90; i++) {
      const x = (rand() - 0.5) * 70,
        z = (rand() - 0.5) * 55;
      d.position.set(x, sceneryGround(x, z), z);
      d.rotation.set(rand(), rand() * 6, rand());
      const scale = 0.15 + rand() * 0.7;
      d.scale.set(scale * 1.5, scale * 0.7, scale);
      d.updateMatrix();
      rocks.current?.setMatrixAt(i, d.matrix);
    }
    if (rocks.current) rocks.current.instanceMatrix.needsUpdate = true;
  }, [count]);
  return (
    <>
      <instancedMesh ref={grass} args={[undefined, undefined, count]}>
        <coneGeometry args={[1, 1, 3]} />
        <meshStandardMaterial color="#75864f" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={trunks} args={[undefined, undefined, 400]}>
        <cylinderGeometry args={[0.5, 1, 1, 5]} />
        <meshStandardMaterial color="#615d4b" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={crowns} args={[undefined, undefined, 2400]}>
        <icosahedronGeometry args={[1, 2]} />
        <meshStandardMaterial color="#405d45" roughness={1} />
      </instancedMesh>
      <instancedMesh
        ref={rocks}
        args={[undefined, undefined, 90]}
        receiveShadow
      >
        <dodecahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color="#888b76" roughness={1} />
      </instancedMesh>
    </>
  );
}
function CameraRig() {
  const controls = useRef<OrbitImpl>(null),
    moving = useRef(true),
    desired = useRef(new THREE.Vector3(12, 8, 19)),
    target = useRef(new THREE.Vector3(-3, 3, 0));
  const { camera } = useThree();
  const revision = useSanctuary((s) => s.cameraRevision),
    view = useSanctuary((s) => s.view),
    forest = useSanctuary((s) => s.forest),
    focus = useSanctuary((s) => s.focus),
    selection = useSanctuary((s) => s.selection);
  const bounds = forestBounds(forest.trees),
    initialized = useRef(false);
  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.far = Math.max(300, bounds * 4);
      camera.updateProjectionMatrix();
    }
  }, [bounds, camera]);
  useEffect(() => {
    if (!initialized.current && forest.trees.length) {
      initialized.current = true;
      if (view === "home") useSanctuary.getState().go("home");
    }
  }, [forest.trees.length]);
  useEffect(() => {
    const tree =
      forest.trees.find((t) => t.id === (selection?.treeId || focus)) ||
      forest.trees.find((t) => t.leaves.length < 108) ||
      forest.trees.at(-1);
    const x = tree?.x || 0,
      z = tree?.z || 0,
      y = ridge(x, z);
    if (view === "mountain" && !focus && !selection) {
      desired.current.set(
        12,
        Math.max(32, bounds * 0.45),
        Math.max(52, bounds * 0.75),
      );
      target.current.set(-2, 3, -14);
    } else if (selection && tree) {
      const p = leafPoint(selection.slot, tree.seed),
        s = treeScale(tree.leaves.length);
      target.current.set(x + p[0] * s, y + p[1] * s, z + p[2] * s);
      desired.current.copy(target.current).add(new THREE.Vector3(4, 2, 7));
    } else {
      desired.current.set(x + 11, y + 7, z + 18);
      target.current.set(x - 3, y + 2.8, z);
    }
    moving.current = true;
  }, [revision, view, focus]);
  useFrame((_, delta) => {
    const c = controls.current;
    if (!c) return;
    if (moving.current) {
      const alpha = reduced() ? 1 : 1 - Math.exp(-delta * 2);
      camera.position.lerp(desired.current, alpha);
      c.target.lerp(target.current, alpha);
      if (camera.position.distanceTo(desired.current) < 0.03)
        moving.current = false;
    }
    camera.position.x = THREE.MathUtils.clamp(
      camera.position.x,
      -bounds,
      bounds,
    );
    camera.position.z = THREE.MathUtils.clamp(
      camera.position.z,
      -bounds,
      bounds,
    );
    camera.position.y = Math.max(
      camera.position.y,
      ridge(camera.position.x, camera.position.z) + 2,
    );
    c.target.x = THREE.MathUtils.clamp(c.target.x, -bounds + 12, bounds - 12);
    c.target.z = THREE.MathUtils.clamp(c.target.z, -bounds + 12, bounds - 12);
    c.target.y = Math.max(c.target.y, ridge(c.target.x, c.target.z) + 0.6);
    c.update();
  });
  return (
    <OrbitControls
      ref={controls}
      enabled={view === "mountain"}
      enableDamping
      dampingFactor={0.065}
      minDistance={4}
      maxDistance={Math.max(75, bounds * 1.8)}
      minPolarAngle={0.22}
      maxPolarAngle={Math.PI / 2 - 0.08}
      onStart={() => {
        moving.current = false;
      }}
      touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
    />
  );
}
function Ridgelines() {
  const geometries = useMemo(
    () =>
      [0, 1, 2].map((layer) => {
        const g = new THREE.PlaneGeometry(800, 85, 160, 20);
        g.rotateX(-Math.PI / 2);
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i),
            z = p.getZ(i),
            peak =
              10 +
              layer * 5 +
              Math.sin(x * 0.037 + layer * 3) * 5 +
              Math.sin(x * 0.083 + layer) * 3 +
              Math.cos(x * 0.19) * 1.1;
          const y =
            -3 +
            Math.pow(Math.max(0, Math.cos((z / 85) * Math.PI)), 1.5) * peak;
          p.setXYZ(i, x, y, z - 105 - layer * 40);
        }
        g.computeVertexNormals();
        return g;
      }),
    [],
  );
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries]);
  return (
    <>
      {geometries.map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshStandardMaterial
            color={["#879b86", "#a4b3a0", "#b9c5b4"][i]}
            roughness={1}
          />
        </mesh>
      ))}
    </>
  );
}

function World() {
  const trees = useSanctuary((s) => s.forest.trees),
    quality = useSanctuary((s) => s.quality);
  return (
    <>
      <color attach="background" args={["#dce1cd"]} />
      <fog attach="fog" args={["#dce1cd", 35, 150]} />
      <hemisphereLight args={["#fff5d6", "#57644a", 2]} />
      <directionalLight
        position={[25, 35, -8]}
        color="#ffe2a1"
        intensity={3.2}
        castShadow
        shadow-mapSize={[
          quality === "high" ? 2048 : 1024,
          quality === "high" ? 2048 : 1024,
        ]}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
        shadow-bias={-0.0005}
      />
      <ambientLight intensity={0.45} />
      <directionalLight
        position={[0, 12, 25]}
        color="#f3edcf"
        intensity={1.5}
      />
      <Terrain bounds={forestBounds(trees)} />
      <Ridgelines />
      <Vegetation />
      {trees.map((tree) => (
        <WishTree key={tree.id} tree={tree} />
      ))}
      <CameraRig />
    </>
  );
}
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="webgl-fallback">
        <h2>The mountain needs a moment.</h2>
        <p>
          3D rendering is unavailable. Please enable WebGL or restart the kiosk
          browser.
        </p>
        <button onClick={() => location.reload()}>Reload experience</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
export function Scene() {
  const quality = useSanctuary((s) => s.quality);
  const [lost, setLost] = useState(false);
  useEffect(() => {
    localStorage.setItem("gmc-quality", quality);
  }, [quality]);
  return (
    <div
      className="scene"
      aria-label="Interactive three dimensional wishing tree mountain"
    >
      <Boundary>
        {lost ? (
          <div className="webgl-fallback">
            The graphics connection was lost.{" "}
            <button onClick={() => location.reload()}>Reload experience</button>
          </div>
        ) : (
          <Canvas
            shadows
            dpr={quality === "high" ? [1, 1.5] : 1}
            camera={{ position: [12, 8, 19], fov: 44, near: 0.2, far: 300 }}
            gl={{
              antialias: quality === "high",
              powerPreference: "high-performance",
            }}
            fallback={
              <div className="webgl-fallback">
                WebGL is unavailable on this device. Please enable hardware
                acceleration.
              </div>
            }
            onCreated={({ gl, camera }) => {
              if (import.meta.env.DEV) developmentCamera = camera;
              gl.domElement.addEventListener("webglcontextlost", (e) => {
                e.preventDefault();
                setLost(true);
              });
            }}
          >
            <World />
          </Canvas>
        )}
      </Boundary>
    </div>
  );
}
