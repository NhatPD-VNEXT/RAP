---
description: Generate RAP code from Coding Design Document — chạy pipeline qua MCP sap-adt, snapshot manual objects (ZAL/ZJC/ZJT/IAM/Comm) vào package/<Case>/abap/, update design status.
argument-hint: "<Case | path-to-design.md>"
---

The user wants to generate RAP code from design document: $ARGUMENTS

## Pre-flight

1. Resolve design path:
   - Nếu `$ARGUMENTS` là full path → dùng trực tiếp
   - Nếu chỉ là tên case (vd `MI902`) → tìm `package/<arg>/designs/*.md` (file mới nhất)
   - Nếu rỗng → list `package/*/designs/*.md` và hỏi user chọn

2. Đọc design doc bằng `Read` tool.

3. **Parse frontmatter `system`** (BẮT BUỘC):
   - Đọc `system:` từ frontmatter (tên system có trong `list_systems`)
   - MỌI sap-adt tool call về sau truyền `system="<name>"` (KHÔNG hard-code)
   - Frontmatter thiếu `system:` → **STOP**, hỏi user system đích
   - System không có trong `list_systems` → **STOP**, báo user system chưa được cấu hình server-side trên adt-mcp

4. **Parse frontmatter `variant` + `suffix`**:
   - Nếu frontmatter có `variant: Local VN` → `SUFFIX = "_VN"`, enforce suffix toàn bộ
   - Nếu `variant: Global` hoặc thiếu → `SUFFIX = ""`, không thêm
   - Nếu frontmatter thiếu hoàn toàn → **STOP**, hỏi user variant trước khi deploy

5. **Naming validation** — scan Object Impact List, verify mọi object tuân `SUFFIX`:
   - Local VN: mọi object phải có `_VN` (draft table: `_VN_D`, IAM App: `_VN_EXT`)
   - Global: không object nào có `_VN`
   - Mismatch → **STOP**, list object lệch + đề xuất rename, KHÔNG auto-deploy

6. Verify 10 mục bắt buộc (Requirement Summary, Metadata Investigation, Object Impact List, Input/Output, Field Mapping, Processing Logic, Validation Rules, Error Handling, Test Points, Open Questions). Thiếu → **STOP**, báo user.

7. Load 2 skills (BẮT BUỘC, trước khi gọi MCP):
   - `rap-generate` — MCP deployment matrix + build order + error recovery + memory save rules.
   - `rap-mcp-adt` — sap-adt tool name + param chuẩn, `create_object`/`update_source`/`update_class_include`/`activate`, `search_objects` collision check, lỗi đã verify.

   > **Cache**: mọi `get_source`/`api_release_state` đọc object **tham chiếu** (standard hoặc Z ngoài case) áp read-through cache `rap-mcp-adt` § Local metadata cache — check `.claude/.cache/metadata/<system>/<TYPE>_<NAME>.json` trước, miss/quá hạn mới query. Object **thuộc case đang deploy**: luôn đọc live (hook `CacheMetadata.mjs` tự invalidate sau mỗi write).

## Pre-deploy scan (BẮT BUỘC — trước khi write bất cứ gì)

Deploy lên SAP **không revert được** (CLAUDE.md cấm xóa object, sap-adt không hỗ trợ delete). Mọi kiểm tra dưới phải xong **trước** object đầu tiên.

7a. **Probe system + PACKAGE EXISTENCE CHECK (BẮT BUỘC, không được bỏ)**

Gom **mọi package khác nhau** xuất hiện trong Object Impact List (cột `Package`) + `package` ở frontmatter. Với **từng** package gọi:

```
list_package(system="<system>", package="<PKG>")
```

- Trả về danh sách object (kể cả rỗng) → package **tồn tại** → OK.
- Lỗi `not found` / `does not exist` / object list null → xác nhận lại 1 lần bằng `search_objects(system, "<PKG>")` (lọc kind `DEVC`). Vẫn không thấy → package **KHÔNG tồn tại**.
- Session expired (HTML login, `CSRF token validation failed`, redirect oauth/saml) → `refresh_cookies_for(system)` + retry 1 lần; vẫn fail → STOP, báo user. **Không** kết luận "package không tồn tại" khi lỗi là session.
- 403 / `package not allowed` → STOP, báo nguyên văn: system không cho write server-side. **Không** phải lỗi session, không retry.

