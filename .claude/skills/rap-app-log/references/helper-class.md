# rap-app-log — Helper Class & Exception Wrapper

Full code cho SKILL.md § Helper class skeleton (reusable), Exception wrapper pattern.

## Helper class skeleton (reusable)

```abap
CLASS zcl_app_log_helper DEFINITION
  PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    CLASS-METHODS write_app_log
      IMPORTING if_object    TYPE if_bali_object_handler=>ty_object
                if_subobject TYPE if_bali_object_handler=>ty_object
                if_severity  TYPE if_bali_item_setter=>ty_severity
                if_message   TYPE string
                if_job_bound TYPE abap_boolean DEFAULT abap_true
      RAISING   zcx_xco_runtime_exception.
ENDCLASS.

CLASS zcl_app_log_helper IMPLEMENTATION.
  METHOD write_app_log.
    TRY.
        DATA(lo_log) = cl_bali_log=>create_with_header(
          header = cl_bali_header_setter=>create(
            object      = if_object
            subobject   = if_subobject
            external_id = '' ) ).

        DATA(lo_item) = cl_bali_free_text_setter=>create(
          severity = if_severity
          text     = if_message ).
        lo_item->set_detail_level( detail_level = '1' ).
        lo_log->add_item( item = lo_item ).

        IF if_job_bound = abap_true.
          cl_bali_log_db=>get_instance( )->save_log(
            log                        = lo_log
            assign_to_current_appl_job = abap_true ).
        ELSE.
          cl_bali_log_db=>get_instance( )->save_log_2nd_db_connection(
            log = lo_log ).
        ENDIF.

      CATCH cx_bali_runtime INTO DATA(lx).
        RAISE EXCEPTION NEW zcx_xco_runtime_exception( previous = lx ).
    ENDTRY.
  ENDMETHOD.
ENDCLASS.
```

Dùng:
```abap
zcl_app_log_helper=>write_app_log(
  if_object    = 'ZAL_MI901_01'
  if_subobject = 'JOB'
  if_severity  = if_bali_constants=>c_severity_error
  if_message   = |Order { ldf_order } failed: { ldf_reason }| ).
```

## Exception wrapper pattern

Khi `cx_bali_runtime` raise (rất hiếm — chỉ khi APLO không tồn tại), wrap thành Cloud-aware exception:

```abap
CATCH cx_bali_runtime INTO DATA(root_exception).
  RAISE EXCEPTION TYPE zcx_xco_runtime_exception
    EXPORTING previous = root_exception.
```

`zcx_xco_runtime_exception` inherit từ `cx_xco_runtime_exception` (Cloud standard).
