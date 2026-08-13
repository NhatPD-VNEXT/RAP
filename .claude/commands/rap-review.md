---
description: Review code SAP đã activate vs Coding Design Document + IPS naming + ABAP Cloud coding rules. Design-first, không tự sửa code/design. Output package/<C>/reviews/YYYY-MM-DD_review.md.
argument-hint: "<CaseName> | <TYPE> <NAME>"
---

The user wants to review activated SAP code: $ARGUMENTS

## Mode detection

Parse `$ARGUMENTS`:

| Format | Mode | Ví dụ |
|--------|------|-------|
| 1 token = tên folder `package/<X>/` tồn tại | CASE MODE | `/rap-review MI902` |
| 2 token "<TYPE> <NAME>" (TYPE ∈ CLAS\|DDLS\|BDEF\|SRVD\|SRVB\|TABL\|DDLX\|DEVC) | OBJECT MODE | `/rap-review CLAS ZBP_I_VF901_01` |
| Khác | STOP, in usage | — |

Usage khi sai format:

```
/rap-review <CaseName>          → review toàn bộ case
/rap-review <TYPE> <NAME>       → review 1 object (auto-locate design)
```

## Pre-flight (main agent — rẻ, không đọc source)

1. **CASE MODE**:
   - Verify `package/<Case>/` tồn tại. Thiếu → STOP, báo user tên case sai (list `package/*/`).
   - Verify có design `package/<Case>/designs/*.md`. Thiếu → STOP, báo chạy `/rap-design` trước (review là design-first, không có design thì không có chuẩn để đối chiếu).
   - Đọc **frontmatter** design lấy `system` / `package` / `variant`. Thiếu `system:` → hỏi user.

2. **OBJECT MODE** — resolve system (BẮT BUỘC, không đoán):
   - Tìm design nào có object `<NAME>` trong Object Impact List (`Grep` trong `package/*/designs/`). Tìm thấy → lấy `system` từ frontmatter design đó, báo user "đối chiếu theo design `<path>`".
   - Không tìm thấy design → **hỏi user system đích** (`AskUserQuestion`, options từ `list_systems`) và báo rõ: review sẽ chỉ check naming + coding rule, **không** đối chiếu được design.

3. **KHÔNG** `Read`/`get_source` object ở main — để agent làm (giữ main context sạch).

## Invoke agent

4. Gọi `Agent(subagent_type: "agent-review-code")` đúng 1 lần với prompt gồm:
   - Mode (CASE | OBJECT) + argument đã parse.
   - `system` đã resolve ở pre-flight — mọi sap-adt call phải truyền `system="<system>"`.
   - Design path (nếu có) + `variant`/`suffix` để check naming.
   - Output path: `package/<Case>/reviews/<YYYY-MM-DD>_review.md`. OBJECT MODE không có case → `package/<Case tìm được>/reviews/`, không tìm được → hỏi user nơi ghi.
   - Reminder: **design-first, read-only** — không sửa code SAP, không sửa design.
   - Session expired (HTML login / `CSRF token validation failed` / redirect oauth-saml / trả `<html>`) → STOP, gọi `refresh_cookies_for(system="<system>")`, retry 1 lần; vẫn fail → báo user, dừng.
   - Trả về **ngắn gọn** (KHÔNG dump source): đường dẫn report, số finding theo severity, top 5 finding nghiêm trọng nhất, object không đọc được (nếu có).

## Output

5. Relay cho user (terse):

```
✓ Review: package/<Case>/reviews/<YYYY-MM-DD>_review.md
📍 System: <system>   📄 Design: <design path | "none — chỉ check naming/rule">
🔴 Blocker: <n>   🟡 Warning: <n>   🔵 Info: <n>
🔎 Top findings:
   - <…>
⚠ Không đọc được: <list hoặc "none">

➡ Next: sửa theo finding rồi /rap-gen <Case> (deploy lại object đã sửa)
```

## Rules

- **Read-only**: KHÔNG sửa code SAP, KHÔNG sửa design, KHÔNG tự apply fix. Chỉ ghi report.
- Muốn apply fix → user yêu cầu riêng; sửa code phải qua `/rap-gen` (có confirm gate + collision check).
- KHÔNG review khi chưa resolve được `system` — đọc nhầm system = review sai object.
- KHÔNG dump source object ra main context; report nằm trong file.
- 1 lần gọi lệnh = 1 lần dispatch. Cần hỏi thêm về finding → `SendMessage` tới subagent đã spawn, không spawn mới.

$ARGUMENTS
