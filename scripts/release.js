"use strict";

const { existsSync, readFileSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const VERSION_FILES = [
  "package.json",
  "package-lock.json",
  "pyproject.toml",
  "app.config.js",
  "tesela.assets.json",
  "CHANGELOG.md",
];

function parseVersion(value) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(String(value || ""));
  if (!match) throw new Error(`Versión semántica inválida: ${value || "(vacía)"}`);
  return match.slice(1).map(Number);
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function replaceOnce(text, pattern, replacement, label) {
  if (!pattern.test(text)) throw new Error(`No se ha encontrado la versión en ${label}`);
  return text.replace(pattern, replacement);
}

function updateChangelog(text, version, date) {
  const releasedHeading = new RegExp(`^## \\[${version.replace(/\./g, "\\.")}\\] - `, "m");
  if (releasedHeading.test(text)) throw new Error(`CHANGELOG.md ya contiene la versión ${version}`);

  const unpublished = new RegExp(`^## ${version.replace(/\./g, "\\.")} — sin publicar$`, "m");
  if (unpublished.test(text)) {
    return text.replace(unpublished, `## [Unreleased]\n\n## [${version}] - ${date}`);
  }
  if (!/^## \[Unreleased\]$/m.test(text)) {
    throw new Error("CHANGELOG.md debe contener una sección ## [Unreleased]");
  }
  const unreleasedContent = /^## \[Unreleased\]\s*\n([\s\S]*?)(?=^## |\s*$)/m.exec(text)?.[1].trim();
  if (!unreleasedContent) throw new Error("La sección [Unreleased] está vacía");
  return text.replace(/^## \[Unreleased\]$/m, `## [Unreleased]\n\n## [${version}] - ${date}`);
}

function assertVersionSynchronized(root, expectedVersion, requireReleased = false) {
  parseVersion(expectedVersion);
  const mismatches = [];
  const packageConfig = readJson(resolve(root, "package.json"));
  const lock = readJson(resolve(root, "package-lock.json"));
  const assets = readJson(resolve(root, "tesela.assets.json"));
  if (packageConfig.version !== expectedVersion) mismatches.push("package.json");
  if (lock.version !== expectedVersion || lock.packages?.[""]?.version !== expectedVersion) {
    mismatches.push("package-lock.json");
  }
  if (assets.version !== expectedVersion) mismatches.push("tesela.assets.json");

  const pyproject = readFileSync(resolve(root, "pyproject.toml"), "utf8");
  const pythonVersion = /\[project\][\s\S]*?\nversion\s*=\s*"([^"]+)"/.exec(pyproject)?.[1];
  if (pythonVersion !== expectedVersion) mismatches.push("pyproject.toml");

  const config = readFileSync(resolve(root, "app.config.js"), "utf8");
  const configVersion = /branding\s*:\s*\{[\s\S]*?\n\s*version\s*:\s*"([^"]+)"/.exec(config)?.[1];
  if (configVersion !== expectedVersion) mismatches.push("app.config.js");

  const changelog = readFileSync(resolve(root, "CHANGELOG.md"), "utf8");
  const escaped = expectedVersion.replace(/\./g, "\\.");
  const isReleased = new RegExp(`^## \\[${escaped}\\] - \\d{4}-\\d{2}-\\d{2}$`, "m").test(changelog);
  const isPending = new RegExp(`^## ${escaped} — sin publicar$`, "m").test(changelog);
  if ((requireReleased && !isReleased) || (!requireReleased && !isReleased && !isPending)) {
    mismatches.push("CHANGELOG.md");
  }

  if (mismatches.length) {
    throw new Error(`Versión ${expectedVersion} desincronizada en: ${mismatches.join(", ")}`);
  }
  return true;
}