**Có bất kỳ package nào không tồn tại → STOP NGAY, KHÔNG deploy object nào, KHÔNG tự tạo package** (sap-adt không tạo được DEVC). In cho user:

```
✗ Package chưa tồn tại trên <system> — dừng deploy

Thiếu (<n>):
  - <PKG>   ← dùng bởi: <TYPE NAME>, <TYPE NAME>, ...   (superpackage: <parent nếu design ghi>)

→ Tạo thủ công trong Eclipse ADT: New → ABAP Package
   Name / Description / Superpackage / Software Component (ZLOCAL…) / Transport Layer
   Tạo xong chạy lại: /rap-gen <Case>
```

Package tồn tại nhưng **khác** package trong design (object cùng tên nằm nơi khác) → xử lý ở 7c, không phải ở đây.

7b. **Resume**: đọc cột `Status` trong Object Impact List.
   - `done` → **bỏ qua**, không deploy lại (đã active ở lần chạy trước).
   - `skip` → **bỏ qua**, user đã quyết ở 7c lần trước là dùng object có sẵn nguyên trạng.
   - `pending` / rỗng → đưa vào danh sách deploy.
   - In ra `<K> object bỏ qua (done: <n>, skip: <m>)`.

7c. **Collision check — object đã tồn tại thì BẮT BUỘC hỏi user**

`search_objects(system, "<ObjectName>")` cho **mọi** object còn pending. Hai kiểu mismatch:

**(A) Design ghi `create` nhưng object ĐÃ TỒN TẠI trên system**

Đây là tình huống nguy hiểm nhất: `create_object` sẽ fail, hoặc tệ hơn là bị "sửa" thành `update_source` và **ghi đè code của người khác** — mà object thì không xóa/rollback được.

Trước khi hỏi, **thu thập đủ thông tin để user quyết** (read-only, rẻ):

| Cần biết | Lấy bằng |
|---|---|
| Object nằm ở package nào | `search_objects` (uri) hoặc `list_package` |
| Description / có active không | `get_source(system, "<TYPE>", "<NAME>")` |
| Ai tạo, version nào | block `[変更履歴]` ở đầu source (nếu có) |
| Object có ai dùng không | `find_references` — chỉ chạy khi user cân nhắc ghi đè |

Rồi hỏi bằng `AskUserQuestion`, **1 câu cho mỗi object trùng** (gộp tối đa 4 object / lần gọi):

```
⚠ <TYPE> <NAME> đã tồn tại trên <system>
   package thật : <package>        (design ghi: <package trong design>)
   description  : <desc>
   header       : <dòng V-mới nhất trong 変更履歴, nếu có>
```

| Option | Hệ quả | Khi nào chọn |
|---|---|---|
| **Dùng luôn object đã tồn tại** | Đổi `Action` trong design `create` → `edit`, deploy bằng `update_source`/`update_class_include` (ghi đè source cũ) | Object chính là cái case này cần, hoặc là shell do user tạo sẵn trong ADT (vd `ZBP_I_*` quick-fix từ BDEF) |
| **Đổi tên object mới** | Main đề xuất tên kế tiếp theo naming rule (`_01` → `_02`…), user confirm hoặc tự nhập; cập nhật design | Object cũ là của case/team khác, không được đụng |
| **Bỏ qua object này** | Đánh `Status = skip` trong design, không deploy | Object cũ dùng lại nguyên trạng, không cần sửa gì |
| **Hủy deploy** | Dừng toàn bộ, quay lại sửa design | Trùng nhiều, nghi design sai từ gốc |

Quy tắc bắt buộc:
- **KHÔNG tự đổi `create` → `update`.** Ghi đè object đang chạy là mất mát không phục hồi được.
- **Package thật ≠ package trong design → cảnh báo đậm.** Object nằm package khác gần như chắc chắn là của case/team khác → mặc định nên chọn "đổi tên", không phải "dùng luôn".
- Sau khi user chọn, **cập nhật design file NGAY** (cột `Action` / `Object Name` / `Status`) **trước khi** deploy — design là ground truth, không được để lệch với cái sắp chạy.
- Tên mới sau khi đổi phải qua lại đúng check này (`search_objects`) — tránh đổi vào một cái trùng khác.

**(B) Design ghi `edit` nhưng object KHÔNG tồn tại**

