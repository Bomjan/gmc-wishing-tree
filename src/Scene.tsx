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
import { leafPoint, treeScale, forestBounds, type Tree } from "./shared";
import { useSanctuary } from "./state";
import { gmcxBrand } from "./shared/branding";
import {
  terrainHeight as ridge,
  fractal,
  random,
  bladeGeometry,
  foliageSprayGeometry,
  rockGeometry,
  leafGeometry,
  leafEdgeGeometry,
  woodTube,
} from "./experiences/wishing-tree/graphics/nature";
import {
  createNatureMaterials,
  type NatureMaterials,
} from "./experiences/wishing-tree/graphics/materials";
import {
  leafArrival,
  LEAF_ARRIVAL_SECONDS,
} from "./experiences/wishing-tree/graphics/leafArrival";
const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
const reduced = () => motionPreference.matches;
let developmentCamera: THREE.Camera | null = null,
  developmentRenderer: THREE.WebGLRenderer | null = null,
  developmentWorld: THREE.Scene | null = null,
  assetsReady = false;
const arrivals = new Map<
  string,
  { progress: number; width: number; scale: number; position: number[] }
>();
export function getCameraPosition() {
  return developmentCamera?.position.toArray();
}
/** Read-only development probe for real pointer/raycast browser checks. */
export function getProjectedLeaves() {
  if (
    !import.meta.env.DEV ||
    !developmentWorld ||
    !developmentCamera ||
    !developmentRenderer
  )
    return [];
  const rect = developmentRenderer.domElement.getBoundingClientRect(),
    points: {
      x: number;
      y: number;
      slot: number;
      treeId: string;
      depth: number;
    }[] = [];
  for (const tree of useSanctuary.getState().forest.trees) {
    const group = developmentWorld.getObjectByName("wish-tree:" + tree.id);
    const leaves = group?.children.find(
      (o) => o instanceof THREE.InstancedMesh,
    ) as THREE.InstancedMesh | undefined;
    if (!group || !leaves) continue;
    group.updateWorldMatrix(true, false);
    tree.leaves.forEach((leaf, index) => {
      const m = new THREE.Matrix4();
      leaves.getMatrixAt(index, m);
      const p = new THREE.Vector3(0, 0.5, 0).applyMatrix4(m);
      group.localToWorld(p);
      p.project(developmentCamera!);
      if (
        Math.abs(p.x) < 0.95 &&
        p.y > -0.6 &&
        p.y < 0.95 &&
        p.z >= -1 &&
        p.z <= 1
      )
        points.push({
          x: rect.left + (p.x * 0.5 + 0.5) * rect.width,
          y: rect.top + (-p.y * 0.5 + 0.5) * rect.height,
          slot: leaf.slot,
          treeId: tree.id,
          depth: p.z,
        });
    });
  }
  return points.sort((a, b) => a.depth - b.depth);
}
export function getSceneMetrics() {
  return {
    assetsReady,
    drawCalls: developmentRenderer?.info.render.calls,
    triangles: developmentRenderer?.info.render.triangles,
    arrivals: [...arrivals.entries()].map(([id, state]) => ({ id, ...state })),
  };
}