function synchronizeVersion(root, version, date) {
  parseVersion(version);

  const packagePath = resolve(root, "package.json");
  const packageConfig = readJson(packagePath);
  packageConfig.version = version;
  writeJson(packagePath, packageConfig);

  const lockPath = resolve(root, "package-lock.json");
  const lock = readJson(lockPath);
  lock.version = version;
  if (lock.packages?.[""]) lock.packages[""].version = version;
  writeJson(lockPath, lock);

  const assetsPath = resolve(root, "tesela.assets.json");
  const assets = readJson(assetsPath);
  assets.version = version;
  writeJson(assetsPath, assets);

  const pyprojectPath = resolve(root, "pyproject.toml");
  const pyproject = readFileSync(pyprojectPath, "utf8");
  writeFileSync(
    pyprojectPath,
    replaceOnce(
      pyproject,
      /(\[project\][\s\S]*?\nversion\s*=\s*")[^"]+("\s*)/,
      (_match, prefix, suffix) => `${prefix}${version}${suffix}`,
      "pyproject.toml",
    ),
    "utf8",
  );

  const configPath = resolve(root, "app.config.js");
  const config = readFileSync(configPath, "utf8");
  writeFileSync(
    configPath,
    replaceOnce(
      config,
      /(branding\s*:\s*\{[\s\S]*?\n\s*version\s*:\s*")[^"]+("\s*,)/,
      (_match, prefix, suffix) => `${prefix}${version}${suffix}`,
      "app.config.js",
    ),
    "utf8",
  );

  const changelogPath = resolve(root, "CHANGELOG.md");
  writeFileSync(
    changelogPath,
    updateChangelog(readFileSync(changelogPath, "utf8"), version, date),
    "utf8",
  );
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = options.capture ? `\n${result.stderr || result.stdout || ""}` : "";
    throw new Error(`${command} ${args.join(" ")} ha fallado${detail}`);
  }
  return options.capture ? String(result.stdout || "").trim() : "";
}

function git(root, args, capture = false) {
  return run("git", args, { cwd: root, capture });
}

function pythonExecutable(root) {
  if (process.env.TESELA_PYTHON) return process.env.TESELA_PYTHON;
  for (const candidate of [".venv/bin/python", ".venv/Scripts/python.exe"]) {
    const path = resolve(root, candidate);
    if (existsSync(path)) return path;
  }
  return process.platform === "win32" ? "python" : "python3";
}

function runValidations(root) {
  run("npm", ["test"], { cwd: root });
  run("npm", ["run", "test:e2e"], { cwd: root });
  run("npm", ["audit", "--audit-level=high"], { cwd: root });
  const python = pythonExecutable(root);
  run(python, ["-m", "pytest"], { cwd: root });
  run(python, ["-m", "ruff", "check", "."], { cwd: root });
  run(python, ["-m", "mypy", "scripts", "tests"], { cwd: root });
}

function release(options) {
  const root = resolve(options.root || process.cwd());
  const version = options.version;
  parseVersion(version);
  const packageVersion = readJson(resolve(root, "package.json")).version;
  const changelog = readFileSync(resolve(root, "CHANGELOG.md"), "utf8");
  const comparison = compareVersions(version, packageVersion);
  const bootstrap = comparison === 0
    && new RegExp(`^## ${version.replace(/\./g, "\\.")} — sin publicar$`, "m").test(changelog);
  if (comparison < 0 || (comparison === 0 && !bootstrap)) {
    throw new Error(`La nueva versión ${version} debe ser posterior a ${packageVersion}`);
  }

  const branch = `release/v${version}`;
  const tag = `v${version}`;
  if (options.dryRun) {
    return { branch, tag, version, bootstrap, dryRun: true, files: VERSION_FILES };
  }

  if (git(root, ["branch", "--show-current"], true) !== "main") {
    throw new Error("Las releases deben crearse desde la rama main");
  }
  if (git(root, ["status", "--porcelain"], true)) {
    throw new Error("El working tree debe estar limpio antes de crear una release");
  }
  if (git(root, ["branch", "--list", branch], true)) throw new Error(`Ya existe la rama ${branch}`);
  if (git(root, ["tag", "--list", tag], true)) throw new Error(`Ya existe el tag ${tag}`);

  git(root, ["switch", "-c", branch]);
  synchronizeVersion(root, version, options.date || new Date().toISOString().slice(0, 10));
  assertVersionSynchronized(root, version, true);
  runValidations(root);
  git(root, ["add", ...VERSION_FILES]);
  git(root, ["commit", "-m", `release: v${version}`]);
  git(root, ["tag", "-a", tag, "-m", `Tesela v${version}`]);
  git(root, ["switch", "main"]);
  git(root, ["merge", "--ff-only", branch]);

  if (options.push) {
    git(root, ["push", "--atomic", options.remote || "origin", "main", branch, `refs/tags/${tag}`]);
  }
  return { branch, tag, version, bootstrap, dryRun: false, files: VERSION_FILES };
}

function parseArguments(argv) {
  const args = [...argv];
  const version = args.shift();
  const options = { version, push: false, dryRun: false, remote: "origin" };
  while (args.length) {
    const argument = args.shift();
    if (argument === "--push") options.push = true;
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--remote") {
      options.remote = args.shift();
      if (!options.remote) throw new Error("--remote requiere un nombre");
    }
    else throw new Error(`Argumento desconocido: ${argument}`);
  }
  return options;
}

if (require.main === module) {
  try {
    const result = release(parseArguments(process.argv.slice(2)));
    console.log(
      result.dryRun
        ? `Release planificada: ${result.branch} + ${result.tag}`
        : `Release creada: ${result.branch} + ${result.tag}`,
    );
  } catch (error) {
    console.error(`Error de release: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  VERSION_FILES,
  parseVersion,
  compareVersions,
  updateChangelog,
  assertVersionSynchronized,
  synchronizeVersion,
  parseArguments,
  release,
};
