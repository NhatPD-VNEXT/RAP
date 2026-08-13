# rap-job — Job Execution Class + Helper (Step 1–2 full code)

Nguồn: SKILL.md § Step 1 (ZCJ_*) và § Step 2 (ZCL_* helper). Code copy verbatim từ package tham chiếu **ZRAP_IF_MI901**.

---

## Step 1 — Job Execution Class (ZCJ_*)

```abap
CLASS zcj_mi901_01 DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC .

  PUBLIC SECTION.
    INTERFACES if_apj_rt_run.

    "! <p class="shorttext synchronized" lang="ja">インターフェースID</p>
    DATA p_ifid  TYPE c LENGTH 10.
    "! <p class="shorttext synchronized" lang="ja">送信基準日</p>
    DATA p_date  TYPE d.
    "! <p class="shorttext synchronized" lang="ja">購買発注番号範囲</p>
    DATA s_ponum TYPE RANGE OF I_PurchaseOrderAPI01-PurchaseOrder.

    METHODS constructor.

  PROTECTED SECTION.
  PRIVATE SECTION.
    CONSTANTS:
      application_log_object_name   TYPE if_bali_object_handler=>ty_object VALUE 'ZAL_MI901_01',
      application_log_sub_obj1_name TYPE if_bali_object_handler=>ty_object VALUE 'JOB'.

    TYPES:
      gtt_data TYPE STANDARD TABLE OF zi_mi901_01 WITH EMPTY KEY.

    DATA application_log TYPE REF TO if_bali_log.

    METHODS check_data
      RETURNING VALUE(rf_no_error) TYPE abap_boolean.

    METHODS get_data
      EXPORTING et_data            TYPE gtt_data
      RETURNING VALUE(rf_no_error) TYPE abap_boolean.

    METHODS add_text_to_app_log
      IMPORTING !VALUE(if_severity) TYPE if_bali_item_setter=>ty_severity
                                    DEFAULT if_bali_constants=>c_severity_status
                if_text             TYPE cl_bali_free_text_setter=>ty_text
      RAISING   cx_bali_runtime.
ENDCLASS.

CLASS zcj_mi901_01 IMPLEMENTATION.

  METHOD constructor.
    TRY.
        application_log = cl_bali_log=>create_with_header(
          header = cl_bali_header_setter=>create(
            object       = application_log_object_name
            subobject    = application_log_sub_obj1_name
            external_id  = '' ) ).
      CATCH cx_bali_runtime INTO DATA(root_exception).
        RAISE EXCEPTION TYPE zcx_xco_runtime_exception
          EXPORTING previous = root_exception.
    ENDTRY.
  ENDMETHOD.

  METHOD if_apj_rt_run~execute.
    " 1. Validate parameters
    IF me->check_data( ) = abap_false.
      RETURN.
    ENDIF.

    " 2. Fetch data
    me->get_data(
     IMPORTING
       et_data    = DATA(ldt_data)
     RECEIVING
       rf_no_error = DATA(ldf_no_error) ).
    IF ldf_no_error = abap_false.
      RETURN.
    ENDIF.

    " 3. Build payload (delegate to helper)
    zcl_mi901_01=>build_data_send(
      EXPORTING it_data    = ldt_data
      IMPORTING es_out_dat = DATA(lds_out_dat) ).

    " 4. Call external API + update history table on success
    IF zcl_mi901_01=>send_acms( is_data = lds_out_dat ).
      zcl_mi901_01=>build_modify_zm901t(
        EXPORTING it_data   = ldt_data
        IMPORTING et_result = DATA(ldt_modif) ).
      MODIFY zm901t FROM TABLE @ldt_modif.
      COMMIT WORK AND WAIT.
    ENDIF.
  ENDMETHOD.

  METHOD check_data.
    rf_no_error = abap_true.
    DATA ldf_message TYPE cl_bali_free_text_setter=>ty_text.

    SELECT SINGLE zzvalue01
      FROM zy043t
      WHERE zztype = 'A' AND div = @p_ifid
      INTO @DATA(ldf_zzvalue01).

    IF ldf_zzvalue01 IS INITIAL.
      TRY.
          MESSAGE s011(zrap_com_99) WITH p_ifid INTO ldf_message.
          add_text_to_app_log( if_severity = if_bali_constants=>c_severity_error
                               if_text     = ldf_message ).
          rf_no_error = abap_false.
          RETURN.
        CATCH cx_bali_runtime INTO DATA(root_exception).
          RAISE EXCEPTION NEW zcx_xco_runtime_exception( previous = root_exception ).
      ENDTRY.
    ENDIF.
  ENDMETHOD.

  METHOD get_data.
    rf_no_error = abap_true.

    DATA(ldf_sendrefdate) = p_date.
    IF ldf_sendrefdate IS INITIAL.
      ldf_sendrefdate = cl_abap_context_info=>get_system_date( ).
    ENDIF.

    SELECT * FROM zi_mi901_01
      WHERE ifid                 = @p_ifid
        AND lastchangedatelocal >= @ldf_sendrefdate
        AND purchaseorder        IN @s_ponum
      INTO TABLE @et_data.
  ENDMETHOD.

  METHOD add_text_to_app_log.
    DATA(app_log_free_text) = cl_bali_free_text_setter=>create(
      severity = if_severity
      text     = if_text ).
    app_log_free_text->set_detail_level( detail_level = '1' ).
    application_log->add_item( item = app_log_free_text ).

    cl_bali_log_db=>get_instance( )->save_log(
      log                        = application_log
      assign_to_current_appl_job = abap_true ).
  ENDMETHOD.
ENDCLASS.
```

