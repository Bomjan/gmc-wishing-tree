/** Kiosk sound effects, synthesised with the Web Audio API.
 * No audio files are shipped, so there is nothing to license or load.
 * Set VITE_SOUND=off to silence the installation. */
const enabled = import.meta.env.VITE_SOUND !== "off";
let context: AudioContext | null = null;

function audio() {
  if (!enabled || typeof window === "undefined") return null;
  const Context =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Context) return null;
  try {
    context ??= new Context();
  } catch {
    return null;
  }
  return context;
}

/** Call from a tap handler: browsers only start audio after a visitor gesture. */
export function unlockSound() {
  const ctx = audio();
  if (ctx?.state === "suspended") void ctx.resume().catch(() => {});
}

/** Soft rising shimmer that follows the light from the roots to the new leaf,
 * then a pentatonic bell bloom as the leaf unfurls (about 3.3 s in). */
export function playWishSound() {
  const ctx = audio();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  const start = ctx.currentTime + 0.05;
  const master = ctx.createGain();
  master.gain.value = 0.55;
  const compressor = ctx.createDynamicsCompressor();
  master.connect(compressor).connect(ctx.destination);

  // Airy rise: band-passed noise swelling upward with the light.
  const noise = ctx.createBuffer(1, ctx.sampleRate * 3.6, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const air = ctx.createBufferSource();
  air.buffer = noise;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = 1.4;
  band.frequency.setValueAtTime(380, start);
  band.frequency.exponentialRampToValueAtTime(2600, start + 3.2);
  const airGain = ctx.createGain();
  airGain.gain.setValueAtTime(0.0001, start);
  airGain.gain.exponentialRampToValueAtTime(0.09, start + 1.6);
  airGain.gain.exponentialRampToValueAtTime(0.0001, start + 3.5);
  air.connect(band).connect(airGain).connect(master);
  air.start(start);
  air.stop(start + 3.6);

  // Faint rising tone beneath the air, like a breath drawn in.
  const glide = ctx.createOscillator();
  glide.type = "sine";
  glide.frequency.setValueAtTime(220, start + 0.4);
  glide.frequency.exponentialRampToValueAtTime(660, start + 3.3);
  const glideGain = ctx.createGain();
  glideGain.gain.setValueAtTime(0.0001, start + 0.4);
  glideGain.gain.exponentialRampToValueAtTime(0.035, start + 2.2);
  glideGain.gain.exponentialRampToValueAtTime(0.0001, start + 3.4);
  glide.connect(glideGain).connect(master);
  glide.start(start + 0.4);
  glide.stop(start + 3.5);

  // Bell bloom: C major pentatonic, each note with a quiet upper partial.
  const notes = [659.25, 783.99, 880, 1046.5, 1318.51];
  notes.forEach((frequency, i) => {
    const at = start + 3.25 + i * 0.11;
    for (const [ratio, level] of [
      [1, 0.16],
      [2.76, 0.035],
    ] as const) {
      const bell = ctx.createOscillator();
      bell.type = "sine";
      bell.frequency.value = frequency * ratio;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(level, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 2.4 - i * 0.2);
      bell.connect(gain).connect(master);
      bell.start(at);
      bell.stop(at + 2.5);
    }
  });
}
