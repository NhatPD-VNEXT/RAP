---
name: rap-report-svf
description: "Build 帳票/SVF form-output RAP BO on ABAP Cloud/BTP (ZRAP_REP pattern). RAP action (svf_output / SVF_Printer) on a managed or projection BO that collects print params from an abstract entity (ZA_* with PrinterName + FormName + optional SortCondition1..5), gathers business data, and sends it to the SVF form server through the shared engine class ZCL_SVF_OUTPUT (out_param_set / svf_api_set / svf_output_proc / user_default_printer_get) using the zif_zrap_com_00 interface types (gts_out_parameter / gts_svf_api / gts_svf_field / gts_svf_data / gcs_div). Default printer via default function GetDefaultsFor_*, printer value help ZI_UserPrinter_VH, side effects affects $self, print-log table update via EML, success/error behavior messages. Reference packages: MR905 (納品書帳票), VR901 (海外出荷帳票), PR901 (製造指図帳票). Trigger on: 'SVF', 'svf_output', 'SVF_Printer', '帳票', 'form output', 'report output', 'ZCL_SVF_OUTPUT', 'svf_output_proc', 'svf_api_set', 'out_param_set', 'user_default_printer_get', 'ZI_UserPrinter_VH', 'PrinterName', 'FormName', 'GetDefaultsFor_', 'validateBeforSVF', 'print log', 'printed_count', 'gts_svf_data', 'gcs_div', 'zif_zrap_com_00'."
---

# RAP 帳票 / SVF Form Output

Pattern chuẩn cho mọi BO trong **ZRAP_REP** (帳票): user bấm nút trên Fiori → RAP action gom data → gửi sang **SVF form server** qua engine chung **`ZCL_SVF_OUTPUT`** → cập nhật log số lần in. Tham chiếu **MR905** (納品書), **VR901** (海外出荷), **PR901** (製造指図).

## When to use

- Output 帳票/form (delivery note, shipping form, PO print…) từ 1 RAP BO qua SVF.
- BO có nút "SVF出力" / "Send to SVF" trên List Report / Object Page.
- KHÔNG dùng cho: outbound OData API thường (→ `rap-comm-outbound`), HTTP inbound (→ `rap-http-service`), Application Job (→ `rap-job`).

## Common dependencies — KHÔNG tạo mới, reuse từ ZRAP_COM_00

| Object | Vai trò |
|--------|---------|
| `ZCL_SVF_OUTPUT` | Engine SVF: `out_param_set`, `svf_api_set`, `svf_output_proc`, `user_default_printer_get`, `field_set`, `data_set` |
| `zif_zrap_com_00` | Type chung: `gts_out_parameter`, `gts_svf_api`, `gts_svf_field`, `gts_svf_data`, const `gcs_div-zrap_rep_<pkg>` |
| `ZI_UserPrinter_VH` | Value help máy in (element `printer`) |
| `zcl_com_context_info` | `get_user_and_timestamp`, `get_local_date_time` (timestamp local/UTC) |
| Message class `ZRAP_COM_00` | success/error message (vd 019 success, 020 external-call error) |

> Engine + interface đã có sẵn server-side. Skill này chỉ sinh **BO-side**: BDEF action, abstract param entity, behavior pool, log table. Mỗi case cần 1 const `gcs_div-zrap_rep_<pkg>` (khai server-side / common — confirm với user nếu chưa có).

## Object inventory (per REP case)

| # | Object | Type | Naming | Deploy |
|---|--------|------|--------|--------|
| 1 | Data Model + log/sub views | DDLS `ZI_*` | `ZI_<PJ>_NN` | auto (MCP) |
| 2 | Projection view | DDLS `ZC_*` | `ZC_<PJ>_01` | auto |
| 3 | Abstract param entity (print popup) | DDLS `ZA_*` | `ZA_<PJ>_01` | auto |
| 4 | (optional) result entity | DDLS `ZA_*` | `ZA_<PJ>_0N` | auto |
| 5 | FormName VH | DDLS `ZI_*` | `ZI_<PJ>_0N` | auto |
| 6 | BDEF (interface) | BDEF | = Data Model ID | auto |
| 7 | BDEF (projection) | BDEF | = Projection ID | auto |
| 8 | Behavior pool | CLAS | `ZBP_I_<PJ>_NN` | clas-confirm |
| 9 | (optional) parallel data class | CLAS | `ZCL_<PJ>_NN` | clas-confirm |
| 10 | Print-log table | TABL | `Z<...>T` | auto |
| 11 | SRVD + SRVB U4 + Fiori | SRVD/SRVB | `ZSD_*` / `ZSB_U4_*` | SRVD auto, IAM/Fiori manual |

