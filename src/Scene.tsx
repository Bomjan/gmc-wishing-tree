import {
  Component,
  useEffect,
  useLayoutEffect,
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
  leafPoint,
  treeScale,
  forestBounds,
  activeTree,
  type Tree,
} from "./shared";
import { useSanctuary } from "./state";
import {
  friendsFor,
  ThuenpaPuenzhi,
} from "./experiences/wishing-tree/graphics/ThuenpaPuenzhi";
import { gmcxBrand } from "./shared/branding";
import {
  leafGeometry,
  leafEdgeGeometry,
  moundGeometry,
  random,
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
  developmentTarget: THREE.Vector3 | null = null,
  developmentWorld: THREE.Scene | null = null,
  assetsReady = false;
const arrivals = new Map<
  string,
  { progress: number; width: number; scale: number; position: number[] }
>();
export function getCameraPosition() {
  return developmentCamera?.position.toArray();
}
export function getCameraTarget() {
  return developmentTarget?.toArray();
}
/** Public rendering coordinates only; no visitor content enters the animation. */
export function getRitualAnchors(treeId: string, slot?: number) {
  const group = developmentWorld?.getObjectByName("wish-tree:" + treeId);
  if (!group || !developmentCamera) return null;
  const project = (point: THREE.Vector3) => {
    group.localToWorld(point);
    point.project(developmentCamera!);
    return {
      x: (point.x * 0.5 + 0.5) * 1080,
      y: (-point.y * 0.5 + 0.5) * 1920,
    };
  };
  const root = project(new THREE.Vector3(0, 0.1, 0));
  const tree = useSanctuary
    .getState()
    .forest.trees.find((t) => t.id === treeId);
  const index = tree?.leaves.findIndex((leaf) => leaf.slot === slot) ?? -1;
  const leaves = group.children.find(
    (o) => o instanceof THREE.InstancedMesh,
  ) as THREE.InstancedMesh | undefined;
  if (index < 0 || !leaves) return { root, leaf: null };
  const matrix = new THREE.Matrix4();
  leaves.getMatrixAt(index, matrix);
  return {
    root,
    leaf: project(new THREE.Vector3(0, 0.6, 0).applyMatrix4(matrix)),
  };
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
/** Screen boxes of the four friends, for placement checks in development. */
function friendRects() {
  const group = developmentWorld?.getObjectByName("thuenpa-puenzhi");
  if (!group || !developmentCamera || !developmentRenderer) return [];
  const rect = developmentRenderer.domElement.getBoundingClientRect();
  const right = new THREE.Vector3().setFromMatrixColumn(
    developmentCamera.matrixWorld,
    0,
  );
  return group.children.map((friend) => {
    const sprite = friend.children.find(
      (c) => c instanceof THREE.Sprite,
    ) as THREE.Sprite;
    const base = friend.getWorldPosition(new THREE.Vector3()),
      w = sprite.scale.x / 2,
      corners = [
        base.clone().addScaledVector(right, -w),
        base.clone().addScaledVector(right, w),
        base
          .clone()
          .addScaledVector(right, -w)
          .setY(base.y + sprite.scale.y),
        base
          .clone()
          .addScaledVector(right, w)
          .setY(base.y + sprite.scale.y),
      ].map((p) => {
        p.project(developmentCamera!);
        return {
          x: rect.left + (p.x * 0.5 + 0.5) * rect.width,
          y: rect.top + (-p.y * 0.5 + 0.5) * rect.height,
        };
      });
    const xs = corners.map((c) => c.x),
      ys = corners.map((c) => c.y);
    return {
      name: friend.name,
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
  });
}
export function getSceneMetrics() {
  return {
    assetsReady,
    companions:
      developmentWorld
        ?.getObjectByName("thuenpa-puenzhi")
        ?.children.map((friend) => friend.name) ?? [],
    companionRects: friendRects(),
    highlights:
      developmentWorld?.children
        .filter((o) => o.name.startsWith("wish-tree:"))
        .flatMap((o) => {
          const h = o.children.find(
            (child) => child.name === "leaf-highlight",
          ) as THREE.Mesh | undefined;
          if (!h?.visible) return [];
          const material = h.material as THREE.MeshBasicMaterial;
          const selected = useSanctuary.getState().selection;
          return [
            {
              treeId: o.name.slice(10),
              slot:
                selected?.treeId === o.name.slice(10) ? selected.slot : null,
              color: material.color.getHexString(),
              depthTest: material.depthTest,
            },
          ];
        }) || [],
    trees: developmentWorld?.children
      .filter((o) => o.name.startsWith("wish-tree:"))
      .map((o) => {
        const leaf = o.children.find(
          (c) => c instanceof THREE.InstancedMesh,
        ) as THREE.InstancedMesh | undefined;
        const wood = o.children.find(
          (c) => c instanceof THREE.Mesh && !(c instanceof THREE.InstancedMesh),
        ) as THREE.Mesh | undefined;
        wood?.geometry.computeBoundingBox();
        return {
          id: o.name.slice(10),
          leaves: leaf?.count || 0,
          scale: o.scale.x,
          woodVertices: wood?.geometry.attributes.position.count || 0,
          woodHeight: wood?.geometry.boundingBox
            ? (wood.geometry.boundingBox.max.y -
                wood.geometry.boundingBox.min.y) *
              o.scale.y
            : 0,
          woodWidth: wood?.geometry.boundingBox
            ? wood.geometry.boundingBox.max.x - wood.geometry.boundingBox.min.x
            : 0,
        };
      }),
    backdrop: (
      developmentWorld?.background as THREE.Color | null
    )?.getHexString?.(),
    backgroundMeshes:
      developmentWorld?.children.filter(
        (o) =>
          o instanceof THREE.Mesh &&
          o.name !== "tree-contact-shadow" &&
          !o.name.startsWith("wish-tree:"),
      ).length ?? 0,
    drawCalls: developmentRenderer?.info.render.calls,
    triangles: developmentRenderer?.info.render.triangles,
    arrivals: [...arrivals.entries()].map(([id, state]) => ({ id, ...state })),
  };
}

/** Shared branch layout: the wood and the decorative foliage use the same
 * limbs and twigs, so every small leaf grows from real wood. */
function limbOf(group: number, seed: number) {
  return (
    Math.round(
      ((group * 2.399963 + seed * 0.001) % (Math.PI * 2)) / ((Math.PI * 2) / 5),
    ) % 5
  );
}
function limbEnd(limb: number) {
  const angle = (limb * Math.PI * 2) / 5;
  return new THREE.Vector3(
    Math.cos(angle) * 0.83,
    2.95 + (limb % 3) * 0.18,
    Math.sin(angle) * 0.83,
  );
}
function clusterBranch(group: number, seed: number) {
  return {
    start: limbEnd(limbOf(group, seed)),
    endpoint: new THREE.Vector3(...leafPoint(group * 6, seed)).multiply(
      new THREE.Vector3(0.87, 0.96, 0.87),
    ),
  };
}
function twigsOf(group: number, seed: number) {
  const { start, endpoint } = clusterBranch(group, seed),
    twigs = random(seed * 131 + group * 17);
  return Array.from({ length: 3 }, () => {
    const from = start.clone().lerp(endpoint, 0.3 + twigs() * 0.45),
      angle = twigs() * Math.PI * 2,
      length = 0.32 + twigs() * 0.38,
      out = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    return {
      from,
      bend: from
        .clone()
        .addScaledVector(out, length * 0.5)
        .add(new THREE.Vector3(0, length * 0.35, 0)),
      tip: from
        .clone()
        .addScaledVector(out, length)
        .add(new THREE.Vector3(0, length * 0.55, 0)),
    };
  });
}
/** Small decorative leaves along the twigs and around each leaf cluster, so
 * the canopy looks full. They are smaller and deeper green than wish leaves,
 * ignore taps, and thicken as the tree grows. */
function foliageMatrices(seed: number, slots: number[], count: number) {
  const groups = [...new Set(slots.map((slot) => Math.floor(slot / 6)))],
    density = 0.55 + 0.45 * Math.min(1, count / 108),
    dummy = new THREE.Object3D(),
    out: { matrix: THREE.Matrix4; shade: number }[] = [];
  for (const group of groups) {
    const r = random(seed * 977 + group * 31),
      { start, endpoint } = clusterBranch(group, seed),
      spots: THREE.Vector3[] = [];
    for (const { bend, tip } of twigsOf(group, seed)) {
      for (let i = 0; i < 4; i++) spots.push(tip.clone());
      spots.push(bend.clone());
    }
    for (let i = 0; i < 5; i++)
      spots.push(new THREE.Vector3(...leafPoint(group * 6 + (i % 6), seed)));
    spots.push(start.clone().lerp(endpoint, 0.55), endpoint.clone());
    for (const spot of spots) {
      if (r() > density) continue;
      dummy.position
        .copy(spot)
        .add(
          new THREE.Vector3(
            r() - 0.5,
            (r() - 0.5) * 0.7,
            r() - 0.5,
          ).multiplyScalar(0.42),
        );
      dummy.rotation.set(
        0.2 + (r() - 0.5) * 1.6,
        r() * Math.PI * 2,
        (r() - 0.5) * 1.2,
      );
      dummy.scale.setScalar(0.22 + r() * 0.12);
      dummy.updateMatrix();
      out.push({ matrix: dummy.matrix.clone(), shade: r() });
    }
  }
  return out;
}
function branchGeometry(
  seed: number,
  slots: number[],
  detailed: boolean,
  preview: boolean,
) {
  const parts: THREE.BufferGeometry[] = [];
  const thickness = preview
    ? 0.8
    : 0.3 + 0.7 * Math.sqrt(Math.min(108, slots.length) / 108);
  const trunk = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.08, 1.3, 0.03),
    new THREE.Vector3(-0.14, 2.7, -0.07),
    new THREE.Vector3(0.13, 4.1, 0.05),
    new THREE.Vector3(0.02, 4.85, 0.05),
  ]);
  const branchCount = preview
    ? 5
    : Math.ceil(5 * Math.sqrt(Math.min(108, slots.length) / 108));
  parts.push(
    woodTube(trunk, 0.27 * thickness, detailed ? 22 : 8, detailed ? 9 : 5),
  );
  // Trunk centre at a height, so limbs start on the bark rather than the axis.
  const trunkAt = (y: number) =>
    trunk.getPoint(THREE.MathUtils.clamp(y / 4.85, 0, 1));
  if (detailed) {
    // Root flare: thick where it leaves the trunk, tapering as it dives into
    // the soil mound instead of lying on the ground like a cut log.
    for (let i = 0; i < Math.max(4, branchCount); i++) {
      const a = i * 2.4 + seed * 0.001,
        reach = 0.7 + ((i * 0.618) % 1) * 0.3;
      parts.push(
        woodTube(
          new THREE.CatmullRomCurve3([
            new THREE.Vector3(Math.cos(a) * 0.04, 0.75, Math.sin(a) * 0.04),
            new THREE.Vector3(Math.cos(a) * 0.38, 0.22, Math.sin(a) * 0.38),
            new THREE.Vector3(Math.cos(a) * reach, 0.02, Math.sin(a) * reach),
          ]),
          0.13 * thickness,
          9,
          6,
        ),
      );
    }
    const groups = [...new Set(slots.map((slot) => Math.floor(slot / 6)))];
    const limbFor = (group: number) => limbOf(group, seed);
    const emergingLimbs = Array.from(
      { length: branchCount },
      (_, limb) => limb,
    );
    for (const limb of new Set([...groups.map(limbFor), ...emergingLimbs])) {
      const end = limbEnd(limb),
        // Stagger where limbs leave the trunk so they do not fan from one knot.
        start = trunkAt(1.55 + ((limb * 0.618 + seed * 0.0007) % 1) * 1.15),
        outward = new THREE.Vector3(end.x, 0, end.z).normalize(),
        elbow = start
          .clone()
          .addScaledVector(outward, 0.42)
          .add(new THREE.Vector3(0, (end.y - start.y) * 0.38, 0));
      parts.push(
        woodTube(
          new THREE.CatmullRomCurve3([start, elbow, end]),
          0.12 * thickness,
          14,
          8,
          // Keep the limb tip as thick as the branches that continue from it.
          0.6,
        ),
      );
    }
    for (const group of groups) {
      const { start, endpoint } = clusterBranch(group, seed);
      const middle = start
        .clone()
        .lerp(endpoint, 0.55)
        .add(new THREE.Vector3(0, 0.18, 0));
      parts.push(
        woodTube(
          new THREE.CatmullRomCurve3([start, middle, endpoint]),
          (0.046 + (group % 3) * 0.006) * thickness,
          10,
          6,
        ),
      );
      // Short bare side twigs give the canopy an inner structure. They are
      // wood only: every leaf on the tree still stands for one wish.
      for (const { from, bend, tip } of twigsOf(group, seed))
        parts.push(
          woodTube(
            new THREE.CatmullRomCurve3([from, bend, tip]),
            0.022 * thickness,
            5,
            4,
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
          0.014 * thickness,
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
// Render the bare tree while the forest is empty or its first snapshot is unavailable.
const starterSlots = Array.from({ length: 18 }, (_, i) => i * 6);
const previewTree: Tree = { id: "preview", seed: 71, x: 0, z: 0, leaves: [] };

function WishTree({
  tree,
  materials,
  isolated,
}: {
  tree: Tree;
  materials: NatureMaterials;
  isolated: boolean;
}) {
  const group = useRef<THREE.Group>(null),
    mesh = useRef<THREE.InstancedMesh>(null),
    outline = useRef<THREE.LineLoop>(null),
    highlight = useRef<THREE.Mesh>(null),
    glow = useRef<THREE.Sprite>(null),
    wood = useRef<THREE.Mesh>(null),
    age = useRef(0),
    grown = useRef({ count: -1, from: 0, at: 0 });
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
  const view = useSanctuary((s) => s.view);
  useEffect(() => {
    if (view === "accepted" && selection?.treeId === tree.id)
      births.current.set(selection.slot, age.current);
  }, [view, selection?.treeId, selection?.slot, tree.id]);
  const signature = tree.leaves.map((l) => l.slot).join(",");
  const branch = useMemo(
    () =>
      branchGeometry(
        tree.seed,
        [...new Set([...starterSlots, ...tree.leaves.map((l) => l.slot)])],
        detailed,
        tree === previewTree,
      ),
    [tree.seed, signature, detailed, tree === previewTree],
  );
  const foliage = useMemo(
      () =>
        detailed
          ? foliageMatrices(
              tree.seed,
              [
                ...new Set([
                  ...starterSlots,
                  ...tree.leaves.map((l) => l.slot),
                ]),
              ],
              tree.leaves.length,
            )
          : [],
      [tree.seed, signature, detailed],
    ),
    foliageMesh = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = foliageMesh.current;
    if (!mesh) return;
    const shade = new THREE.Color();
    foliage.forEach(({ matrix, shade: s }, i) => {
      mesh.setMatrixAt(i, matrix);
      mesh.setColorAt(i, shade.setHSL(0.23 + s * 0.05, 0.34, 0.27 + s * 0.1));
    });
    mesh.count = foliage.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [foliage]);
  const leaf = useMemo(() => leafGeometry(detailed), [detailed]),
    edge = useMemo(leafEdgeGeometry, []),
    mound = useMemo(moundGeometry, []);
  useEffect(() => () => mound.dispose(), [mound]);
  const dummy = useMemo(() => new THREE.Object3D(), []),
    color = useMemo(() => new THREE.Color(), []),
    warmColor = useMemo(() => new THREE.Color("#d9c87c"), []),
    gold = useMemo(
      () =>
        new THREE.LineBasicMaterial({
          color: gmcxBrand.actionGold,
          // Keep the yellow accent from washing out in the morning tone mapping.
          toneMapped: false,
          transparent: true,
          opacity: 0.8,
          depthWrite: false,
          depthTest: false,
        }),
      [],
    );
  const highlightMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: gmcxBrand.actionGold,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );
  const glowTexture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const context = canvas.getContext("2d")!;
    const gradient = context.createRadialGradient(64, 64, 3, 64, 64, 62);
    gradient.addColorStop(0, "rgba(255,242,164,0.98)");
    gradient.addColorStop(0.16, "rgba(255,215,102,0.78)");
    gradient.addColorStop(0.42, "rgba(255,199,65,0.34)");
    gradient.addColorStop(1, "rgba(255,199,65,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);
  const glowMaterial = useMemo(
    () =>
      new THREE.SpriteMaterial({
        map: glowTexture,
        color: gmcxBrand.actionGold,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    [glowTexture],
  );
  useEffect(
    () => () => {
      highlightMaterial.dispose();
      glowMaterial.dispose();
      glowTexture.dispose();
    },
    [highlightMaterial, glowMaterial, glowTexture],
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
    // Grow when a wish arrives: hold the previous size until the leaf blooms
    // (about 3 s into the arrival), then swell slightly and settle larger.
    const count = tree.leaves.length,
      growth = grown.current;
    if (count !== growth.count) {
      const added = count > growth.count && growth.count >= 0;
      grown.current = {
        count,
        from: added ? growth.count : count,
        at: added && !reduced() ? age.current + 3 : age.current,
      };
    }
    const { from, at } = grown.current,
      since = age.current - at,
      swell =
        since >= 0 && since < 1.4 && from !== count
          ? Math.sin((since / 1.4) * Math.PI) * 0.06
          : 0,
      desired =
        tree === previewTree
          ? 0.55
          : treeScale(since < 0 ? from : count) * (1 + swell),
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
      const selected =
        selection?.treeId === tree.id && selection.slot === l.slot;
      const base = leafPoint(l.slot, tree.seed),
        // Varied, slightly smaller leaves read as a fuller, older canopy.
        leafSize = 0.38 + ((l.slot * 0.7548777) % 1) * 0.2;
      dummy.position.set(
        base[0] + movement.x,
        base[1] + movement.y,
        base[2] + movement.z,
      );
      if (selected && view === "accepted" && movement.progress < 1) {
        const travel = movement.travel;
        dummy.position.set(
          base[0] * travel +
            Math.sin(travel * Math.PI * 2) * (1 - travel) * 0.35,
          0.35 + (base[1] - 0.35) * travel,
          base[2] * travel + Math.sin(travel * Math.PI) * 0.5,
        );
      }
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
        .setHSL(
          0.19 + ((l.slot * 0.381966) % 1) * 0.075,
          0.3 + (l.slot % 4) * 0.045,
          0.4 + ((l.slot * 0.618034) % 1) * 0.15,
        )
        .lerp(warmColor, movement.warmth * 0.45);
      if (selected) color.set(gmcxBrand.actionGold);
      mesh.current!.setColorAt(index, color);
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
          ? 1
          : Math.sin(movement.progress * Math.PI) * 0.48;
        if (highlight.current) {
          highlight.current.position.copy(dummy.position);
          highlight.current.quaternion.copy(dummy.quaternion);
          highlight.current.scale.copy(dummy.scale);
          highlightMaterial.opacity = selected
            ? 0.9
            : 0.2 * Math.sin(movement.progress * Math.PI);
          if (glow.current) {
            glow.current.position.copy(dummy.position);
            glow.current.quaternion.copy(dummy.quaternion);
            const breathe = selected
              ? 1 + Math.sin(age.current * 2.3) * 0.08
              : 1;
            glow.current.scale.set(2.5 * breathe, 2.5 * breathe, 1);
            glowMaterial.opacity = selected
              ? 0.82 + Math.sin(age.current * 2.3) * 0.12
              : 0.42 * Math.sin(movement.progress * Math.PI);
          }
        }
      }
    });
    if (outline.current) outline.current.visible = hasOutline;
    if (highlight.current) highlight.current.visible = hasOutline;
    if (glow.current) glow.current.visible = hasOutline;
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor)
      mesh.current.instanceColor.needsUpdate = true;
  });
  return (
    <group
      ref={group}
      name={"wish-tree:" + tree.id}
      position={[isolated ? 0 : tree.x, 0, isolated ? 0 : tree.z]}
      scale={tree === previewTree ? 0.55 : treeScale(tree.leaves.length)}
      onClick={(event) => {
        event.stopPropagation();
        const s = useSanctuary.getState();
        if (tree === previewTree || event.delta > 6) return;
        if (s.view === "home" || s.view === "mountain") {
          // Thin twigs can sit in front of a leaf; any leaf along the tap
          // ray counts, so wood never blocks selecting a leaf.
          const leafHit = event.intersections.find(
            (hit) =>
              hit.object === mesh.current && hit.instanceId !== undefined,
          );
          const leafSlot =
            leafHit?.instanceId !== undefined
              ? tree.leaves[leafHit.instanceId]?.slot
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
      {/* After the wood mesh: scene metrics read the first plain mesh as wood. */}
      <mesh
        name="root-mound"
        geometry={mound}
        material={materials.soil}
        receiveShadow
        dispose={null}
        raycast={() => {}}
      />
      <group name="starter-canopy">
        {starterSlots
          .filter((slot) => !tree.leaves.some((leaf) => leaf.slot === slot))
          .map((slot) => (
            <mesh
              key={slot}
              geometry={leaf}
              material={materials.leaf}
              position={leafPoint(slot, tree.seed)}
              rotation={[0.4, slot * 2.399963, 0.2]}
              scale={0.75}
              castShadow
              dispose={null}
              raycast={() => {}}
            />
          ))}
      </group>
      {/* Wrapped in a group: scene probes treat the tree's first direct
          instanced mesh child as its wish leaves. */}
      <group name="foliage">
        <instancedMesh
          key={detailed ? "detailed" : "simple"}
          ref={foliageMesh}
          args={[leaf, materials.leaf, 400]}
          count={foliage.length}
          castShadow
          frustumCulled={false}
          raycast={() => {}}
          dispose={null}
        />
      </group>
      <sprite
        ref={glow}
        name="leaf-yellow-glow"
        material={glowMaterial}
        visible={false}
        renderOrder={20}
        raycast={() => {}}
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
        renderOrder={22}
        raycast={() => {}}
        dispose={null}
      />
      <mesh
        ref={highlight}
        name="leaf-highlight"
        geometry={leaf}
        material={highlightMaterial}
        visible={false}
        renderOrder={21}
        dispose={null}
        raycast={() => {}}
      />
    </group>
  );
}
function World() {
  const { forest, view, focus, selection, quality, demoInitialWishes } =
    useSanctuary();
  const current = activeTree(forest.trees, selection?.treeId || focus);
  const overview =
    forest.trees.length > 0 && view === "mountain" && !focus && !selection;
  const visibleTrees = overview ? forest.trees : [current ?? previewTree];
  const materials = useMemo(createNatureMaterials, []);
  const lightTarget = useMemo(() => new THREE.Object3D(), []);
  const x = overview ? current?.x || 0 : 0,
    z = overview ? current?.z || 0 : 0;
  useEffect(() => {
    lightTarget.position.set(x, 2.4, z);
  }, [lightTarget, x, z]);
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
  return (
    <>
      <hemisphereLight args={["#fffaf0", "#8e927f", 1.65]} />
      <primitive object={lightTarget} />
      <spotLight
        position={[x - 4, 11, z + 7]}
        target={lightTarget}
        color="#fff3d7"
        intensity={180}
        angle={0.65}
        penumbra={0.85}
        distance={65}
        castShadow
        shadow-mapSize={[
          quality === "high" ? 2048 : 1024,
          quality === "high" ? 2048 : 1024,
        ]}
        shadow-bias={-0.0002}
        shadow-normalBias={0.025}
        shadow-radius={4}
      />
      <mesh
        name="tree-contact-shadow"
        rotation={[-Math.PI / 2, 0, 0]}
        position={[x, -0.045, z]}
        receiveShadow
      >
        <planeGeometry
          args={[
            Math.max(200, forestBounds(forest.trees) * 3),
            Math.max(200, forestBounds(forest.trees) * 3),
          ]}
        />
        <shadowMaterial transparent opacity={0.16} depthWrite={false} />
      </mesh>
      {visibleTrees.map((t) => (
        <WishTree
          key={t.id}
          tree={t}
          materials={materials}
          isolated={!overview}
        />
      ))}
      {!overview && current && (
        <ThuenpaPuenzhi
          key={current.id}
          visible={
            forest.demo && current.id === "demo-current"
              ? demoInitialWishes === null
                ? 0
                : friendsFor(current.leaves.length, demoInitialWishes)
              : friendsFor(current.leaves.length, forest.demo ? 0 : null)
          }
          reducedMotion={reduced}
        />
      )}
      <CameraRig />
    </>
  );
}

function CameraRig() {
  const controls = useRef<OrbitImpl>(null),
    moving = useRef(true),
    desired = useRef(new THREE.Vector3(6, 3.7, 13)),
    target = useRef(new THREE.Vector3(0, 2.4, 0));
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
    const x = 0,
      z = 0,
      y = 0;
    if (forest.trees.length && view === "mountain" && !focus && !selection) {
      desired.current.set(
        0,
        Math.max(40, bounds * 0.65),
        Math.max(64, bounds * 0.95),
      );
      target.current.set(0, 2, -8);
    } else {
      desired.current.set(x + 6, y + 3.7, z + 13);
      target.current.set(x, y + 2.4, z);
    }
    moving.current = true;
  }, [revision, view, focus, forest.trees.length > 0]);
  useFrame((_, delta) => {
    const c = controls.current;
    if (!c) return;
    if (import.meta.env.DEV) developmentTarget = c.target;
    if (moving.current) {
      const alpha = reduced() ? 1 : 1 - Math.exp(-delta * 2);
      camera.position.lerp(desired.current, alpha);
      c.target.lerp(target.current, alpha);
      if (
        camera.position.distanceTo(desired.current) < 0.03 &&
        c.target.distanceTo(target.current) < 0.03
      ) {
        camera.position.copy(desired.current);
        c.target.copy(target.current);
        moving.current = false;
      }
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
    camera.position.y = Math.max(camera.position.y, 0.6);
    c.target.x = THREE.MathUtils.clamp(c.target.x, -bounds + 12, bounds - 12);
    c.target.z = THREE.MathUtils.clamp(c.target.z, -bounds + 12, bounds - 12);
    c.target.y = Math.max(c.target.y, 0.2);
    c.update();
    camera.position.y = Math.max(camera.position.y, 0.6);
  });
  return (
    <OrbitControls
      ref={controls}
      target={[0, 2.4, 0]}
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
        <h2>The tree needs a moment.</h2>
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
      aria-label="Interactive three dimensional wishing tree"
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
            camera={{ position: [6, 3.7, 13], fov: 38, near: 0.2, far: 300 }}
            gl={{
              alpha: true,
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
              developmentCamera = camera;
              developmentRenderer = gl;
              developmentWorld = scene;
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
