# rap-app-log — Setup & Init (Step 1–4 + Severity)

Full code cho SKILL.md § Step 1, Step 2, Step 3, Step 4, Severity constants.

## Step 1 — Tạo Application Log Object (ZAL_*)

ADT only:
1. Right-click package → New → Other ABAP Repository Object
2. Search: "Application Log Object" hoặc "APLO"
3. Name: `ZAL_<5chars>_<NN>` (vd `ZAL_MI901_01`)
4. Description: business label (vd 「発注データ連携（送信）」)
5. Add **Subobject** trong tab "Subobjects":
   - Subobject name (vd `JOB`, `BATCH`)
   - Description per subobject
6. Save + Activate

Subobject là phân loại log — 1 object có thể nhiều subobject (vd `JOB` cho APJ runs, `MANUAL` cho user-triggered).

## Step 2 — Constants trong consumer class

```abap
CONSTANTS:
  application_log_object_name   TYPE if_bali_object_handler=>ty_object VALUE 'ZAL_MI901_01',
  application_log_sub_obj1_name TYPE if_bali_object_handler=>ty_object VALUE 'JOB'.
```

**KHÔNG hardcode** trong từng method — đặt constants để dễ change.

## Step 3 — Init log instance (constructor)

```abap
DATA application_log TYPE REF TO if_bali_log.

METHOD constructor.
  TRY.
      application_log = cl_bali_log=>create_with_header(
        header = cl_bali_header_setter=>create(
          object       = application_log_object_name
          subobject    = application_log_sub_obj1_name
          external_id  = '' ) ).    " external_id = '' nếu không cần track
    CATCH cx_bali_runtime INTO DATA(root_exception).
      RAISE EXCEPTION TYPE zcx_xco_runtime_exception
        EXPORTING previous = root_exception.
  ENDTRY.
ENDMETHOD.
```

**Pattern**:
- Tạo header trước (`cl_bali_header_setter=>create`) — chứa object + subobject + external_id
- Tạo log instance với header (`cl_bali_log=>create_with_header`)
- `external_id` cho phép tìm log theo string identifier custom (vd transaction ID, batch ID)
- Wrap trong TRY/CATCH `cx_bali_runtime`

## Step 4 — Add log item + save

```abap
METHOD add_text_to_app_log.
  " 1. Build item (severity + text)
  DATA(app_log_free_text) = cl_bali_free_text_setter=>create(
    severity = if_severity         " từ if_bali_constants
    text     = if_text ).

  " 2. Set detail level (1-9, '1' = highest priority)
  app_log_free_text->set_detail_level( detail_level = '1' ).

  " 3. Add to log
  application_log->add_item( item = app_log_free_text ).

  " 4. Persist to DB (assign to current job if in APJ)
  cl_bali_log_db=>get_instance( )->save_log(
    log                        = application_log
    assign_to_current_appl_job = abap_true ).
ENDMETHOD.
```

## Severity constants — `if_bali_constants`

```abap
TYPE if_bali_item_setter=>ty_severity
```

| Constant | Value | Meaning |
|----------|-------|---------|
| `c_severity_status` | 'S' | Status (default) |
| `c_severity_information` | 'I' | Info |
| `c_severity_warning` | 'W' | Warning |
| `c_severity_error` | 'E' | Error |
| `c_severity_termination` | 'A' | Abort |
| `c_severity_exit` | 'X' | Exit |
| `c_severity_default` | (= status) | Default fallback |

Pattern usage:
```abap
add_text_to_app_log(
  if_severity = if_bali_constants=>c_severity_error
  if_text     = |Failed to process { ldf_doc }: { ldf_error }| ).
```