## Step 1 — Abstract param entity (ZA_*) cho popup máy in

Tuân `cds-field-types` §4 (abstract entity). PrinterName + FormName bắt buộc; SortCondition tuỳ case.

```sql
@EndUserText.label: 'SVF出力ボタン・ポップアップ画面'
@Metadata.allowExtensions: false
define abstract entity ZA_<PJ>_01
{
  @EndUserText.label: '{@i18n>PrinterName}'
  @Consumption.valueHelpDefinition: [ { useForValidation: true,
                                        entity: { name: 'ZI_UserPrinter_VH', element: 'printer' } } ]
  key PrinterName : zzprintername;

  @EndUserText.label: '{@i18n>FormName}'
  @UI.defaultValue: '<PJ>_01.xml'
  @Consumption.valueHelpDefinition: [ { entity: { name: 'ZI_<PJ>_0N', element: 'Formid' } } ]
  key FormName    : zzformname;

  // optional — nếu cần điều kiện sort khi in
  @Consumption.valueHelpDefinition: [ { entity: { name: 'ZI_<PJ>_0N', element: 'SortCondition' } } ]
  SortCondition1  : zz_<pj>_sort_condition;
  // SortCondition2..5 tương tự
}
```

- `PrinterName : zzprintername`, `FormName : zzformname` — data element chung; `FormName` default `<PJ>_NN.xml` (tên form file trên SVF).
- BDEF của abstract entity (nếu cần mandatory): `field ( mandatory ) PrinterName, FormName, SortCondition1...;`

## Step 2 — BDEF action

Hai biến thể (cùng backbone):

### 2a. Projection BO (`use action`) — MR905 / PR901

```abap
// Interface BDEF
managed implementation in class zbp_i_<pj>_01 unique;
strict ( 2 );
define behavior for ZI_<PJ>_01 alias <Alias>
{
  ...
  action <name> affects $self;                          // vd svf_output
  action ( lock : none ) validateBefor<Name>;           // optional pre-check
}
```
```abap
// Projection BDEF
projection implementation in class zbp_i_<pj>_01 unique;
strict ( 1 );
use side effects;
define behavior for ZC_<PJ>_01
{
  use action <name>;
  use function GetDefaultsFor_ZA_<PJ>_01;
  use action validateBefor<Name>;   // nếu có
}
```

### 2b. Managed `with unmanaged save` + result entity — VR901

```abap
managed implementation in class zbp_i_<pj>_01 unique;
strict ( 2 );
define behavior for ZI_<PJ>_01 alias <Alias>
with unmanaged save
lock master
authorization master ( instance )
{
  field ( readonly ) <keyfields>;
  action ( lock : none ) <Name> parameter ZA_<PJ>_01 result [1] ZA_<PJ>_0N
    { default function GetDefaultsFor_ZA_<PJ>_01; }
  side effects { action <Name> affects $self; }
}
```

**Quy tắc chung**:
- Action có param `ZA_<PJ>_01` (popup máy in) + `default function GetDefaultsFor_ZA_<PJ>_01` (điền default printer).
- `side effects { action affects $self }` (hoặc `affects $self` inline) → Fiori refresh sau in.
- `lock : none` cho action in (không lock instance), và cho function GetDefaults.
- Expose nút qua `@UI.lineItem`/`@UI.identification` `{ type: #FOR_ACTION, dataAction: '<name>', label: '{@i18n>SVFOutput}', invocationGrouping: #CHANGE_SET }` trong projection view.

## Step 3 — Behavior pool: default function (lấy máy in mặc định)

