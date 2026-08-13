---
name: rap-app-log
description: "Use SAP Application Log API (cl_bali_*) on ABAP Cloud/BTP: ZAL_* Application Log Object (APLO), cl_bali_log/cl_bali_header_setter/cl_bali_free_text_setter, severity constants (if_bali_constants), save_log with assign_to_current_appl_job=true for APJ context, save_log_2nd_db_connection for non-LUW context (HTTP service). Reference pattern: MI901 (ZAL_MI901_01 used in ZCJ_MI901_01 job for error/status logging). Trigger on: 'application log', 'cl_bali_log', 'cl_bali_header_setter', 'cl_bali_free_text_setter', 'cl_bali_log_db', 'ZAL_', 'APLO', 'save_log', 'save_log_2nd_db_connection', 'assign_to_current_appl_job', 'if_bali_constants', 'c_severity_error', 'c_severity_warning', 'c_severity_information', 'c_severity_status', 'add_item', 'add_text_to_app_log', 'free text log item'."
---

# RAP Application Log API

Ghi log thông tin/lỗi vào Application Log để admin xem qua App "Application Logs" trên S/4 Cloud — tham chiếu **ZAL_MI901_01** + cách dùng trong **ZCJ_MI901_01** (job class).

## Reference files (progressive disclosure — đọc khi tới bước tương ứng)

| Nội dung | File |
|---------|------|
| Step 1–4 (tạo APLO, constants, init constructor, add item+save) + bảng severity constants — full code | `references/setup-init.md` |
| Save modes (APJ vs 2nd db connection) + decision matrix, message class, reading logs — full code | `references/save-messages.md` |
| Helper class skeleton (reusable) + exception wrapper — full code | `references/helper-class.md` |

SKILL.md này = index + Critical rules mỗi mục. Code khối lớn nằm ở reference file — chỉ đọc khi generate object đó (tránh nạp full context).

## Templates

| Object | Template |
|--------|---------|
| Job class với log integration (APJ context, `assign_to_current_appl_job=true`) | `.claude/templates/clas/zcj-job-class.abap` |
| HTTP handler với log via EML | `.claude/templates/clas/zcl-http-handler.abap` |
| Application Log Object `ZAL_*` + Subobjects | **Manual ADT** — không có template, tạo thủ công |

## When to use

- Background job (APJ): log lỗi, status, debug info gắn với job run
- HTTP service: log async events ngoài LUW chính
- Action handler: log error chi tiết cho audit
- KHÔNG dùng cho: response sync trả về client → dùng `reported`/`failed` của EML hoặc HTTP response body

## Object inventory

| # | Object | Type | Naming | Tạo qua |
|---|--------|------|--------|---------|
| 1 | Application Log Object | APLO | `ZAL_<5chars>_<NN>` | ADT thủ công (KHÔNG có MCP) |
| 2 | (optional) Subobject(s) | text constants | `JOB`, `BATCH`, `IMPORT`... | Khai báo trong APLO |

## Step 1 — Tạo Application Log Object (ZAL_*)

Mục đích: tạo APLO + subobject phân loại log.

Critical: `ZAL_<5chars>_<NN>`; ADT only (KHÔNG có MCP); add Subobject trong tab "Subobjects" (`JOB`/`BATCH`...); Save + Activate.

→ Các bước ADT chi tiết: `references/setup-init.md` § Step 1.

## Step 2 — Constants trong consumer class

Mục đích: đặt object + subobject name thành CONSTANTS trong consumer class.

Critical: `TYPE if_bali_object_handler=>ty_object`; **KHÔNG hardcode** trong từng method.

→ Code: `references/setup-init.md` § Step 2.

## Step 3 — Init log instance (constructor)

Mục đích: tạo log instance từ header trong constructor.

Critical: tạo header trước (`cl_bali_header_setter=>create` với object + subobject + external_id) → `cl_bali_log=>create_with_header`; `external_id=''` nếu không track; wrap TRY/CATCH `cx_bali_runtime`.

→ Code: `references/setup-init.md` § Step 3.

## Step 4 — Add log item + save

Mục đích: build item (severity+text), set detail level, add vào log, persist.

Critical: `cl_bali_free_text_setter=>create` → `set_detail_level('1')` (1 = highest) → `add_item` → `save_log`.

→ Code: `references/setup-init.md` § Step 4.

## Severity constants — `if_bali_constants`

Mục đích: dùng constants thay magic value cho severity (`ty_severity`).

Critical: `c_severity_status/information/warning/error/termination/exit`; dùng `if_bali_constants=>c_severity_*`, KHÔNG hardcode chữ 'E'/'W'.

→ Bảng đầy đủ giá trị: `references/setup-init.md` § Severity constants.