→ Hỏi user: **tạo mới** (đổi `Action` → `create` trong design) / **sửa tên** (có thể gõ nhầm) / **bỏ qua**. Không tự tạo, vì có thể design đang trỏ sai tên và tạo mới sẽ đẻ thêm object rác.

> Trường hợp riêng đã biết: `ZBP_I_*` behavior pool phải do user tạo shell trong Eclipse ADT (quick-fix từ BDEF), MCP chỉ `update_class_include`. Object này **luôn** rơi vào nhánh (A) → chọn "dùng luôn object đã tồn tại" là đúng.

7d. **Hỏi Author + 移送番号** (1 lần cho cả case, dùng `AskUserQuestion`):
   - `社員ID` người tạo → điền vào block 変更履歴 (`IPS.<Author>`).
   - Số transport (移送番号) → điền vào cùng dòng V1.00.
   - User skip → dùng placeholder `<Author>` / `<移送番号>` + note trong Output để user sửa tay.

7e. **Hỏi CLAS deploy mode** (1 lần, ngay đây — KHÔNG hỏi giữa build order): MCP (`create_object` + `update_class_include`) hay local snapshot (`package/<Case>/abap/`). Case không có CLAS → skip câu này.

## Confirm gate (GATE DUY NHẤT — chờ user OK)

7f. In block rồi **dừng chờ xác nhận**, chưa OK thì không gọi write tool nào:

```
⚠ Sắp deploy — thao tác KHÔNG revert được

📍 System : <system>        📦 Package: <package>  (đã verify tồn tại: <list package OK>)
🌏 Variant: <variant>       ✍ Author  : <author> / 移送番号: <transport>
🧱 CLAS mode: <MCP | local snapshot>

Sẽ CREATE (<n>)          : <list>
Sẽ UPDATE (<m>)          : <list>
  ↳ trong đó GHI ĐÈ object đã tồn tại (<x>): <list>   ← user đã chọn "dùng luôn" ở 7c
Đã đổi tên (<y>)         : <tên cũ> → <tên mới>
Skip — done (<k>)        : <list>
Skip — user bỏ qua (<z>) : <list>
Manual sau (<p>)         : <list>
```

Dòng **GHI ĐÈ** phải in rõ ràng: đây là những object có source cũ sắp bị thay. Nếu user đọc lại thấy sai → reject gate, quay về 7c.

User reject / muốn sửa → quay lại design, KHÔNG deploy một phần.

## Execution

8. Parse **Object Impact List** thành danh sách `{ObjectType, ObjectName, Package, Action, MCPDeploy?}` (đã lọc `done` ở 7b).

9. Sort theo **RAP build order** (xem `rap-generate` § 1):
   ```
   TABL → DDLS(ZI_) → DDLS(ZC_) → BDEF(ZI_) → CLAS(ZBP_I_)
   → BDEF(ZC_) → DDLX → CLAS(ZCL_) → SRVD → SRVB → manual
   ```

10. **Chạy theo PHASE — phased checkpoint là bắt buộc** (`rap-generate` § 1.1).

RAP phụ thuộc theo tầng: TABL sai 1 field → CDS/BDEF/ZBP dựng trên đó sai theo, mà object đã active **không xóa được**. Vì vậy deploy đi theo 9 phase, **sau MỖI phase → DỪNG, báo user, chờ xác nhận** mới sang phase kế:

```
Phase 1: TABL (+ draft _D)            Phase 6: DDLX
Phase 2: DDLS interface ZI_           Phase 7: CLAS ZCL_/ZCJ_/ZCL_HS_
Phase 3: DDLS projection ZC_          Phase 8: SRVD + SRVB
Phase 4: BDEF ZI_ + BDEF ZC_          Phase 9: Manual Steps (snapshot + hướng dẫn)
Phase 5: CLAS ZBP_I_*
```

Chỉ gộp phase khi user nói rõ "gen hết" / "không cần dừng".

### 10a. Trong 1 phase — chọn ai chạy

| Phase | Ai chạy | Lý do |
|-------|---------|-------|
| 5 (CLAS `ZBP_I_*`), 7 (CLAS `ZCL_/ZCJ_/ZCL_HS_`) | **dispatch subagent** | phải đọc full source class mẫu (500–2000 dòng/class) — noise lớn nhất |
| 2 (DDLS `ZI_`) khi **≥ 4 view** | **dispatch subagent** | nhiều view + `cds_dependencies` + đọc CDS chuẩn |
| 1, 3, 4, 6, 8 | **main tự chạy** | ít object / dựng từ template — đẻ subagent tốn hơn tự làm |
| 9 | **main tự chạy** | chỉ ghi file + hướng dẫn, không deploy |

