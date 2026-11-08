/**
 * dsh-webdav-sync — 跨设备同步 DSH 设置/状态（服务端）
 *
 * 目标：把 DSH 的「设置与状态」同步到 WebDAV，供第二台设备拉取。
 * 明确不含会话历史（sessions/）与附件（attachments/）——那是「传文件」，
 * 本插件只同步小而可移植的配置/状态层。
 *
 * 设计要点：
 *  - 零第三方运行时依赖：WebDAV 只用 Node 内置 fetch（GET/PUT/MKCOL）。
 *  - manifest 驱动：push 时在远端写一份 dsh-sync-manifest.json（path → sha256），
 *    pull/status 都先读 manifest，避免解析 PROPFIND 的 XML。
 *  - 凭据存 DSH_HOME/dsh-webdav-sync/config.json（本地专属、不进同步范围），
 *    不把密码写进会被同步的 cordis.patch.yml。
 *  - 硬排除：.credentials.yaml（密钥）、.anonymous-user-id（机器相关）、
 *    *.tmp / *.lock（运行时垃圾）。
 */
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  statSync,
  renameSync,
  copyFileSync,
} from "node:fs";
import { join, dirname, resolve, sep } from "node:path";
import { homedir, hostname } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";

const PLUGIN_NAME = "webdav-sync";
const PLUGIN_VERSION = "0.1.0";
const STORE_DIR = "dsh-webdav-sync";
const MANIFEST = "dsh-sync-manifest.json";
const MANIFEST_VERSION = 1;
/** 坚果云等 WebDAV 不允许把文件直接放在根目录（PUT 到根会 404），所有同步内容统一放进这个子目录。 */
const SYNC_DIR = "dsh-sync";
const LEDGER = "ledger.json";

/** 设备标识：主机名 + 系统目录，用于同步账本与 manifest 溯源。 */
function deviceInfo() {
  return { host: hostname(), platform: platformDir() };
}

/** 按当前系统选择远端子目录：同一 WebDAV 上 win/mac/linux 各存一份。 */
function platformDir() {
  if (process.platform === "win32") return "win";
  if (process.platform === "darwin") return "mac";
  return "linux";
}

export const name = PLUGIN_NAME;

export const Config = z
  .object({
    remoteUrl: z.string().default(""),
    username: z.string().default(""),
    password: z.string().default(""),
    scope: z.array(z.string()).default([]),
  })
  .description("dsh-webdav-sync：跨设备同步 DSH 设置/状态（不含会话历史与附件）");

/* ------------------------------------------------------------------ */
/* 同步范围                                                             */
/* ------------------------------------------------------------------ */

/**
 * 默认白名单（相对 DSH_HOME）。这是「设置/状态」层，不含会话历史与附件。
 * 故意不放进默认：storages/workspace.json（机器相关绝对路径）、
 * storages/session_projcache*（74MB 可重建缓存）、sessions/、attachments/。
 */
const DEFAULT_SCOPE = [
  { rel: ".agent-presets", kind: "dir", note: "自定义 agent 预设" },
  { rel: "storages/scheduled_tasks.json", kind: "file", note: "定时任务" },
  { rel: "storages/schedule.json", kind: "file", note: "调度器状态" },
  { rel: "auto-work/tasks.json", kind: "file", note: "自动化任务" },
  { rel: "task-board", kind: "dir", note: "任务看板" },
  { rel: "profiles/desktop/cordis.patch.yml", kind: "file", note: "插件/模型/UI 配置" },
];

/** 无论 scope 如何都不同步的文件名（密钥 / 机器相关 / 运行时垃圾）。 */
const HARD_EXCLUDE_BASENAMES = new Set([".credentials.yaml", ".anonymous-user-id", ".DS_Store"]);

function isExcluded(rel) {
  const base = rel.split("/").pop();
  if (HARD_EXCLUDE_BASENAMES.has(base)) return true;
  if (base.endsWith(".tmp")) return true;
  if (base.includes(".lock")) return true;
  return false;
}

/* ------------------------------------------------------------------ */
/* 路径与配置                                                           */
/* ------------------------------------------------------------------ */

function dshHome() {
  return process.env.DSH_HOME || join(homedir(), ".dsh");
}

function storeDir() {
  return join(dshHome(), STORE_DIR);
}

