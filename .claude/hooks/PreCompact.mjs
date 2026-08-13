#!/usr/bin/env node
// PreCompact hook: inject existing memories + request Claude to save new ones before compact.
// Nguồn memory = daemon agentmemory local qua REST API (KHÔNG đọc file trực tiếp nữa).
//   - URL lấy từ AGENTMEMORY_URL (mặc định http://localhost:3111), trùng config .mcp.json.
//   - Endpoint: GET /agentmemory/memories?limit=N → { memories: [{type,title,content,strength,...}] }.
// Daemon không chạy / không reachable → best-effort: in "no memories", KHÔNG block compact.
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const BASE = (process.env.AGENTMEMORY_URL || "http://localhost:3111").replace(/\/+$/, "");
const LIMIT = 50; // lấy rộng rồi sort theo strength, cắt 20
const TIMEOUT_MS = 2500;

async function fetchMemories() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/agentmemory/memories?limit=${LIMIT}`, {
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const json = await res.json();
    return Array.isArray(json?.memories) ? json.memories : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Fallback cuối: đọc file persistence của chính daemon (cùng store, chỉ khi REST fail).
function readMemoriesFromFile() {
  const store = process.env.AGENTMEMORY_HOME
    ? join(process.env.AGENTMEMORY_HOME, "standalone.json")
    : join(process.env.USERPROFILE || homedir(), ".agentmemory", "standalone.json");
  try {
    const raw = JSON.parse(readFileSync(store, "utf8"));
    return Object.values(raw["mem:memories"] || {});
  } catch {
    return [];
  }
}

const fromApi = await fetchMemories();
const source = fromApi ?? readMemoriesFromFile();

const existingMemories = source
  .filter((m) => m && (m.content || m.title))
  .sort((a, b) => (b.strength || 0) - (a.strength || 0))
  .slice(0, 20);

const fmt = (m) => {
  const body = (m.content || m.title || "").replace(/\s+/g, " ").trim().slice(0, 280);
  return `- [${m.type || "memory"}] ${body}`;
};

const memoriesBlock = existingMemories.length
  ? `## Existing memories (preserve these across compact)\n` +
    existingMemories.map(fmt).join("\n")
  : `## No existing memories yet (daemon agentmemory at ${BASE} unreachable or empty)`;

const instruction = `
## IMPORTANT — Before compacting this conversation

Review the current conversation and use the \`memory_save\` MCP tool to save any of the following that are NOT already in the existing memories above:

1. SAP objects created/modified (name + system + package)
2. Design decisions that are non-obvious (why managed vs unmanaged, why specific pattern)
3. Patterns/snippets that were tested and confirmed working
4. Bugs encountered and their fixes
5. Open questions or blockers not yet resolved

Call \`memory_save\` once per distinct insight. Be specific (e.g. exact object names, system IDs, pattern names) not generic ("class", "function", "fixed bug").
`;

process.stdout.write(`${memoriesBlock}\n${instruction}`);
