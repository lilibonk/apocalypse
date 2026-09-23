import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// A local, dependency-free distribution check. A file visible only on a maintainer's
// machine is not a valid target for a public usage document.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tracked = new Set(
  execFileSync("git", ["ls-files", "--cached", "-z"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean),
);

const published = [
  "README.md",
  "AGENTS.md",
  "THIRD_PARTY_NOTICES.md",
  "apocalypse-web/README.md",
  "apocalypse-web/AGENTS.md",
  "apocalypse-web/src/design/DEFINITION.md",
  "apocalypse-web/src/effects/README.md",
  "docs/README.md",
  "docs/getting-started.md",
  "docs/module-development.md",
  "docs/operations.md",
  "docs/release.md",
  ...[...tracked]
    .filter((name) => name.startsWith("docs/calendar/") && name.endsWith(".md"))
    .sort(),
];

const problems = [];
let linksChecked = 0;
for (const source of published) {
  if (!tracked.has(source)) {
    problems.push(`${source}: published document is absent from the Git index`);
    continue;
  }
  const file = path.join(root, source);
  if (!fs.existsSync(file)) {
    problems.push(`${source}: tracked document is absent from the worktree`);
    continue;
  }
  const markdown = fs.readFileSync(file, "utf8");
  for (const match of markdown.matchAll(/\]\(([^)]+)\)/g)) {
    const raw = match[1].trim().replace(/^<|>$/g, "");
    if (/^(https?:|mailto:)/i.test(raw) || raw.startsWith("#")) continue;
    const line = markdown.slice(0, match.index).split("\n").length;
    if (/^[a-z][a-z\d+.-]*:/i.test(raw) || raw.startsWith("/")) {
      problems.push(`${source}:${line}: nonportable link ${raw}`);
      continue;
    }
    let target;
    try {
      target = decodeURIComponent(raw.split(/[?#]/, 1)[0]);
    } catch {
      problems.push(`${source}:${line}: invalid URL escape in ${raw}`);
      continue;
    }
    const absolute = path.resolve(path.dirname(file), target);
    const relative = path.relative(root, absolute).split(path.sep).join("/");
    if (relative === ".." || relative.startsWith("../")) {
      problems.push(`${source}:${line}: link escapes repository: ${raw}`);
      continue;
    }
    const trackedTarget =
      tracked.has(relative) || [...tracked].some((name) => name.startsWith(`${relative}/`));
    if (!trackedTarget || !fs.existsSync(absolute)) {
      problems.push(`${source}:${line}: target is unavailable in a clean clone: ${raw}`);
      continue;
    }
    linksChecked++;
  }
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Public docs OK: ${published.length} tracked Markdown files, ${linksChecked} local links`,
  );
}
