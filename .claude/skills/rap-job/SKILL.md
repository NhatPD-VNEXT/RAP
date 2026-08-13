---
name: rap-job
description: "Build Application Job (APJ) in ABAP Cloud/BTP: ZCJ_* job execution class (if_apj_rt_run), ZJC_* Application Job Catalog Entry, ZJT_* Application Job Template, parameter selection screens via PUBLIC DATA attributes with ABAP Doc lang=ja, Application Log integration (cl_bali_log), buffer pattern for save phase, and direct DDIC table modify with COMMIT WORK AND WAIT in job context. Reference pattern: MI901 (ZCJ_MI901_01 sending PO data to ACMS with file logging). Trigger on: 'application job', 'background job', 'ZCJ_', 'ZJC_', 'ZJT_', 'if_apj_rt_run', 'APJ', 'job catalog', 'job template', 'job execution class', 'PUBLIC DATA attributes', 'p_ifid', 'job parameters', 'ABAP Doc lang ja', 'scheduled job'."
---

# RAP Application Job (APJ)

Background job trên ABAP Cloud/BTP — tham chiếu **ZRAP_IF_MI901** (job gửi PO data tới ACMS).

## Reference files (progressive disclosure — đọc khi tới bước tương ứng)

| Step | Nội dung | File |
|------|---------|------|
| Step 1–2 | Job execution class `ZCJ_*` (full code) + pattern rules + direct DDIC modify + helper class `ZCL_*` | `references/job-class.md` |
| Step 3–5 | Application Log Object `ZAL_*`, Job Catalog `ZJC_*` + Template `ZJT_*` (manual ADT steps), Buffer pattern | `references/manual-and-buffer.md` |

SKILL.md này = index + Critical rules mỗi step. Code khối lớn nằm ở reference file — chỉ đọc khi generate object đó (tránh nạp full context).

## Templates

| Object | Template |
|--------|---------|
| Job execution class `ZCJ_*` | `.claude/templates/clas/zcj-job-class.abap` |
| Job Catalog Entry `ZJC_*` | **Manual ADT** — không có template, làm trong ADT |
| Job Template `ZJT_*` | **Manual** — Fiori "Application Jobs" hoặc ADT |

## When to use

- Cần chạy logic theo lịch (scheduled) hoặc on-demand từ App "Application Jobs"
- Trigger qua: Communication Arrangement (REST/RFC) hoặc giao diện admin
- Xử lý batch, log lại kết quả vào Application Log

KHÔNG dùng job cho: response sync với external system → dùng skill `rap-http-service` hoặc unmanaged BO action.

> **2 kiểu Application Job trong codebase — chọn đúng:**
> - **Kiểu này (`if_apj_rt_run`)**: params qua PUBLIC DATA + ABAP Doc `lang=ja`, App Log `ZAL_*` riêng, gửi REST/JSON trực tiếp (vd MI901→ACMS). Đơn giản, ít param.
> - **Kiểu DWH送信 (`if_apj_dt_exec_object` + `if_apj_rt_exec_object` + `if_oo_adt_classrun`)**: params qua `get_parameters` (`et_parameter_def`, có select-option/range), App Log **object chung `ZRAP_COM_00`** (subobject = tên package), gửi **CSV ra DataSpider** qua engine `zcl_svf_output`, chunk theo `ZY043T`. Đây là pattern chủ đạo của **ZRAP_IF 送信 (~100 package)** → dùng skill **`rap-if-dwh-send`**, KHÔNG dùng skill này.

## Object inventory

| # | Object | Type | Naming | Tạo qua |
|---|--------|------|--------|---------|
| 1 | Job Execution Class | CLAS | `ZCJ_<5chars>_<NN>` | MCP `edit CLAS` hoặc ADT |
| 2 | Application Log Object | APLO | `ZAL_<5chars>_<NN>` | ADT thủ công (không có MCP) |
| 3 | Job Catalog Entry | SAJC | `ZJC_<5chars>_<NN>` | ADT thủ công |
| 4 | Job Template | SAJT | `ZJT_<5chars>_<NN>` | ADT thủ công (cùng `<5chars>_<NN>` với ZJC) |
| (opt) | Common helper | CLAS | `ZCL_<5chars>_<NN>` | MCP `edit CLAS` |
| (opt) | Monitor BO | DDLS+BDEF+SRVD+SRVB | `ZI_*` + `ZSD_*` + `ZSB_U4_*` | Fiori UI giám sát kết quả |

> ZCJ và ZJC, ZJT có cùng `<5chars>_<NN>` để dễ track. Z prefix khác nhau (CJ = Class, JC = Catalog, JT = Template).

## Step 1 — Job Execution Class (ZCJ_*)

Class `ZCJ_<5chars>_<NN>` implements `if_apj_rt_run`. → Code đầy đủ + pattern rules + direct DDIC modify: **`references/job-class.md` § Step 1**.

