import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { FRIENDS, type Friend } from "../../../shared";
export { friendsFor } from "../../../shared";

// Placement in the default view's frame: `side` runs left to right across the
// screen and `toward` points at the camera, so the friends never overlap one
// another, the trunk or the mound from the visitor's point of view.
const toCamera = new THREE.Vector2(6, 13).normalize(),
  screenRight = new THREE.Vector2(toCamera.y, -toCamera.x);
type Pose = {
  height: number;
  aspect: number;
  side: number;
  toward: number;
  /** Paintings face right; flip those standing right of the tree. */
  flip: boolean;
};
const POSES: Record<Friend, Pose> = {
  bird: {
    height: 0.62,
    aspect: 360 / 280,
    side: 0.85,
    toward: 2.7,
    flip: true,
  },
  rabbit: {
    height: 0.6,
    aspect: 220 / 260,
    side: -0.95,
    toward: 2.7,
    flip: false,
  },
  monkey: {
    height: 0.92,
    aspect: 300 / 320,
    side: 1.8,
    toward: 0.2,
    flip: true,
  },
  elephant: {
    height: 1.35,
    aspect: 420 / 340,
    side: -2.0,
    toward: -0.9,
    flip: false,
  },
};
export function friendPosition(friend: Friend): [number, number, number] {
  const { side, toward } = POSES[friend];
  return [
    screenRight.x * side + toCamera.x * toward,
    0,
    screenRight.y * side + toCamera.y * toward,
  ];
}

/** Rasterise a painted SVG once, mirrored when needed, for crisp sprites. */
function paint(friend: Friend) {
  const { aspect, flip } = POSES[friend];
  const canvas = document.createElement("canvas");
  canvas.height = 512;
  canvas.width = Math.round(512 * aspect);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const image = new Image();
  image.onload = () => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (flip) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    texture.needsUpdate = true;
  };
  image.src = `/wishing-tree/animals/${friend}.svg`;
  return texture;
}
function shadowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
  gradient.addColorStop(0, "rgba(60,48,30,0.42)");
  gradient.addColorStop(1, "rgba(60,48,30,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

const noRaycast = () => {};
const HOP_SECONDS = 0.9;
const easeOutBack = (t: number) => {
  const c = 1.7;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

/** The friends who have arrived, standing around the isolated tree. */
export function ThuenpaPuenzhi({
  visible,
  reducedMotion,
}: {
  visible: number;
  reducedMotion: () => boolean;
}) {
  const textures = useMemo(
    () => Object.fromEntries(FRIENDS.map((f) => [f, paint(f)])),
    [],
  ) as Record<Friend, THREE.CanvasTexture>;
  const shadow = useMemo(shadowTexture, []);
  const materials = useMemo(
    () =>
      Object.fromEntries(
        FRIENDS.map((f) => [
          f,
          new THREE.SpriteMaterial({
            map: textures[f],
            transparent: true,
            alphaTest: 0.35,
          }),
        ]),
      ) as Record<Friend, THREE.SpriteMaterial>,
    [textures],
  );
  const shadowMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: shadow,
        transparent: true,
        depthWrite: false,
      }),
    [shadow],
  );
  const shadowGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  useEffect(
    () => () => {
      FRIENDS.forEach((f) => {
        textures[f].dispose();
        materials[f].dispose();
      });
      shadow.dispose();
      shadowMaterial.dispose();
      shadowGeometry.dispose();
    },
    [textures, materials, shadow, shadowMaterial, shadowGeometry],
  );

  // A newly arrived friend hops in once the new leaf has bloomed (about 3 s).
  const clock = useRef(0),
    arrivals = useRef<Partial<Record<Friend, number>>>({}),
    shown = useRef(-1),
    sprites = useRef<Partial<Record<Friend, THREE.Sprite>>>({});
  const [count, setCount] = useState(visible);
  useEffect(() => {
    if (shown.current < 0 || reducedMotion()) {
      shown.current = visible;
      setCount(visible);
      return;
    }
    if (visible < shown.current) {
      shown.current = visible;
      setCount(visible);
      return;
    }
    const timer = setTimeout(() => {
      for (let i = shown.current; i < visible; i++)
        arrivals.current[FRIENDS[i]] = clock.current;
      shown.current = visible;
      setCount(visible);
    }, 3000);
    return () => clearTimeout(timer);
  }, [visible, reducedMotion]);

  useFrame((_, dt) => {
    clock.current += dt;
    for (const friend of FRIENDS) {
      const sprite = sprites.current[friend];
      if (!sprite) continue;
      const { height, aspect } = POSES[friend];
      const start = arrivals.current[friend];
      const t =
        start === undefined || reducedMotion()
          ? 1
          : Math.min(1, (clock.current - start) / HOP_SECONDS);
      const grow = t >= 1 ? 1 : Math.max(0, easeOutBack(t));
      sprite.scale.set(height * aspect * grow, height * grow, 1);
      sprite.position.y = Math.sin(Math.PI * t) * 0.22 * (1 - t * 0.5);
    }
  });

  return (
    <group name="thuenpa-puenzhi">
      {FRIENDS.slice(0, count).map((friend) => {
        const { height, aspect } = POSES[friend];
        const [x, , z] = friendPosition(friend);
        return (
          <group key={friend} name={`companion-${friend}`} position={[x, 0, z]}>
            <sprite
              ref={(s) => {
                if (s) sprites.current[friend] = s;
                else delete sprites.current[friend];
              }}
              material={materials[friend]}
              center={[0.5, 0.02]}
              scale={[height * aspect, height, 1]}
              raycast={noRaycast}
            />
            <mesh
              geometry={shadowGeometry}
              material={shadowMaterial}
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, 0.012, 0]}
              scale={[height * aspect * 0.85, height * 0.32, 1]}
              raycast={noRaycast}
            />
          </group>
        );
      })}
    </group>
  );
}
