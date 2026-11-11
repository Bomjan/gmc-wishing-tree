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

/** Remotion creates a choreographed light journey; the real leaf is rendered in Three.js. */
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
    ? 0.72
    : interpolate(seconds, [0, 0.35, 5.1, 5.9], [0, 1, 1, 0], clamp);
  const rise = interpolate(seconds, [0.45, 3.45], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const bloom = waiting
    ? 0
    : interpolate(seconds, [3, 3.8, 4.55, 5.65], [0, 1, 0.72, 0], {
        ...clamp,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
      });
  const pulse = waiting
    ? (Math.sin(seconds * 2) + 1) / 2
    : interpolate(seconds, [2.9, 3.75, 4.25, 5.7], [0, 1, 0.72, 0], clamp);
  const path = `M ${root.x} ${root.y} C ${root.x - 85} ${root.y - 230}, ${leaf.x + 95} ${leaf.y + 180}, ${leaf.x} ${leaf.y}`;
  const t = rise,
    u = 1 - t;
  const mote = {
    x:
      u ** 3 * root.x +
      3 * u ** 2 * t * (root.x - 85) +
      3 * u * t ** 2 * (leaf.x + 95) +
      t ** 3 * leaf.x,
    y:
      u ** 3 * root.y +
      3 * u ** 2 * t * (root.y - 230) +
      3 * u * t ** 2 * (leaf.y + 180) +
      t ** 3 * leaf.y,
  };

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
            <feGaussianBlur stdDeviation="12" />
          </filter>
          <radialGradient id="ritual-aura">
            <stop stopColor="#FFF4B8" stopOpacity=".98" />
            <stop offset=".18" stopColor="#FFD66B" stopOpacity=".8" />
            <stop offset=".48" stopColor="#E8B943" stopOpacity=".34" />
            <stop offset="1" stopColor="#FFD66B" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="ritual-flash">
            <stop stopColor="#FFF0A6" stopOpacity=".27" />
            <stop offset=".42" stopColor="#FFD66B" stopOpacity=".12" />
            <stop offset="1" stopColor="#FFD66B" stopOpacity="0" />
          </radialGradient>
        </defs>
        {!waiting && (
          <circle
            cx={leaf.x}
            cy={leaf.y}
            r={560 * bloom}
            fill="url(#ritual-flash)"
          />
        )}
        <ellipse
          cx={root.x}
          cy={root.y}
          rx={waiting ? 110 + pulse * 26 : 120 + (1 - rise) * 45}
          ry={waiting ? 35 + pulse * 9 : 38 + (1 - rise) * 14}
          fill="url(#ritual-aura)"
          opacity={waiting ? 0.55 : 1 - rise}
        />
        {[0, 1, 2].map((ring) => (
          <ellipse
            key={ring}
            cx={root.x}
            cy={root.y}
            rx={36 + ring * 23 + pulse * 12}
            ry={10 + ring * 7}
            fill="none"
            stroke="#D7AA43"
            strokeWidth="3"
            strokeDasharray="45 140"
            strokeDashoffset={-frame * (ring % 2 ? -1.3 : 1.3)}
            opacity={waiting ? 0.68 : (1 - rise) * 0.95}
          />
        ))}
        {!waiting && (
          <>
            <path
              d={path}
              fill="none"
              stroke="#FFD66B"
              strokeWidth="24"
              filter="url(#ritual-soft)"
              pathLength="1"
              strokeDasharray="1"
              strokeDashoffset={1 - rise}
              opacity={0.88 * (1 - Math.max(0, seconds - 3.7) / 2.1)}
            />
            <path
              d={path}
              fill="none"
              stroke="#FFF1A6"
              strokeWidth="4"
              pathLength="1"
              strokeDasharray="1"
              strokeDashoffset={1 - rise}
              opacity={interpolate(seconds, [0, 3.4, 5.1], [0.1, 1, 0], clamp)}
            />
            <circle
              cx={mote.x}
              cy={mote.y}
              r={25 + Math.sin(frame * 0.5) * 5}
              fill="#FFF9D7"
              opacity={1 - rise * 0.3}
            />
            <circle
              cx={mote.x}
              cy={mote.y}
              r="86"
              fill="url(#ritual-aura)"
              opacity={0.78 * (1 - rise * 0.4)}
            />
            <circle
              cx={leaf.x}
              cy={leaf.y}
              r={210 + pulse * 155}
              fill="url(#ritual-aura)"
              opacity={bloom}
            />
            {Array.from({ length: 18 }, (_, ray) => {
              const angle = (ray / 18) * Math.PI * 2 + frame * 0.002;
              const inner = 52 + (1 - bloom) * 18;
              const outer = 112 + bloom * 108 + ((ray % 3) - 1) * 15;
              return (
                <line
                  key={ray}
                  x1={leaf.x + Math.cos(angle) * inner}
                  y1={leaf.y + Math.sin(angle) * inner}
                  x2={leaf.x + Math.cos(angle) * outer}
                  y2={leaf.y + Math.sin(angle) * outer}
                  stroke={ray % 3 === 0 ? "#FFF4B8" : "#FFD66B"}
                  strokeWidth={ray % 3 === 0 ? 4 : 2.5}
                  strokeLinecap="round"
                  opacity={bloom * (ray % 2 ? 0.5 : 0.8)}
                />
              );
            })}
            {[0, 1, 2].map((ring) => (
              <circle
                key={ring}
                cx={leaf.x}
                cy={leaf.y}
                r={interpolate(
                  seconds,
                  [3.2 + ring * 0.16, 5.6 + ring * 0.16],
                  [12, 155 + ring * 32],
                  clamp,
                )}
                fill="none"
                stroke={ring === 0 ? "#FFF4B8" : "#D7A934"}
                strokeWidth={ring === 0 ? 4 : 2}
                opacity={bloom * (0.9 - ring * 0.2)}
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
          color: "#FFFFFF",
          fontFamily: "Roboto, Arial, sans-serif",
          fontWeight: 500,
          fontSize: 24,
          lineHeight: "34px",
          opacity: waiting
            ? 0.92
            : interpolate(seconds, [0, 0.8, 4.9, 5.8], [0, 1, 1, 0], clamp),
          translate: `0 ${interpolate(seconds, [0, 1.4], [14, 0], clamp)}px`,
        }}
      >
        {/* Brand caption: text on a dark panel with the yellow accent. */}
        <span
          style={{
            display: "inline-block",
            padding: "12px 28px",
            background: "rgba(23, 23, 23, 0.9)",
            borderLeft: "5px solid #FFD66B",
          }}
        >
          {waiting ? "Tending your wish…" : "Watch your leaf unfold."}
        </span>
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
