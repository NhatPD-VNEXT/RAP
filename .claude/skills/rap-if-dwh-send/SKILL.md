---
name: rap-if-dwh-send
description: "Build DWH/APS outbound CSV sender Application Job on ABAP Cloud/BTP (ZRAP_IF 送信 pattern) — the dominant IF pattern (~100 packages). A job class ZCJ_<PJ>_NN implements the triple interface if_apj_dt_exec_object + if_apj_rt_exec_object + if_oo_adt_classrun (NOT if_apj_rt_run), declares selection screen via get_parameters (et_parameter_def with kind/datatype/length/selname), reads a ZI_<PJ>_NN extraction CDS WITH PRIVILEGED ACCESS, chunks rows by a limit from parameter table ZY043T (zztype='B'), and sends each chunk as a CSV to DataSpider/DWH through the SHARED SVF engine zcl_svf_output=>out_param_set + svf_output_proc using zif_zrap_com_00 types (gts_out_parameter / gts_svf_field / gts_svf_data) and 区分ID gcs_div-zrap_if_<pj>_N. Application Log uses shared object ZRAP_COM_00 with subobject = package name; message class zrap_com_00 (s013 error / s027 no-data / s029 send-count / s030 retry-warn). Reference packages: CI901 (財務計画データ), MI902 (発注ME21N), VI912 (出荷VL01N), YI925..YI953 (DWH master send). Trigger on: 'DWH連携', 'APS連携', '送信クラス', 'DataSpider', 'ZEAI_CONNECT', 'if_apj_dt_exec_object', 'if_apj_rt_exec_object', 'get_parameters', 'et_parameter_def', 'm_post_to_api', 'out_param_set', 'svf_output_proc', 'gts_out_parameter', 'gts_svf_data', 'ZY043T', 'zrap_if send job', 'outbound CSV job', 'gcs_div-zrap_if'."
---

# RAP DWH / APS Outbound Sender Job (ZRAP_IF 送信)

Pattern chủ đạo của **ZRAP_IF** (送信クラス, ~100 package DWH連携/APS連携): 1 **Application Job** đọc data từ 1 CDS extraction view rồi đẩy **CSV** ra DataSpider/EAI (→ DWH) qua **chính engine SVF** `ZCL_SVF_OUTPUT`. Tham chiếu **CI901** (財務計画), **MI902** (発注), **VI912** (出荷), **YI925+** (master送信).

## Reference files (progressive disclosure — đọc khi tới bước tương ứng)

| Step | Nội dung | File |
|------|---------|------|
| Step 2–4 | Class declaration (triple interface) + constructor, `get_parameters`, `execute` + build range (full code) | `references/job-class.md` |
| Step 5–7 | `head_proc` chunk, `m_post_to_api_head` (engine SVF send), local test `main` (full code) | `references/send-logic.md` |

SKILL.md này = index + Critical rules mỗi step. Code khối lớn nằm ở reference file — chỉ đọc khi generate object đó (tránh nạp full context).

## When to use

- Job gửi data (transaction/master) từ S/4 ra hệ ngoài (DWH/APS/3PL) dưới dạng **file CSV qua DataSpider** (EAI `ZEAI_CONNECT`).
- Job có selection screen (ngày cơ sở + select-options), chạy scheduled/on-demand từ App "Application Jobs".

KHÔNG dùng cho:
- 帳票/form output (in giấy) → **`rap-report-svf`** (dùng cùng engine nhưng trigger từ Fiori action, không phải job).
- Job kiểu gọi REST/OData API JSON trực tiếp (MI901/ACMS) → **`rap-job`** (interface `if_apj_rt_run`).
- Inbound HTTP/REST → **`rap-http-service`**; outbound OData V4 proxy → **`rap-comm-outbound`**.

> **Phân biệt với `rap-job`**: kiểu này dùng bộ 3 interface `if_apj_dt_exec_object` + `if_apj_rt_exec_object` + `if_oo_adt_classrun` (KHÔNG phải `if_apj_rt_run`), selection screen khai qua `get_parameters` (không phải PUBLIC DATA + ABAP Doc), App Log dùng object chung `ZRAP_COM_00` (không tạo `ZAL_*` riêng).

## Common dependencies — reuse ZRAP_COM_00, KHÔNG tạo mới

| Object | Vai trò |
|--------|---------|
| `ZCL_SVF_OUTPUT` | Engine gửi DataSpider: `out_param_set`, `svf_output_proc` (retry + err/warn/cause msg) |
| `ZCL_ZRAP_COM_00` | Helper chung: `process_date_time_output` (date/time/timestamp) |
| `zif_zrap_com_00` | Types: `gts_out_parameter`, `gts_svf_field`, `gts_svf_data`; const `gcf_app_log_object='ZRAP_COM_00'`, `gcs_div-zrap_if_<pj>_N` (区分ID) |
| `zcx_xco_runtime_exception` | Exception wrap cho cx_bali_runtime |
| Table `ZY043T` | Parameter table (limit gửi, config). `zztype='B'` seqno `0001` → `zzvalue07` = số dòng/chunk |
| Message class `ZRAP_COM_00` | s013 lỗi output / s027 no-data / s029 送信件数 / s030 retry-warn |
| Comm Scenario `ZEAI_CONNECT` (+ `_2`/`_NDQ`) | EAI outbound (SCO1/SCO3 REST) — engine dùng bên trong |

