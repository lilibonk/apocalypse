#!/usr/bin/env node

// Assemble a local candidate with fresh gates and immutable content identity; never publish it.
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
import { pathToFileURL } from "node:url";

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
    throw new Error(
      `${program} ${args.join(" ")} failed (${result.status}): ${result.stderr ?? ""}`,
    );
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

async function sourceSnapshot(review) {
  if (!review) assertClean();
  const paths = [
    ...new Set(
      git("ls-files", "--cached", "--others", "--exclude-standard", "-z")
        .split("\0")
        .filter(Boolean),
    ),
  ].sort(compare);
  const files = [];
  for (const path of paths) {
    let metadata;
    try {
      metadata = await lstat(join(root, path));
    } catch (error) {
      if (error.code === "ENOENT") continue; // A tracked deletion is represented by absence.
      throw error;
    }
    if (!metadata.isFile())
      throw new Error(`Source input must be a regular file: ${path}`);
    files.push({
      path,
      bytes: metadata.size,
      executable: Boolean(metadata.mode & 0o111),
      sha256: await digest(join(root, path)),
    });
  }
  const changes = git("status", "--porcelain=v1", "--untracked-files=all");
  return {
    commit: git("rev-parse", "HEAD"),
    tree: git("rev-parse", "HEAD^{tree}"),
    dirty: Boolean(changes),
    statusSha256: createHash("sha256").update(changes).digest("hex"),
    contentSha256: createHash("sha256")
      .update(JSON.stringify(files))
      .digest("hex"),
    files,
  };
}

async function assertSourceUnchanged(source, review) {
  if (JSON.stringify(await sourceSnapshot(review)) !== JSON.stringify(source)) {
    throw new Error(
      "Source inputs or Git identity changed during the candidate build; discard this result and run fresh gates.",
    );
  }
}

async function assertNoFrontendOverrides() {
  const variables = Object.keys(process.env).filter(
    (name) =>
      name.startsWith("VITE_") || name.startsWith("APOCALYPSE_BROWSER_"),
  );
  if (variables.length)
    throw new Error(
      `Frontend build overrides are present: ${variables.join(", ")}`,
    );
  for (const directory of [root, web]) {
    const files = await readdir(directory);
    const overrides = files.filter(
      (name) =>
        name === ".env" ||
        (name.startsWith(".env.") && name !== ".env.example"),
    );
    if (overrides.length)
      throw new Error(
        `Ignored environment files may alter the build in ${directory}: ${overrides.join(", ")}`,
      );
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
    if (type.isSymbolicLink())
      throw new Error(`Symbolic link is not allowed: ${file}`);
    if (type.isDirectory()) files.push(...(await filesUnder(file)));
    else if (type.isFile()) files.push(file);
    else throw new Error(`Non-regular build output is not allowed: ${file}`);
  }
  return files;
}

async function digest(file) {
  return createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
}