### Pattern rules — bắt buộc

1. **`INTERFACES if_apj_rt_run`** trong PUBLIC SECTION.
2. **`execute` method** từ interface là entry point — KHÔNG có parameter (framework auto-fill các DATA attributes trước khi gọi).
3. **PUBLIC DATA attributes** = parameter input của job:
   - Mỗi attribute PHẢI có ABAP Doc `"!` block với `lang="ja"`:
     ```abap
     "! <p class="shorttext synchronized" lang="ja">送信基準日</p>
     DATA p_date TYPE d.
     ```
   - Type: scalar (`p_ifid TYPE c LENGTH 10`), date (`p_date TYPE d`), RANGE (`s_ponum TYPE RANGE OF ...`)
   - Naming convention: `p_*` cho parameter scalar, `s_*` cho RANGE/select-options
4. **Constructor** init `cl_bali_log` cho Application Log:
   - Reference `ZAL_*` object name + subobject (vd `'JOB'`)
   - Subobject KHÔNG cần tạo riêng, chỉ là string identifier
5. **`save_log( assign_to_current_appl_job = abap_true )`** — bind log vào job đang chạy để Admin App "Application Jobs" show được log.
   - **KHÔNG dùng `save_log_2nd_db_connection`** trong APJ context — `save_log` chuẩn hơn vì nó tham gia LUW của job.
   - `save_log_2nd_db_connection` chỉ dùng khi cần log tách khỏi LUW chính (vd trong HTTP handler không có commit chính thức).

### Direct DDIC modify trong job (KHÔNG qua EML)

Job execute theo LUW riêng → dùng `MODIFY/INSERT/UPDATE/DELETE` trực tiếp + `COMMIT WORK AND WAIT`:

```abap
MODIFY zm901t FROM TABLE @ldt_modif.
COMMIT WORK AND WAIT.
```

**KHÔNG bắt buộc dùng EML/RAP BO trong job class** — chỉ dùng nếu cần draft hoặc trigger validation/determination. Job context thường ưu tiên direct DML cho tốc độ.

---

## Step 2 — Helper class (ZCL_*)

Tách logic non-RAP (build JSON, call API, transform data) ra `ZCL_<5chars>_<NN>`:

```abap
CLASS zcl_mi901_01 DEFINITION
  PUBLIC FINAL CREATE PUBLIC.

  PUBLIC SECTION.
    TYPES:
      gtt_mi901_01 TYPE STANDARD TABLE OF zi_mi901_01 WITH EMPTY KEY,
      gtt_zm901t   TYPE STANDARD TABLE OF zm901t WITH EMPTY KEY.

    " Public types (cho I/O với ZCJ class)
    TYPES: BEGIN OF gts_field,
             field001 TYPE c LENGTH 30,
             field002 TYPE c LENGTH 30,
             " ...
           END OF gts_field.
    TYPES: BEGIN OF gts_data,
             field001 TYPE string,
             " ...
           END OF gts_data.

    " CLASS-METHODS only — không cần instance state
    CLASS-METHODS data_set
      IMPORTING is_data TYPE zi_mi901_01
      CHANGING  cs_data TYPE zcl_send_acms=>gts_json_data.

    CLASS-METHODS field_set
      CHANGING cs_field TYPE zcl_send_acms=>gts_json_header.

    CLASS-METHODS build_data_send
      IMPORTING it_data    TYPE gtt_mi901_01
      EXPORTING es_out_dat TYPE zcl_send_acms=>gts_json_body.

    CLASS-METHODS build_modify_zm901t
      IMPORTING it_data   TYPE gtt_mi901_01
      EXPORTING et_result TYPE gtt_zm901t.

    CLASS-METHODS send_acms
      IMPORTING is_data           TYPE zcl_send_acms=>gts_json_body
      RETURNING VALUE(rf_success) TYPE abap_boolean.
ENDCLASS.
```

**Rules**:
- `CLASS-METHODS` (static) — không cần state giữa lần gọi
- Tách thành các bước nhỏ: `field_set` (build header), `data_set` (1 row), `build_data_send` (loop wrap), `build_modify_zm901t` (build update), `send_acms` (call API)
- Trả `rf_success` thay vì raise exception — job orchestrator quyết định có commit hay không
