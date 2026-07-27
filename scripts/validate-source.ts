import { access, readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";

interface PackageManifest {
  version?: string;
}

const root = process.cwd();
const forbiddenDirectories = new Set([".git", "dist", "generated", "node_modules"]);
const sourceDirectories = [join(root, "src"), join(root, "scripts")];
const styleDirectory = join(root, "styles");
const styleEntry = join(styleDirectory, "styles.css");
const styleModules = [
  "tokens.css",
  "site.css",
  "forms.css",
  "modals.css",
  "calendar.css",
  "chat.css",
  "taxi.css"
] as const;
const nestedStyleModules = new Set<string>(styleModules.filter(module => module !== "tokens.css"));
const forbiddenTypeNames = [
  ["a", "n", "y"].join(""),
  ["u", "n", "k", "n", "o", "w", "n"].join("")
];
const forbiddenDirectives = [
  ["@", "t", "s", "-", "i", "g", "n", "o", "r", "e"].join(""),
  ["@", "t", "s", "-", "n", "o", "c", "h", "e", "c", "k"].join("")
];
const failures: string[] = [];

async function walk(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (forbiddenDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function validateBalancedBraces(path: string, source: string): void {
  let depth = 0;
  let quote: "\"" | "'" | null = null;
  let inComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const current = source[index] ?? "";
    const next = source[index + 1] ?? "";

    if (inComment) {
      if (current === "*" && next === "/") {
        inComment = false;
        index += 1;
      }
      continue;
    }

    if (quote) {
      if (current === "\\") {
        index += 1;
        continue;
      }
      if (current === quote) quote = null;
      continue;
    }

    if (current === "/" && next === "*") {
      inComment = true;
      index += 1;
      continue;
    }
    if (current === "\"" || current === "'") {
      quote = current;
      continue;
    }
    if (current === "{") depth += 1;
    if (current === "}") depth -= 1;
    if (depth < 0) {
      failures.push(`${relative(root, path)} closes a CSS block before it is opened`);
      return;
    }
  }

  if (inComment) failures.push(`${relative(root, path)} contains an unterminated comment`);
  if (quote) failures.push(`${relative(root, path)} contains an unterminated string`);
  if (depth !== 0) failures.push(`${relative(root, path)} has unbalanced CSS blocks`);
}

for (const directory of sourceDirectories) {
  for (const path of await walk(directory)) {
    if (extname(path) !== ".ts") continue;
    const source = await readFile(path, "utf8");
    for (const typeName of forbiddenTypeNames) {
      const expression = new RegExp(`\\b${typeName}\\b`, "g");
      if (expression.test(source)) failures.push(`${relative(root, path)} contains forbidden type ${typeName}`);
    }
    for (const directive of forbiddenDirectives) {
      if (source.includes(directive)) failures.push(`${relative(root, path)} contains ${directive}`);
    }
  }
}

for (const path of await walk(root)) {
  if (extname(path) === ".js") failures.push(`${relative(root, path)} is JavaScript source`);
}

if (await exists(join(root, "styles.css"))) {
  failures.push("styles.css must live at styles/styles.css");
}

const styleEntrySource = await readFile(styleEntry, "utf8");
if (!styleEntrySource.includes("@layer")) failures.push("styles/styles.css does not declare cascade layers");
for (const module of styleModules) {
  const importStatement = `@import url("./${module}")`;
  if (!styleEntrySource.includes(importStatement)) {
    failures.push(`styles/styles.css does not import ${module}`);
  }

  const path = join(styleDirectory, module);
  const source = await readFile(path, "utf8");
  validateBalancedBraces(path, source);
  if (nestedStyleModules.has(module) && !source.includes("&")) {
    failures.push(`styles/${module} does not use native CSS nesting`);
  }
}
validateBalancedBraces(styleEntry, styleEntrySource);

for (const path of await walk(root)) {
  if (extname(path) !== ".html") continue;
  const markup = await readFile(path, "utf8");
  const scriptExpression = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  for (const match of markup.matchAll(scriptExpression)) {
    const attributes = match[1] ?? "";
    const body = match[2] ?? "";
    if (!/\bsrc\s*=/.test(attributes) && body.trim()) {
      failures.push(`${relative(root, path)} contains inline script source`);
    }
  }
  if (/\sstyle\s*=/.test(markup)) failures.push(`${relative(root, path)} contains inline styles`);

  const localStylesheets = Array.from(markup.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi))
    .map(match => match[1] ?? "")
    .filter(href => !href.startsWith("http"));
  if (!localStylesheets.includes("./styles/styles.css")) {
    failures.push(`${relative(root, path)} does not load ./styles/styles.css`);
  }
}

const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as PackageManifest;
const version = (await readFile(join(root, "VERSION"), "utf8")).trim();
const readme = await readFile(join(root, "README.md"), "utf8");
const index = await readFile(join(root, "index.html"), "utf8");
if (!/^\d+\.\d+\.\d+$/.test(version)) failures.push("VERSION is not a semantic version");
if (manifest.version !== version) failures.push("package.json and VERSION disagree");
if (!readme.includes(`**Version ${version}**`)) failures.push("README.md does not report the current version");
if (!index.includes(`<meta name="application-version" content="${version}">`)) {
  failures.push("index.html does not report the current version");
}

if (failures.length > 0) {
  throw new Error(failures.join("\n"));
}
