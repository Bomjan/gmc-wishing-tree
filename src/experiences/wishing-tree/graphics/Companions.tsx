import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { treeScale } from "../../../shared";

export const COMPANION_THRESHOLDS = {
  bird: 1,
  rabbit: 2,
  monkey: 3,
  elephant: 4,
} as const;
type Animal = keyof typeof COMPANION_THRESHOLDS;
type Vec = [number, number, number];

function Part({
  position,
  scale,
  colour,
}: {
  position: Vec;
  scale: Vec;
  colour: string;
}) {
  return (
    <mesh position={position} scale={scale} castShadow>
      <sphereGeometry args={[1, 12, 8]} />
      <meshStandardMaterial color={colour} roughness={0.85} />
    </mesh>
  );
}

function Companion({ animal, count }: { animal: Animal; count: number }) {
  const root = useRef<THREE.Group>(null);
  const leftWing = useRef<THREE.Group>(null);
  const rightWing = useRef<THREE.Group>(null);
  const legs = useRef<(THREE.Group | null)[]>([]);
  const elapsed = useRef(0);
  const index = Object.keys(COMPANION_THRESHOLDS).indexOf(animal);
  const bird = animal === "bird";
  const elephant = animal === "elephant";
  const rabbit = animal === "rabbit";
  const colour = bird
    ? "#30354f"
    : elephant
      ? "#a6a5a5"
      : rabbit
        ? "#f9eee1"
        : "#b57e51";
  const size = bird ? 0.42 : elephant ? 0.52 : rabbit ? 0.4 : 0.43;

  useFrame(({ camera }, delta) => {
    if (!root.current) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (!reduced) elapsed.current += Math.min(delta, 0.05);
    const time = elapsed.current;
    const facing = Math.atan2(camera.position.x, camera.position.z);
    const rightX = Math.cos(facing),
      rightZ = -Math.sin(facing);
    // Disjoint lanes in the camera plane keep the ground animals apart.
    const lane = (index - 2) * 1.5;
    const walk = Math.sin(time * 0.65) * 0.28;
    const sideways = bird ? Math.sin(time * 0.45) * 2.2 : lane + walk;
    const forward = bird ? 0 : 1.6;
    root.current.position.set(
      rightX * sideways + Math.sin(facing) * forward,
      bird
        ? 2.8 + treeScale(count) * 3 + Math.sin(time * 1.8) * 0.15
        : size * 0.65,
      rightZ * sideways + Math.cos(facing) * forward,
    );
    root.current.rotation.y =
      facing +
      (bird ? Math.cos(time * 0.45) * 0.3 : Math.cos(time * 0.65) * 0.22);
    root.current.scale.setScalar(
      size * (reduced ? 1 : Math.min(1, time / 0.8)),
    );
    if (leftWing.current)
      leftWing.current.rotation.z = Math.sin(time * 10) * 0.65;
    if (rightWing.current)
      rightWing.current.rotation.z = -Math.sin(time * 10) * 0.65;
    legs.current.forEach((leg, i) => {
      if (leg)
        leg.rotation.x =
          Math.sin(time * 4 + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.42;
    });
  });

  return (
    <group ref={root} name={`companion-${animal}`} raycast={() => {}}>
      <Part
        position={[0, 0.25, 0]}
        scale={[elephant ? 0.68 : 0.42, elephant ? 0.65 : 0.5, 0.7]}
        colour={colour}
      />
      <Part
        position={[0, 0.8, 0.65]}
        scale={[0.55, 0.55, 0.46]}
        colour={colour}
      />
      {!bird && !elephant && (
        <Part
          position={[0, 0.75, 0.95]}
          scale={[0.43, 0.38, 0.14]}
          colour={rabbit ? "#fff9f1" : "#e9bd83"}
        />
      )}
      {[-1, 1].map((side) => (
        <group key={side}>
          <Part
            position={[side * 0.23, 0.96, 1.02]}
            scale={[0.18, 0.22, 0.08]}
            colour="#fffdf5"
          />
          <Part
            position={[side * 0.23, 0.95, 1.09]}
            scale={[0.12, 0.16, 0.06]}
            colour={bird ? "#72bbdb" : "#67412d"}
          />
          <Part
            position={[side * 0.23, 0.95, 1.14]}
            scale={[0.085, 0.12, 0.035]}
            colour="#181f32"
          />
          <Part
            position={[side * 0.23 - 0.035, 1.01, 1.17]}
            scale={[0.035, 0.045, 0.02]}
            colour="#ffffff"
          />
          <Part
            position={[side * 0.36, 0.71, 1.02]}
            scale={[0.095, 0.055, 0.025]}
            colour="#ed9b9d"
          />
          {rabbit && (
            <>
              <Part
                position={[side * 0.18, 1.35, 0.6]}
                scale={[0.13, 0.48, 0.12]}
                colour={colour}
              />
              <Part
                position={[side * 0.18, 1.35, 0.7]}
                scale={[0.065, 0.33, 0.035]}
                colour="#d9a7a0"
              />
            </>
          )}
          {elephant && (
            <Part
              position={[side * 0.57, 0.87, 0.71]}
              scale={[0.29, 0.39, 0.07]}
              colour="#e8a7b4"
            />
          )}
          {elephant && (
            <Part
              position={[side * 0.49, 0.78, 0.53]}
              scale={[0.37, 0.5, 0.14]}
              colour="#a4afc0"
            />
          )}
          {animal === "monkey" && (
            <Part
              position={[side * 0.4, 0.85, 0.65]}
              scale={[0.17, 0.2, 0.12]}
              colour="#e9bd83"
            />
          )}
        </group>
      ))}
      {bird ? (
        <>
          <group ref={leftWing} position={[-0.25, 0.4, 0]}>
            <Part
              position={[-0.5, 0, 0]}
              scale={[0.7, 0.075, 0.32]}
              colour="#34394f"
            />
          </group>
          <group ref={rightWing} position={[0.25, 0.4, 0]}>
            <Part
              position={[0.5, 0, 0]}
              scale={[0.7, 0.075, 0.32]}
              colour="#34394f"
            />
          </group>
          <Part
            position={[0, 0.76, 1.1]}
            scale={[0.12, 0.1, 0.28]}
            colour="#f1bd44"
          />
          <Part
            position={[0, 0.25, -0.8]}
            scale={[0.25, 0.09, 0.55]}
            colour="#34394f"
          />
        </>
      ) : (
        <group>
          {[-1, 1].flatMap((side) =>
            [-1, 1].map((end, j) => {
              const i = (side === -1 ? 0 : 2) + j;
              return (
                <group
                  key={i}
                  ref={(node) => {
                    legs.current[i] = node;
                  }}
                  position={[side * (elephant ? 0.45 : 0.3), 0.05, end * 0.4]}
                >
                  <Part
                    position={[0, -0.25, 0]}
                    scale={[elephant ? 0.23 : 0.14, 0.3, 0.17]}
                    colour={colour}
                  />
                  <Part
                    position={[0, -0.48, 0.12]}
                    scale={[elephant ? 0.25 : 0.18, 0.13, 0.25]}
                    colour={
                      rabbit ? "#fff9f1" : elephant ? "#c6b9a6" : "#edc49e"
                    }
                  />
                </group>
              );
            }),
          )}
        </group>
      )}

      {elephant && (
        <>
          <Part
            position={[0, 0.35, 1]}
            scale={[0.17, 0.55, 0.19]}
            colour={colour}
          />
          <Part
            position={[0, -0.1, 1.15]}
            scale={[0.15, 0.16, 0.32]}
            colour={colour}
          />
          {[-1, 1].map((side) => (
            <Part
              key={side}
              position={[side * 0.27, 0.5, 1.1]}
              scale={[0.055, 0.07, 0.35]}
              colour="#fff3d8"
            />
          ))}
        </>
      )}
      {rabbit && (
        <Part
          position={[0, 0.3, -0.72]}
          scale={[0.23, 0.23, 0.23]}
          colour="#fff9f1"
        />
      )}
      {animal === "monkey" && (
        <mesh
          position={[0, 0.45, -0.8]}
          rotation={[0, Math.PI / 2, 0]}
          castShadow
        >
          <torusGeometry args={[0.43, 0.07, 8, 20, Math.PI * 1.6]} />
          <meshStandardMaterial color={colour} roughness={0.85} />
        </mesh>
      )}
    </group>
  );
}

export function Companions({ count }: { count: number }) {
  return (
    <group name="thuenpa-puenzhi">
      {(Object.keys(COMPANION_THRESHOLDS) as Animal[]).map((animal) =>
        count >= COMPANION_THRESHOLDS[animal] ? (
          <Companion key={animal} animal={animal} count={count} />
        ) : null,
      )}
    </group>
  );
}