function loadConfig(config) {
  const file = join(storeDir(), "config.json");
  let stored = {};
  if (existsSync(file)) {
    try {
      stored = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      stored = {};
    }
  }
  const cfg = config && typeof config === "object" ? config : {};
  const first = (...vals) => vals.find((v) => typeof v === "string" && v !== "");
  return {
    remoteUrl: first(stored.remoteUrl, cfg.remoteUrl, process.env.DSH_WEBDAV_URL) || "",
    username: first(stored.username, cfg.username, process.env.DSH_WEBDAV_USER) || "",
    password: first(stored.password, cfg.password, process.env.DSH_WEBDAV_PASS) || "",
  };
}

function saveConfig(partial) {
  const file = join(storeDir(), "config.json");
  let existing = {};
  if (existsSync(file)) {
    try {
      existing = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      existing = {};
    }
  }
  const merged = { ...existing };
  if (partial.remoteUrl !== undefined) merged.remoteUrl = String(partial.remoteUrl).trim();
  if (partial.username !== undefined) merged.username = String(partial.username);
  if (partial.password !== undefined) merged.password = String(partial.password);
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${randomUUID().slice(0, 8)}`;
  writeFileSync(tmp, JSON.stringify(merged, null, 2), "utf8");
  renameSync(tmp, file);
  return merged;
}

/* ------------------------------------------------------------------ */
/* 同步账本（只增不改，本地；记录本机 push/pull 历史）                    */
/* ------------------------------------------------------------------ */

function ledgerFile() {
  return join(storeDir(), LEDGER);
}

function appendLedger(entry) {
  const file = ledgerFile();
  let data = { version: 1, entries: [] };
  if (existsSync(file)) {
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8"));
      if (parsed && Array.isArray(parsed.entries)) data = parsed;
    } catch {
      data = { version: 1, entries: [] };
    }
  }
  data.entries.push(entry);
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${randomUUID().slice(0, 8)}`;
  writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  renameSync(tmp, file);
}

function readLedger(limit) {
  const file = ledgerFile();
  if (!existsSync(file)) return { entries: [] };
  try {
    const data = JSON.parse(readFileSync(file, "utf8"));
    const entries = Array.isArray(data.entries) ? data.entries : [];
    const n = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : 20;
    return { entries: entries.slice(-n) };
  } catch {
    return { entries: [] };
  }
}

function resolveScope(config) {
  const custom = config && Array.isArray(config.scope) ? config.scope.map((s) => String(s)).filter(Boolean) : [];
  if (custom.length === 0) return DEFAULT_SCOPE.slice();
  const root = dshHome();
  return custom.map((rel) => {
    let kind = "file";
    try {
      if (statSync(join(root, rel)).isDirectory()) kind = "dir";
    } catch {
      /* 不存在默认按文件处理 */
    }
    return { rel, kind, note: "" };
  });
}

/* ------------------------------------------------------------------ */
/* 文件收集                                                             */
/* ------------------------------------------------------------------ */

function walkDir(absDir, relBase, out) {
  if (!existsSync(absDir)) return out;
  for (const entry of readdirSync(absDir)) {
    const abs = join(absDir, entry);
    const rel = relBase ? `${relBase}/${entry}` : entry;
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkDir(abs, rel, out);
    else if (st.isFile() && !isExcluded(rel)) out.push({ rel, abs });
  }
  return out;
}

function collectFiles(scope) {
  const root = dshHome();
  const files = [];
  for (const entry of scope) {
    if (isExcluded(entry.rel)) continue;
    const abs = join(root, entry.rel);
    if (entry.kind === "dir") walkDir(abs, entry.rel, files);
    else if (existsSync(abs)) files.push({ rel: entry.rel, abs });
  }
  return files;
}

function insideRoot(root, abs) {
  const r = resolve(root);
  const a = resolve(abs);
  return a === r || a.startsWith(r + sep);
}

/* ------------------------------------------------------------------ */
/* WebDAV 客户端（Node 内置 fetch，零依赖）                              */
/* ------------------------------------------------------------------ */

function joinUrl(base, rel) {
  const b = base.endsWith("/") ? base : `${base}/`;
  return b + rel.split("/").map(encodeURIComponent).join("/");
}

function remoteBase(cfg) {
  return joinUrl(cfg.remoteUrl, `${SYNC_DIR}/${platformDir()}`);
}

function authHeaders(cfg) {
  if (cfg.username) {
    return { Authorization: `Basic ${Buffer.from(`${cfg.username}:${cfg.password || ""}`).toString("base64")}` };
  }
  return {};
}

