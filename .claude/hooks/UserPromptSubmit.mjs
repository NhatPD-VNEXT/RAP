#!/usr/bin/env node
// UserPromptSubmit hook: tự recall memory liên quan tới prompt người dùng.
// Mỗi lần gửi tin → semantic-search daemon agentmemory → chèn memory liên quan vào context.
//   - URL: AGENTMEMORY_URL (mặc định http://localhost:3111), trùng .mcp.json.
//   - Endpoint: POST /agentmemory/smart-search { query, limit } (giống MCP memory_smart_search).
// Best-effort: daemon tắt / prompt ngắn / slash command → im lặng, KHÔNG block prompt.
//
// Input (stdin JSON từ Claude Code): { prompt, session_id, cwd, hook_event_name, ... }
// Output (stdout, exit 0): text được chèn vào context. Không in gì = không chèn.

const BASE = (process.env.AGENTMEMORY_URL || "http://localhost:3111").replace(/\/+$/, "");
const TIMEOUT_MS = 2000;
const LIMIT = 6;
const MIN_PROMPT_LEN = 12; // prompt quá ngắn → bỏ qua (vd "ok", "tiếp")

function readStdin() {
  return new Promise((resolve) => {
    let s = "";
    process.stdin.on("data", (d) => (s += d));
    process.stdin.on("end", () => resolve(s));
    setTimeout(() => resolve(s), 500); // phòng stdin không đóng
  });
}

async function smartSearch(query) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/agentmemory/smart-search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit: LIMIT }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const clip = (t, n) => (t || "").replace(/\s+/g, " ").trim().slice(0, n);

(async () => {
  const raw = await readStdin();
  let prompt = "";
  try {
    prompt = (JSON.parse(raw).prompt || "").trim();
  } catch {
    prompt = raw.trim();
  }

  // Bỏ qua: prompt rỗng/ngắn hoặc slash command (vd /rap-gen) → không nhiễu.
  if (!prompt || prompt.length < MIN_PROMPT_LEN || prompt.startsWith("/")) return;

  const data = await smartSearch(prompt);
  if (!data) return;

  const lessons = (data.lessons || [])
    .filter((l) => l && l.content)
    .slice(0, 3)
    .map((l) => `- ${clip(l.content, 200)}`);

  // Chỉ giữ loại memory có nghĩa; bỏ observation hệ thống (conversation/file_read/other…)
  // và title rác (prompt_submit, Read, post_tool_use…).
  const USEFUL = new Set([
    "decision", "pattern", "architecture", "fact", "workflow", "insight", "lesson", "preference",
  ]);
  const NOISE_TITLE = /^(prompt_submit|post_tool_use|pre_tool_use|read|write|edit|bash|user_prompt)/i;
  const results = (data.results || [])
    .filter((r) => r && r.title && USEFUL.has(r.type) && !NOISE_TITLE.test(r.title.trim()))
    .slice(0, 4)
    .map((r) => `- [${r.type}] ${clip(r.title, 110)}`);

  if (!lessons.length && !results.length) return;

  let out = `## 🧠 Memory liên quan (auto-recall — tham khảo, verify trước khi dùng)\n`;
  if (results.length) out += `\n**Past context:**\n${results.join("\n")}\n`;
  if (lessons.length) out += `\n**Lessons:**\n${lessons.join("\n")}\n`;
  out += `\n> Nếu cần chi tiết một mục, gọi MCP \`memory_smart_search\` với từ khóa cụ thể.`;

  process.stdout.write(out);
})();
