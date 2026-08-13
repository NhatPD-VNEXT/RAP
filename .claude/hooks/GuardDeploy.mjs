#!/usr/bin/env node
// PreToolUse hook: chặn write sai lên SAP TRƯỚC khi tool chạy.
// Lý do tồn tại: object SAP đã activate KHÔNG xóa được (CLAUDE.md § KHÔNG xóa SAP object,
// sap-adt cũng không có delete). Deploy nhầm system/package/naming = rác vĩnh viễn.
//
// Nguồn sự thật = frontmatter design (package/<Case>/designs/*.md):
//   system: IPS   variant: Local VN   suffix: _VN   package: ZRAP_IF_VI901_VN
// Hook tra design có `package:` khớp tool_input.package rồi đối chiếu.
//
// Match: mcp__sap-adt__(create_object|update_source|update_class_include)
// Output (PreToolUse protocol):
//   exit 0 + stdout            → cho chạy (stdout = cảnh báo, chèn vào context)
//   exit 2 + stderr            → CHẶN, stderr là lý do trả về cho model
// Best-effort: không parse được input / không tìm thấy design → CHO QUA (không cản trở),
// chỉ chặn khi phát hiện vi phạm CHẮC CHẮN.
import { readFileSync, readdirSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..", "..");

function readStdin() {
  return new Promise((resolve) => {
    let s = "";
    process.stdin.on("data", (d) => (s += d));
    process.stdin.on("end", () => resolve(s));
    setTimeout(() => resolve(s), 500);
  });
}

// ---- Đọc mọi design + frontmatter ----
function loadDesigns() {
  const pkgDir = join(ROOT, "package");
  if (!existsSync(pkgDir)) return [];
  const out = [];
  for (const caseName of readdirSync(pkgDir)) {
    const dir = join(pkgDir, caseName, "designs");
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".md")) continue;
      let text;
      try {
        text = readFileSync(join(dir, f), "utf8");
      } catch {
        continue;
      }
      const fm = {};
      const head = text.slice(0, 2000);
      for (const m of head.matchAll(/^(system|variant|suffix|pjcode|package)\s*:\s*(.*)$/gim)) {
        fm[m[1].toLowerCase()] = m[2].split("#")[0].trim().replace(/^["']|["']$/g, "");
      }
      if (fm.package) out.push({ caseName, file: f, fm });
    }
  }
  return out;
}

// ---- Các check naming (deterministic, chỉ chặn cái chắc chắn sai) ----
const TECH_SUFFIX = /_(D|EXT|MBC|UI5A|SQL)$/i;

function nameChecks(name, suffix) {
  const errs = [];
  const n = String(name || "").toUpperCase();
  if (!n) return errs;

  // ZBP_ lồng ZI_ — rule abap-cloud-naming § ABAP Class
  if (/^ZBP_Z/.test(n)) {
    errs.push(`\`${n}\` lồng chữ Z của Data Model. Đúng: ZBP_I_<rest> (vd ZI_VI901_01 → ZBP_I_VI901_01).`);
  }

  if (suffix) {
    const s = suffix.toUpperCase();
    // Thiếu suffix variant
    const withoutTech = n.replace(TECH_SUFFIX, "");
    if (!withoutTech.endsWith(s)) {
      errs.push(`variant yêu cầu suffix \`${suffix}\` nhưng \`${n}\` không có (suffix variant đứng TRƯỚC _D/_EXT/_SQL).`);
    }
    // Sai thứ tự: _D_VN thay vì _VN_D
    if (new RegExp(`_(D|EXT|MBC|UI5A|SQL)${s}$`).test(n)) {
      errs.push(`\`${n}\` sai thứ tự suffix — variant phải đứng trước hậu tố kỹ thuật (vd ZM902T${suffix}_D).`);
    }
  } else {
    // variant Global mà object lại có _VN
    if (/_VN(_(D|EXT|MBC|UI5A|SQL))?$/.test(n)) {
      errs.push(`design là Global (suffix rỗng) nhưng \`${n}\` có _VN.`);
    }
  }
  return errs;
}

// Header 変更履歴 — rule bắt buộc cho mọi source
function headerMissing(source, objectType, include) {
  if (!source || source.trim().length < 40) return false; // source rỗng/stub → bỏ qua
  // TABL (DDIC table): rule không yêu cầu header 変更履歴
  if (objectType === "TABL") return false;
  // CLAS: header nằm ở include `main`; các include khác không bắt buộc
  if (objectType === "CLAS" && include && include !== "main") return false;
  return !/\[?変更履歴\]?/.test(source.slice(0, 3000));
}