```abap
METHOD getdefaultsfor_za_<pj>_01.
  READ ENTITIES OF zi_<pj>_01 IN LOCAL MODE
    ENTITY <Alias>
    ALL FIELDS WITH CORRESPONDING #( keys )
    RESULT DATA(ldt_data).

  APPEND INITIAL LINE TO result ASSIGNING FIELD-SYMBOL(<lfs_result>).
  <lfs_result>-%tky = ldt_data[ 1 ]-%tky.
  <lfs_result>-%param-printername = zcl_svf_output=>user_default_printer_get( ).
ENDMETHOD.
```

## Step 4 — Behavior pool: action in SVF (core flow)

Flow chuẩn trong method action:

1. Lấy user + timestamp local/UTC qua `zcl_com_context_info`.
2. `lds_param = keys[ 1 ]-%param` (printer + form + sort).
3. Đọc data chính (SELECT … WITH PRIVILEGED ACCESS / READ ENTITIES) + build proc data.
4. Group theo đơn vị 1 帳票 (vd theo key) → mỗi nhóm build bảng `gts_svf_data` (method `data_set`) + map field-id (method `field_set`).
5. Gọi engine (method `export_svf_data`):

```abap
" 1) parameter set
zcl_svf_output=>out_param_set(
  EXPORTING if_div    = zif_zrap_com_00=>gcs_div-zrap_rep_<pkg>
            if_fileid = gcf_file_id            " vd 'SAP_Z<PJ>'
            if_date   = cl_abap_context_info=>get_system_date( )
            if_time   = cl_abap_context_info=>get_system_time( )
  CHANGING  cs_out_parameter = cs_data-param ).

" 2) API/form/printer set
zcl_svf_output=>svf_api_set(
  EXPORTING if_div                = zif_zrap_com_00=>gcs_div-zrap_rep_<pkg>
            if_vrsetoutputprinter = is_param-printername
            if_vrsetform          = is_param-formname
  CHANGING  ct_api           = cs_data-api
            cs_out_parameter = cs_data-param ).

" 3) filename + field-id map
cs_data-param-filename = |{ gcf_file_id }_{ if_date }_{ if_time }_{ sy-uname }_{ if_key }{ gcf_file_ext }|.
field_set( CHANGING cs_field = cs_data-field ).

" 4) send to SVF
DATA(ldf_subrc) = zcl_svf_output=>svf_output_proc(
  EXPORTING if_div     = zif_zrap_com_00=>gcs_div-zrap_rep_<pkg>
            is_out_dat = cs_data
  IMPORTING ef_ds_err_msg = ldf_ds_err_msg ).

IF ldf_subrc = 0.  cf_update = abap_true.
ELSE.              cf_msg_log = ldf_ds_err_msg.  ENDIF.
```

6. Thành công (`subrc = 0`) → update log table (Step 5) + `reported` message success (`if_abap_behv_message=>severity-success`).
7. Thất bại → `APPEND %tky TO failed-<alias>` + `reported` message error (kèm `ef_ds_err_msg`).
8. Bọc toàn bộ trong `TRY … CATCH cx_root` → reported error với `get_text( )`. (engine raise `cx_http_dest_provider_error`/`cx_web_http_client_error` khi gọi SVF server fail.)

**Struct gom data trong pool**:
```abap
TYPES: BEGIN OF gts_out_data,
         param TYPE zif_zrap_com_00=>gts_out_parameter,
         api   TYPE STANDARD TABLE OF zif_zrap_com_00=>gts_svf_api WITH EMPTY KEY,
         field TYPE zif_zrap_com_00=>gts_svf_field,
         data  TYPE STANDARD TABLE OF zif_zrap_com_00=>gts_svf_data WITH EMPTY KEY,
       END OF gts_out_data.
```

`gts_svf_data` dùng field generic `field001..NNN`; `field_set` map field-id (tên cột form SVF) còn `data_set` đổ giá trị tương ứng — index 2 method PHẢI khớp nhau.

## Step 5 — Log table (số lần in)

Table `Z<...>T` ghi `printed_count`, `printed_at_first/last`, `printed_user_first/last`. Update qua EML trên log CDS (vd `ZI_<PJ>_03`):

