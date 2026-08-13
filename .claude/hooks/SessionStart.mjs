#!/usr/bin/env node
// SessionStart hook: đầu mỗi phiên, inject vào context:
//   1. Trạng thái connect SAP systems (MCP sap-adt check_connection) — đọc CACHE (tức thì),
//      refresh ngầm cho phiên sau (vì probe 5 system mất ~15s, không được block session).
//   2. Dashboard case RAP đang dở — parse Object Impact List (cột Status) mỗi design.
//   3. Cảnh báo daemon agentmemory nếu offline.
// Gọi với --refresh: chỉ chạy check_connection live + ghi cache, KHÔNG in context (chạy nền).
// Best-effort: lỗi nào bỏ phần đó, KHÔNG block session.
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { spawn } from "child_process";

const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..", ".."); // <root>/.claude/hooks → <root>
const BASE = (process.env.AGENTMEMORY_URL || "http://localhost:3111").replace(/\/+$/, "");
const REFRESH = process.argv.includes("--refresh");

const CACHE = join(ROOT, ".claude", ".cache", "systems.json");
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 phút → cache cũ hơn thì refresh nền

// ---- 1. Quét case ----
function scanCases() {
  const pkgDir = join(ROOT, "package");
  if (!existsSync(pkgDir)) return [];
  const out = [];
  for (const caseName of readdirSync(pkgDir)) {
    const designDir = join(pkgDir, caseName, "designs");
    if (!existsSync(designDir)) continue;
    const md = readdirSync(designDir).find((f) => f.endsWith(".md"));
    if (!md) continue;
    let text;
    try {
      text = readFileSync(join(designDir, md), "utf8");
    } catch {
      continue;
    }
    const fm = Object.fromEntries(
      [...text.matchAll(/^(system|package)\s*:\s*(.+)$/gim)].map((m) => [
        m[1].toLowerCase(),
        m[2].trim().replace(/^["']|["']$/g, ""),
      ])
    );
    const summary = (text.match(/^>\s*\*\*Status\*\*:\s*(.+)$/im) || [])[1];
    let done = 0,
      total = 0;
    const pending = [];
    for (const line of text.split("\n")) {
      if (!/^\|\s*\d+\s*\|/.test(line)) continue;
      const cells = line.split("|").map((c) => c.trim());
      if (cells.length < 9) continue;
      const status = (cells[cells.length - 2] || "").toLowerCase();
      const name = cells[3] || "?";
      total++;
      if (status.startsWith("done")) done++;
      else if (status && status !== "-") pending.push(`${name}(${status})`);
      else pending.push(name);
    }
    if (total) out.push({ caseName, fm, summary, done, total, pending });
  }
  return out;
}

// ---- 2. check_connection qua MCP sap-adt (Streamable HTTP handshake) ----
function parseSse(text) {
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const j = JSON.parse(payload);
      if (j.result || j.error) return j;
    } catch {}
  }
  return null;
}

async function liveCheckSystems() {
  let cfg;
  try {
    cfg = JSON.parse(readFileSync(join(ROOT, ".mcp.json"), "utf8"));
  } catch {
    return null;
  }
  const srv = cfg?.mcpServers?.["sap-adt"];
  if (!srv?.url) return null;
  const url = srv.url;
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (srv?.headers?.Authorization) headers.Authorization = srv.headers.Authorization;
  const sig = (ms) => {
    const c = new AbortController();
    setTimeout(() => c.abort(), ms);
    return c.signal;
  };
  try {
    const initRes = await fetch(url, {
      method: "POST",
      headers,
      signal: sig(8000),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "sessionstart-hook", version: "1.0" } },
      }),
    });
    const sid = initRes.headers.get("mcp-session-id");
    await initRes.text();
    const h2 = { ...headers };
    if (sid) h2["Mcp-Session-Id"] = sid;
    await fetch(url, {
      method: "POST",
      headers: h2,
      signal: sig(5000),
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    }).catch(() => {});
    const callRes = await fetch(url, {
      method: "POST",
      headers: h2,
      signal: sig(25000),
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "check_connection", arguments: {} } }),
    });
    const txt = await callRes.text();
    const j = parseSse(txt) || (() => { try { return JSON.parse(txt); } catch { return null; } })();
    return j?.result?.structuredContent?.result || j?.result?.content?.[0]?.text || null;
  } catch {
    return null;
  }
}

function writeCache(text) {
  try {
    mkdirSync(dirname(CACHE), { recursive: true });
    writeFileSync(CACHE, JSON.stringify({ ts: Date.now(), text }), "utf8");
  } catch {}
}

function readCache() {
  try {
    return JSON.parse(readFileSync(CACHE, "utf8"));
  } catch {
    return null;
  }
}

