#!/usr/bin/env node
// PostToolUse hook: cache metadata sap-adt ra file local (daemon-independent) + tự xoá khi object đổi.
// Mục đích: né re-query cross-case, nhưng KHÔNG bao giờ phục vụ data thiu sau khi object bị sửa.
//
//   READ  (get_source, api_release_state, list_package, cds_dependencies, get_class_include)
//         → ghi .claude/.cache/metadata/<system>/<KEY>.json = { ts, tool, input, response }.
//   WRITE (update_source, update_class_include, create_object, activate)
//         → INVALIDATE: xoá cache file của chính object đó (vừa sửa = cache hết giá trị).
//
//   KEY khớp convention /rap-design: get_source/api_release_state → <OBJECT_TYPE>_<NAME>.json.
//   Best-effort: response rỗng / HTML login / CSRF / "not found" → KHÔNG ghi. Không bao giờ block tool.
//
// Input (stdin JSON từ Claude Code): { tool_name, tool_input, tool_response, cwd, ... }
import { writeFileSync, mkdirSync, readdirSync, rmSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..", ".."); // <root>/.claude/hooks → <root>
const CACHE_DIR = join(ROOT, ".claude", ".cache", "metadata");

const READ_TOOLS = new Set([
  "get_source",
  "api_release_state",
  "list_package",
  "cds_dependencies",
  "get_class_include",
]);
const WRITE_TOOLS = new Set([
  "update_source",
  "update_class_include",
  "create_object",
  "activate",
]);

function readStdin() {
  return new Promise((resolve) => {
    let s = "";
    process.stdin.on("data", (d) => (s += d));
    process.stdin.on("end", () => resolve(s));
    setTimeout(() => resolve(s), 500); // phòng stdin không đóng
  });
}

const sanitize = (s) => String(s || "").replace(/[^A-Za-z0-9._-]/g, "_");

function toText(resp) {
  if (resp == null) return "";
  if (typeof resp === "string") return resp;
  if (Array.isArray(resp)) {
    return resp.map((x) => (typeof x === "string" ? x : x?.text || "")).join("\n");
  }
  if (typeof resp === "object") {
    if (typeof resp.text === "string") return resp.text;
    if (Array.isArray(resp.content)) return toText(resp.content);
    if (typeof resp.result === "string") return resp.result;
    try {
      return JSON.stringify(resp);
    } catch {
      return "";
    }
  }
  return String(resp);
}

function isBad(text) {
  if (!text || text.trim().length < 2) return true;
  const t = text.slice(0, 600).toLowerCase();
  return (
    t.includes("<html") ||
    t.includes("csrf token") ||
    t.includes("logon") ||
    t.includes("login page") ||
    t.includes("does not exist") ||
    t.includes("not found") ||
    t.includes("no object")
  );
}

// READ → tên file cache. null nếu thiếu khoá định danh.
function cacheKey(tool, input) {
  const i = input || {};
  switch (tool) {
    case "get_source":
    case "api_release_state": {
      if (!i.object_type || !i.name) return null;
      const fg = i.function_group ? `${sanitize(i.function_group)}_` : "";
      return `${sanitize(i.object_type)}_${fg}${sanitize(i.name)}`;
    }
    case "list_package":
      return i.package ? `PACKAGE_${sanitize(i.package)}${i.recursive ? "_R" : ""}` : null;
    case "cds_dependencies":
      return i.ddls_name ? `DEPS_${sanitize(i.ddls_name)}` : null;
    case "get_class_include":
      return i.class_name && i.include
        ? `CLASINC_${sanitize(i.class_name)}_${sanitize(i.include)}`
        : null;
    default:
      return null;
  }
}

// WRITE → các cache key (exact) + prefix cần xoá vì object vừa đổi.
function invalidationTargets(tool, input) {
  const i = input || {};
  const exact = new Set();
  const prefix = new Set();
  const type = i.object_type ? sanitize(i.object_type) : null;
  const name = i.name ? sanitize(i.name) : null;

  if ((tool === "update_source" || tool === "activate" || tool === "create_object") && type && name) {
    exact.add(`${type}_${name}`); // get_source / api_release_state cache
    if (type === "DDLS") exact.add(`DEPS_${name}`); // cấu trúc CDS đổi → upstream deps stale
    if (type === "CLAS") prefix.add(`CLASINC_${name}_`); // mọi include của class
  }
  if (tool === "update_class_include" && i.class_name) {
    const cn = sanitize(i.class_name);
    exact.add(`CLAS_${cn}`);
    prefix.add(`CLASINC_${cn}_`);
  }
  if (tool === "create_object" && i.package) {
    const pkg = sanitize(i.package); // package có member mới → list_package stale
    exact.add(`PACKAGE_${pkg}`);
    exact.add(`PACKAGE_${pkg}_R`);
  }
  return { exact, prefix };
}

(async () => {
  const raw = await readStdin();
  let evt;
  try {
    evt = JSON.parse(raw);
  } catch {
    return;
  }

  const tool = (evt.tool_name || "").replace(/^mcp__sap-adt__/, "");
  const input = evt.tool_input || {};
  const system = input.system;
  if (!system) return;

  const dir = join(CACHE_DIR, sanitize(system));

  // ----- WRITE → invalidate -----
  if (WRITE_TOOLS.has(tool)) {
    const { exact, prefix } = invalidationTargets(tool, input);
    if (!exact.size && !prefix.size) return;
    let files;
    try {
      files = readdirSync(dir);
    } catch {
      return; // chưa có cache dir → không có gì xoá
    }
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      const key = f.slice(0, -5);
      const hit = exact.has(key) || [...prefix].some((p) => key.startsWith(p));
      if (hit) {
        try {
          rmSync(join(dir, f), { force: true });
        } catch {}
      }
    }
    return;
  }

  // ----- READ → cache -----
  if (!READ_TOOLS.has(tool)) return;
  const text = toText(evt.tool_response);
  if (isBad(text)) return;
  const key = cacheKey(tool, input);
  if (!key) return;
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, `${key}.json`),
      JSON.stringify({ ts: Date.now(), tool, system, input, response: text }, null, 2),
      "utf8"
    );
  } catch {}
})();