**TUYỆT ĐỐI KHÔNG** dispatch song song nhiều subagent — 1 phase = tối đa 1 subagent, chạy xong mới tới phase sau. Song song = phá thứ tự phụ thuộc RAP.

### 10b. Dispatch 1 phase (khi bảng trên nói "dispatch")

`Agent(subagent_type: "agent-generate-code")` — main **KHÔNG** load skill `rap-*` và **KHÔNG** gọi write tool cho phase đó.

```
Deploy PHASE <n> (<tên phase>) của case <Case> theo design đã duyệt.

- system   = <system>          (mọi sap-adt call phải truyền)
- package  = <package>
- variant  = <variant> / suffix = <suffix>
- Author   = <author> · 移送番号 = <transport>   (block 変更履歴)
- CLAS deploy mode = <MCP | local snapshot>
- Object CỦA PHASE NÀY (đã sort, đã lọc Status=done):
  1. <TYPE> <NAME> — action=<create|edit> — MCP Deploy=<auto|clas-confirm>
  ...
- Object đã active ở phase trước (dùng để tham chiếu, KHÔNG deploy lại):
  <TYPE> <NAME>, ...
- Design excerpt: §3 rows tương ứng + §5 Field Mapping + §6 Processing Logic + §7 Validation Rules
- KHÔNG đụng object ngoài danh sách phase này.

Quy tắc: theo agent-generate-code.md § Chế độ hoạt động. syntax_check trước mỗi write.
Stop on first error. KHÔNG gọi AskUserQuestion — thiếu thông tin thì trả "STOP: <lý do>".

Trả về NGẮN GỌN (KHÔNG dump source):
1. Object đã active (list).
2. Object fail + lỗi nguyên văn.
3. Object đã snapshot local vào package/<Case>/abap/.
4. Quyết định đáng lưu (naming/type đã adapt) — ≤5 gạch đầu dòng, để main memory_save.
```

Phase main tự chạy → load skill theo pattern (`agent-generate-code.md` § Skill Routing) rồi làm bước 11.

### 10c. Kết thúc mỗi phase (main làm, cả 2 trường hợp)

1. Update Object Impact List cột `Status` → `done` cho object đã active (11e).
2. `memory_save` (11f).
3. In bảng tóm tắt phase: object | kind | syntax/activate OK hay E | note.
4. **DỪNG chờ user OK** mới sang phase kế. Có `severity:"E"` hoặc subagent trả `STOP:` → báo nguyên văn, **không tự loop fix**, không sang phase sau.

11. Trong 1 phase, for each object **theo thứ tự** — main tự chạy, hoặc subagent chạy 11a–11d (11e–11f luôn là main, xem 10c):

   a. **Decide deploy mode** theo deployment matrix (`rap-generate` § 2):
      - Matrix A (TABL/DDLS/BDEF/SRVD/SRVB/DDLX/PROG/INTF) → `create_object` (mới) / `update_source` (sửa) trực tiếp.
      - **CLAS (ZBP_*/ZCL_*/ZCJ_*/ZCL_HS_*)** → dùng mode đã chốt ở 7e (`rap-generate § 2.CLAS`). KHÔNG hỏi lại giữa chừng.
      - Matrix B (IAM, ZJC/ZJT, ZAL, Comm Scenario, ZHS, package, …) → write content/instructions vào `package/<Case>/abap/<Object>.<ext>` (convention `rap-generate § 2.C`) + thêm dòng vào "Manual Steps" của design.

   b. **Generate + deploy source** theo tool call template (`rap-generate` § 3). Source phải mở đầu bằng block 変更履歴 với Author/移送番号 từ 7d (format + vị trí theo `.claude/rules/abap-cloud-naming.md` § Version History Header — CLAS đặt ở include `main`; DDLS/BDEF/DDLX/SRVD dùng comment `//`). **TABL: KHÔNG chèn header 変更履歴.**
      - `syntax_check(system, type, name, source=<source>)` **trước** khi write — có `severity:"E"` → sửa rồi mới write.
      - Mỗi write (`create_object`/`update_source`/`update_class_include`/`activate`) đi qua **permission prompt** của Claude Code (settings.json cố ý không allowlist write tool) → user confirm từng lần. Đây là tầng confirm thứ 2 sau gate 7f.

   c. **Execute sap-adt tool** (truyền `system` từ frontmatter) với session-expired guard:
      - Fail vì session (HTML login, `CSRF token validation failed`, redirect oauth/saml, trả `<html>`) → STOP, gọi `refresh_cookies_for(system="<system>")` + retry 1 lần; vẫn fail → báo user
      - Fail vì activation error (severity="E") → STOP, parse + đề xuất fix, **không** auto-retry

   d. **Activate + read-back** verify (`rap-generate` § 5).

   e. **Update design**: sửa Object Impact List cột `Status` → `done` (dùng Edit tool trên design file).

   f. **Save memory** (`memory_save`): `<object name> trong <package> trên <system> — pattern: <...>`. System BẮT BUỘC có trong content để recall sau filter được.

