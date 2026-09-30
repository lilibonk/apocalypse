#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import {
  copyFile,
  cp,
  lstat,
  mkdir,
  readdir,
  writeFile,
} from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

export async function prepare(
  runtimeDirectory,
  jarFile,
  frontendDirectory,
  port = 8443,
  publicOrigin = `https://127.0.0.1${port === 443 ? "" : `:${port}`}`,
) {
  const runtime = resolve(runtimeDirectory);
  const jar = resolve(jarFile);
  const frontend = resolve(frontendDirectory);
  const uid = process.getuid?.();
  const gid = process.getgid?.();
  if (!uid || gid === undefined)
    throw new Error("Run as a dedicated non-root Linux deployment user.");
  if (/[\r\n'\\]/.test(runtime))
    throw new Error("Runtime path contains unsupported dotenv characters.");
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid HTTPS port.");
  if (typeof publicOrigin !== "string" || /[\r\n'\\]/.test(publicOrigin))
    throw new Error("PUBLIC_ORIGIN contains unsupported dotenv characters.");
  const origin = new URL(publicOrigin);
  if (
    origin.protocol !== "https:" ||
    origin.origin !== publicOrigin ||
    origin.hostname.includes("*")
  )
    throw new Error(
      "PUBLIC_ORIGIN must be an exact HTTPS origin without a path, credentials or query.",
    );
  if (!(await lstat(jar)).isFile())
    throw new Error("JAR must be a regular file.");
  if (!(await lstat(frontend)).isDirectory())
    throw new Error("Frontend must be a directory, not a symlink.");
  if (runtime === frontend || runtime.startsWith(`${frontend}/`))
    throw new Error("Runtime must be outside the frontend source directory.");
  if (!(await lstat(join(frontend, "index.html"))).isFile())
    throw new Error("Missing frontend index.html.");
  async function rejectLinks(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink())
        throw new Error("Frontend artifacts must not contain symlinks.");
      if (entry.isDirectory()) await rejectLinks(join(directory, entry.name));
    }
  }
  await rejectLinks(frontend);
  // Exclusive directory creation: never overwrite an existing deployment or secrets.
  await mkdir(runtime, { mode: 0o700 });
  for (const directory of ["secrets", "tls", "artifacts"]) {
    await mkdir(join(runtime, directory), { mode: 0o700 });
  }
  for (const name of [
    "db-admin-password",
    "db-password",
    "jwt-secret",
    "redis-password",
  ]) {
    await writeFile(
      join(runtime, "secrets", name),
      randomBytes(32).toString("hex"),
      { mode: 0o600, flag: "wx" },
    );
  }
  await writeFile(
    join(runtime, "secrets", "bootstrap-admin-password"),
    `A9-${randomBytes(24).toString("hex")}`,
    {
      mode: 0o600,
      flag: "wx",
    },
  );
  await copyFile(jar, join(runtime, "artifacts", "backend.jar"));
  await cp(frontend, join(runtime, "artifacts", "frontend"), {
    recursive: true,
    dereference: false,
  });
  // Only non-secret configuration belongs here. Compose secrets remain separate files.
  await writeFile(
    join(runtime, "deployment.env"),
    [
      `DEPLOY_RUNTIME_DIR='${runtime}'`,
      `APP_UID=${uid}`,
      `APP_GID=${gid}`,
      "HTTPS_BIND=127.0.0.1",
      `HTTPS_PORT=${port}`,
      `PUBLIC_ORIGIN='${publicOrigin}'`,
      "",
    ].join("\n"),
    { mode: 0o600, flag: "wx" },
  );
  return runtime;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv.length !== 5)
    throw new Error(
      "Usage: node deploy/prepare.mjs <new-runtime-directory> <backend.jar> <frontend-dist-directory>",
    );
  const runtime = await prepare(...process.argv.slice(2));
  console.log(
    `Prepared ${runtime}. Install tls/server.crt and tls/server.key (0600) before startup.`,
  );
  console.log(
    "Initial admin password is only in secrets/bootstrap-admin-password; remove its value after successful login.",
  );
}
