#!/usr/bin/env node

// Disposable, synthetic deployment rehearsal; never operates on an existing project.
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { request as httpsRequest } from "node:https";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prepare } from "../deploy/prepare.mjs";
import { verifyCandidate } from "./candidate-manifest.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const options = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  if (
    ![
      "--jar",
      "--dist",
      "--candidate",
      "--browser-checkpoint",
      "--out",
      "--artifact-kind",
      "--probe-static-resource",
    ].includes(key) ||
    !process.argv[index + 1] ||
    options.has(key)
  ) {
    throw new Error(
      "Usage: node scripts/deployment-smoke.mjs --candidate <candidate-directory> [--browser-checkpoint required] | --jar <jar> --dist <dist> [--out <new-evidence-directory>] [--artifact-kind local|diagnostic] [--probe-static-resource /api/path]",
    );
  }
  options.set(key, process.argv[index + 1]);
}
const candidate = options.has("--candidate")
  ? await verifyCandidate(options.get("--candidate"))
  : undefined;
if (candidate && (options.has("--jar") || options.has("--dist")))
  throw new Error(
    "Use --candidate alone so the verified manifest selects both artifacts.",
  );
if (!candidate && (!options.has("--jar") || !options.has("--dist")))
  throw new Error("Both --jar and --dist, or --candidate, are required.");
const artifactKind = candidate
  ? candidate.kind === "review-candidate"
    ? "review-candidate"
    : "release-candidate"
  : (options.get("--artifact-kind") ?? "local");
if (
  candidate &&
  options.has("--artifact-kind") &&
  options.get("--artifact-kind") !== artifactKind
)
  throw new Error(
    "Artifact kind must agree with the verified candidate manifest.",
  );
if (
  !["local", "diagnostic", "release-candidate", "review-candidate"].includes(
    artifactKind,
  )
)
  throw new Error("Unsupported artifact kind.");
if (
  !candidate &&
  ["release-candidate", "review-candidate"].includes(artifactKind)
)
  throw new Error(
    "A candidate classification requires --candidate and successful manifest verification.",
  );
if (candidate) {
  const jars = candidate.manifest.files.filter((file) =>
    /^backend\/[^/]+\.jar$/.test(file.path),
  );
  if (jars.length !== 1)
    throw new Error("Candidate must identify exactly one backend JAR.");
  options.set("--jar", join(candidate.candidate, jars[0].path));
  options.set("--dist", join(candidate.candidate, "apocalypse-web/dist"));
}
if (
  options.has("--browser-checkpoint") &&
  (options.get("--browser-checkpoint") !== "required" || !candidate)
) {
  throw new Error(
    "Browser checkpoint requires --candidate and --browser-checkpoint required.",
  );
}
const extraResource =
  options.get("--probe-static-resource") ??
  candidate?.manifest.productionStaticResourceProbes?.[0];
if (
  candidate &&
  options.has("--probe-static-resource") &&
  !candidate.manifest.productionStaticResourceProbes?.includes(extraResource)
) {
  throw new Error(
    "A candidate resource probe must identify a real bundled resource recorded by its build.",
  );
}
if (
  extraResource &&
  (!extraResource.startsWith("/api/") || /[\r\n]/.test(extraResource))
)
  throw new Error(
    "Static resource probe must remain under the local /api/ origin.",
  );
process.umask(0o077);
const id = `${Date.now()}-${randomBytes(3).toString("hex")}`;
const output = resolve(
  options.get("--out") ?? join(root, ".verify/scaffold-release/deployment", id),
);
const rehearsalOverridesFile = options.has("--browser-checkpoint")
  ? join(output, "browser-rehearsal-overrides.yml")
  : undefined;
const projects = [
  { name: `apocalypse-release-${id}`, runtime: join(output, "primary") },
  {
    name: `apocalypse-release-${id}-restore`,
    runtime: join(output, "restore"),
  },
];
const secretValues = new Set();
const report = {
  schemaVersion: 1,
  startedAt: new Date().toISOString(),
  result: "running",
  artifactKind,
  checks: [],
  projects: projects.map((p) => p.name),
  ...(candidate
    ? {
        candidate: {
          path: candidate.candidate,
          manifestSha256: candidate.manifestSha256,
          sourceCommit: candidate.sourceCommit,
          sourceContentSha256: candidate.sourceContentSha256,
          dirty: candidate.manifest.source.dirty ?? false,
        },
      }
    : {}),
};
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const pause = (milliseconds) =>
  new Promise((resolvePause) => setTimeout(resolvePause, milliseconds));
let ca;
let backupPath;
let failure;
let cleanupComplete = true;