// Chỉ CẢNH BÁO (không chặn) — dễ có false positive trong comment/string
function sourceWarnings(source) {
  const w = [];
  if (!source) return w;
  if (/\b(COMMIT WORK)\b/i.test(source)) w.push("có `COMMIT WORK` — ABAP Cloud RAP dùng `COMMIT ENTITIES`.");
  if (/\bGET TIME STAMP FIELD\b/i.test(source)) w.push("có `GET TIME STAMP FIELD` (deprecated) — dùng `utclong_current( )`.");
  const badPrefix = source.match(/\b(DATA|FINAL)\s*\(\s*(lv_|ls_|lt_|gv_|gs_|gt_)\w+/i);
  if (badPrefix) w.push(`prefix biến kiểu SAP cũ (\`${badPrefix[2]}\`) — rule IPS dùng ldf_/lds_/ldt_.`);
  const param = source.match(/\b(IMPORTING|EXPORTING|CHANGING|RETURNING)\s+(iv_|is_|it_|ev_|es_|et_|cv_|cs_|ct_|rv_|rs_|rt_)\w+/i);
  if (param) w.push(`prefix parameter sai (\`${param[2]}\`) — rule IPS dùng idf_/edf_/cdf_/rdf_.`);
  return w;
}

(async () => {
  const raw = await readStdin();
  let evt;
  try {
    evt = JSON.parse(raw);
  } catch {
    process.exit(0); // không parse được → cho qua
  }

  const tool = (evt.tool_name || "").replace(/^mcp__sap-adt__/, "");
  const i = evt.tool_input || {};
  if (!["create_object", "update_source", "update_class_include"].includes(tool)) process.exit(0);

  const name = i.name || i.class_name;
  if (!name) process.exit(0);

  const designs = loadDesigns();
  if (!designs.length) process.exit(0); // chưa có design nào → không có chuẩn để đối chiếu

  const errs = [];
  const warns = [];

  // ---- Đối chiếu package/system với design ----
  let design = null;
  if (i.package) {
    design = designs.find((d) => d.fm.package.toUpperCase() === String(i.package).toUpperCase());
    if (!design) {
      errs.push(
        `package \`${i.package}\` không khớp \`package:\` của bất kỳ design nào trong package/*/designs/.\n` +
          `Design hiện có: ${designs.map((d) => `${d.fm.package} (${d.caseName})`).join(", ")}`
      );
    }
  } else {
    // update_source/update_class_include không truyền package → suy design theo suffix của tên
    const cands = designs.filter((d) => {
      const s = (d.fm.suffix || "").toUpperCase();
      return s ? String(name).toUpperCase().includes(s) : true;
    });
    if (cands.length === 1) design = cands[0];
  }

  if (design) {
    const want = (design.fm.system || "").toUpperCase();
    const got = String(i.system || "").toUpperCase();
    if (want && got && want !== got) {
      errs.push(
        `system mismatch: design \`${design.caseName}\` khai \`system: ${design.fm.system}\` nhưng đang deploy lên \`${i.system}\`.`
      );
    }
    const suffix = (design.fm.suffix || "").replace(/^["']|["']$/g, "");
    errs.push(...nameChecks(name, suffix));
  } else {
    // Không xác định được design → vẫn check được ZBP_Z (đúng trong mọi variant)
    errs.push(...nameChecks(name, null).filter((e) => e.includes("lồng chữ Z")));
  }

  // ---- Header 変更履歴 ----
  if (headerMissing(i.source, i.object_type, i.include)) {
    errs.push(
      `source thiếu block \`[変更履歴]\` ở đầu (rule abap-cloud-naming § Version History Header).` +
        (i.object_type === "CLAS" || tool === "update_class_include"
          ? ` CLAS: header đặt ở include \`main\`.`
          : ` DDLS/BDEF/DDLX/SRVD: dùng comment \`//\` (TABL không cần header).`)
    );
  }

  warns.push(...sourceWarnings(i.source));

  if (errs.length) {
    process.stderr.write(
      `⛔ GuardDeploy CHẶN \`${tool}\` cho \`${name}\` — object SAP đã activate KHÔNG xóa được.\n\n` +
        errs.map((e, n2) => `${n2 + 1}. ${e}`).join("\n") +
        `\n\nSửa rồi gọi lại. Nếu design mới là cái sai → sửa design trước, đừng bypass.\n`
    );
    process.exit(2); // chặn tool
  }

  if (warns.length) {
    process.stdout.write(
      `⚠ GuardDeploy (không chặn) — \`${name}\`:\n` + warns.map((w) => `- ${w}`).join("\n")
    );
  }
  process.exit(0);
})();