> Engine + interface + ZY043T + Comm Scenario đã có server-side. Mỗi case mới cần: 1 const `gcs_div-zrap_if_<pj>_N` trong `zif_zrap_com_00` (common, sửa manual — confirm user) + 1 entry ZY043T (config limit/fileid, manual).

## Object inventory (per IF送信 case)

| # | Object | Type | Naming | Deploy |
|---|--------|------|--------|--------|
| 1 | Extraction CDS (抽出用) | DDLS `ZI_*` | `ZI_<PJ>_NN` | auto (MCP) |
| 2 | Job execution class | CLAS | `ZCJ_<PJ>_NN` | clas-confirm |
| 3 | Job Catalog Entry | SAJC | `ZJC_<PJ>_NN` | **manual ADT** |
| 4 | Job Template | SAJT | `ZJT_<PJ>_NN` | **manual ADT/Fiori** |
| 5 | 区分ID const | — | `gcs_div-zrap_if_<pj>_N` trong `zif_zrap_com_00` | manual (common) |
| 6 | ZY043T config entry | data | `div=<PJ>, zztype='B'` | manual |
| 7 | IAM (SIA1/SIA6/SIA7) | — | `ZBC_*` / `ZJC_*_SAJC` | manual admin |

> Case DWH thường KHÔNG có table/BDEF/SRVD riêng — chỉ CDS extraction + job class. (Khác với BO managed.)

## Step 1 — Extraction CDS (ZI_<PJ>_NN)

CDS gom data cần gửi (join các bảng/CDS standard). Description `Data Model：抽出用CDS`. Job SELECT trực tiếp view này `WITH PRIVILEGED ACCESS` (job context, bỏ qua DCL). Không cần projection/BDEF nếu chỉ để job đọc.

## Step 2 — Job class: khai báo (triple interface)

→ Code đầy đủ: **`references/job-class.md` § Step 2**.

Critical:
- Class implements **3 interface**: `if_apj_dt_exec_object` (design-time) + `if_apj_rt_exec_object` (runtime) + `if_oo_adt_classrun` (F9 test) — KHÔNG `if_apj_rt_run`.
- Struct gửi `gds_out_dat_head` = { `param` (gts_out_parameter) + `field` (gts_svf_field, tên cột) + `data` (table `gts_svf_data_head`, rows) }.
- Constructor init app log object **chung** `zif_zrap_com_00=>gcf_app_log_object` ('ZRAP_COM_00'), subobject = tên package (`ZRAP_IF_<PJ>`).

## Step 3 — Selection screen: get_parameters

→ Code đầy đủ: **`references/job-class.md` § Step 3**.

Critical:
- `kind` = `parameter` (1 giá trị) hoặc `select_option` (range); `datatype`/`length` = kiểu DDIC thô (`D`/`N`/`C`…).
- `selname` PHẢI khớp với `if_key` khi đọc trong `execute`. `param_text` = text symbol (TEXT-i0N).

## Step 4 — Runtime: execute + build range

→ Code đầy đủ: **`references/job-class.md` § Step 4**.

Critical:
- Scalar param: đọc qua `line_exists( it_parameters[ selname = ... ] )`; select-option: build range qua `m_move_to_range` (MOVE-CORRESPONDING sign/option/low/high).
- Set `gdf_nodata = 'X'` trước, gọi `head_proc` với `if_div = gcs_div-zrap_if_<pj>_N`; sau đó nếu vẫn no-data → s027. Bọc `TRY/CATCH cx_root` → s013 error.

## Step 5 — head_proc: đọc CDS + build + chunk

→ Code + chi tiết đầy đủ: **`references/send-logic.md` § Step 5**.

Critical:
- SELECT `ZI_<PJ>_NN` **`WITH PRIVILEGED ACCESS`** + filter theo range; `RETURN` sớm nếu `sy-subrc <> 0`.
- Limit gửi = `zzvalue07` từ `ZY043T` (`zztype='B'`, `zzseqno='0001'`).
- LOOP → `data_set_head` → APPEND vào buffer → gọi `m_post_to_api_head` mỗi vòng; **sau loop flush cuối `if_limitcnt = 0`**.
- Số tiền: external format kèm currency; dấu âm → `-{ abs( v ) }`.

## Step 6 — m_post_to_api_head: gửi DataSpider qua engine SVF

→ Code đầy đủ: **`references/send-logic.md` § Step 6**.

Critical:
- Chunk gate: `IF if_limitcnt > 0 AND ldf_line < if_limitcnt. RETURN.` (flush cuối truyền limit=0).
- Chuỗi gửi: `process_date_time_output` → `out_param_set(if_fileid)` → `field_set_head` → `svf_output_proc`.
- `field_set_head` (tên cột) ↔ `data_set_head` (giá trị): index `fieldNNN` khớp 1-1.
- subrc=0 → s029 送信件数 (+ s030 nếu `ef_retry_cnt>0`, chỉ warning); ≠0 → s013 + `ef_ds_err_msg`. **`CLEAR gds_out_dat_head`** sau mỗi chunk.