function check(condition, label, detail = undefined) {
  if (!condition) throw new Error(`Check failed: ${label}`);
  report.checks.push({
    name: label,
    result: "passed",
    ...(detail === undefined ? {} : { detail }),
  });
  console.log(`PASS ${label}`);
}
function redact(value) {
  let result = String(value);
  for (const secret of secretValues)
    if (secret) result = result.split(secret).join("[REDACTED]");
  return result;
}
function run(
  program,
  args,
  {
    input,
    allowedFailure = false,
    binary = false,
    environment = process.env,
  } = {},
) {
  const result = spawnSync(program, args, {
    cwd: root,
    encoding: binary ? undefined : "utf8",
    input,
    env: environment,
    maxBuffer: 64 * 1024 * 1024,
    timeout: 300_000,
  });
  if (result.error || (!allowedFailure && result.status !== 0)) {
    // Never include command output here; diagnostics are separately redacted.
    report.commandFailure = {
      program,
      status: result.status,
      message: redact(
        (result.stderr ?? result.error?.message ?? "").toString(),
      ).slice(-6000),
    };
    throw new Error(
      `${program} failed (${result.status ?? result.error?.code ?? "unknown"}).`,
    );
  }
  return result;
}
function compose(project, args, options = {}) {
  if (
    !projects.includes(project) ||
    !/^apocalypse-release-[0-9]+-[0-9a-f]{6}(-restore)?$/.test(project.name)
  ) {
    throw new Error("Refusing to operate on a non-rehearsal Compose project.");
  }
  // Shell overrides must not redirect an isolated rehearsal to real deployment files or a public listener.
  const isolatedEnvironment = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) =>
        !name.startsWith("COMPOSE_") &&
        ![
          "DEPLOY_RUNTIME_DIR",
          "APP_UID",
          "APP_GID",
          "HTTPS_BIND",
          "HTTPS_PORT",
          "PUBLIC_ORIGIN",
        ].includes(name),
    ),
  );
  return run(
    "docker",
    [
      "compose",
      "--project-name",
      project.name,
      "--env-file",
      join(project.runtime, "deployment.env"),
      "-f",
      join(root, "deploy/compose.yml"),
      ...(rehearsalOverridesFile ? ["-f", rehearsalOverridesFile] : []),
      ...args,
    ],
    { ...options, environment: isolatedEnvironment },
  );
}
function sql(project, query) {
  return compose(
    project,
    [
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "postgres",
      "-d",
      "apocalypse",
      "-X",
      "-t",
      "-A",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: query },
  ).stdout.trim();
}
async function availablePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const port = server.address().port;
  await new Promise((resolveClose) => server.close(resolveClose));
  return port;
}
async function request(
  project,
  path,
  { method = "GET", body, token, trusted = true, headers = {} } = {},
) {
  const bytes = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolveRequest, reject) => {
    const req = httpsRequest(
      {
        hostname: "127.0.0.1",
        port: project.port,
        path,
        method,
        ca: trusted ? ca : undefined,
        timeout: 5000,
        headers: {
          ...headers,
          ...(bytes === undefined
            ? {}
            : {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(bytes),
              }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json;
          try {
            json = JSON.parse(text);
          } catch {
            /* Static content is not JSON. */
          }
          resolveRequest({
            status: response.statusCode,
            headers: response.headers,
            text,
            json,
          });
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("request timeout")));
    if (bytes !== undefined) req.write(bytes);
    req.end();
  });
}
async function healthy(project) {
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      const response = await request(project, "/api/actuator/health");
      if (response.status === 200 && response.json?.status === "UP")
        return response;
    } catch {
      /* Readiness can lag Compose startup and DNS changes. */
    }
    await pause(1000);
  }
  throw new Error("Application did not become ready within 90 seconds.");
}
async function loginPair(project, password, headers = {}) {
  const response = await request(project, "/api/auth/login", {
    method: "POST",
    body: { username: "admin", password },
    headers,
  });
  if (
    response.status !== 200 ||
    response.json?.code !== 0 ||
    !response.json.data?.accessToken ||
    !response.json.data?.refreshToken
  )
    throw new Error("Bootstrap/admin login failed.");
  secretValues.add(response.json.data.accessToken);
  secretValues.add(response.json.data.refreshToken);
  return response.json.data;
}
async function login(project, password, headers = {}) {
  return (await loginPair(project, password, headers)).accessToken;
}
async function refresh(project, refreshToken) {
  const response = await request(project, "/api/auth/refresh", {
    method: "POST",
    body: { refreshToken },
  });
  secretValues.add(response.json?.data?.accessToken);
  secretValues.add(response.json?.data?.refreshToken);
  return response;
}
function recordResource(response, path, token, via) {
  report.resourceProbes ??= [];
  report.resourceProbes.push({
    path,
    via,
    authenticated: Boolean(token),
    status: response.status,
    contentType: response.headers["content-type"] ?? null,
    bytes: Buffer.byteLength(response.text),
    sha256: sha256(response.text),
    ...(response.json?.code === undefined
      ? {}
      : { businessCode: response.json.code }),
  });
  return response;
}
async function probeResource(project, path, token) {
  return recordResource(
    await request(project, path, { token }),
    path,
    token,
    "https-gateway",
  );
}
function probeBackendResource(project, path, token) {
  // The synthetic JWT travels only over stdin. The backend stays unpublished.
  const input = [
    `GET ${path} HTTP/1.1`,
    "Host: localhost",
    "Connection: close",
    ...(token ? [`Authorization: Bearer ${token}`] : []),
    "",
    "",
  ].join("\r\n");
  const wire = compose(
    project,
    [
      "exec",
      "-T",
      "backend",
      "bash",
      "-c",
      "set -e; exec 3<>/dev/tcp/127.0.0.1/8080; cat >&3; cat <&3",
    ],
    { input, binary: true },
  ).stdout;
  const boundary = wire.indexOf("\r\n\r\n");
  if (boundary < 0) throw new Error("Malformed direct backend HTTP response.");
  const headerLines = wire.subarray(0, boundary).toString("utf8").split("\r\n");
  const status = Number(headerLines.shift().split(" ")[1]);
  const headers = Object.fromEntries(
    headerLines.map((line) => {
      const colon = line.indexOf(":");
      return [line.slice(0, colon).toLowerCase(), line.slice(colon + 1).trim()];
    }),
  );
  let body = wire.subarray(boundary + 4);
  if (/chunked/i.test(headers["transfer-encoding"] ?? "")) {
    let cursor = 0;
    const chunks = [];
    while (cursor < body.length) {
      const end = body.indexOf("\r\n", cursor);
      if (end < 0) throw new Error("Invalid chunked backend response.");
      const size = Number.parseInt(
        body.subarray(cursor, end).toString("ascii").split(";")[0],
        16,
      );
      if (!Number.isFinite(size) || size < 0 || end + 2 + size > body.length)
        throw new Error("Invalid backend chunk size.");
      if (size === 0) break;
      chunks.push(body.subarray(end + 2, end + 2 + size));
      cursor = end + 2 + size + 2;
    }
    body = Buffer.concat(chunks);
  }
  const text = body.toString("utf8");
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    /* Record metadata only for static assets. */
  }
  return recordResource(
    { status, headers, text, json },
    path,
    token,
    "backend-loopback",
  );
}
async function fileManifest(directory, prefix = "") {
  const entries = [];
  for (const item of (await readdir(directory, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name),
  )) {
    const name = `${prefix}${item.name}`;
    if (item.isDirectory())
      entries.push(
        ...(await fileManifest(join(directory, item.name), `${name}/`)),
      );
    else
      entries.push({
        path: name,
        sha256: sha256(await readFile(join(directory, item.name))),
      });
  }
  return entries;
}
function candidateFiles(prefix) {
  return candidate.manifest.files
    .filter((file) => file.path.startsWith(prefix))
    .map((file) => ({
      path: file.path.slice(prefix.length),
      sha256: file.sha256,
    }));
}
const sameFiles = (left, right) => {
  const sort = (files) =>
    [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return JSON.stringify(sort(left)) === JSON.stringify(sort(right));
};
async function generateTls(project) {
  const tls = join(project.runtime, "tls");
  run("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-days",
    "2",
    "-keyout",
    join(output, "ca.key"),
    "-out",
    join(output, "ca.crt"),
    "-subj",
    "/CN=Apocalypse temporary smoke CA",
  ]);
  run("openssl", [
    "req",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    join(tls, "server.key"),
    "-out",
    join(output, "server.csr"),
    "-subj",
    "/CN=localhost",
  ]);
  const extensions = join(output, "server.extensions");
  await writeFile(
    extensions,
    "subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\nbasicConstraints=CA:FALSE\n",
    { mode: 0o600 },
  );
  run("openssl", [
    "x509",
    "-req",
    "-in",
    join(output, "server.csr"),
    "-CA",
    join(output, "ca.crt"),
    "-CAkey",
    join(output, "ca.key"),
    "-CAserial",
    join(output, "ca.srl"),
    "-CAcreateserial",
    "-days",
    "2",
    "-out",
    join(tls, "server.crt"),
    "-extfile",
    extensions,
  ]);
  await chmod(join(tls, "server.key"), 0o600);
  ca = await readFile(join(output, "ca.crt"));
}

