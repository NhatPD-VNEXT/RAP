#!/usr/bin/env node
// PostToolUse hook: audit trail mọi write lên SAP.
// Lý do tồn tại: object đã activate KHÔNG xóa được. Khi phát hiện object rác trên system,
// đây là nguồn duy nhất trả lời "tạo lúc nào, từ case nào, bằng lệnh gì, kết quả ra sao".
//
// Match: mcp__sap-adt__(create_object|update_source|update_class_include|activate)
// Ghi:   package/<Case>/deploy-log.jsonl   (1 dòng JSON / lần write)
//        Không suy được case → .claude/.cache/deploy-log.jsonl
// Best-effort: mọi lỗi đều nuốt, KHÔNG bao giờ block tool.
import { readFileSync, readdirSync, existsSync, appendFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..", "..");
const TOOLS = new Set(["create_object", "update_source", "update_class_include", "activate"]);

function readStdin() {
  return new Promise((resolve) => {
    let s = "";
    process.stdin.on("data", (d) => (s += d));
    process.stdin.on("end", () => resolve(s));
    setTimeout(() => resolve(s), 500);
  });
}

// package → <Case> (đọc frontmatter `package:` của design)
function caseForPackage(pkg) {
  const pkgDir = join(ROOT, "package");
  if (!existsSync(pkgDir) || !pkg) return null;
  const want = String(pkg).toUpperCase();
  for (const caseName of readdirSync(pkgDir)) {
    const dir = join(pkgDir, caseName, "designs");
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".md")) continue;
      try {
        const head = readFileSync(join(dir, f), "utf8").slice(0, 2000);
        const m = head.match(/^package\s*:\s*(.*)$/im);
        if (m && m[1].split("#")[0].trim().replace(/^["']|["']$/g, "").toUpperCase() === want) {
          return caseName;
        }
      } catch {}
    }
  }
  return null;
}

// Tên object có suffix variant nào → đoán case (khi tool không truyền package)
function caseForName(name) {
  const pkgDir = join(ROOT, "package");
  if (!existsSync(pkgDir) || !name) return null;
  const n = String(name).toUpperCase();
  const hits = [];
  for (const caseName of readdirSync(pkgDir)) {
    const dir = join(pkgDir, caseName, "designs");
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".md")) continue;
      try {
        // object name xuất hiện trong Object Impact List của design nào
        if (readFileSync(join(dir, f), "utf8").toUpperCase().includes(n)) hits.push(caseName);
      } catch {}
    }
  }
  return hits.length === 1 ? hits[0] : null;
}

function toText(resp) {
  if (resp == null) return "";
  if (typeof resp === "string") return resp;
  if (Array.isArray(resp)) return resp.map((x) => (typeof x === "string" ? x : x?.text || "")).join("\n");
  if (typeof resp === "object") {
    if (typeof resp.text === "string") return resp.text;
    if (Array.isArray(resp.content)) return toText(resp.content);
    try {
      return JSON.stringify(resp);
    } catch {
      return "";
    }
  }
  return String(resp);
}

// Phân loại kết quả từ response text
function verdict(text) {
  const t = (text || "").toLowerCase();
  if (!t) return "unknown";
  if (t.includes("<html") || t.includes("csrf token") || t.includes("logon")) return "session-expired";
  if (/"severity"\s*:\s*"e"|severity=e\b|\berror\b/.test(t)) return "error";
  if (t.includes("not allowed") || t.includes("403")) return "blocked";
  if (t.includes("activated") || t.includes("active")) return "active";
  return "ok";
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
  if (!TOOLS.has(tool)) return;

  const i = evt.tool_input || {};
  const name = i.name || i.class_name;
  if (!name) return;

  const text = toText(evt.tool_response);
  const caseName = caseForPackage(i.package) || caseForName(name);

  const rec = {
    ts: new Date().toISOString(),
    case: caseName || null,
    system: i.system || null,
    package: i.package || null,
    tool,
    type: i.object_type || (tool === "update_class_include" ? "CLAS" : null),
    name,
    include: i.include || null,
    transport: i.transport || null,
    source_lines: typeof i.source === "string" ? i.source.split("\n").length : null,
    result: verdict(text),
    detail: verdict(text) === "ok" || verdict(text) === "active" ? null : text.replace(/\s+/g, " ").trim().slice(0, 300),
  };

  const target = caseName
    ? join(ROOT, "package", caseName, "deploy-log.jsonl")
    : join(ROOT, ".claude", ".cache", "deploy-log.jsonl");

  try {
    mkdirSync(dirname(target), { recursive: true });
    appendFileSync(target, JSON.stringify(rec) + "\n", "utf8");
  } catch {}
})();
