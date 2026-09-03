import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Read-only, dependency-free check for this handoff; not a replacement for API tests or CI.
const docsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(docsDir, "../..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const files = fs.readdirSync(docsDir).filter((name) => name.endsWith(".md"));
const markdownFiles = [
  ...files.map((name) => path.join(docsDir, name)),
  path.join(root, "README.md"),
  path.join(root, "apocalypse-web/README.md"),
];
let localLinks = 0;
for (const file of markdownFiles) {
  const content = fs.readFileSync(file, "utf8");
  for (const match of content.matchAll(/\]\(([^)]+)\)/g)) {
    const href = match[1].replace(/^<|>$/g, "");
    if (/^[a-z]+:/i.test(href) || href.startsWith("#")) continue;
    const target = decodeURIComponent(href.split("#")[0]);
    assert.ok(
      fs.existsSync(path.resolve(path.dirname(file), target)),
      `${file}: ${href}`,
    );
    localLinks++;
  }
}

const api = read("docs/calendar/api.md");
const documented = new Set();
for (const line of api.split("\n")) {
  const cells = line.split("|").map((cell) => cell.trim());
  if (!/^(GET|POST|PUT|DELETE)(, (GET|POST|PUT|DELETE))*$/.test(cells[1] ?? ""))
    continue;
  const route = cells[2].replaceAll("`", "");
  for (const method of cells[1].split(", "))
    documented.add(`${method} ${route}`);
}

// The current controllers use literal class prefixes and literal/no-argument method mappings.
const implemented = new Set();
const controllersDir = path.join(
  root,
  "src/main/java/io/apocalypse/calendar/interfaces",
);
for (const file of fs
  .readdirSync(controllersDir)
  .filter((name) => name.endsWith("Controller.java"))) {
  const code = fs.readFileSync(path.join(controllersDir, file), "utf8");
  const prefix = code.match(/@RequestMapping\("([^"]+)"\)/)?.[1] ?? "";
  for (const mapping of code.matchAll(
    /@(Get|Post|Put|Delete)Mapping(?:\(([^)]*)\))?/g,
  )) {
    const suffix = mapping[2]?.match(/^"([^"]*)"/)?.[1] ?? "";
    implemented.add(`${mapping[1].toUpperCase()} ${prefix}${suffix}`);
  }
}
assert.ok(documented.size > 0, "No documented endpoints found");
assert.deepEqual(
  [...documented].sort(),
  [...implemented].sort(),
  "Controller/document route drift",
);

let runtimeRoutes = null;
if (process.argv[2]) {
  const openapi = JSON.parse(
    fs.readFileSync(path.resolve(process.argv[2]), "utf8"),
  );
  const live = new Set();
  for (const [route, operations] of Object.entries(openapi.paths)) {
    if (!route.startsWith("/calendar/")) continue;
    for (const method of Object.keys(operations)) {
      if (["get", "post", "put", "delete"].includes(method))
        live.add(`${method.toUpperCase()} ${route}`);
    }
  }
  assert.deepEqual(
    [...documented].sort(),
    [...live].sort(),
    "Runtime/document route drift",
  );
  runtimeRoutes = live.size;
}

const config = read("src/main/resources/application.yml");
const configurationDoc = read("docs/calendar/configuration.md");
const calendarEnv = [
  ...config.matchAll(
    /\$\{(APOCALYPSE_(?:CAPABILITIES_CALENDAR|CALENDAR_IMPORT_STORAGE)[A-Z_]+):/g,
  ),
];
for (const [, variable] of calendarEnv)
  assert.ok(configurationDoc.includes(variable), variable);
for (let code = 11000; code <= 11019; code++)
  assert.ok(api.includes(String(code)), `Missing error ${code}`);
const sop = read("docs/calendar/data-update-sop.md");
assert.ok(
  sop.includes("date,action,classification,name,source_document_no,note"),
);
console.log(
  JSON.stringify(
    {
      markdownFiles: markdownFiles.length,
      localLinks,
      controllerRoutes: implemented.size,
      runtimeRoutes,
      calendarEnvironmentVariables: calendarEnv.length,
      result: "PASS",
    },
    null,
    2,
  ),
);
