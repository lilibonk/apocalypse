#!/usr/bin/env node

// Assemble a local development candidate from a clean checkout. This is not a release publisher.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

const root = process.cwd();
const web = join(root, "apocalypse-web");
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function run(program, args, cwd = root, inherit = false) {
  const result = spawnSync(program, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: inherit ? "inherit" : "pipe",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${program} ${args.join(" ")} failed (${result.status}): ${result.stderr ?? ""}`);
  }
  return (result.stdout || result.stderr || "").trim();
}

function git(...args) {
  return run("git", args);
}

function assertClean() {
  const changes = git("status", "--porcelain=v1", "--untracked-files=all");
  if (changes) throw new Error(`Source tree is not clean:\n${changes}`);
}

async function assertNoFrontendOverrides() {
  const variables = Object.keys(process.env).filter((name) => name.startsWith("VITE_"));
  if (variables.length) throw new Error(`Frontend build overrides are present: ${variables.join(", ")}`);
  for (const directory of [root, web]) {
    const files = await readdir(directory);
    const overrides = files.filter((name) => name === ".env" || (name.startsWith(".env.") && name !== ".env.example"));
    if (overrides.length) throw new Error(`Ignored environment files may alter the build in ${directory}: ${overrides.join(", ")}`);
  }
}

function pathWithin(base, file) {
  return relative(base, file).split(sep).join("/");
}

async function filesUnder(directory) {
  const files = [];
  for (const name of (await readdir(directory)).sort(compare)) {
    const file = join(directory, name);
    const type = await lstat(file);
    if (type.isSymbolicLink()) throw new Error(`Symbolic link is not allowed: ${file}`);
    if (type.isDirectory()) files.push(...(await filesUnder(file)));
    else if (type.isFile()) files.push(file);
    else throw new Error(`Non-regular build output is not allowed: ${file}`);
  }
  return files;
}

async function digest(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

async function fileEntries(directory) {
  const entries = [];
  for (const file of await filesUnder(directory)) {
    const path = pathWithin(directory, file);
    if (path === "manifest.json") continue;
    entries.push({ path, bytes: (await stat(file)).size, sha256: await digest(file) });
  }
  return entries.sort((a, b) => compare(a.path, b.path));
}

async function copy(source, directory, path) {
  const destination = join(directory, path);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

function projectVersion(pom) {
  const match = pom.match(/^  <version>([^<]+)<\/version>\s*$/m);
  if (!match) throw new Error("Cannot identify the project version in pom.xml");
  return match[1];
}

function normalizedFrontendLicenses(groups) {
  const packages = [];
  for (const [group, members] of Object.entries(groups)) {
    if (!Array.isArray(members)) throw new Error("Unexpected pnpm licenses JSON shape");
    for (const member of members) {
      if (typeof member.name !== "string" || !Array.isArray(member.versions)) {
        throw new Error("Incomplete pnpm license metadata");
      }
      packages.push({
        name: member.name,
        versions: [...member.versions].sort(compare),
        declaredLicense: member.license ?? group,
      });
    }
  }
  packages.sort((a, b) => compare(`${a.name}@${a.versions.join(",")}`, `${b.name}@${b.versions.join(",")}`));
  return {
    source: "pnpm licenses list --prod --json",
    scope: "installed production dependencies; may over-include packages absent from the final bundle",
    reviewStatus: "pending; metadata is not a complete redistribution notice review",
    packages,
  };
}

async function verify(directory) {
  const candidate = resolve(directory);
  const manifestText = await readFile(join(candidate, "manifest.json"), "utf8");
  const manifest = JSON.parse(manifestText);
  if (manifest.schemaVersion !== 1 || manifest.kind !== "development-candidate" || !Array.isArray(manifest.files)) {
    throw new Error("Unknown candidate manifest format");
  }
  const manifestHash = createHash("sha256").update(manifestText).digest("hex");
  const expectedName = `${manifest.source.commit.slice(0, 12)}-${manifestHash.slice(0, 12)}`;
  if (basename(candidate) !== expectedName) {
    throw new Error(`Candidate directory name does not match the source commit and manifest SHA-256: ${expectedName}`);
  }
  if (JSON.stringify(await fileEntries(candidate)) !== JSON.stringify(manifest.files)) {
    throw new Error("Candidate files are missing, added, or different from manifest.json");
  }
  process.stdout.write(JSON.stringify({ candidate, sourceCommit: manifest.source.commit, manifestSha256: manifestHash, verifiedFiles: manifest.files.length }) + "\n");
}

async function build() {
  assertClean();
  await assertNoFrontendOverrides();
  const source = { commit: git("rev-parse", "HEAD"), tree: git("rev-parse", "HEAD^{tree}") };
  const nodeVersion = process.versions.node;
  if (!nodeVersion.startsWith("24.")) throw new Error(`Node.js 24 is required; found ${nodeVersion}`);
  const frontendPackage = JSON.parse(await readFile(join(web, "package.json"), "utf8"));
  const pnpmVersion = run("pnpm", ["--version"]);
  if (frontendPackage.packageManager !== `pnpm@${pnpmVersion}`) {
    throw new Error(`Expected ${frontendPackage.packageManager}; found pnpm@${pnpmVersion}`);
  }
  const javaVersion = run("java", ["-version"]);
  if (!javaVersion.includes('version "25.')) throw new Error("JDK 25 is required");
  const backendVersion = projectVersion(await readFile(join(root, "pom.xml"), "utf8"));

  run("./mvnw", ["--batch-mode", "clean", "verify"], root, true);
  run("pnpm", ["install", "--frozen-lockfile"], web, true);
  run("pnpm", ["check"], web, true);
  run("node", ["scripts/verify-public-docs.mjs"], root, true);
  assertClean();
  if (git("rev-parse", "HEAD") !== source.commit) throw new Error("HEAD changed while building");

  const jar = join(root, "target", `apocalypse-${backendVersion}.jar`);
  const jarEntries = run("jar", ["tf", jar]).split("\n");
  const runtimeJars = jarEntries.filter((name) => /^BOOT-INF\/lib\/[^/]+\.jar$/.test(name)).sort(compare);
  if (!jarEntries.includes("BOOT-INF/classes/") || runtimeJars.length === 0) {
    throw new Error("The backend artifact is not an executable Spring Boot JAR");
  }
  const dist = join(web, "dist");
  const distFiles = await filesUnder(dist);
  if (!distFiles.some((file) => pathWithin(dist, file) === "index.html")) {
    throw new Error("Frontend dist/index.html is missing");
  }
  const licenses = join(web, "public", "licenses");
  const licenseFiles = await filesUnder(licenses);
  const builtPaths = new Set(distFiles.map((file) => pathWithin(dist, file)));
  for (const file of licenseFiles) {
    const path = `licenses/${pathWithin(licenses, file)}`;
    if (!builtPaths.has(path) || (await digest(file)) !== (await digest(join(dist, path)))) {
      throw new Error(`Frontend build is missing its upstream license text: ${path}`);
    }
  }
  const frontendLicenses = normalizedFrontendLicenses(
    JSON.parse(run("pnpm", ["licenses", "list", "--prod", "--json"], web)),
  );

  const candidates = join(root, "target", "scaffold-candidates");
  await mkdir(candidates, { recursive: true });
  const stage = await mkdtemp(join(candidates, ".stage-"));
  try {
    await copy(jar, stage, `backend/${basename(jar)}`);
    await copy(join(root, "LICENSE"), stage, "LICENSE");
    await copy(join(root, "THIRD_PARTY_NOTICES.md"), stage, "THIRD_PARTY_NOTICES.md");
    for (const file of distFiles) await copy(file, stage, `apocalypse-web/dist/${pathWithin(dist, file)}`);
    for (const file of licenseFiles) await copy(file, stage, `apocalypse-web/public/licenses/${pathWithin(licenses, file)}`);
    await mkdir(join(stage, "inventory"), { recursive: true });
    await writeFile(join(stage, "inventory", "backend-runtime-jars.json"), JSON.stringify({
      source: "BOOT-INF/lib entries in the candidate Spring Boot JAR",
      reviewStatus: "pending; JAR names do not prove redistribution-license compliance",
      jars: runtimeJars,
    }, null, 2) + "\n");
    await writeFile(join(stage, "inventory", "frontend-production-licenses.json"), JSON.stringify(frontendLicenses, null, 2) + "\n");
    const manifest = {
      schemaVersion: 1,
      kind: "development-candidate",
      source,
      versions: { backend: backendVersion, frontend: frontendPackage.version, java: javaVersion.split("\n")[0], node: nodeVersion, pnpm: pnpmVersion },
      checks: ["./mvnw --batch-mode clean verify", "pnpm install --frozen-lockfile", "pnpm check", "node scripts/verify-public-docs.mjs"],
      licenseReview: "pending; no stable release or complete transitive-notice claim",
      files: await fileEntries(stage),
    };
    const manifestText = JSON.stringify(manifest, null, 2) + "\n";
    await writeFile(join(stage, "manifest.json"), manifestText);
    const manifestHash = createHash("sha256").update(manifestText).digest("hex");
    const destination = join(candidates, `${source.commit.slice(0, 12)}-${manifestHash.slice(0, 12)}`);
    let exists = true;
    try {
      await lstat(destination);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      exists = false;
    }
    if (exists) {
      await verify(destination);
      if ((await digest(join(destination, "manifest.json"))) !== manifestHash) {
        throw new Error(`An existing candidate has a different manifest: ${destination}`);
      }
    } else {
      await rename(stage, destination);
    }
    await verify(destination);
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

if (process.argv[2] === "build" && process.argv.length === 3) await build();
else if (process.argv[2] === "verify" && process.argv.length === 4) await verify(process.argv[3]);
else throw new Error("Usage: node scripts/candidate-manifest.mjs build | verify <candidate-directory>");
