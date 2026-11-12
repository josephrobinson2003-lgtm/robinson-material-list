import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const dest = join(here, "..", "www");
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
for (const name of ["index.html", "manifest.webmanifest", "sw.js", "logo.png", "favicon.ico", "favicon-32.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"]) {
  cpSync(join(root, name), join(dest, name));
}
cpSync(join(root, "js"), join(dest, "js"), { recursive: true });
console.log("Staged website into native/www");
