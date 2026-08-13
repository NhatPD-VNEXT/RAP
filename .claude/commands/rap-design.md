---
description: Hoàn thiện Coding Design Document cho 1 case RAP — BẮT BUỘC chạy trong subagent agent-design để cô lập noise tra metadata, main context chỉ nhận design doc.
argument-hint: "<Case | path-to-design.md>"
---

The user wants to complete the design for RAP case: $ARGUMENTS

## Nguyên tắc — BẮT BUỘC (đọc trước khi làm bất cứ gì)

Phase tra metadata (`get_source`/`api_release_state`/`list_package` cho hàng chục object) sinh **rất nhiều context noise**. Nếu chạy trên main agent, noise đó đè context suốt phase deploy về sau (case VI901: phình 78M cache, $82).

→ **TUYỆT ĐỐI KHÔNG tự tra metadata / viết design doc trên main agent.** Việc của lệnh này là **dispatch sang subagent `agent-design`** rồi chỉ relay kết quả. Subagent ăn hết noise; main chỉ nhận lại design doc path + tóm tắt.

## Pre-flight (main agent làm — rẻ; MCP tối đa 1 call `list_systems`)

1. Resolve case:
   - `$ARGUMENTS` là full path design → lấy `<Case>` từ path.
   - Chỉ là tên case (vd `MI902`) → target `package/<Case>/designs/`.
   - Rỗng → list `package/*/` và hỏi user chọn case.

2. Verify `package/<Case>/` tồn tại. Thiếu → STOP, báo user chạy `/rap-new` trước.

3. Verify có BD đầu vào trong `package/<Case>/docs/`. Trống → cảnh báo user (subagent sẽ thiếu input để fill design), hỏi có tiếp tục không.

4. **Verify frontmatter design** (chỉ đọc frontmatter, không đọc body):
   - Thiếu `system:` → hỏi user (`AskUserQuestion`, options từ `list_systems`), ghi vào frontmatter trước khi dispatch.
   - `system` không có trong `list_systems` → STOP, báo system chưa cấu hình server-side trên adt-mcp.
   - Thiếu `variant:` / `package:` → hỏi user, ghi vào frontmatter.
   > Rẻ hơn nhiều so với để subagent chạy hết rồi mới lòi ra thiếu — và `/rap-gen` sẽ STOP nếu thiếu.

5. **Overwrite guard**: check design đã fill hay còn skeleton (10 mục còn placeholder `{{…}}` / "TBD" hay đã có nội dung).
   - Còn skeleton → dispatch thẳng.
   - Đã fill → **hỏi user** (`AskUserQuestion`): `refresh toàn bộ` (ghi đè) / `chỉ fill mục còn trống` / `hủy`. Truyền lựa chọn vào prompt subagent. KHÔNG mặc định ghi đè design đã duyệt.

6. **KHÔNG** `Read` các file docs/metadata ở đây. Để subagent đọc — tránh kéo nội dung vào main context.

## Dispatch (BẮT BUỘC)

7. Gọi `Agent(subagent_type: "agent-design")` đúng 1 lần với prompt:

   ```
   Hoàn thiện Coding Design Document cho case <Case>.

   - BD đầu vào: package/<Case>/docs/
   - Output: package/<Case>/designs/<Case>_design.md (skeleton đã có từ /rap-new)
   - Chế độ ghi: <refresh toàn bộ | chỉ fill mục còn trống>  ← từ overwrite guard
   - Đọc frontmatter design có sẵn (system/package/variant/suffix) — KHÔNG đổi.
   - Mọi sap-adt call truyền system="<system>" từ frontmatter.
   - Session expired (HTML login / CSRF token validation failed / redirect oauth-saml / trả <html>)
     → STOP, gọi refresh_cookies_for(system="<system>"), retry 1 lần; vẫn fail → dừng, báo lại.
   - Tra metadata SAP live qua MCP sap-adt theo agent-design.md (load rap-mcp-adt + skill pattern trước khi query).
   - Trước mỗi get_source/api_release_state, áp read-through cache policy trong skill rap-mcp-adt (§ Local metadata cache): check .claude/.cache/metadata/<system>/<TYPE>_<NAME>.json, xét ts theo tầng freshness (standard 30d / Z khác package 7d / object trong case này: luôn live), miss/quá hạn thì query.
   - Fill đủ 10 mục. Naming theo .claude/rules/abap-cloud-naming.md, field type theo cds-field-types.md.

   Khi xong, trả về NGẮN GỌN (KHÔNG dump source/metadata thô):
   1. Đường dẫn design doc đã ghi.
   2. Object Impact List: số object create/edit.
   3. Design decision không hiển nhiên (≤5 gạch đầu dòng).
   4. Open Questions còn lại (nếu có).
   5. Object SAP standard chưa released / chưa verify được (risk).
   ```

8. **Không** chạy lại MCP, **không** Read lại design doc đầy đủ sau khi subagent xong. Tin final message của subagent.

## Sau khi subagent trả về

9. **Save memory** (`memory_save`) — mỗi design decision không hiển nhiên subagent trả về = 1 entry, format bắt buộc có system: `<quyết định> cho <object> trong <package> trên <system>`. Không có decision nào → skip. Daemon offline → bỏ qua, note 1 dòng cho user.

10. Relay cho user (terse):
   ```
   ✓ Design hoàn thiện: package/<Case>/designs/<Case>_design.md
   📋 Object Impact: <create> create / <edit> edit
   🔑 Decisions: <tóm tắt>
   ❓ Open Questions: <list hoặc "none">
   ⚠ Risk (chưa released/chưa verify): <list hoặc "none">

   ➡ Next: /rap-gen <Case>
   ```

11. Nếu subagent báo Open Questions chặn (thiếu thông tin BD, metadata không tra được) → nêu rõ cho user, **KHÔNG** tự suy diễn để fill thay.

## Rules

- **KHÔNG** ghi đè design đã fill khi user chưa chọn — luôn qua overwrite guard (pre-flight 5).
- **KHÔNG** tự làm design trên main — luôn dispatch. Đây là lý do tồn tại của lệnh.
- **KHÔNG** Read docs/metadata lớn trên main trước/sau dispatch (giữ main context sạch).
- 1 lần gọi lệnh = 1 lần dispatch. Cần sửa design tiếp → `SendMessage` tới đúng subagent đã spawn (giữ context), không spawn mới.
- Subagent KHÔNG generate/deploy code (chỉ design). Deploy là việc của `/rap-gen`.

$ARGUMENTS
