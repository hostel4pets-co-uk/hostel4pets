import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const output = join(root, "dist");
const excludedNames = new Set([
  ".git",
  ".github",
  ".gitignore",
  "dist",
  "node_modules",
  "src",
  "scripts",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "tsconfig.scripts.json"
]);
const excludedExtensions = new Set([".js", ".map", ".ts"]);

await rm(output, { recursive: true, force: true });

const compiler = process.platform === "win32"
  ? join(root, "node_modules", ".bin", "tsc.cmd")
  : join(root, "node_modules", ".bin", "tsc");
const result = spawnSync(compiler, ["-p", "tsconfig.json"], {
  cwd: root,
  stdio: "inherit"
});

if (result.status !== 0) {
  throw new Error("TypeScript compilation failed");
}

await mkdir(output, { recursive: true });

for (const entry of await readdir(root, { withFileTypes: true })) {
  if (excludedNames.has(entry.name)) continue;
  if (entry.isFile() && excludedExtensions.has(extname(entry.name))) continue;
  await cp(join(root, entry.name), join(output, entry.name), { recursive: true });
}

await writeFile(join(output, ".nojekyll"), "", "utf8");
