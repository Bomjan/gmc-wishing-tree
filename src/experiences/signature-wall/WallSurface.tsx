import { useEffect, useRef, type Ref } from "react";
import {
  PEN_COLOURS,
  SIGNATURE_LIMITS,
  SIGNATURE_LOGO,
  clampSignaturePlacement,
  signatureInkBounds,
  signatureLineWidth,
  type PublicSignature,
  type SignaturePlacement,
  type Stroke,
} from "../../shared/signatures";
import { inkPath } from "./ink";

const { markWidth, markHeight, wallWidth, wallHeight } = SIGNATURE_LIMITS;
const lineWidth = signatureLineWidth;

function fitOnWall(length: number) {
  return `min(${(length / wallWidth) * 100}cqw, ${(length / wallHeight) * 100}cqh)`;
}

function SignatureInk({
  strokes,
  spot,
  id,
  glow,
  landing,
  preview,
  elementRef,
}: {
  strokes: readonly Stroke[];
  spot: SignaturePlacement;
  id?: string;
  glow?: boolean;
  landing?: boolean;
  preview?: "open" | "occupied";
  elementRef?: Ref<SVGSVGElement>;
}) {
  const bounds = signatureInkBounds(strokes);
  const paths = strokes.map(({ points, colour }) => ({
    colour: PEN_COLOURS[colour],
    path: inkPath(points, markWidth, markHeight),
    dot: points.length === 1 ? points[0] : undefined,
  }));

  return (
    <svg
      ref={elementRef}
      className={`signature-mark${glow || landing ? " signature-mark-front" : ""}`}
      data-signature={id}
      data-landing={landing ? id : undefined}
      data-preview={preview}
      viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
      style={{
        left: `${spot.x * 100}%`,
        top: `${spot.y * 100}%`,
        width: fitOnWall(bounds.width),
        height: fitOnWall(bounds.height),
      }}
      aria-hidden="true"
    >
      {glow && (
        <g
          className="signature-ink-glow"
          stroke="#FFD04C"
          strokeWidth={lineWidth + 6}
        >
          {paths.map(({ path, dot }, index) =>
            dot ? (
              <circle
                key={index}
                cx={dot[0] * markWidth}
                cy={dot[1] * markHeight}
                r={lineWidth / 2}
              />
            ) : (
              <path key={index} d={path} />
            ),
          )}
        </g>
      )}
      {paths.map(({ path, colour, dot }, index) =>
        dot ? (
          <circle
            key={index}
            cx={dot[0] * markWidth}
            cy={dot[1] * markHeight}
            r={lineWidth / 2}
            fill={colour}
          />
        ) : (
          <path key={index} d={path} stroke={colour} strokeWidth={lineWidth} />
        ),
      )}
    </svg>
  );
}

export function WallSurface({
  section,
  signatures,
  highlight,
  landing,
  onLanded,
  draft,
  placement,
  occupied,
  onPlace,
}: {
  section: number;
  signatures: readonly PublicSignature[];
  highlight?: string;
  landing?: PublicSignature;
  onLanded: () => void;
  draft?: readonly Stroke[];
  placement?: SignaturePlacement;
  occupied: boolean;
  onPlace?: (placement: SignaturePlacement) => void;
}) {
  const animatedMark = useRef<SVGSVGElement>(null);
  const activeLanding =
    landing?.placement.section === section ? landing : undefined;

  useEffect(() => {
    if (!activeLanding) return;
    const element = animatedMark.current;
    if (!element || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onLanded();
      return;
    }
    const animation = element.animate(
      [
        {
          scale: 1.28,
          opacity: 0.35,
          filter: "drop-shadow(0 0 1.2rem #ffd04c)",
        },
        {
          scale: 0.96,
          opacity: 1,
          filter: "drop-shadow(0 0 0.65rem #ffbf37)",
          offset: 0.62,
        },
        { scale: 1, opacity: 1, filter: "drop-shadow(0 0 0rem #ffbf37)" },
      ],
      { duration: 560, easing: "ease-out", fill: "both" },
    );
    animation.onfinish = onLanded;
    return () => animation.cancel();
  }, [activeLanding, onLanded]);

  function place(x: number, y: number) {
    if (draft) onPlace?.(clampSignaturePlacement({ section, x, y }, draft));
  }

  return (
    <div
      className="signature-wall-surface"
      role={onPlace ? "group" : "img"}
      aria-label={
        onPlace
          ? "Choose a spot for your signature"
          : "Community signature wall"
      }
      data-section={section}
      data-signature-count={signatures.length}
      data-highlight={
        signatures.some((s) => s.id === highlight) ? highlight : undefined
      }
      tabIndex={onPlace ? 0 : undefined}
      onPointerUp={
        onPlace
          ? (event) => {
              if (event.button !== 0) return;
              const rect = event.currentTarget.getBoundingClientRect();
              place(
                (event.clientX - rect.left) / rect.width,
                (event.clientY - rect.top) / rect.height,
              );
            }
          : undefined
      }
      onKeyDown={
        onPlace
          ? (event) => {
              const { x, y } = placement || { x: 0.5, y: 0.5 };
              switch (event.key) {
                case "ArrowLeft":
                  place(x - 0.025, y);
                  break;
                case "ArrowRight":
                  place(x + 0.025, y);
                  break;
                case "ArrowUp":
                  place(x, y - 0.025);
                  break;
                case "ArrowDown":
                  place(x, y + 0.025);
                  break;
                case "Enter":
                  place(x, y);
                  break;
                default:
                  return;
              }
              event.preventDefault();
            }
          : undefined
      }
    >
      <img
        className="signature-wall-logo"
        src={SIGNATURE_LOGO}
        alt=""
        aria-hidden="true"
      />
      {signatures.map(({ id, placement: spot, strokes }) =>
        id === activeLanding?.id ? null : (
          <SignatureInk
            key={id}
            id={id}
            strokes={strokes}
            spot={spot}
            glow={id === highlight}
          />
        ),
      )}
      {draft && placement && (
        <SignatureInk
          strokes={draft}
          spot={placement}
          preview={occupied ? "occupied" : "open"}
        />
      )}
      {activeLanding && (
        <SignatureInk
          id={activeLanding.id}
          strokes={activeLanding.strokes}
          spot={activeLanding.placement}
          elementRef={animatedMark}
          landing
        />
      )}
    </div>
  );
}