if (candidate) {
  if (
    !sameFiles(
      await fileManifest(join(root, "deploy")),
      candidateFiles("deploy/"),
    ) ||
    sha256(await readFile(fileURLToPath(import.meta.url))) !==
      candidate.manifest.files.find(
        (file) => file.path === "scripts/deployment-smoke.mjs",
      )?.sha256
  ) {
    throw new Error(
      "Deployment inputs differ from the verified candidate; run the script shipped inside that candidate.",
    );
  }
}
await mkdir(output, { mode: 0o700 });
try {
  if (rehearsalOverridesFile) {
    const overrides =
      'services:\n  backend:\n    environment:\n      APOCALYPSE_SECURITY_JWT_TTL_MINUTES: "1"\n';
    await writeFile(rehearsalOverridesFile, overrides, {
      mode: 0o600,
      flag: "wx",
    });
    report.rehearsalConfiguration = {
      overrideFile: rehearsalOverridesFile,
      overrideSha256: sha256(overrides),
      accessTtlSeconds: 60,
      scope:
        "Only the two disposable browser-checkpoint projects; production defaults unchanged.",
    };
  }
  for (const [index, project] of projects.entries()) {
    project.port = await availablePort();
    project.origin = new URL(`https://127.0.0.1:${project.port}`).origin;
    await prepare(
      project.runtime,
      index === 0
        ? options.get("--jar")
        : join(projects[0].runtime, "artifacts/backend.jar"),
      index === 0
        ? options.get("--dist")
        : join(projects[0].runtime, "artifacts/frontend"),
      project.port,
      project.origin,
    );
    for (const file of await readdir(join(project.runtime, "secrets"))) {
      const path = join(project.runtime, "secrets", file);
      secretValues.add((await readFile(path, "utf8")).trim());
      if (((await stat(path)).mode & 0o777) !== 0o600)
        throw new Error("Secret file permission is not 0600.");
    }
  }
  await generateTls(projects[0]);
  for (const file of ["server.crt", "server.key"])
    await copyFile(
      join(projects[0].runtime, "tls", file),
      join(projects[1].runtime, "tls", file),
    );
  const model = JSON.parse(
    compose(projects[0], ["config", "--format", "json"]).stdout,
  );
  const images = [
    ...new Set(Object.values(model.services).map((service) => service.image)),
  ];
  check(
    images.every((image) => /@sha256:[0-9a-f]{64}$/.test(image)),
    "all runtime images pinned by digest",
  );
  report.images = images.map((image) => {
    const info = JSON.parse(
      run("docker", ["image", "inspect", image]).stdout,
    )[0];
    return { image, id: info.Id, architecture: info.Architecture, os: info.Os };
  });
  report.artifacts = {
    backend: {
      sha256: sha256(
        await readFile(join(projects[0].runtime, "artifacts/backend.jar")),
      ),
    },
    frontend: await fileManifest(
      join(projects[0].runtime, "artifacts/frontend"),
    ),
    deployment: await fileManifest(join(root, "deploy")),
    smoke: sha256(await readFile(fileURLToPath(import.meta.url))),
  };
  if (candidate) {
    check(
      report.artifacts.backend.sha256 ===
        candidate.manifest.files.find((file) =>
          /^backend\/[^/]+\.jar$/.test(file.path),
        ).sha256 &&
        sameFiles(
          report.artifacts.frontend,
          candidateFiles("apocalypse-web/dist/"),
        ),
      "deployed JAR and frontend match the verified candidate manifest",
    );
  }
  check(
    sha256(
      await readFile(join(projects[1].runtime, "artifacts/backend.jar")),
    ) === report.artifacts.backend.sha256 &&
      sameFiles(
        await fileManifest(join(projects[1].runtime, "artifacts/frontend")),
        report.artifacts.frontend,
      ),
    "restore rehearsal uses the identical checked JAR and frontend",
  );
  check(
    ["backend", "postgres", "redis"].every(
      (name) => !model.services[name].ports,
    ),
    "data services have no host-published ports",
  );
  check(
    model.networks.application.internal && model.networks.data.internal,
    "application and data networks are internal",
  );
  check(
    model.services.backend.user.split(":")[0] !== "0",
    "application runs as non-root",
  );
  check(
    model.services.backend.environment.PUBLIC_ORIGIN === projects[0].origin,
    "production browser origin exactly matches this HTTPS frontend",
  );
  check(
    model.services.frontend.ports.length === 1 &&
      model.services.frontend.ports[0].host_ip === "127.0.0.1" &&
      Number(model.services.frontend.ports[0].published) === projects[0].port,
    "rehearsal HTTPS is published only on its allocated loopback port",
  );
  if (rehearsalOverridesFile) {
    check(
      model.services.backend.environment.APOCALYPSE_SECURITY_JWT_TTL_MINUTES ===
        "1",
      "isolated browser expiry rehearsal uses its recorded one-minute access lifetime",
    );
  }
  check(
    ![...secretValues].some((secret) => JSON.stringify(model).includes(secret)),
    "generated credentials use 0600 files; no secret values in Compose environment",
  );

  const [primary, restored] = projects;
  console.log("Starting isolated PostgreSQL/Redis on empty volumes...");
  compose(primary, [
    "up",
    "-d",
    "--wait",
    "--wait-timeout",
    "90",
    "postgres",
    "redis",
  ]);
  check(
    sql(
      primary,
      "SELECT count(*) FROM pg_tables WHERE schemaname='public';",
    ) === "0",
    "database is empty before application migration",
  );
  check(
    sql(
      primary,
      "SELECT rolsuper OR rolcreaterole OR rolcreatedb FROM pg_roles WHERE rolname='apocalypse';",
    ) === "f",
    "application database role is not privileged",
  );
  compose(primary, ["up", "-d", "--wait", "--wait-timeout", "240"]);
  const health = await healthy(primary);
  check(!health.json.components, "production health exposes summary only");
  let tlsRejected = false;
  try {
    await request(primary, "/", { trusted: false });
  } catch {
    tlsRejected = true;
  }
  check(tlsRejected, "temporary CA is untrusted outside this test client");
  const index = await request(primary, "/");
  const deep = await request(primary, "/system/users");
  check(
    index.status === 200 &&
      index.text.includes('<div id="root">') &&
      deep.text === index.text,
    "HTTPS static index and SPA deep link",
  );
  const scriptPath = index.text.match(/src="(\/assets\/[^\"]+\.js)"/)?.[1];
  const javascript = scriptPath
    ? await request(primary, scriptPath)
    : undefined;
  check(javascript?.status === 200, "built frontend JavaScript is served");
  const indexFile = await request(primary, "/index.html");
  check(
    [index, indexFile, deep, javascript].every(
      (response) =>
        response.headers["x-frame-options"] === "DENY" &&
        response.headers["x-content-type-options"] === "nosniff" &&
        response.headers["referrer-policy"] ===
          "strict-origin-when-cross-origin",
    ),
    "security headers survive SPA and immutable asset cache policies",
  );
  check(
    (await request(primary, "/assets/not-present.js")).status === 404,
    "missing asset is not rewritten to SPA",
  );
  check(
    (await request(primary, "/api/actuator/env")).status === 404,
    "management details are not publicly proxied",
  );
  const docs = await request(primary, "/api/v3/api-docs");
  check(
    docs.status === 404,
    "production gateway blocks the OpenAPI JSON endpoint",
  );
  check(
    (await probeResource(primary, "/api/swagger-ui/index.html")).status === 404,
    "production gateway blocks Swagger UI assets",
  );
  await probeResource(primary, "/api/v3/api-docs");
  if (extraResource) await probeResource(primary, extraResource);
  const anonymous = await request(primary, "/api/system/users/me");
  check(
    anonymous.json?.code === 40100,
    "protected API rejects anonymous calls",
  );
  const password = await readFile(
    join(primary.runtime, "secrets/bootstrap-admin-password"),
    "utf8",
  );
  const initialPair = await loginPair(primary, password);
  if (rehearsalOverridesFile) {
    check(
      Number(initialPair.expiresIn) === 60,
      "rehearsal login actually issues sixty-second access tokens",
    );
    report.rehearsalConfiguration.effectiveExpiresIn = Number(
      initialPair.expiresIn,
    );
  }
  let token = initialPair.accessToken;
  const rotated = await refresh(primary, initialPair.refreshToken);
  check(
    rotated.status === 200 &&
      rotated.json?.code === 0 &&
      Boolean(rotated.json.data?.accessToken) &&
      Boolean(rotated.json.data?.refreshToken) &&
      rotated.json.data.accessToken !== initialPair.accessToken &&
      rotated.json.data.refreshToken !== initialPair.refreshToken,
    "HTTPS refresh rotates the access and refresh token pair",
  );
  token = rotated.json.data.accessToken;
  check(
    (await request(primary, "/api/system/users/me", { token })).json?.code ===
      0,
    "refreshed access token authorizes the protected API",
  );
  const replay = await refresh(primary, initialPair.refreshToken);
  check(
    replay.json?.code === 40100 || replay.status === 401,
    "consumed refresh token replay is rejected",
  );
  let currentRefreshToken = rotated.json.data.refreshToken;
  for (const path of [
    "/api/swagger-ui.html",
    "/api/swagger-ui;probe/index.html",
    "/api/webjars;probe/missing.js",
    "/api/v3/api-docs.yaml",
  ]) {
    check(
      (await request(primary, path, { token })).status === 404,
      `gateway reserves documentation boundary ${path}`,
    );
  }
  for (const path of [
    "/api/swagger-ui-extra",
    "/api/webjars-extra",
    "/api/v3/api-docs-extra",
  ]) {
    check(
      (await request(primary, path, { token })).headers[
        "content-type"
      ]?.startsWith("application/json"),
      `gateway preserves adjacent API path ${path}`,
    );
  }
  for (const path of ["/swagger-ui/index.html", "/v3/api-docs"]) {
    const response = probeBackendResource(primary, path);
    check(
      response.status === 404 || response.json?.code === 40400,
      `direct production backend does not expose ${path}`,
    );
  }
  if (extraResource) {
    const resource = await probeResource(primary, extraResource, token);
    if (extraResource.startsWith("/api/webjars")) {
      check(
        resource.status === 404,
        "production gateway blocks WebJar assets even for authenticated users",
      );
    }
    probeBackendResource(primary, extraResource.slice(4));
    const direct = probeBackendResource(primary, extraResource.slice(4), token);
    check(
      direct.status === 404 || direct.json?.code === 40400,
      "direct production backend does not serve the authenticated static resource",
    );
  }
  const me = await request(primary, "/api/system/users/me", { token });
  check(
    me.json?.code === 0 && me.json.data?.user?.username === "admin",
    "bootstrap admin login and authenticated API through /api",
  );
  const spoofedHeaders = {
    "User-Agent": "apocalypse-deployment-proxy-smoke",
    Forwarded: "for=203.0.113.10;host=untrusted.invalid;proto=http",
    "X-Forwarded-For": "203.0.113.10",
    "X-Forwarded-Host": "untrusted.invalid",
    "X-Forwarded-Proto": "http",
    "X-Forwarded-Port": "1",
    "X-Forwarded-Prefix": "/untrusted-prefix",
    "X-Forwarded-Ssl": "off",
  };
  await login(primary, password, spoofedHeaders);
  let auditedIp = "";
  for (let attempt = 0; attempt < 20 && !auditedIp; attempt++) {
    auditedIp = sql(
      primary,
      "SELECT ip FROM sys_login_log WHERE user_agent='apocalypse-deployment-proxy-smoke' AND success=1 ORDER BY login_time DESC LIMIT 1;",
    );
    if (!auditedIp) await pause(500);
  }
  check(
    Boolean(auditedIp) && auditedIp !== "203.0.113.10",
    "untrusted forwarding headers do not replace the audited client address",
  );
  const calendar = await request(primary, "/api/calendar/days/2026-09-27", {
    token,
  });
  check(
    calendar.json?.code === 40400,
    "Calendar HTTP capability is closed by default",
  );
  check(
    sql(
      primary,
      "SELECT count(*) > 0 FROM pg_tables WHERE tablename LIKE 'cal_%';",
    ) === "t",
    "disabled Calendar schema still migrates with the artifact",
  );
  const invalid = await request(primary, "/api/system/configs", {
    method: "POST",
    token,
    body: { configKey: "", configName: "" },
  });
  check(
    invalid.status === 200 && invalid.json?.code === 40000,
    "business failure is detected by R.code even at HTTP 200",
    { httpStatus: invalid.status, businessCode: invalid.json.code },
  );
  const record = {
    configKey: `release.smoke.${id}`,
    configName: "Deployment smoke fixture",
    configValue: "backup-before-change",
    remark: "Synthetic deployment fixture",
  };
  const created = await request(primary, "/api/system/configs", {
    method: "POST",
    token,
    body: record,
  });
  check(
    created.json?.code === 0 && typeof created.json.data === "string",
    "synthetic business write succeeds",
  );

  // Remove the one-time bootstrap value without changing the inode of its bind mount.
  await writeFile(
    join(primary.runtime, "secrets/bootstrap-admin-password"),
    "",
    { mode: 0o600 },
  );
  compose(primary, ["restart", "postgres", "redis", "backend", "frontend"]);
  await healthy(primary);
  const restartedPair = await loginPair(primary, password);
  token = restartedPair.accessToken;
  currentRefreshToken = restartedPair.refreshToken;
  const afterRestart = await request(
    primary,
    `/api/system/configs/key/${record.configKey}`,
    { token },
  );
  check(
    afterRestart.json?.data?.configValue === record.configValue,
    "restart preserves data and admin after bootstrap removal",
  );

  // Quiesce writers for a clearly bounded recovery point, then save a local-only dump.
  compose(primary, ["stop", "backend"]);
  backupPath = join(output, "database.dump");
  const dump = compose(
    primary,
    [
      "exec",
      "-T",
      "postgres",
      "pg_dump",
      "-U",
      "postgres",
      "-d",
      "apocalypse",
      "-Fc",
      "--no-owner",
      "--no-acl",
    ],
    { binary: true },
  ).stdout;
  await writeFile(backupPath, dump, { mode: 0o600, flag: "wx" });
  report.backup = {
    sha256: sha256(dump),
    bytes: dump.length,
    format: "PostgreSQL custom",
    writesPaused: true,
  };
  compose(primary, ["up", "-d", "--wait", "--wait-timeout", "180", "backend"]);
  await healthy(primary);
  const changed = await request(
    primary,
    `/api/system/configs/${created.json.data}`,
    { method: "PUT", token, body: { ...record, configValue: "after-backup" } },
  );
  check(
    changed.json?.code === 0,
    "post-backup mutation differs from recovery point",
  );

  console.log(
    "Restoring backup into a second isolated project with new credentials and empty Redis...",
  );
  await writeFile(
    join(restored.runtime, "secrets/bootstrap-admin-password"),
    "",
    { mode: 0o600 },
  );
  compose(restored, [
    "up",
    "-d",
    "--wait",
    "--wait-timeout",
    "90",
    "postgres",
    "redis",
  ]);
  check(
    sql(
      restored,
      "SELECT count(*) FROM pg_tables WHERE schemaname='public';",
    ) === "0",
    "restore target is a separate empty database",
  );
  compose(
    restored,
    [
      "exec",
      "-T",
      "postgres",
      "pg_restore",
      "-U",
      "postgres",
      "-d",
      "apocalypse",
      "--exit-on-error",
      "--no-owner",
      "--no-acl",
      "--role=apocalypse",
    ],
    { input: dump, binary: true },
  );
  compose(restored, ["up", "-d", "--wait", "--wait-timeout", "240"]);
  await healthy(restored);
  const oldSession = await request(restored, "/api/system/users/me", { token });
  check(
    oldSession.json?.code === 40100 || oldSession.status === 401,
    "rotated JWT secret rejects pre-recovery sessions",
  );
  const oldRefresh = await refresh(restored, currentRefreshToken);
  check(
    oldRefresh.json?.code === 40100 || oldRefresh.status === 401,
    "new recovery credentials reject the pre-recovery refresh token",
  );
  const restoredPair = await loginPair(restored, password);
  const restoredToken = restoredPair.accessToken;
  if (rehearsalOverridesFile) {
    check(
      Number(restoredPair.expiresIn) === 60,
      "restored browser checkpoint actually issues sixty-second access tokens",
    );
    report.rehearsalConfiguration.restoredEffectiveExpiresIn = Number(
      restoredPair.expiresIn,
    );
  }
  const recovered = await request(
    restored,
    `/api/system/configs/key/${record.configKey}`,
    { token: restoredToken },
  );
  check(
    recovered.json?.code === 0 &&
      recovered.json.data?.configValue === record.configValue,
    "restored database returns the backed-up business value",
  );

  console.log(
    "Injecting a failed artifact startup, then restoring the checked JAR...",
  );
  compose(restored, ["stop", "backend"]);
  await writeFile(
    join(restored.runtime, "artifacts/backend.jar"),
    "invalid smoke artifact\n",
  );
  const failedStart = compose(
    restored,
    ["up", "-d", "--wait", "--wait-timeout", "25", "backend"],
    { allowedFailure: true },
  );
  check(
    failedStart.status !== 0,
    "invalid replacement artifact cannot pass startup gate",
  );
  const broken = await request(restored, "/api/actuator/health");
  const staticDuringFailure = await request(restored, "/");
  check(
    broken.status === 502 && staticDuringFailure.status === 200,
    "static readiness does not hide backend unavailability",
    { healthStatus: broken.status, staticStatus: staticDuringFailure.status },
  );
  compose(restored, ["stop", "backend"]);
  await copyFile(
    join(primary.runtime, "artifacts/backend.jar"),
    join(restored.runtime, "artifacts/backend.jar"),
  );
  check(
    sha256(await readFile(join(restored.runtime, "artifacts/backend.jar"))) ===
      report.artifacts.backend.sha256 &&
      sameFiles(
        await fileManifest(join(restored.runtime, "artifacts/frontend")),
        report.artifacts.frontend,
      ),
    "rollback restores the exact checked JAR and frontend hashes",
  );
  compose(restored, ["up", "-d", "--wait", "--wait-timeout", "180", "backend"]);
  await healthy(restored);
  const rollback = await request(
    restored,
    `/api/system/configs/key/${record.configKey}`,
    { token: restoredToken },
  );
  check(
    rollback.json?.data?.configValue === record.configValue,
    "known artifact rollback restores API and preserves restored data",
  );
  if (options.has("--browser-checkpoint")) {
    const credentialsFile = join(output, "browser-credentials.json");
    const completionFile = join(output, "browser-completion.json");
    const temporaryLeafCertificateFile = join(
      restored.runtime,
      "tls/server.crt",
    );
    const leafPublicKey = run("openssl", [
      "x509",
      "-in",
      temporaryLeafCertificateFile,
      "-pubkey",
      "-noout",
    ]).stdout;
    const leafSpki = run("openssl", ["pkey", "-pubin", "-outform", "DER"], {
      input: leafPublicKey,
      binary: true,
    }).stdout;
    const chromiumSpkiSha256 = createHash("sha256")
      .update(leafSpki)
      .digest("base64");
    await writeFile(
      credentialsFile,
      JSON.stringify({ username: "admin", password }),
      { mode: 0o600, flag: "wx" },
    );
    const checkpoint = {
      result: "waiting",
      origin: restored.origin,
      candidateManifestSha256: candidate.manifestSha256,
      sourceContentSha256: candidate.sourceContentSha256,
      accessTtlSeconds: report.rehearsalConfiguration.accessTtlSeconds,
      effectiveExpiresIn:
        report.rehearsalConfiguration.restoredEffectiveExpiresIn,
      rehearsalOverrideSha256: report.rehearsalConfiguration.overrideSha256,
      credentialsFile,
      temporaryCaFile: join(output, "ca.crt"),
      temporaryLeafCertificateFile,
      chromiumSpkiSha256,
      completionFile,
      instructions:
        "Read synthetic credentials only in the browser automation process; do not print or persist their values. Keep ignoreHTTPSErrors=false and trust only this leaf with Chromium --ignore-certificate-errors-spki-list=<chromiumSpkiSha256>. Atomically write result=passed, origin, candidateManifestSha256, sourceContentSha256 and a non-empty checks array to completionFile after real HTTPS browser verification.",
    };
    await writeFile(
      join(output, "browser-checkpoint.json"),
      `${JSON.stringify(checkpoint, null, 2)}\n`,
      { mode: 0o600, flag: "wx" },
    );
    console.log(
      `BROWSER_CHECKPOINT ${JSON.stringify({ origin: restored.origin, checkpointFile: join(output, "browser-checkpoint.json") })}`,
    );
    const deadline = Date.now() + 30 * 60_000;
    let completion;
    while (Date.now() < deadline && !completion) {
      try {
        completion = JSON.parse(await readFile(completionFile, "utf8"));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        await pause(1000);
      }
    }
    check(
      completion?.result === "passed" &&
        completion.origin === restored.origin &&
        completion.candidateManifestSha256 === candidate.manifestSha256 &&
        completion.sourceContentSha256 === candidate.sourceContentSha256 &&
        Array.isArray(completion.checks) &&
        completion.checks.length > 0 &&
        completion.checks.every(
          (item) => item.result === "passed" && typeof item.name === "string",
        ),
      "real browser report passed against the same HTTPS candidate",
    );
    report.browser = {
      origin: restored.origin,
      candidateManifestSha256: candidate.manifestSha256,
      sourceContentSha256: candidate.sourceContentSha256,
      chromiumSpkiSha256,
      checks: completion.checks.map(({ name, result }) => ({
        name: redact(name),
        result,
      })),
      completionFile,
    };
  }
  if (candidate) {
    check(
      (await verifyCandidate(candidate.candidate)).manifestSha256 ===
        candidate.manifestSha256,
      "candidate inputs remain unchanged through the deployment rehearsal",
    );
  }
  report.result = "passed";
} catch (error) {
  failure = new Error(redact(error.message));
  report.result = "failed";
  report.error = failure.message;
} finally {
  for (const project of projects) {
    try {
      let prepared = true;
      try {
        await stat(join(project.runtime, "deployment.env"));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        prepared = false;
      }
      if (!prepared) {
        await rm(project.runtime, { recursive: true, force: true });
        continue;
      }
      const logs = compose(project, ["logs", "--no-color", "--tail", "250"], {
        allowedFailure: true,
      });
      await writeFile(
        join(output, `${project.name}.log`),
        redact(`${logs.stdout ?? ""}${logs.stderr ?? ""}`),
        { mode: 0o600 },
      );
      const cleanup = compose(
        project,
        ["down", "--volumes", "--remove-orphans", "--timeout", "30"],
        { allowedFailure: true },
      );
      const containers = run("docker", [
        "ps",
        "-aq",
        "--filter",
        `label=com.docker.compose.project=${project.name}`,
      ]).stdout.trim();
      const volumes = run("docker", [
        "volume",
        "ls",
        "-q",
        "--filter",
        `label=com.docker.compose.project=${project.name}`,
      ]).stdout.trim();
      const networks = run("docker", [
        "network",
        "ls",
        "-q",
        "--filter",
        `label=com.docker.compose.project=${project.name}`,
      ]).stdout.trim();
      check(
        cleanup.status === 0 && !containers && !volumes && !networks,
        `removed disposable project ${project.name}`,
      );
      await rm(project.runtime, { recursive: true, force: true });
    } catch (error) {
      report.result = "failed";
      cleanupComplete = false;
      report.cleanupError = redact(error.message);
      failure ??= new Error(report.cleanupError);
    }
  }
  for (const name of [
    "ca.key",
    "ca.crt",
    "ca.srl",
    "server.csr",
    "server.extensions",
    "database.dump",
    "browser-credentials.json",
  ])
    await rm(join(output, name), { force: true });
  report.finishedAt = new Date().toISOString();
  report.secretRetention = cleanupComplete
    ? "Generated credentials, tokens, TLS private keys and synthetic database dump deleted; redacted logs and content hashes retained."
    : "A failed cleanup retained its private runtime directory for targeted recovery; inspect cleanupError and the exact projects list. Synthetic dump and temporary CA were removed.";
  report.limits = [
    "Local temporary CA, not public trusted TLS.",
    "Single Linux architecture reported per image; no HA, load or amd64 runtime claim.",
    "Rollback covers failed binary startup before migration; no schema downgrade or cross-version guarantee.",
    "Health is dependency readiness; business checks require R.code and authentication.",
    "Compose secrets are host files, not an encrypted secrets manager.",
  ];
  await writeFile(
    join(output, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    { mode: 0o600 },
  );
  console.log(
    `Deployment rehearsal ${report.result}; evidence: ${join(output, "report.json")}`,
  );
}
if (failure) throw failure;
