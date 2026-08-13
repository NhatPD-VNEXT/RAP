"! <p class="shorttext synchronized" lang="ja">{{CASE_NAME}} Job Execution Class</p>
CLASS {{JOB_CLASS}} DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_apj_dt_exec_object.
    INTERFACES if_apj_rt_run.

    "! <p class="shorttext synchronized" lang="ja">Interface ID</p>
    DATA p_ifid     TYPE c LENGTH 10.
    "! <p class="shorttext synchronized" lang="ja">処理日付</p>
    DATA p_process_date TYPE d.

  PROTECTED SECTION.
  PRIVATE SECTION.

    CONSTANTS gc_aplo_name TYPE balsubobj VALUE '{{APP_LOG_OBJECT}}'.

    DATA mo_log TYPE REF TO if_bali_log.

    METHODS init_log
      RAISING cx_bali_runtime.

    METHODS save_log
      RAISING cx_bali_runtime.

    METHODS add_log_message
      IMPORTING iv_severity TYPE bali_severity
                iv_text     TYPE string.

ENDCLASS.


CLASS {{JOB_CLASS}} IMPLEMENTATION.

  METHOD if_apj_dt_exec_object~get_parameters.
    " Provide parameter metadata for ZJC catalog entry (optional override)
  ENDMETHOD.

  METHOD if_apj_rt_run~execute.

    TRY.
        init_log( ).
        add_log_message( iv_severity = if_bali_constants=>c_severity_status
                         iv_text     = |Start job. Interface: { p_ifid } Date: { p_process_date }| ).

        " ===== Business logic =====
        " 1. Read data
        " 2. Process / transform
        " 3. Modify DDIC table directly (job context)
        "    MODIFY {{TABLE}} FROM TABLE @ldt_records.
        "    COMMIT WORK AND WAIT.
        " ===========================

        add_log_message( iv_severity = if_bali_constants=>c_severity_status
                         iv_text     = |End job successfully| ).

      CATCH cx_root INTO DATA(lx_root).
        add_log_message( iv_severity = if_bali_constants=>c_severity_error
                         iv_text     = lx_root->get_text( ) ).
    ENDTRY.

    save_log( ).

  ENDMETHOD.

  METHOD init_log.
    mo_log = cl_bali_log=>create( ).
    mo_log->set_header( cl_bali_header_setter=>create(
      object      = gc_aplo_name
      subobject   = 'MAIN'
      external_id = CONV #( |{ p_ifid }_{ p_process_date }| ) ) ).
  ENDMETHOD.

  METHOD save_log.
    cl_bali_log_db=>get_instance( )->save_log(
      log                           = mo_log
      assign_to_current_appl_job    = abap_true ).
  ENDMETHOD.

  METHOD add_log_message.
    mo_log->add_item( cl_bali_free_text_setter=>create(
      severity = iv_severity
      text     = iv_text ) ).
  ENDMETHOD.

ENDCLASS.
