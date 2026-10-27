import sharp from "sharp";
import { readFile, writeFile, copyFile, readdir } from "node:fs/promises";
for (const name of await readdir(
  new URL("../assets/brand/theme/", import.meta.url),
))
  await copyFile(
    new URL("../assets/brand/theme/" + name, import.meta.url),
    new URL("../public/brand/" + name, import.meta.url),
  );
const catalog = JSON.parse(
  await readFile(new URL("../copy/src/en.json", import.meta.url), "utf8"),
);
const favicon = await readFile(
  new URL("../public/favicon.svg", import.meta.url),
);
await sharp(favicon)
  .resize(32, 32)
  .png()
  .toFile(new URL("../public/favicon.png", import.meta.url).pathname);
await sharp(favicon)
  .resize(180, 180)
  .png()
  .toFile(new URL("../public/apple-touch-icon.png", import.meta.url).pathname);
const logo = (
  await readFile(
    new URL("../public/brand/mierkhat-logo-light.svg", import.meta.url),
    "utf8",
  )
)
  .replace(/<\?xml[^>]+>/, "")
  .replace("<svg", '<svg x="90" y="110" width="480"');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#DEDEDE"/><path d="M70 60h40M70 60v510h40" fill="none" stroke="#EB4134" stroke-width="4"/>${logo}<text x="100" y="425" fill="#000000" font-family="sans-serif" font-size="58">${catalog["action.review"]}</text></svg>`;
await sharp(Buffer.from(svg))
  .png()
  .toFile(new URL("../public/share.png", import.meta.url).pathname);