async function davPut(cfg, rel, body) {
  const res = await fetch(joinUrl(remoteBase(cfg), rel), {
    method: "PUT",
    headers: { ...authHeaders(cfg), "content-type": "application/octet-stream" },
    body,
  });
  if (res.status >= 400) throw new Error(`PUT ${rel} -> HTTP ${res.status}`);
}

async function davGet(cfg, rel) {
  const res = await fetch(joinUrl(remoteBase(cfg), rel), { method: "GET", headers: authHeaders(cfg) });
  if (res.status === 404) return null;
  if (res.status >= 400) throw new Error(`GET ${rel} -> HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function davMkcol(cfg, rel) {
  const res = await fetch(joinUrl(remoteBase(cfg), rel), { method: "MKCOL", headers: authHeaders(cfg) });
  if (res.status === 201 || res.status === 200 || res.status === 405) return; // 405 = 已存在
  if (res.status >= 400) throw new Error(`MKCOL ${rel} -> HTTP ${res.status}`);
}

function parentDirs(rel) {
  const parts = rel.split("/");
  const dirs = [];
  for (let i = 1; i < parts.length; i += 1) dirs.push(parts.slice(0, i).join("/"));
  return dirs;
}

/**
 * 尽力创建远端同步子目录（push 前调用）。
 * 坚果云等 WebDAV 不允许把文件直接放在根目录（PUT 到根会 404），
 * 因此所有内容统一放进 remoteUrl 下的 SYNC_DIR 子目录；这里先把它建出来。
 * 201=新建、405=已存在、409=父级是虚拟路由，都不是错误，忽略即可。
 */
async function ensureBaseCollection(cfg) {
  try {
    await fetch(joinUrl(cfg.remoteUrl, SYNC_DIR), { method: "MKCOL", headers: authHeaders(cfg) });
  } catch {
    /* 顶层同步目录，建不出来就忽略 */
  }
  try {
    await fetch(remoteBase(cfg), { method: "MKCOL", headers: authHeaders(cfg) });
  } catch {
    /* 平台子目录，best-effort：建不出来就让后面的 PUT 报真实错误 */
  }
}

/* ------------------------------------------------------------------ */
/* 同步逻辑                                                             */
/* ------------------------------------------------------------------ */

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * 行级差异（本地 → 远端：'-' 本地、'+' 远端）。用于 pull 的「参照」模式。
 * 配置层文件都很小，LCS 足够；文件过大则退化为摘要，避免爆内存。
 */
function lineDiff(oldText, newText, cap = 100) {
  const a = String(oldText).split(/\r?\n/);
  const b = String(newText).split(/\r?\n/);
  const n = a.length;
  const m = b.length;
  if (n * m > 4_000_000) {
    return [{ op: "?", line: `(文件较大，省略行级差异；行数 ${n} → ${m})` }];
  }
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ op: " ", line: a[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ op: "-", line: a[i] });
      i += 1;
    } else {
      ops.push({ op: "+", line: b[j] });
      j += 1;
    }
  }
  while (i < n) {
    ops.push({ op: "-", line: a[i] });
    i += 1;
  }
  while (j < m) {
    ops.push({ op: "+", line: b[j] });
    j += 1;
  }
  let first = -1;
  let last = -1;
  for (let k = 0; k < ops.length; k += 1) {
    if (ops[k].op !== " ") {
      if (first < 0) first = k;
      last = k;
    }
  }
  if (first < 0) return [];
  const start = Math.max(0, first - 2);
  const end = Math.min(ops.length, last + 3);
  const window = ops.slice(start, end);
  return window.length > cap ? window.slice(0, cap) : window;
}

async function pushOp(cfg, scope) {
  const files = collectFiles(scope);
  await ensureBaseCollection(cfg);
  const dirs = new Set();
  for (const f of files) for (const d of parentDirs(f.rel)) dirs.add(d);
  const ordered = [...dirs].sort((a, b) => a.split("/").length - b.split("/").length);
  for (const d of ordered) await davMkcol(cfg, d);

  const manifest = { version: MANIFEST_VERSION, generatedAt: new Date().toISOString(), pushedBy: deviceInfo(), files: [] };
  for (const f of files) {
    const body = readFileSync(f.abs);
    await davPut(cfg, f.rel, body);
    manifest.files.push({ path: f.rel, sha256: sha256(body), size: body.length });
  }
  manifest.files.sort((a, b) => a.path.localeCompare(b.path));
  await davPut(cfg, MANIFEST, Buffer.from(JSON.stringify(manifest, null, 2), "utf8"));
  appendLedger({
    at: manifest.generatedAt,
    action: "push",
    host: manifest.pushedBy.host,
    platform: manifest.pushedBy.platform,
    dir: `${SYNC_DIR}/${platformDir()}`,
    count: files.length,
    files: files.map((f) => f.rel),
  });
  return { pushed: files.length, files: files.map((f) => f.rel) };
}

async function pullOp(cfg, scope) {
  const raw = await davGet(cfg, MANIFEST);
  if (raw === null) throw new Error("远端没有 manifest，请先在另一台设备执行推送（push）");
  let manifest;
  try {
    manifest = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new Error("远端 manifest 不是合法 JSON");
  }
  const entries = Array.isArray(manifest.files) ? manifest.files : [];
  const root = dshHome();
  const backupDir = join(storeDir(), "backups", new Date().toISOString().replace(/[:.]/g, "-"));
  const applied = [];
  const skipped = [];
  for (const entry of entries) {
    const rel = typeof entry.path === "string" ? entry.path : "";
    if (!rel || isExcluded(rel)) {
      skipped.push(rel);
      continue;
    }
    const abs = join(root, rel);
    if (!insideRoot(root, abs)) {
      skipped.push(rel);
      continue;
    }
    const body = await davGet(cfg, rel);
    if (body === null) {
      skipped.push(rel);
      continue;
    }
    if (existsSync(abs)) {
      mkdirSync(backupDir, { recursive: true });
      const bak = join(backupDir, rel);
      mkdirSync(dirname(bak), { recursive: true });
      copyFileSync(abs, bak);
    }
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body);
    applied.push(rel);
  }
  appendLedger({
    at: new Date().toISOString(),
    action: "pull",
    host: deviceInfo().host,
    platform: platformDir(),
    dir: `${SYNC_DIR}/${platformDir()}`,
    count: applied.length,
    files: applied,
  });
  return { pulled: applied.length, skipped: skipped.length, backupDir, applied, skipped };
}

/**
 * 「参照」模式：只读，不改本机。逐文件对比本地 vs 远端，给出行级差异，
 * 由用户/agent 决定是否 apply（apply 见 pullOp）。
 */
async function diffOp(cfg, scope) {
  const files = collectFiles(scope);
  const local = new Map();
  for (const f of files) local.set(f.rel, readFileSync(f.abs));

  const raw = await davGet(cfg, MANIFEST);
  if (raw === null) {
    return { remote: false, pushedBy: null, changed: [], remoteOnly: [], localOnly: [...local.keys()], unchanged: [] };
  }
  let manifest;
  try {
    manifest = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new Error("远端 manifest 不是合法 JSON");
  }
  const remote = new Map();
  for (const e of Array.isArray(manifest.files) ? manifest.files : []) {
    if (typeof e.path === "string") remote.set(e.path, e);
  }
  const changed = [];
  const remoteOnly = [];
  const unchanged = [];
  for (const [rel, body] of local) {
    const entry = remote.get(rel);
    if (!entry) continue;
    if (entry.sha256 === sha256(body)) {
      unchanged.push(rel);
      continue;
    }
    const remoteBody = await davGet(cfg, rel);
    if (remoteBody === null) continue;
    changed.push({
      path: rel,
      localSize: body.length,
      remoteSize: remoteBody.length,
      diff: lineDiff(body.toString("utf8"), remoteBody.toString("utf8")),
    });
  }
  const localOnly = [...local.keys()].filter((rel) => !remote.has(rel));
  const localSet = new Set(local.keys());
  for (const rel of remote.keys()) if (!localSet.has(rel)) remoteOnly.push(rel);
  return {
    remote: true,
    generatedAt: manifest.generatedAt,
    pushedBy: manifest.pushedBy || null,
    changed,
    remoteOnly,
    localOnly,
    unchanged,
  };
}

async function statusOp(cfg, scope) {
  const files = collectFiles(scope);
  const local = new Map();
  for (const f of files) local.set(f.rel, sha256(readFileSync(f.abs)));

  const raw = await davGet(cfg, MANIFEST);
  if (raw === null) {
    return { remote: false, localCount: files.length, localOnly: [...local.keys()] };
  }
  let manifest;
  try {
    manifest = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new Error("远端 manifest 不是合法 JSON");
  }
  const remote = new Map();
  for (const e of Array.isArray(manifest.files) ? manifest.files : []) {
    if (typeof e.path === "string") remote.set(e.path, e.sha256);
  }
  const upToDate = [];
  const changed = [];
  const localOnly = [];
  const remoteOnly = [];
  for (const [rel, hash] of local) {
    if (!remote.has(rel)) localOnly.push(rel);
    else if (remote.get(rel) !== hash) changed.push(rel);
    else upToDate.push(rel);
  }
  for (const rel of remote.keys()) if (!local.has(rel)) remoteOnly.push(rel);
  return { remote: true, generatedAt: manifest.generatedAt, upToDate, changed, localOnly, remoteOnly };
}

/* ------------------------------------------------------------------ */
/* API（工具与 HTTP 路由共用）                                           */
/* ------------------------------------------------------------------ */

function makeApi(config) {
  const effective = () => loadConfig(config);
  const scope = () => resolveScope(config);
  const requireRemote = (c) => {
    if (!c.remoteUrl) throw new Error("WebDAV 地址未配置：先执行 dsh_sync_config，或设置 DSH_WEBDAV_URL");
  };

  const configView = () => {
    const c = effective();
    return { remoteUrl: c.remoteUrl, username: c.username, passwordSet: !!c.password, platform: platformDir() };
  };

  const setConfig = (args) => {
    const partial = {};
    if (typeof args.remoteUrl === "string") partial.remoteUrl = args.remoteUrl;
    if (typeof args.username === "string") partial.username = args.username;
    if (typeof args.password === "string" && args.password !== "") partial.password = args.password;
    if (Object.keys(partial).length === 0) throw new Error("没有要保存的配置字段");
    saveConfig(partial);
    return configView();
  };

  const scopeView = () => ({
    platform: platformDir(),
    remoteDir: `${SYNC_DIR}/${platformDir()}`,
    scope: scope().map((e) => ({ rel: e.rel, kind: e.kind, note: e.note })),
    excluded: [...HARD_EXCLUDE_BASENAMES],
  });

  const pushRun = async () => {
    const c = effective();
    requireRemote(c);
    return pushOp(c, scope());
  };

  const pullRun = async (args) => {
    const c = effective();
    requireRemote(c);
    if (args && args.apply === true) return pullOp(c, scope());
    return diffOp(c, scope());
  };

  const diffRun = async () => {
    const c = effective();
    requireRemote(c);
    return diffOp(c, scope());
  };

  const statusRun = async () => {
    const c = effective();
    requireRemote(c);
    return statusOp(c, scope());
  };

  const ledgerRun = (args) => readLedger(args && args.limit);

  return {
    configView,
    setConfig,
    scopeView,
    push: pushRun,
    pull: pullRun,
    diff: diffRun,
    status: statusRun,
    ledger: ledgerRun,
  };
}

/* ------------------------------------------------------------------ */
/* 工具                                                                */
/* ------------------------------------------------------------------ */

function textOutput(label) {
  return {
    schema: { type: "object", additionalProperties: true },
    render(_args, value) {
      return [{ type: "text", text: `${label}\n${JSON.stringify(value, null, 2)}` }];
    },
  };
}

function registerTools(ctx, api) {
  ctx.inject(["tools"], (sctx) => {
    const disposers = [];
    const register = (tool) => {
      try {
        disposers.push(sctx.tools.register(defineTool(tool)));
      } catch (error) {
        ctx.logger?.warn?.(`webdav-sync: tool ${tool.name} was not registered: ${String(error)}`);
      }
    };

    register({
      name: "dsh_sync_config",
      description:
        "配置跨设备同步的 WebDAV 连接（远程地址、用户名、密码）。凭据保存在本机 DSH_HOME/dsh-webdav-sync/config.json，不会进入同步范围。密码字段留空表示不改。",
      parameters: {
        remoteUrl: { type: "string", description: "WebDAV 根地址，如 https://host/dav/" },
        username: { type: "string", description: "WebDAV 用户名（可留空匿名）" },
        password: { type: "string", description: "WebDAV 密码（留空表示不修改）" },
      },
      output: textOutput("同步配置（密码不回显，仅显示是否已设置）"),
      execute(args) {
        return api.setConfig(args);
      },
    });

    register({
      name: "dsh_sync_push",
      description: "把本机的 DSH 设置/状态（agent 预设、定时任务、自动化任务、任务看板、cordis.patch.yml）推送到 WebDAV。",
      parameters: {},
      output: textOutput("已推送到 WebDAV"),
      async execute() {
        return api.push();
      },
    });

    register({
      name: "dsh_sync_pull",
      description:
        "从 WebDAV 拉取 DSH 设置/状态。默认只输出差异（参照模式，不改本机）；传 apply=true 才真正写入，写入前自动备份到 DSH_HOME/dsh-webdav-sync/backups/。",
      parameters: {
        apply: { type: "boolean", description: "true = 真正写入本机（覆盖前备份）；默认 false 只出差异" },
      },
      output: textOutput("拉取结果（apply=false 时为差异）"),
      async execute(args) {
        return api.pull(args);
      },
    });

    register({
      name: "dsh_sync_diff",
      description: "只读对比本机与 WebDAV 的逐文件差异（行级），不改本机。",
      parameters: {},
      output: textOutput("同步差异（只读）"),
      async execute() {
        return api.diff();
      },
    });

    register({
      name: "dsh_sync_ledger",
      description: "查看本机的同步账本（历史 push/pull 记录，只增不改）。",
      parameters: {
        limit: { type: "number", description: "最近条数，默认 20" },
      },
      output: textOutput("同步账本"),
      execute(args) {
        return api.ledger(args);
      },
    });

    register({
      name: "dsh_sync_status",
      description: "对比本机与 WebDAV 上的同步状态：一致 / 本地有改动 / 仅本地 / 仅远端。",
      parameters: {},
      output: textOutput("同步状态对比"),
      async execute() {
        return api.status();
      },
    });

    register({
      name: "dsh_sync_scope",
      description: "查看当前同步白名单（哪些文件会被同步）以及硬排除项。",
      parameters: {},
      output: textOutput("同步范围"),
      execute() {
        return api.scopeView();
      },
    });

    return () => {
      for (const dispose of disposers) {
        try {
          dispose();
        } catch {
          /* ignore */
        }
      }
    };
  });
}

/* ------------------------------------------------------------------ */
/* HTTP 路由（供侧栏 UI 读取/操作）                                      */
/* ------------------------------------------------------------------ */

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function handleRequest(request, api) {
  try {
    if (request.method === "GET") {
      return jsonResponse({ config: api.configView(), scope: api.scopeView(), ledger: api.ledger({ limit: 8 }) });
    }
    if (request.method !== "POST") return jsonResponse({ error: "method not allowed" }, 405);
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "invalid JSON body" }, 400);
    }
    const action = String(body?.action || "");
    switch (action) {
      case "config":
        return jsonResponse(api.setConfig(body));
      case "push":
        return jsonResponse(await api.push());
      case "pull":
        return jsonResponse(await api.pull(body));
      case "status":
        return jsonResponse(await api.status());
      case "ledger":
        return jsonResponse(api.ledger(body));
      case "scope":
        return jsonResponse(api.scopeView());
      default:
        return jsonResponse({ error: `unknown action "${action}"` }, 400);
    }
  } catch (error) {
    return jsonResponse({ error: String(error?.message ?? error) }, 400);
  }
}

function registerRoutes(ctx, api) {
  ctx.inject(["connection"], (sctx) => {
    const connection = sctx.get("connection");
    if (!connection || !connection.fetch || typeof connection.fetch.register !== "function") {
      ctx.logger?.warn?.("webdav-sync: no connection.fetch; GUI route not registered");
      return;
    }
    sctx.effect(
      () =>
        connection.fetch.register({
          path: "/api/dsh-webdav-sync",
          methods: ["GET", "POST"],
          requestBody: "buffered",
          fetch: (request) => handleRequest(request, api),
        }),
      "webdav-sync: /api/dsh-webdav-sync",
    );
  });
}

/* ------------------------------------------------------------------ */
/* 插件入口                                                             */
/* ------------------------------------------------------------------ */

export function apply(ctx, config) {
  const cfg = config && typeof config === "object" ? config : {};
  const api = makeApi(cfg);

  registerTools(ctx, api);
  registerRoutes(ctx, api);

  ctx.logger?.info?.(`webdav-sync: ready (store=${storeDir()}, version=${PLUGIN_VERSION})`);
}
