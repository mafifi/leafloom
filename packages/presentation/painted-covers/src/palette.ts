export type Random = () => number;
export type Palette = ReturnType<typeof palette>;
// ---------- deterministic randomness ----------
export function hash(str: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = <T>(r: Random, arr: T[]) => arr[Math.floor(r() * arr.length)];
export const between = (r: Random, a: number, b: number) => a + r() * (b - a);

// ---------- palettes ----------
// Modern and a little muted: one base hue, a neighbour, and a single accent.
export function palette(r: Random) {
  const base = Math.floor(r() * 360);
  const scheme = pick(r, ['analogous', 'split', 'mono', 'duotone']);
  const sat = between(r, 28, 62);
  const dark = r() < 0.7; // most covers sit on a deep ground; some go bright
  const L = dark ? [10, 22] : [78, 92];
  const hsl = (h: number, s: number, l: number) =>
    `hsl(${((h % 360) + 360) % 360}, ${s.toFixed(0)}%, ${l.toFixed(0)}%)`;
  let hues;
  if (scheme === 'analogous') hues = [base, base + 30, base - 25];
  else if (scheme === 'split') hues = [base, base + 150, base + 210];
  else if (scheme === 'mono') hues = [base, base + 8, base - 8];
  else hues = [base, base + 180, base + 180];
  return {
    dark,
    ground: hsl(hues[0], sat * 0.8, between(r, L[0], L[1])),
    ground2: hsl(hues[1], sat * 0.7, dark ? between(r, 6, 18) : between(r, 70, 86)),
    mid: hsl(hues[1], sat, dark ? between(r, 30, 48) : between(r, 45, 62)),
    accent: hsl(hues[2], Math.min(90, sat + 30), dark ? between(r, 52, 68) : between(r, 38, 55)),
    pale: hsl(hues[0], sat * 0.5, dark ? between(r, 60, 80) : between(r, 20, 34)),
    hsl,
  };
}

// ---------- painting ----------