async function fileEntries(directory) {
  const entries = [];
  for (const file of await filesUnder(directory)) {
    const path = pathWithin(directory, file);
    if (path === "manifest.json") continue;
    entries.push({
      path,
      bytes: (await stat(file)).size,
      sha256: await digest(file),
    });
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
    if (!Array.isArray(members))
      throw new Error("Unexpected pnpm licenses JSON shape");
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
  packages.sort((a, b) =>
    compare(
      `${a.name}@${a.versions.join(",")}`,
      `${b.name}@${b.versions.join(",")}`,
    ),
  );
  return {
    source: "pnpm licenses list --prod --json",
    scope:
      "installed production dependencies; may over-include packages absent from the final bundle",
    reviewStatus:
      "pending; metadata is not a complete redistribution notice review",
    packages,
  };
}

async function verifyBackendNotices(jar, runtimeJars) {
  const noticePath = "src/main/resources/META-INF/licenses";
  const noticeDirectory = join(root, noticePath);
  const index = JSON.parse(
    await readFile(join(noticeDirectory, "backend-runtime.json"), "utf8"),
  );
  if (index.schemaVersion !== 1 || !Array.isArray(index.dependencies)) {
    throw new Error("Unknown backend notice index format");
  }
  if (
    (await digest(join(noticeDirectory, "backend-runtime.txt"))) !==
    index.noticeSha256
  ) {
    throw new Error("Backend notice text differs from its reviewed index");
  }
  const expected = new Map(
    index.dependencies.map((dependency) => [
      dependency.filename,
      dependency.jarSha256,
    ]),
  );
  if (
    expected.size !== index.dependencies.length ||
    expected.size !== runtimeJars.length
  ) {
    throw new Error(
      "Backend runtime JAR set differs from the notice index; review the actual artifact",
    );
  }
  await mkdir(join(root, "target"), { recursive: true });
  const temporary = await mkdtemp(join(root, "target", ".notice-check-"));
  try {
    const embeddedNotices = ["backend-runtime.txt", "backend-runtime.json"];
    run(
      "jar",
      [
        "xf",
        resolve(jar),
        ...runtimeJars,
        ...embeddedNotices.map((name) => `META-INF/licenses/${name}`),
      ],
      temporary,
    );
    await filesUnder(temporary);
    for (const path of runtimeJars) {
      if (
        (await digest(join(temporary, path))) !== expected.get(basename(path))
      ) {
        throw new Error(
          `Backend runtime notice review is stale or missing: ${basename(path)}`,
        );
      }
    }
    for (const name of embeddedNotices) {
      if (
        (await digest(join(temporary, "META-INF/licenses", name))) !==
        (await digest(join(noticeDirectory, name)))
      ) {
        throw new Error(
          `Backend artifact has a missing or stale embedded notice: ${name}`,
        );
      }
    }
    const productionStaticResourceProbes = [];
    for (const path of runtimeJars.filter((name) =>
      /^swagger-ui-.*\.jar$/.test(basename(name)),
    )) {
      const resource = run("jar", ["tf", join(temporary, path)])
        .split("\n")
        .find((name) =>
          /^META-INF\/resources\/webjars\/swagger-ui\/[^/]+\/swagger-ui-bundle\.js$/.test(
            name,
          ),
        );
      if (!resource)
        throw new Error(
          `Cannot identify the bundled Swagger resource in ${basename(path)}`,
        );
      productionStaticResourceProbes.push(
        `/api/${resource.slice("META-INF/resources/".length)}`,
      );
    }
    return {
      runtimeJars: runtimeJars.length,
      noticeSha256: index.noticeSha256,
      productionStaticResourceProbes,
    };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function verifyCandidate(directory) {
  const candidate = resolve(directory);
  const manifestText = await readFile(join(candidate, "manifest.json"), "utf8");
  const manifest = JSON.parse(manifestText);
  if (
    ![1, 2].includes(manifest.schemaVersion) ||
    !["development-candidate", "review-candidate"].includes(manifest.kind) ||
    !Array.isArray(manifest.files) ||
    !/^[0-9a-f]{40}$/.test(manifest.source?.commit ?? "") ||
    !/^[0-9a-f]{40}$/.test(manifest.source?.tree ?? "")
  ) {
    throw new Error("Unknown candidate manifest format");
  }
  if (manifest.schemaVersion === 2) {
    if (
      !Array.isArray(manifest.source.files) ||
      manifest.source.files.length === 0 ||
      !manifest.source.files.every(
        (file, index, files) =>
          typeof file.path === "string" &&
          file.path.length > 0 &&
          !file.path.startsWith("/") &&
          !file.path
            .split("/")
            .some((part) => ["", ".", ".."].includes(part)) &&
          /^[0-9a-f]{64}$/.test(file.sha256) &&
          Number.isSafeInteger(file.bytes) &&
          file.bytes >= 0 &&
          typeof file.executable === "boolean" &&
          (index === 0 || compare(files[index - 1].path, file.path) < 0),
      ) ||
      !/^[0-9a-f]{64}$/.test(manifest.source.statusSha256 ?? "") ||
      typeof manifest.source.dirty !== "boolean" ||
      (manifest.kind === "development-candidate" && manifest.source.dirty) ||
      createHash("sha256")
        .update(JSON.stringify(manifest.source.files))
        .digest("hex") !== manifest.source.contentSha256
    ) {
      throw new Error("Candidate source content identity is inconsistent");
    }
  } else if (manifest.kind !== "development-candidate") {
    throw new Error(
      "Review candidates require a complete source content identity",
    );
  }
  const manifestHash = createHash("sha256").update(manifestText).digest("hex");
  const expectedName = `${manifest.source.commit.slice(0, 12)}-${manifestHash.slice(0, 12)}`;
  if (basename(candidate) !== expectedName) {
    throw new Error(
      `Candidate directory name does not match the source commit and manifest SHA-256: ${expectedName}`,
    );
  }
  if (
    JSON.stringify(await fileEntries(candidate)) !==
    JSON.stringify(manifest.files)
  ) {
    throw new Error(
      "Candidate files are missing, added, or different from manifest.json",
    );
  }
  return {
    candidate,
    kind: manifest.kind,
    sourceCommit: manifest.source.commit,
    sourceContentSha256: manifest.source.contentSha256 ?? null,
    manifestSha256: manifestHash,
    verifiedFiles: manifest.files.length,
    manifest,
  };
}

async function verify(directory) {
  const { manifest, ...result } = await verifyCandidate(directory);
  process.stdout.write(JSON.stringify(result) + "\n");
}

async function build(review = false) {
  if (!review) assertClean();
  await assertNoFrontendOverrides();
  const source = await sourceSnapshot(review);
  const nodeVersion = process.versions.node;
  if (!nodeVersion.startsWith("24."))
    throw new Error(`Node.js 24 is required; found ${nodeVersion}`);
  const frontendPackage = JSON.parse(
    await readFile(join(web, "package.json"), "utf8"),
  );
  const pnpmVersion = run("pnpm", ["--version"]);
  if (frontendPackage.packageManager !== `pnpm@${pnpmVersion}`) {
    throw new Error(
      `Expected ${frontendPackage.packageManager}; found pnpm@${pnpmVersion}`,
    );
  }
  const javaVersion = run("java", ["-version"]);
  if (!javaVersion.includes('version "25.'))
    throw new Error("JDK 25 is required");
  const backendVersion = projectVersion(
    await readFile(join(root, "pom.xml"), "utf8"),
  );
  if (backendVersion !== frontendPackage.version) {
    throw new Error(
      `Backend/frontend versions differ: ${backendVersion} / ${frontendPackage.version}`,
    );
  }

  run("./mvnw", ["--batch-mode", "clean", "verify"], root, true);
  run("pnpm", ["install", "--frozen-lockfile"], web, true);
  run("pnpm", ["check"], web, true);
  run("pnpm", ["test:browser"], web, true);
  const browserEnvironment = JSON.parse(
    run(
      "pnpm",
      [
        "exec",
        "node",
        "--input-type=module",
        "-e",
        [
          "import { chromium } from '@playwright/test';",
          "import { createRequire } from 'node:module';",
          "const require = createRequire(import.meta.url);",
          "const browser = await chromium.launch({ headless: true });",
          "try { process.stdout.write(JSON.stringify({ engine: 'chromium', version: browser.version(), playwrightVersion: require('@playwright/test/package.json').version, platform: process.platform, architecture: process.arch })); } finally { await browser.close(); }",
        ].join("\n"),
      ],
      web,
    ),
  );
  run("node", ["scripts/verify-public-docs.mjs"], root, true);
  await assertSourceUnchanged(source, review);

  const jar = join(root, "target", `apocalypse-${backendVersion}.jar`);
  const jarEntries = run("jar", ["tf", jar]).split("\n");
  const runtimeJars = jarEntries
    .filter((name) => /^BOOT-INF\/lib\/[^/]+\.jar$/.test(name))
    .sort(compare);
  if (!jarEntries.includes("BOOT-INF/classes/") || runtimeJars.length === 0) {
    throw new Error(
      "The backend artifact is not an executable Spring Boot JAR",
    );
  }
  const backendNoticeIntegrity = await verifyBackendNotices(jar, runtimeJars);
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
    if (
      !builtPaths.has(path) ||
      (await digest(file)) !== (await digest(join(dist, path)))
    ) {
      throw new Error(
        `Frontend build is missing its upstream license text: ${path}`,
      );
    }
  }
  const frontendLicenses = normalizedFrontendLicenses(
    JSON.parse(run("pnpm", ["licenses", "list", "--prod", "--json"], web)),
  );
  const noticeIndex = JSON.parse(
    await readFile(join(licenses, "frontend-dependencies.json"), "utf8"),
  );
  if (
    noticeIndex.schemaVersion !== 1 ||
    !Array.isArray(noticeIndex.dependencies)
  ) {
    throw new Error("Unknown frontend notice index format");
  }
  const noticed = new Set(
    noticeIndex.dependencies.map(({ name, version }) => `${name}@${version}`),
  );
  for (const dependency of frontendLicenses.packages) {
    for (const version of dependency.versions) {
      if (!noticed.has(`${dependency.name}@${version}`)) {
        throw new Error(
          `Frontend notice review is stale or missing: ${dependency.name}@${version}`,
        );
      }
    }
  }
  for (const name of ["vite", "tailwindcss"]) {
    const dependency = JSON.parse(
      await readFile(join(web, "node_modules", name, "package.json"), "utf8"),
    );
    if (!noticed.has(`${name}@${dependency.version}`)) {
      throw new Error(
        `Frontend build contribution notice is stale or missing: ${name}@${dependency.version}`,
      );
    }
  }

  const candidates = join(root, "target", "scaffold-candidates");
  await mkdir(candidates, { recursive: true });
  const stage = await mkdtemp(join(candidates, ".stage-"));
  try {
    await copy(jar, stage, `backend/${basename(jar)}`);
    await copy(join(root, "LICENSE"), stage, "LICENSE");
    await copy(
      join(root, "THIRD_PARTY_NOTICES.md"),
      stage,
      "THIRD_PARTY_NOTICES.md",
    );
    for (const path of [
      "deploy/compose.yml",
      "deploy/nginx.conf",
      "deploy/prepare.mjs",
      "deploy/postgres-entrypoint.sh",
      "deploy/init-db.sh",
      "deploy/redis-entrypoint.sh",
      "deploy/backend-health.sh",
      "docs/deployment.md",
      "docs/audit-recovery.md",
      "src/main/resources/META-INF/licenses/backend-runtime.txt",
      "src/main/resources/META-INF/licenses/backend-runtime.json",
      "scripts/deployment-smoke.mjs",
      "scripts/candidate-manifest.mjs",
    ]) {
      await copy(join(root, path), stage, path);
    }
    for (const file of distFiles)
      await copy(file, stage, `apocalypse-web/dist/${pathWithin(dist, file)}`);
    for (const file of licenseFiles)
      await copy(
        file,
        stage,
        `apocalypse-web/public/licenses/${pathWithin(licenses, file)}`,
      );
    await mkdir(join(stage, "inventory"), { recursive: true });
    await writeFile(
      join(stage, "inventory", "backend-runtime-jars.json"),
      JSON.stringify(
        {
          source: "BOOT-INF/lib entries in the candidate Spring Boot JAR",
          reviewStatus:
            "pending; JAR names do not prove redistribution-license compliance",
          jars: runtimeJars,
        },
        null,
        2,
      ) + "\n",
    );
    await writeFile(
      join(stage, "inventory", "frontend-production-licenses.json"),
      JSON.stringify(frontendLicenses, null, 2) + "\n",
    );
    const manifest = {
      schemaVersion: 2,
      kind: review ? "review-candidate" : "development-candidate",
      source,
      productionStaticResourceProbes:
        backendNoticeIntegrity.productionStaticResourceProbes,
      versions: {
        backend: backendVersion,
        frontend: frontendPackage.version,
        java: javaVersion.split("\n")[0],
        node: nodeVersion,
        pnpm: pnpmVersion,
        browser: browserEnvironment,
      },
      checks: [
        "./mvnw --batch-mode clean verify",
        "pnpm install --frozen-lockfile",
        "pnpm check",
        "pnpm test:browser",
        "node scripts/verify-public-docs.mjs",
      ].map((command) => ({
        command,
        result: "passed",
        ...(command === "pnpm test:browser"
          ? { environment: browserEnvironment }
          : {}),
      })),
      sourceIntegrity:
        "All non-ignored Git-tracked and untracked regular files, executable bits, HEAD and index status unchanged across fresh build gates and packaging.",
      publicationStatus: review
        ? "Local uncommitted review candidate; not a clean Git release or publication approval."
        : "Local clean development candidate; not a publication approval.",
      noticeIntegrity:
        "backend nested JAR set/hashes and embedded notices match the index; frontend versions and copied notices match; not a legal or vulnerability clearance",
      licenseReview:
        "pending; no stable release or complete transitive-notice claim",
      files: await fileEntries(stage),
    };
    const manifestText = JSON.stringify(manifest, null, 2) + "\n";
    await assertNoFrontendOverrides();
    await assertSourceUnchanged(source, review);
    await writeFile(join(stage, "manifest.json"), manifestText);
    const manifestHash = createHash("sha256")
      .update(manifestText)
      .digest("hex");
    const destination = join(
      candidates,
      `${source.commit.slice(0, 12)}-${manifestHash.slice(0, 12)}`,
    );
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
        throw new Error(
          `An existing candidate has a different manifest: ${destination}`,
        );
      }
    } else {
      await rename(stage, destination);
    }
    await verify(destination);
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  if (process.argv[2] === "build" && process.argv.length === 3) await build();
  else if (process.argv[2] === "build-review" && process.argv.length === 3)
    await build(true);
  else if (process.argv[2] === "verify" && process.argv.length === 4)
    await verify(process.argv[3]);
  else if (process.argv[2] === "verify-notices" && process.argv.length === 4) {
    const jar = resolve(process.argv[3]);
    const jars = run("jar", ["tf", jar])
      .split("\n")
      .filter((name) => /^BOOT-INF\/lib\/[^/]+\.jar$/.test(name));
    process.stdout.write(
      JSON.stringify(await verifyBackendNotices(jar, jars)) + "\n",
    );
  } else
    throw new Error(
      "Usage: node scripts/candidate-manifest.mjs build | build-review | verify <candidate-directory> | verify-notices <backend.jar>",
    );
}