function Terrain({
  bounds,
  material,
}: {
  bounds: number;
  material: THREE.Material;
}) {
  const geometry = useMemo(() => {
    const size = Math.max(420, bounds * 2 + 220),
      g = new THREE.PlaneGeometry(size, size, 210, 210);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position,
      uv = g.attributes.uv,
      colors: number[] = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        z = p.getZ(i) - 100;
      p.setXYZ(i, x, ridge(x, z), z);
      uv.setXY(i, x * 0.24, z * 0.24);
    }
    g.computeVertexNormals();
    const normal = g.attributes.normal,
      color = new THREE.Color(),
      soil = new THREE.Color("#c9c8b4"),
      green = new THREE.Color("#c0c9a0"),
      stone = new THREE.Color("#a4aca8");
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        z = p.getZ(i),
        height = p.getY(i),
        slope = 1 - normal.getY(i);
      color
        .copy(green)
        .lerp(soil, fractal(x * 0.2, z * 0.2) * 0.7)
        .lerp(
          stone,
          Math.min(0.85, slope * 2.2 + Math.max(0, height - 12) * 0.025),
        );
      color.multiplyScalar(0.85 + fractal(x * 0.34 + 18, z * 0.34) * 0.25);
      colors.push(color.r, color.g, color.b);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return g;
  }, [bounds]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh
      geometry={geometry}
      material={material}
      receiveShadow
      dispose={null}
    />
  );
}
function branchGeometry(seed: number, slots: number[], detailed: boolean) {
  const parts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.08, 1.3, 0.03),
    new THREE.Vector3(-0.14, 2.7, -0.07),
    new THREE.Vector3(0.13, 4.1, 0.05),
    new THREE.Vector3(0.02, 4.85, 0.05),
  ]);
  parts.push(woodTube(trunk, 0.27, detailed ? 22 : 8, detailed ? 9 : 5));
  if (detailed) {
    for (let i = 0; i < 5; i++) {
      const a = i * 2.4 + seed * 0.001;
      parts.push(
        woodTube(
          new THREE.CatmullRomCurve3([
            new THREE.Vector3(Math.cos(a) * 0.95, -0.07, Math.sin(a) * 0.95),
            new THREE.Vector3(Math.cos(a) * 0.27, 0.17, Math.sin(a) * 0.27),
            new THREE.Vector3(0, 0.8, 0),
          ]),
          0.09,
          7,
          6,
        ),
      );
    }
    const groups = [...new Set(slots.map((slot) => Math.floor(slot / 6)))];
    const limbFor = (group: number) =>
      Math.round(
        ((group * 2.399963 + seed * 0.001) % (Math.PI * 2)) /
          ((Math.PI * 2) / 5),
      ) % 5;
    const limbEnd = (limb: number) => {
      const angle = (limb * Math.PI * 2) / 5;
      return new THREE.Vector3(
        Math.cos(angle) * 0.83,
        2.95 + (limb % 3) * 0.18,
        Math.sin(angle) * 0.83,
      );
    };
    for (const limb of new Set(groups.map(limbFor))) {
      const end = limbEnd(limb);
      parts.push(
        woodTube(
          new THREE.CatmullRomCurve3([
            new THREE.Vector3(0, 1.4 + limb * 0.13, 0),
            end.clone().multiply(new THREE.Vector3(0.4, 0.76, 0.4)),
            end,
          ]),
          0.12,
          14,
          8,
        ),
      );
    }
    for (const group of groups) {
      const endpoint = new THREE.Vector3(
        ...leafPoint(group * 6, seed),
      ).multiply(new THREE.Vector3(0.87, 0.96, 0.87));
      const start = limbEnd(limbFor(group)),
        middle = start
          .clone()
          .lerp(endpoint, 0.55)
          .add(new THREE.Vector3(0, 0.18, 0));
      parts.push(
        woodTube(
          new THREE.CatmullRomCurve3([start, middle, endpoint]),
          0.046 + (group % 3) * 0.006,
          10,
          6,
        ),
      );
    }
    for (const slot of slots) {
      const end = new THREE.Vector3(...leafPoint(slot, seed)),
        base = new THREE.Vector3(
          ...leafPoint(Math.floor(slot / 6) * 6, seed),
        ).multiply(new THREE.Vector3(0.87, 0.96, 0.87));
      parts.push(
        woodTube(
          new THREE.CatmullRomCurve3([
            base,
            base
              .clone()
              .lerp(end, 0.55)
              .add(new THREE.Vector3(0, 0.08, 0)),
            end,
          ]),
          0.014,
          5,
          4,
        ),
      );
    }
  }
  const result = mergeGeometries(parts)!;
  parts.forEach((g) => g.dispose());
  return result;
}
function WishTree({
  tree,
  materials,
}: {
  tree: Tree;
  materials: NatureMaterials;
}) {
  const group = useRef<THREE.Group>(null),
    mesh = useRef<THREE.InstancedMesh>(null),
    outline = useRef<THREE.LineLoop>(null),
    wood = useRef<THREE.Mesh>(null),
    age = useRef(0);
  const births = useRef(
    new Map(
      tree.leaves.map((leaf) => [
        leaf.slot,
        leaf.state === "pending" ? 0 : -20,
      ]),
    ),
  );
  const [detailed, setDetailed] = useState(
      Math.hypot(tree.x - 7.5, tree.z - 16) < 75,
    ),
    detail = useRef(detailed);
  const selection = useSanctuary((s) => s.selection);
  const signature = tree.leaves.map((l) => l.slot).join(",");
  const branch = useMemo(
    () =>
      branchGeometry(
        tree.seed,
        tree.leaves.map((l) => l.slot),
        detailed,
      ),
    [tree.seed, signature, detailed],
  );
  const leaf = useMemo(() => leafGeometry(detailed), [detailed]),
    edge = useMemo(leafEdgeGeometry, []);
  const dummy = useMemo(() => new THREE.Object3D(), []),
    color = useMemo(() => new THREE.Color(), []),
    gold = useMemo(
      () =>
        new THREE.LineBasicMaterial({
          color: gmcxBrand.actionGold,
          // Keep the yellow accent from washing out in the morning tone mapping.
          toneMapped: false,
          transparent: true,
          opacity: 0.8,
          depthWrite: false,
        }),
      [],
    );
  useEffect(() => () => branch.dispose(), [branch]);
  useEffect(() => () => leaf.dispose(), [leaf]);
  useEffect(
    () => () => {
      edge.dispose();
      gold.dispose();
    },
    [edge, gold],
  );
  useEffect(() => {
    for (const slot of births.current.keys())
      if (!tree.leaves.some((l) => l.slot === slot))
        births.current.delete(slot);
    return () => {
      if (import.meta.env.DEV)
        for (const key of arrivals.keys())
          if (key.startsWith(tree.id + ":")) arrivals.delete(key);
    };
  }, [signature, tree.id]);
  useFrame(({ camera, clock }, dt) => {
    if (!group.current || !mesh.current) return;
    age.current += dt;
    group.current.rotation.z = reduced()
      ? 0
      : Math.sin(clock.elapsedTime * 0.45 + tree.seed) * 0.002;
    const desired = treeScale(tree.leaves.length),
      scale = reduced()
        ? desired
        : THREE.MathUtils.damp(group.current.scale.x, desired, 2.4, dt);
    group.current.scale.setScalar(scale);
    const distance = camera.position.distanceTo(group.current.position),
      nextDetail = detail.current ? distance < 85 : distance < 65;
    if (nextDetail !== detail.current) {
      detail.current = nextDetail;
      setDetailed(nextDetail);
    }
    mesh.current.visible = distance < 180;
    if (wood.current) wood.current.visible = distance < 180;
    if (distance > 180) return;
    let hasOutline = false;
    tree.leaves.forEach((l, index) => {
      if (!births.current.has(l.slot)) {
        const queue = useSanctuary.getState().animations,
          indexInQueue = queue.findIndex(
            (v) => v.treeId === tree.id && v.slot === l.slot,
          );
        if (
          indexInQueue <= 0 ||
          (selection?.treeId === tree.id && selection.slot === l.slot)
        )
          births.current.set(l.slot, age.current);
      }
      const seconds = births.current.has(l.slot)
        ? age.current - births.current.get(l.slot)!
        : -1;
      const movement = leafArrival(seconds, reduced());
      const base = leafPoint(l.slot, tree.seed),
        leafSize = 0.44 + (l.slot % 5) * 0.035;
      dummy.position.set(
        base[0] + movement.x,
        base[1] + movement.y,
        base[2] + movement.z,
      );
      const sway = reduced()
        ? 0
        : Math.sin(clock.elapsedTime * 0.85 + l.slot * 1.1) * 0.028;
      dummy.rotation.set(
        0.35 + Math.sin(l.slot * 1.7) * 0.8,
        tree.seed * 0.01 + l.slot * 2.399963 + movement.turn,
        Math.sin(l.slot) * 0.38 + sway,
      );
      dummy.scale.set(
        leafSize * movement.scale * movement.width,
        leafSize * movement.scale,
        leafSize * movement.scale,
      );
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(index, dummy.matrix);
      color
        .setHSL(0.22 + (l.slot % 7) * 0.004, 0.24, 0.43 + (l.slot % 5) * 0.025)
        .lerp(new THREE.Color("#d9c87c"), movement.warmth * 0.45);
      mesh.current!.setColorAt(index, color);
      const selected =
        selection?.treeId === tree.id && selection.slot === l.slot;
      const arriving = seconds >= 0 && seconds < LEAF_ARRIVAL_SECONDS;
      if (import.meta.env.DEV) {
        const id = `${tree.id}:${l.slot}`;
        if (arriving)
          arrivals.set(id, {
            progress: movement.progress,
            width: movement.width,
            scale: movement.scale,
            position: dummy.position.toArray(),
          });
        else arrivals.delete(id);
      }
      if (
        (selected || (!selection && arriving && movement.progress > 0.1)) &&
        outline.current
      ) {
        hasOutline = true;
        outline.current.position.copy(dummy.position);
        outline.current.quaternion.copy(dummy.quaternion);
        outline.current.scale.copy(dummy.scale).multiplyScalar(1.035);
        gold.opacity = selected
          ? 0.7
          : Math.sin(movement.progress * Math.PI) * 0.48;
      }
    });
    if (outline.current) outline.current.visible = hasOutline;
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor)
      mesh.current.instanceColor.needsUpdate = true;
  });
  return (
    <group
      ref={group}
      name={"wish-tree:" + tree.id}
      position={[tree.x, ridge(tree.x, tree.z), tree.z]}
      scale={treeScale(tree.leaves.length)}
      onClick={(event) => {
        event.stopPropagation();
        const s = useSanctuary.getState();
        if (event.delta > 6) return;
        if (s.view === "home" || s.view === "mountain") {
          const leafSlot =
            event.object === mesh.current && event.instanceId !== undefined
              ? tree.leaves[event.instanceId]?.slot
              : undefined;
          s.set({
            selection:
              leafSlot === undefined
                ? null
                : { treeId: tree.id, slot: leafSlot },
          });
          s.go(s.view, tree.id);
        }
      }}
    >
      <mesh
        ref={wood}
        geometry={branch}
        material={materials.bark}
        castShadow
        receiveShadow
        dispose={null}
      />
      <instancedMesh
        ref={mesh}
        args={[leaf, materials.leaf, 108]}
        count={tree.leaves.length}
        castShadow
        receiveShadow
        frustumCulled={false}
        dispose={null}
      />
      <lineLoop
        ref={outline}
        geometry={edge}
        material={gold}
        visible={false}
        dispose={null}
      />
    </group>
  );
}
function Vegetation({
  materials,
  trees,
}: {
  materials: NatureMaterials;
  trees: Tree[];
}) {
  const grass = useRef<THREE.InstancedMesh>(null),
    trunks = useRef<THREE.InstancedMesh>(null),
    crowns = useRef<THREE.InstancedMesh>(null),
    rocks = useRef<THREE.InstancedMesh>(null);
  const quality = useSanctuary((s) => s.quality),
    count = quality === "high" ? 11000 : 4200,
    treeCount = 180;
  const blade = useMemo(bladeGeometry, []),
    spray = useMemo(foliageSprayGeometry, []),
    stone = useMemo(rockGeometry, []),
    trunk = useMemo(() => new THREE.CylinderGeometry(0.035, 0.1, 1, 6), []);
  useEffect(
    () => () => {
      blade.dispose();
      spray.dispose();
      stone.dispose();
      trunk.dispose();
    },
    [blade, spray, stone, trunk],
  );
  const positions = trees.map((t) => `${t.id}:${t.x}:${t.z}`).join(",");
  useEffect(() => {
    const rand = random(9625),
      d = new THREE.Object3D(),
      c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const x = (rand() - 0.5) * 48,
        z = (rand() - 0.5) * 36;
      const density = fractal(x * 0.22, z * 0.22),
        nearRoot = trees.some((t) => Math.hypot(t.x - x, t.z - z) < 0.8);
      d.position.set(x, ridge(x, z) - 0.025, z);
      d.rotation.set(0, rand() * Math.PI * 2, (rand() - 0.5) * 0.1);
      const size = nearRoot || density < 0.28 ? 0 : 0.3 + rand() * 0.35;
      d.scale.set(size, size * (0.7 + rand() * 0.6), size);
      d.updateMatrix();
      grass.current?.setMatrixAt(i, d.matrix);
      c.setHSL(0.2 + rand() * 0.045, 0.15 + rand() * 0.1, 0.32 + rand() * 0.14);
      grass.current?.setColorAt(i, c);
    }
    for (let i = 0; i < treeCount; i++) {
      const x = (rand() - 0.5) * 220,
        z = -55 - rand() * 145,
        base = ridge(x, z),
        height = 2.4 + rand() * 3.8,
        blocked = trees.some((t) => Math.hypot(t.x - x, t.z - z) < 4);
      d.position.set(x, base + height * 0.5, z);
      d.rotation.set(0, rand() * 6.28, (rand() - 0.5) * 0.1);
      d.scale.set(height * 0.22, height, height * 0.22);
      if (blocked) d.scale.setScalar(0);
      d.updateMatrix();
      trunks.current?.setMatrixAt(i, d.matrix);
      for (let j = 0; j < 10; j++) {
        const a = j * 2.399963,
          rad = height * (0.1 + rand() * 0.2),
          level = 0.58 + (j % 4) * 0.105;
        d.position.set(
          x + Math.cos(a) * rad,
          base + height * level,
          z + Math.sin(a) * rad,
        );
        const s = height * (0.35 + rand() * 0.16);
        d.scale.set(s, s * (0.8 + rand() * 0.4), s);
        if (blocked) d.scale.setScalar(0);
        d.rotation.set(
          (rand() - 0.5) * 0.25,
          rand() * 6.28,
          (rand() - 0.5) * 0.2,
        );
        d.updateMatrix();
        crowns.current?.setMatrixAt(i * 10 + j, d.matrix);
        c.setHSL(0.22 + rand() * 0.025, 0.1, 0.38 + rand() * 0.16);
        crowns.current?.setColorAt(i * 10 + j, c);
      }
    }
    for (let i = 0; i < 55; i++) {
      let x = (rand() - 0.5) * 64,
        z = (rand() - 0.5) * 48;
      if (z > 0 && Math.abs(x) < 5) x += x >= 0 ? 7 : -7;
      const size = 0.12 + rand() * 0.48;
      d.position.set(x, ridge(x, z) - size * 0.18, z);
      d.rotation.set(rand() * 0.4, rand() * 6.28, rand() * 0.3);
      d.scale.set(size * (1 + rand()), size, size);
      d.updateMatrix();
      rocks.current?.setMatrixAt(i, d.matrix);
    }
    for (const ref of [grass, trunks, crowns, rocks])
      if (ref.current) {
        ref.current.instanceMatrix.needsUpdate = true;
        if (ref.current.instanceColor)
          ref.current.instanceColor.needsUpdate = true;
      }
  }, [count, positions]);
  return (
    <group>
      <instancedMesh
        ref={grass}
        args={[blade, materials.grass, count]}
        receiveShadow
        dispose={null}
      />
      <instancedMesh
        ref={trunks}
        args={[trunk, materials.stem, treeCount]}
        dispose={null}
      />
      <instancedMesh
        ref={crowns}
        args={[spray, materials.scenery, treeCount * 10]}
        dispose={null}
      />
      <instancedMesh
        ref={rocks}
        args={[stone, materials.rock, 55]}
        receiveShadow
        castShadow
        dispose={null}
      />
    </group>
  );
}
function MorningSky() {
  const sky = useRef<THREE.Mesh>(null);
  const dome = useMemo(() => new THREE.SphereGeometry(650, 32, 20), []);
  useFrame(({ camera }) => sky.current?.position.copy(camera.position));
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          horizon: { value: new THREE.Color("#e8e2cc") },
          zenith: { value: new THREE.Color("#9eb8bc") },
          sun: { value: new THREE.Vector3(-0.45, 0.35, 0.7).normalize() },
        },
        vertexShader:
          "varying vec3 vDirection; void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_Position.z=gl_Position.w*.9999;}",
        fragmentShader:
          `varying vec3 vDirection;uniform vec3 horizon;uniform vec3 zenith;uniform vec3 sun;void main(){vec3 d=normalize(vDirection);float altitude=pow(max(0.,d.y),.5);vec3 color=mix(horizon,zenith,altitude);float glow=pow(max(0.,dot(d,sun)),24.);color+=vec3(1.,.72,.38)*glow*.15;gl_FragColor=vec4(color,1.);#include <tonemapping_fragment>\n#include <colorspace_fragment>}`.replace(
            ";#include",
            ";\n#include",
          ),
      }),
    [],
  );
  useEffect(
    () => () => {
      material.dispose();
      dome.dispose();
    },
    [material, dome],
  );
  return (
    <mesh
      ref={sky}
      geometry={dome}
      material={material}
      frustumCulled={false}
      dispose={null}
    />
  );
}
function World() {
  const trees = useSanctuary((s) => s.forest.trees),
    quality = useSanctuary((s) => s.quality);
  const materials = useMemo(createNatureMaterials, []);
  useEffect(() => {
    let active = true;
    assetsReady = false;
    void materials.ready.then(() => {
      if (active) assetsReady = true;
    });
    return () => {
      active = false;
      assetsReady = false;
      materials.dispose();
    };
  }, [materials]);
  useFrame(({ clock }) => {
    materials.wind.value = reduced() ? 0 : clock.elapsedTime;
  });
  return (
    <>
      <color attach="background" args={["#dedfcd"]} />
      <fog attach="fog" args={["#dce4db", 38, 275]} />
      <MorningSky />
      <hemisphereLight args={["#f1efde", "#53604b", 1.45]} />
      <directionalLight
        position={[-24, 32, 18]}
        color="#fff0ce"
        intensity={2.3}
        castShadow
        shadow-mapSize={[
          quality === "high" ? 2048 : 1024,
          quality === "high" ? 2048 : 1024,
        ]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-camera-near={1}
        shadow-camera-far={90}
        shadow-bias={-0.0003}
        shadow-normalBias={0.025}
        shadow-radius={3}
      />
      <Terrain bounds={forestBounds(trees)} material={materials.ground} />
      <Vegetation trees={trees} materials={materials} />
      {trees.map((t) => (
        <WishTree key={t.id} tree={t} materials={materials} />
      ))}
      <CameraRig />
    </>
  );
}

function CameraRig() {
  const controls = useRef<OrbitImpl>(null),
    moving = useRef(true),
    desired = useRef(new THREE.Vector3(7.5, 4.5, 16)),
    target = useRef(new THREE.Vector3(0, 1.9, 0));
  const { camera } = useThree();
  const revision = useSanctuary((s) => s.cameraRevision),
    view = useSanctuary((s) => s.view),
    forest = useSanctuary((s) => s.forest),
    focus = useSanctuary((s) => s.focus),
    selection = useSanctuary((s) => s.selection);
  const bounds = forestBounds(forest.trees),
    initialized = useRef(false),
    manipulated = useRef(false);
  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.far = Math.max(300, bounds * 4);
      camera.updateProjectionMatrix();
    }
  }, [bounds, camera]);
  useEffect(() => {
    if (!initialized.current && forest.trees.length) {
      initialized.current = true;
      if (view === "home" && !manipulated.current)
        useSanctuary.getState().go("home");
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
        0,
        Math.max(40, bounds * 0.65),
        Math.max(64, bounds * 0.95),
      );
      target.current.set(0, 2, -8);
    } else if (selection && tree) {
      const p = leafPoint(selection.slot, tree.seed),
        s = treeScale(tree.leaves.length);
      target.current.set(x + p[0] * s, y + p[1] * s, z + p[2] * s);
      desired.current.copy(target.current).add(new THREE.Vector3(4, 2, 7));
    } else if (focus) {
      desired.current.set(x + 6, y + 4.1, z + 11);
      target.current.set(x, y + 2.1, z);
    } else {
      desired.current.set(x + 7.5, y + 4.5, z + 16);
      target.current.set(x, y + 1.9, z);
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
    camera.position.y = Math.max(
      camera.position.y,
      ridge(camera.position.x, camera.position.z) + 2,
    );
  });
  return (
    <OrbitControls
      ref={controls}
      enabled={view !== "form"}
      enableDamping
      dampingFactor={0.065}
      minDistance={4}
      maxDistance={Math.max(75, bounds * 1.8)}
      minPolarAngle={0.22}
      maxPolarAngle={Math.PI / 2 - 0.08}
      onStart={() => {
        moving.current = false;
        manipulated.current = true;
      }}
      touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
    />
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
            camera={{ position: [7.5, 4.5, 16], fov: 44, near: 0.2, far: 300 }}
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
            onCreated={({ gl, camera, scene }) => {
              gl.toneMapping = THREE.ACESFilmicToneMapping;
              gl.toneMappingExposure = 1.05;
              if (import.meta.env.DEV) {
                developmentCamera = camera;
                developmentRenderer = gl;
                developmentWorld = scene;
              }
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