## Save modes — CRITICAL

Mục đích: chọn đúng save mode theo context để log không bị mất/rollback.

Critical:
- APJ job (`if_apj_rt_run~execute`): `save_log( assign_to_current_appl_job = abap_true )` → link vào job run, commit cùng LUW job.
- Non-LUW (HTTP log trước RETURN 400, raise exception, test): `save_log_2nd_db_connection` → không bị rollback nhưng mất atomic với business data.
- RAP behavior handler: `save_log( assign_to_current_appl_job = abap_false )` → tham gia RAP LUW.

→ Code 2 mode + decision matrix đầy đủ: `references/save-messages.md` § Save modes.

## Save log với từ message class

Mục đích: fill text log từ message class thay vì free text.

Critical: `MESSAGE <id>(<class>) WITH <p1>... INTO <var>` (type `cl_bali_free_text_setter=>ty_text`); hoặc `add_messages_from_bapirettab` (BAPI return table); hoặc `add_abap_behavior_message` (RAP message).

→ Code: `references/save-messages.md` § Save log với từ message class.

## Reading logs (cho monitoring UI / custom query)

Mục đích: load logs để build custom Fiori list giám sát (thay App standard).

Critical: `load_logs_via_filter( filter = cl_bali_log_filter=>create( object=... subobject=... ) )` → loop `->log` → `get_header` / `get_all_items`.

→ Code: `references/save-messages.md` § Reading logs.

## Helper class skeleton (reusable)

Mục đích: 1 class-method `write_app_log` gói toàn bộ create→add→save (job-bound switchable).

Critical: `CLASS-METHODS write_app_log` IMPORTING object/subobject/severity/message/`if_job_bound DEFAULT abap_true`; branch `save_log` vs `save_log_2nd_db_connection` theo `if_job_bound`; RAISING `zcx_xco_runtime_exception`.

→ Code đầy đủ + call site: `references/helper-class.md` § Helper class skeleton.

## Exception wrapper pattern

Mục đích: wrap `cx_bali_runtime` (hiếm — APLO không tồn tại) thành Cloud-aware exception.

Critical: `CATCH cx_bali_runtime` → `RAISE EXCEPTION TYPE zcx_xco_runtime_exception EXPORTING previous = ...`; `zcx_xco_runtime_exception` inherit `cx_xco_runtime_exception`.

→ Code: `references/helper-class.md` § Exception wrapper pattern.

## Validation checklist

- [ ] ZAL_* (APLO) đã tạo + activate trong ADT
- [ ] Subobject(s) đã định nghĩa cho phân loại
- [ ] Constants `application_log_object_name` + `application_log_sub_obj1_name` trong class consumer
- [ ] Constructor init `cl_bali_log=>create_with_header` trong TRY/CATCH `cx_bali_runtime`
- [ ] `add_item` mỗi log entry (severity + text)
- [ ] `set_detail_level('1')` cho high-priority items
- [ ] Save mode:
  - APJ context: `save_log( assign_to_current_appl_job = abap_true )`
  - Non-LUW context: `save_log_2nd_db_connection`
- [ ] Severity dùng `if_bali_constants=>c_severity_*` (KHÔNG hardcode chữ)
- [ ] Wrap `cx_bali_runtime` thành Cloud exception

## Common pitfalls

| Lỗi | Triệu chứng | Fix |
|-----|------------|-----|
| `save_log_2nd_db_connection` trong APJ job | Log không hiện trong job log view | Đổi sang `save_log( assign_to_current_appl_job = abap_true )` |
| `save_log` trong HTTP handler trả 400 RETURN sớm | Log bị rollback cùng với business fail | Dùng `save_log_2nd_db_connection` để log dù RETURN sớm |
| Hardcode severity `'E'` thay vì constant | Magic value, dễ typo | `if_bali_constants=>c_severity_error` |
| Quên `set_detail_level` | Log item ở level mặc định khó filter | Set `'1'` cho important |
| ZAL chưa tạo trước khi consumer activate | "Object ZAL_* not found" | Tạo APLO trước CLAS |
| Save log mỗi loop iteration | Performance kém | Add nhiều items rồi save 1 lần cuối |

## Reference

- Package mẫu: `ZRAP_IF_MI901`
- Files: `ZAL_MI901_01` (APLO), `ZCJ_MI901_01` (job class consumer, methods `constructor` + `add_text_to_app_log` + `check_data`)
- API classes: `cl_bali_log`, `cl_bali_header_setter`, `cl_bali_free_text_setter`, `cl_bali_log_db`, `if_bali_constants`
- Full code: `references/setup-init.md`, `references/save-messages.md`, `references/helper-class.md`