Critical:
- `INTERFACES if_apj_rt_run`; entry point `execute` KHÔNG có parameter (framework auto-fill DATA attributes trước khi gọi).
- PUBLIC DATA attributes = job parameters; mỗi cái BẮT BUỘC ABAP Doc `"!` với `lang="ja"`. Naming `p_*` scalar, `s_*` RANGE/select-options.
- Constructor init `cl_bali_log` reference `ZAL_*` object + subobject.
- `save_log( assign_to_current_appl_job = abap_true )` — KHÔNG `save_log_2nd_db_connection` trong APJ context.
- Direct DML `MODIFY ddic_table FROM TABLE` + `COMMIT WORK AND WAIT` (job LUW riêng — không bắt buộc EML/RAP BO).

## Step 2 — Helper class (ZCL_*)

Tách logic non-RAP (build JSON, call API, transform data) ra `ZCL_<5chars>_<NN>`. → Skeleton đầy đủ: **`references/job-class.md` § Step 2**.

Critical:
- `CLASS-METHODS` (static) only — không cần state giữa lần gọi.
- Tách bước nhỏ: `field_set` (header), `data_set` (1 row), `build_data_send` (loop wrap), `build_modify_zm901t` (build update), `send_acms` (call API).
- Trả `rf_success` thay vì raise exception — job orchestrator quyết định có commit hay không.

## Step 3 — Application Log Object (ZAL_*)

**KHÔNG có MCP tool** → tạo thủ công trong ADT (New → Application Log Object, name `ZAL_<5chars>_<NN>`, add subobject vd `JOB`). → Chi tiết + constant reference: **`references/manual-and-buffer.md` § Step 3**.

Class ZCJ reference object name + subobject làm string constants. Chi tiết API `cl_bali_*` → xem skill **rap-app-log**.

## Step 4 — Job Catalog Entry (ZJC_*) + Template (ZJT_*)

**KHÔNG có MCP tool** → tạo thủ công trong ADT. → Các bước Catalog Entry + Template đầy đủ: **`references/manual-and-buffer.md` § Step 4**.

Critical:
- Catalog Entry `ZJC_<5chars>_<NN>` reference Job Execution Class `ZCJ_*` (cùng NN) + Authorization Object.
- Template `ZJT_<5chars>_<NN>` (cùng NN với ZJC) reference Catalog Entry + parameter default values. Optional nếu user nhập param mỗi lần chạy.

## Step 5 — Buffer pattern (khi action call → defer save)

Trong unmanaged BO action, không gọi `MODIFY ddic_table` trực tiếp trong handler — push vào singleton buffer để saver phase ghi. → Code đầy đủ (`lcl_buffer` + saver `save` REDEFINITION): **`references/manual-and-buffer.md` § Step 5**.

Critical: dùng khi 1 RAP request có nhiều action calls → gom MODIFY thành 1 lần ở save phase để tránh deadlock + giữ atomic.

## Validation checklist

- [ ] `ZCJ_*` implements `if_apj_rt_run`
- [ ] PUBLIC DATA attributes có ABAP Doc `"!` với `lang="ja"`
- [ ] Parameter naming: `p_*` scalar, `s_*` RANGE
- [ ] Constructor init `cl_bali_log` (nếu có Application Log)
- [ ] `execute` method KHÔNG có parameter (auto-filled)
- [ ] `save_log( assign_to_current_appl_job = abap_true )` (KHÔNG `save_log_2nd_db_connection`)
- [ ] Helper class `ZCL_*` là CLASS-METHODS only
- [ ] `MODIFY ddic_table FROM TABLE` + `COMMIT WORK AND WAIT` (job context dùng DML trực tiếp)
- [ ] `ZAL_*` (APLO) đã tạo thủ công trong ADT
- [ ] `ZJC_*` (SAJC) Catalog Entry đã tạo + reference đúng `ZCJ_*`
- [ ] `ZJT_*` (SAJT) Template (optional) cùng NN với `ZJC_*`
- [ ] Description: 業務的 label tiếng Nhật/Việt

## Common pitfalls

| Lỗi | Triệu chứng | Fix |
|-----|------------|-----|
| ABAP Doc `lang="en"` | Warning khi activate ZCJ | Đổi sang `lang="ja"` |
| `save_log_2nd_db_connection` trong APJ | Log không hiện trong App "Application Jobs" | Dùng `save_log( assign_to_current_appl_job = abap_true )` |
| Quên `COMMIT WORK AND WAIT` sau MODIFY | Data không persist sau khi job kết thúc | Thêm commit |
| ZJC + ZJT khác NN | Admin tìm không thấy template tương ứng | Dùng cùng `<5chars>_<NN>` |
| ZCJ activate fail vì ZAL chưa tạo | "Application Log Object not found" | Tạo ZAL trước ZCJ |

## Reference

- Package mẫu: `ZRAP_IF_MI901`
- Files: `ZCJ_MI901_01` (job class), `ZCL_MI901_01` (helper), `ZAL_MI901_01` (APLO), `ZJC_MI901_01` (catalog), `ZJT_MI901_01` (template), `ZCL_MI901_03` (query provider cho monitor list)
- Full code: `references/job-class.md`, `references/manual-and-buffer.md`