## Step 7 — Local test: if_oo_adt_classrun~main

→ Code đầy đủ: **`references/send-logic.md` § Step 7**.

Critical: `main` build `lt_sel` giả lập rồi gọi `execute` (F9 test ngoài scheduler). `m_add_text_to_app_log` phân nhánh `sy-batch`: batch → `save_log( assign_to_current_appl_job = abap_true )`; else → `out->write(...)`.

## Step 8 — Manual objects (ADT/Fiori)

- `ZJC_<PJ>_NN` (Catalog Entry) → reference class `ZCJ_<PJ>_NN`.
- `ZJT_<PJ>_NN` (Template, cùng NN).
- IAM (SIA1 `ZBC_*` / SIA6 `ZJC_*_SAJC` / SIA7).
- Entry `ZY043T` (div=<PJ>, zztype='B', zzseqno='0001', zzvalue07=limit) + const `gcs_div-zrap_if_<pj>_N` trong `zif_zrap_com_00`.

Chi tiết Catalog/Template → xem **`rap-job`** Step 4.

## Validation checklist

- [ ] Class implements `if_apj_dt_exec_object` + `if_apj_rt_exec_object` + `if_oo_adt_classrun` (KHÔNG `if_apj_rt_run`)
- [ ] `get_parameters` khai đủ selname; `execute` đọc đúng selname (scalar `line_exists`, range `m_move_to_range`)
- [ ] Constructor app log object = `zif_zrap_com_00=>gcf_app_log_object` ('ZRAP_COM_00'), subobject = tên package
- [ ] SELECT extraction CDS `WITH PRIVILEGED ACCESS`
- [ ] Chunk theo ZY043T `zztype='B'` limit + **flush cuối `if_limitcnt = 0`**
- [ ] Chuỗi gửi: `process_date_time_output` → `out_param_set(if_fileid)` → `field_set` → `svf_output_proc`
- [ ] `field_set_head` ↔ `data_set_head` map field-id ↔ value khớp index
- [ ] `gcs_div-zrap_if_<pj>_N` tồn tại trong `zif_zrap_com_00` (thêm manual nếu chưa)
- [ ] Số tiền external-format kèm currency; dấu âm → `-{ abs }`
- [ ] subrc=0 → s029 送信件数 (+ s030 nếu retry); ≠0 → s013 error + `ef_ds_err_msg`
- [ ] `CLEAR gds_out_dat_head` sau mỗi chunk
- [ ] no-data → `gdf_nodata` + s027; bọc `TRY/CATCH cx_root`
- [ ] `if_oo_adt_classrun~main` cho test; `m_add_text_to_app_log` phân nhánh `sy-batch`

## Common pitfalls

| Lỗi | Triệu chứng | Fix |
|-----|------------|-----|
| Dùng `if_apj_rt_run` | Job không nhận select-options/range | Dùng bộ 3 interface + `get_parameters` |
| Quên flush cuối (limit≠0) | Chunk cuối < limit không được gửi → mất data | Sau loop gọi lại `m_post` với `if_limitcnt = 0` |
| Quên `CLEAR gds_out_dat_head` | Chunk sau gộp cả chunk trước → gửi trùng | CLEAR sau mỗi lần gửi |
| Thiếu `WITH PRIVILEGED ACCESS` | Job không đọc được data (DCL chặn) | Thêm vào SELECT extraction CDS |
| `field_set`/`data_set` lệch index | CSV lệch cột / trống | Map 1-1 fieldNNN |
| Thiếu `gcs_div-zrap_if_<pj>_N` | Engine không map fileid/config | Thêm const vào `zif_zrap_com_00` (common, manual) |
| Coi retry là lỗi | Báo fail dù đã gửi thành công sau retry | subrc=0 = OK; `ef_retry_cnt>0` chỉ log warning s030 |
| App log object sai (tạo ZAL_ riêng) | Log không gom vào ZRAP_COM_00 | Dùng object chung 'ZRAP_COM_00', subobject = package |

## Reference

- **CI901** `ZRAP_IF_CI901`: `ZCJ_CI901_01` (財務計画データ送信), CDS `ZI_CI901_01`, div `gcs_div-zrap_if_ci901_1`, fileid `CO0101-ZAIMUKEIKAKUDATA`.
- **MI902/VI912/PI904…**: cùng pattern, phân ヘッダ/明細 → nhiều div (`_1`, `_2`, `_3`) + nhiều `head_proc`/`m_post` (mỗi cấp 1 file DataSpider).
- **YI925..YI953**: DWH master送信 (品目/BP/価格/BOM…), mỗi master nhiều div `_1.._C`.
- Engine dùng chung với **`rap-report-svf`** (`zcl_svf_output` + `zif_zrap_com_00`) — 帳票 in giấy vs DWH gửi CSV là 2 use-case của cùng engine.
- Full code: `references/job-class.md`, `references/send-logic.md`.
