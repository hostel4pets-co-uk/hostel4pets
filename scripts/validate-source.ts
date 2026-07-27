import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const forbiddenDirectories = new Set([".git", "dist", "node_modules"]);
const sourceDirectories = [join(root, "src"), join(root, "scripts")];
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
}

if (failures.length > 0) {
  throw new Error(failures.join("\n"));
}