12. Sau khi xong tất cả object deploy được qua MCP (Matrix A + CLAS nếu chọn MCP):
   - Generate **Manual Steps section** trong design (template ở `rap-generate` § 6) liệt kê toàn bộ object thuộc Matrix B (+ CLAS nếu chọn local snapshot) kèm hướng dẫn cụ thể.
   - Snapshot các object manual/class-local vào `package/<Case>/abap/`.
   - Báo user list manual steps phải làm trong ADT/Fiori.

## Output

Cuối lệnh, in ra:
```
✓ MCP deployed  : <N> objects
⏭ Skipped (done): <K> objects
✗ Failed        : <F> objects  ← kèm object nào + lỗi nguyên văn
⚠ Manual required: <M> objects (xem section "Manual Steps" trong <design.md>)
📁 Snapshot files: package/<Case>/abap/*.abap, *_manual.md
💾 Memory saved : <J> entries
✍ Placeholder cần sửa tay: <list object còn <Author>/<移送番号>>  (nếu user skip 7d)
```

Dừng giữa chừng vì lỗi → in rõ object nào đã active, object nào chưa, và câu lệnh resume: `/rap-gen <Case>` (sẽ skip object `done`).

## Rules

- **KHÔNG write bất cứ gì khi chưa verify package tồn tại (7a)** — check `list_package` cho MỌI package trong Object Impact List. Thiếu package → STOP, báo user tạo trong ADT, KHÔNG deploy một phần, KHÔNG tự chọn package khác.
- KHÔNG write bất cứ gì trước khi user OK confirm gate (7f).
- KHÔNG bỏ phased checkpoint: mỗi phase xong phải dừng báo user, trừ khi user nói "gen hết".
- KHÔNG dispatch song song nhiều subagent — 1 phase tối đa 1 subagent, tuần tự phase.
- Subagent KHÔNG bao giờ được giao nhiều hơn 1 phase trong 1 lần dispatch (nó không dừng hỏi user được).
- KHÔNG generate nếu pre-flight fail. Hỏi user fix design trước.
- KHÔNG tự đổi `create` → `update` khi phát hiện object đã tồn tại — **BẮT BUỘC hỏi user** (7c): dùng luôn object cũ / đổi tên / bỏ qua / hủy.
- Object tồn tại ở **package khác** package trong design → mặc định đề xuất "đổi tên", KHÔNG đề xuất ghi đè (gần như chắc chắn là object của case/team khác).
- Mọi quyết định ở 7c phải **ghi vào design trước khi deploy** — không để design lệch với cái đang chạy.
- KHÔNG bỏ qua bước verify activate giữa các object.
- KHÔNG tự suy diễn field/CDS/object name nếu design không ghi rõ → STOP, hỏi user.
- KHÔNG xóa SAP object (CLAUDE.md § 5 — bắt buộc).
- Stop on first error trong build order — không tiếp tục các object phụ thuộc.
- **KHÔNG mix variant**: nếu design `variant: Local VN`, không object nào được thiếu `_VN`. Ngược lại với Global. Phát hiện mix → STOP, hỏi user.
- **Suffix order**: variant suffix `_VN` LUÔN đứng trước hậu tố kỹ thuật khác (`_D` draft, `_EXT`/`_MBC`/`_UI5A` IAM App, `_SQL` scalar function). Đúng: `ZM902T_VN_D`, `ZIAM_U4_MI902_01_VN_EXT`. Sai: `ZM902T_D_VN`.

$ARGUMENTS
