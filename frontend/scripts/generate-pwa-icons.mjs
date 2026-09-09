// One-off script: renders the WebDrop signal-wave logo mark (the same SVG
// used next to the "WebDrop" wordmark) to PWA PNG icons in public/.
// Run with: node scripts/generate-pwa-icons.mjs
// Requires: sharp (already present via Next.js; also listed in devDependencies).
import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

const NAVY = "#0A0E1A";
const BLUE = "#5B8DEF";

// The exact logo mark from the wordmark: two concentric arcs + center dot.
// Centered so the dot sits at (256,256); arcs emanate upward like a signal.
const mark = (scale, cy) =>
  `<g transform="translate(256,${cy}) scale(${scale}) translate(-14,-14)" fill="none">` +
  `<path d="M6 14a8 8 0 0 1 16 0" stroke="${BLUE}" stroke-width="2.5" stroke-linecap="round"/>` +
  `<path d="M10 14a4 4 0 0 1 8 0" stroke="${BLUE}" stroke-width="2.5" stroke-linecap="round"/>` +
  `<circle cx="14" cy="14" r="2" fill="${BLUE}" stroke="none"/>` +
  `</g>`;

const svgDoc = (inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">` +
  `<rect width="512" height="512" fill="${NAVY}"/>${inner}</svg>`;

// Regular icons: mark fills most of the canvas (scale 15).
const regularSvg = svgDoc(mark(15, 256));
// Maskable icons: extra padding so OS shape masks don't crop the mark
// (scale 9 leaves ~36% padding on each side). Solid navy background, NOT
// transparent, so circular/rounded masks look intentional.
const maskableSvg = svgDoc(mark(9, 256));

for (const [svg, base, sizes] of [
  [regularSvg, "icon", [512, 192]],
  [maskableSvg, "icon-maskable", [512, 192]],
]) {
  for (const size of sizes) {
    const out = path.join(publicDir, `${base}-${size}.png`);
    let pipeline = sharp(Buffer.from(svg));
    if (size !== 512) pipeline = pipeline.resize(size, size);
    await pipeline.png().toFile(out);
    console.log(`wrote ${out}`);
  }
}

// Verify dimensions.
for (const f of [
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-192.png",
  "icon-maskable-512.png",
]) {
  const meta = await sharp(path.join(publicDir, f)).metadata();
  console.log(`${f}: ${meta.width}x${meta.height} (${meta.format})`);
}
