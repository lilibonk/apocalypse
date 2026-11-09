#!/usr/bin/env node
/**
 * 脚手架一键重命名工具（包名 / groupId / artifactId / 前端工程品牌）。
 *
 * 用法：
 *   node scripts/rebrand-scaffold.mjs --group <com.acme.platform> --artifact <acme-admin> [--brand <AcmeAdmin>] [--dry-run]
 *
 * 示例：
 *   node scripts/rebrand-scaffold.mjs --group com.acme.console --artifact acme-console --brand "Acme Console" --dry-run
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

function readArg(flag) {
  const idx = args.indexOf(flag);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : null;
}

if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  console.log(
    "Usage: node scripts/rebrand-scaffold.mjs --group <com.example.app> --artifact <my-app> [--brand <MyApp>] [--dry-run]",
  );
  process.exit(0);
}

const dryRun = args.includes("--dry-run");
const targetGroup = readArg("--group");
const targetArtifact = readArg("--artifact");
const targetBrand = readArg("--brand") ?? targetArtifact;

if (!targetGroup || !/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(targetGroup)) {
  console.error("Error: --group 必须是合法的 Java 包名（如 com.acme.platform）。");
  process.exit(1);
}
if (!targetArtifact || !/^[a-z][a-z0-9-]{1,48}$/.test(targetArtifact)) {
  console.error("Error: --artifact 必须是合法的 kebab-case 标识（如 acme-admin）。");
  process.exit(1);
}

const oldPackage = "io.apocalypse";
const oldPackagePath = "io/apocalypse";
const newPackagePath = targetGroup.replace(/\./g, "/");

const textExtensions = new Set([
  ".java",
  ".xml",
  ".yml",
  ".yaml",
  ".properties",
  ".sql",
  ".ts",
  ".tsx",
  ".json",
  ".md",
  ".html",
]);

function walkFiles(dir, result = []) {
  if (!fs.existsSync(dir)) return result;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (
      entry.name === ".git" ||
      entry.name === ".git-backups" ||
      entry.name === ".verify" ||
      entry.name === "启示录" ||
      entry.name === "node_modules" ||
      entry.name === "target" ||
      entry.name === "dist"
    ) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, result);
    } else if (textExtensions.has(path.extname(entry.name))) {
      result.push(full);
    }
  }
  return result;
}

const files = walkFiles(root);
let updatedFiles = 0;

for (const file of files) {
  const rel = path.relative(root, file);
  const original = fs.readFileSync(file, "utf8");
  let next = original.replaceAll(oldPackage, targetGroup);
  if (rel === "pom.xml") {
    next = next.replace(
      "<artifactId>apocalypse</artifactId>",
      `<artifactId>${targetArtifact}</artifactId>`,
    );
  } else if (rel === "apocalypse-web/package.json") {
    next = next.replace(
      '"name": "apocalypse-web"',
      `"name": "${targetArtifact}-web"`,
    );
  } else if (rel === "apocalypse-web/index.html" && targetBrand) {
    next = next.replaceAll("Apocalypse", targetBrand);
  }
  if (next !== original) {
    updatedFiles++;
    if (dryRun) {
      console.log(`[dry-run] update ${rel}`);
    } else {
      fs.writeFileSync(file, next, "utf8");
    }
  }
}

for (const sourceRoot of ["src/main/java", "src/test/java"]) {
  const fromDir = path.join(root, sourceRoot, oldPackagePath);
  const toDir = path.join(root, sourceRoot, newPackagePath);
  if (fs.existsSync(fromDir) && fromDir !== toDir) {
    if (dryRun) {
      console.log(
        `[dry-run] move ${path.relative(root, fromDir)} -> ${path.relative(root, toDir)}`,
      );
    } else {
      fs.mkdirSync(path.dirname(toDir), { recursive: true });
      fs.renameSync(fromDir, toDir);
    }
  }
}

console.log(
  dryRun
    ? `\nDry-run 完成：将更新 ${updatedFiles} 个文件并将包路径从 ${oldPackage} 重命名为 ${targetGroup}。`
    : `\n重命名完成：已更新 ${updatedFiles} 个文件并将包路径迁移至 ${targetGroup}。`,
);