function formatSystems(resultText, ageMs) {
  const ok = [], bad = [];
  for (const l of resultText.split("\n")) {
    const m = l.match(/-\s*([A-Z0-9_]+)\s*:\s*(✅|❌)/);
    if (!m) continue;
    (m[2] === "✅" ? ok : bad).push(m[1]);
  }
  if (!ok.length && !bad.length) return "";
  const age = ageMs == null ? "" : ` (cache ${Math.round(ageMs / 60000)}p trước)`;
  let o = `\n## 🔌 SAP systems (sap-adt)${age}\n`;
  if (ok.length) o += `✅ connected: ${ok.join(", ")}\n`;
  if (bad.length)
    o += `❌ cần refresh: ${bad.join(", ")}  → gọi \`refresh_cookies_for(system="<tên>")\` trước khi deploy\n`;
  return o;
}

// ---- 3. Ping daemon ----
async function daemonStatus() {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 1500);
  try {
    const r = await fetch(`${BASE}/agentmemory/livez`, { signal: c.signal });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

// Ping nhanh MCP sap-adt: CHỈ kiểm tra endpoint có sống không (initialize handshake),
// KHÔNG gọi check_connection (probe 5 system mất ~15s — việc đó để --refresh chạy nền).
// Trả: "on" | "off" (không reachable) | "n/a" (.mcp.json không khai sap-adt).
async function adtStatus() {
  let url, auth;
  try {
    const cfg = JSON.parse(readFileSync(join(ROOT, ".mcp.json"), "utf8"));
    const srv = cfg?.mcpServers?.["sap-adt"];
    if (!srv?.url) return "n/a";
    url = srv.url;
    auth = srv?.headers?.Authorization;
  } catch {
    return "n/a";
  }
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 1500);
  try {
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (auth) headers.Authorization = auth;
    const r = await fetch(url, {
      method: "POST",
      headers,
      signal: c.signal,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "sessionstart-ping", version: "1.0" } },
      }),
    });
    return r.status < 500 ? "on" : "off"; // có phản hồi = có process lắng nghe
  } catch {
    return "off";
  } finally {
    clearTimeout(t);
  }
}

// ===== Background refresh mode: chỉ check live + ghi cache, không in context =====
if (REFRESH) {
  const text = await liveCheckSystems();
  if (text) writeCache(text);
  process.exit(0);
}

// ===== Normal mode =====
(async () => {
  const [cases, alive, adt] = await Promise.all([
    Promise.resolve(scanCases()),
    daemonStatus(),
    adtStatus(),
  ]);

  let out = "";

  // Systems: đọc cache (tức thì). Cache cũ/thiếu → spawn refresh nền cho phiên sau.
  const cache = readCache();
  if (adt === "off") {
    // Daemon sap-adt không sống → cache có cũng vô nghĩa, và spawnRefresh chắc chắn fail.
    out += `\n## 🔌 SAP systems (sap-adt)\n❌ **MCP sap-adt KHÔNG reachable** — mọi tool sap-adt sẽ fail. Bật daemon rồi mở lại phiên.\n`;
  } else if (cache?.text) {
    const ageMs = Date.now() - (cache.ts || 0);
    out += formatSystems(cache.text, ageMs);
    if (ageMs > CACHE_TTL_MS) spawnRefresh();
  } else {
    out += `\n## 🔌 SAP systems (sap-adt)\n⏳ Đang kiểm tra connect (chạy nền) — sẽ hiển thị ở phiên sau.\n`;
    spawnRefresh();
  }

  if (cases.length) {
    out += `\n## 📋 RAP cases — trạng thái deploy\n`;
    for (const c of cases) {
      const sys = c.fm.system ? ` @ ${c.fm.system}` : "";
      const flag = c.done < c.total ? "🟡" : "✅";
      out += `\n${flag} **${c.caseName}** (${c.fm.package || "?"}${sys}) — ${c.done}/${c.total} object done`;
      if (c.pending.length)
        out += `\n   ↳ TODO: ${c.pending.slice(0, 5).join(", ")}${c.pending.length > 5 ? ` …(+${c.pending.length - 5})` : ""}`;
      if (c.summary) out += `\n   ↳ ${c.summary.replace(/\s+/g, " ").trim().slice(0, 160)}`;
    }
    out += `\n`;
  }

  if (!alive) {
    out += `\n## ⚠ agentmemory daemon OFFLINE (${BASE})\nMemory hook (auto-recall + PreCompact) sẽ fallback/không hoạt động. Bật lại: chạy \`agentmemory\` ở terminal.\n`;
  }

  // Heartbeat: bằng chứng hook đã chạy trong phiên này (luôn in, kể cả khi các khối trên rỗng).
  out += `\n${heartbeat(cache, cases.length, alive, adt)}`;

  process.stdout.write(out.trimEnd());
})();

function heartbeat(cache, caseCount, daemonAlive, adt) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const evt = process.env.CLAUDE_HOOK_EVENT || "SessionStart";
  const cacheAge = cache?.ts ? `${Math.round((Date.now() - cache.ts) / 60000)}p` : "none";
  return (
    `---\n✅ ${evt} hook OK · ${stamp} · ${caseCount} case\n` +
    `   mcp sap-adt ${adt} · systems-cache ${cacheAge} · memory-daemon ${daemonAlive ? "on" : "off"}`
  );
}

function spawnRefresh() {
  try {
    spawn(process.execPath, [SELF, "--refresh"], { detached: true, stdio: "ignore" }).unref();
  } catch {}
}
