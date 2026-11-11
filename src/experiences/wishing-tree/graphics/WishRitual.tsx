import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import { Player } from "@remotion/player";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { getRitualAnchors } from "../../../Scene";

type RitualProps = {
  phase: "waiting" | "arrival";
  treeId: string;
  slot?: number;
};
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Remotion draws light, never a second contribution leaf or private visitor text. */
function LightJourney({ phase, treeId, slot }: RitualProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const anchors =
    getRitualAnchors(treeId, slot) ||
    (phase === "waiting" ? { root: { x: 540, y: 1480 }, leaf: null } : null);
  if (!anchors || (phase === "arrival" && !anchors.leaf)) return null;
  const root = anchors.root;
  const leaf = anchors.leaf || { x: root.x, y: root.y - 450 };
  const seconds = frame / fps;
  const waiting = phase === "waiting";
  const fade = waiting
    ? 0.65
    : interpolate(seconds, [0, 0.45, 4.8, 5.9], [0, 1, 1, 0], clamp);
  const rise = interpolate(seconds, [0.3, 3.6], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.2, 0.7, 0.3, 1),
  });
  const pulse = waiting
    ? (Math.sin(seconds * 2) + 1) / 2
    : interpolate(seconds, [2.5, 3.6, 5.2], [0, 1, 0], clamp);
  const path = `M ${root.x} ${root.y} C ${root.x - 85} ${root.y - 230}, ${leaf.x + 95} ${leaf.y + 180}, ${leaf.x} ${leaf.y}`;
  return (
    <AbsoluteFill style={{ opacity: fade, pointerEvents: "none" }}>
      <svg
        viewBox="0 0 1080 1920"
        width="100%"
        height="100%"
        aria-hidden="true"
      >
        <defs>
          <filter id="ritual-soft">
            <feGaussianBlur stdDeviation="10" />
          </filter>
          <radialGradient id="ritual-aura">
            <stop stopColor="#FFD766" stopOpacity=".45" />
            <stop offset="1" stopColor="#FFD766" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse
          cx={root.x}
          cy={root.y}
          rx={110 + pulse * 26}
          ry={35 + pulse * 9}
          fill="url(#ritual-aura)"
        />
        {[0, 1, 2].map((ring) => (
          <ellipse
            key={ring}
            cx={root.x}
            cy={root.y}
            rx={36 + ring * 23 + pulse * 12}
            ry={10 + ring * 7}
            fill="none"
            stroke="#B69A5A"
            strokeWidth="2"
            strokeDasharray="45 140"
            strokeDashoffset={-frame * (ring % 2 ? -1.3 : 1.3)}
            opacity={waiting ? 0.55 : (1 - rise) * 0.7}
          />
        ))}
        {!waiting && (
          <>
            <path
              d={path}
              fill="none"
              stroke="#FFD766"
              strokeWidth="14"
              filter="url(#ritual-soft)"
              pathLength="1"
              strokeDasharray="1"
              strokeDashoffset={1 - rise}
              opacity={0.7 * (1 - Math.max(0, seconds - 4) / 2)}
            />
            <path
              d={path}
              fill="none"
              stroke="#D3AC4C"
              strokeWidth="2.5"
              pathLength="1"
              strokeDasharray="1"
              strokeDashoffset={1 - rise}
              opacity={interpolate(seconds, [0, 3.8, 5.4], [1, 0.7, 0], clamp)}
            />
            <circle
              cx={leaf.x}
              cy={leaf.y}
              r={85 + pulse * 40}
              fill="url(#ritual-aura)"
              opacity={pulse}
            />
            {[0, 1].map((ring) => (
              <circle
                key={ring}
                cx={leaf.x}
                cy={leaf.y}
                r={interpolate(
                  seconds,
                  [2.4 + ring * 0.35, 4.8 + ring * 0.35],
                  [15, 105],
                  clamp,
                )}
                fill="none"
                stroke="#E4BE54"
                strokeWidth={2 - ring * 0.5}
                opacity={pulse * (0.65 - ring * 0.15)}
              />
            ))}
          </>
        )}
      </svg>
      <div
        style={{
          position: "absolute",
          top: "85%",
          width: "100%",
          textAlign: "center",
          color: "#745C00",
          fontFamily: "Lora, Georgia, serif",
          fontSize: 27,
          opacity: waiting
            ? 0.8
            : interpolate(seconds, [0, 0.8, 4.4, 5.5], [0, 1, 1, 0], clamp),
          translate: `0 ${interpolate(seconds, [0, 1.4], [14, 0], clamp)}px`,
        }}
      >
        {waiting ? "Tending your wish…" : "Watch your leaf unfold."}
      </div>
    </AbsoluteFill>
  );
}

class OrnamentBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function WishRitual(props: RitualProps) {
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(preference.matches);
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  const inputProps = useMemo(
    () => props,
    [props.phase, props.treeId, props.slot],
  );
  if (reduced) return null;
  return (
    <div className="wish-ritual" data-phase={props.phase} aria-hidden="true">
      <OrnamentBoundary>
        <Player
          component={LightJourney}
          inputProps={inputProps}
          durationInFrames={props.phase === "waiting" ? 360 : 180}
          compositionWidth={1080}
          compositionHeight={1920}
          fps={30}
          autoPlay
          loop={props.phase === "waiting"}
          controls={false}
          clickToPlay={false}
          doubleClickToFullscreen={false}
          moveToBeginningWhenEnded={false}
          numberOfSharedAudioTags={0}
          style={{ width: "100%", height: "100%", pointerEvents: "none" }}
          errorFallback={() => null}
        />
      </OrnamentBoundary>
    </div>
  );
}