```abap
IF is_proc_data-printedcount = 0.
  MODIFY ENTITIES OF zi_<pj>_03 ENTITY <LogAlias> CREATE AUTO FILL CID
    FIELDS ( ... printedcount printedatfirst printeduserfirst printedatlast printeduserlast )
    WITH VALUE #( ( %key-... = ... printedcount = 1 ... ) )
    FAILED DATA(lf) REPORTED DATA(lr) ##EML_IN_LOOP_OK.
ELSE.
  MODIFY ENTITIES OF zi_<pj>_03 ENTITY <LogAlias> UPDATE
    FIELDS ( printedcount printedatlast printeduserlast )
    WITH VALUE #( ( %key-... = ... printedcount = is_proc_data-printedcount + 1 ... ) )
    FAILED DATA(lf2) REPORTED DATA(lr2) ##EML_IN_LOOP_OK.
ENDIF.
```

## Parallel data fetch (optional)

Nếu data nặng (nhiều BAPI/SELECT per item), gom song song bằng `cl_abap_parallel` → class `ZCL_<PJ>_0N` với `run( EXPORTING p_in_tab IMPORTING p_out_tab )`. Xem skill **rap-parallel-bo-call** cho mẫu inherit + DATA BUFFER.

## Validation checklist

- [ ] `ZA_<PJ>_01` có key + `PrinterName` (VH `ZI_UserPrinter_VH`) + `FormName` (default `*.xml`)
- [ ] Action có `default function GetDefaultsFor_ZA_<PJ>_01` + `side effects affects $self` + `lock : none`
- [ ] Projection `use action` + `use function` (biến thể 2a) HOẶC managed `with unmanaged save` + `result [1] ZA_*` (2b)
- [ ] `GetDefaultsFor_*` set `%param-printername = zcl_svf_output=>user_default_printer_get( )`
- [ ] Action gọi đủ chuỗi `out_param_set` → `svf_api_set` → `field_set` → `svf_output_proc`
- [ ] Truyền đúng `gcs_div-zrap_rep_<pkg>` (const phải tồn tại trong `zif_zrap_com_00`)
- [ ] `field_set` ↔ `data_set` map khớp field-id ↔ value
- [ ] Subrc = 0 → update log + success message; ≠ 0 → failed + error message kèm `ef_ds_err_msg`
- [ ] TRY/CATCH `cx_root` (engine raise http/dest exception)
- [ ] Nút SVF expose qua `@UI.lineItem`/`@UI.identification` `#FOR_ACTION`
- [ ] SRVD expose projection + VH; SRVB `ZSB_U4_*` (Fiori UI) — xem skill `rap-service`

## Common pitfalls

| Lỗi | Triệu chứng | Fix |
|-----|------------|-----|
| Quên `gcs_div-zrap_rep_<pkg>` | Engine không nhận diện form/printer config | Confirm const tồn tại; thêm vào `zif_zrap_com_00` (common, manual) |
| `field_set`/`data_set` lệch index | Form in sai cột / trống | Map 1-1 fieldNNN giữa 2 method |
| Thiếu `default function` | Popup không tự điền máy in | Khai `default function GetDefaultsFor_*` trong action BDEF |
| Action lock instance | In nhiều bản bị khoá / lỗi lock | Dùng `action ( lock : none )` |
| Không catch http/dest exception | Dump khi SVF server down | TRY/CATCH `cx_root`, đẩy `get_text` vào reported |
| Update log mỗi loop không group | Đếm sai số lần in | Group theo đơn vị 1 帳票 trước khi update_log |

## Reference

- **MR905** `ZRAP_REP_MR905`: action `svf_output` + `validateBeforSVF_MR905`, có SortCondition1..5, parallel class `ZCL_MR905_02`.
- **VR901** `ZRAP_REP_VR901`: action `SVF_Printer` parameter `ZA_VR901_01` result `[1] ZA_VR903_01`, managed `with unmanaged save`, log table `ZV90101T` qua `ZI_VR901_03`, file id `SAP_ZVR901`.
- **PR901** `ZRAP_REP_PR901`: action `svf_output` (製造指図帳票).
- Engine: `ZCL_SVF_OUTPUT` + `zif_zrap_com_00` (ZRAP_COM_00, common — reuse, KHÔNG tạo mới).
