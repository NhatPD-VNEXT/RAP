*"* Buffer pattern — unmanaged BO action push buffer, saver flush to DDIC.
*"* Reference: MI901 ZBP_I_MI901_03

CLASS lcl_buffer DEFINITION CREATE PRIVATE.
  PUBLIC SECTION.
    CLASS-DATA gdt_buffer TYPE STANDARD TABLE OF {{TABLE}} WITH EMPTY KEY.
    CLASS-METHODS get_instance RETURNING VALUE(ro_instance) TYPE REF TO lcl_buffer.
  PRIVATE SECTION.
    CLASS-DATA go_instance TYPE REF TO lcl_buffer.
ENDCLASS.

CLASS lcl_buffer IMPLEMENTATION.
  METHOD get_instance.
    IF go_instance IS NOT BOUND.
      go_instance = NEW lcl_buffer( ).
    ENDIF.
    ro_instance = go_instance.
  ENDMETHOD.
ENDCLASS.


CLASS lhc_{{DATA_MODEL_LOWER}} DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
    METHODS process_request FOR MODIFY
      IMPORTING keys FOR ACTION {{DATA_MODEL_ALIAS}}~ProcessRequest RESULT result.
ENDCLASS.

CLASS lhc_{{DATA_MODEL_LOWER}} IMPLEMENTATION.

  METHOD process_request.
    DATA(lo_buffer) = lcl_buffer=>get_instance( ).

    LOOP AT keys INTO DATA(ls_key).
      " Build record from action parameter
      DATA(ls_record) = VALUE {{TABLE}}(
        request_id = ls_key-%param-RequestId
        status     = 'P'
        " ... map other fields ...
        created_at = cl_abap_context_info=>get_system_date( )
        created_by = cl_abap_context_info=>get_user_technical_name( ) ).

      APPEND ls_record TO lo_buffer->gdt_buffer.
    ENDLOOP.

    " Return result via abstract entity
    result = VALUE #( FOR ls_key IN keys
                      ( %cid    = ls_key-%cid
                        %param  = VALUE #(
                          ResponseCode    = 'OK'
                          ResponseMessage = 'Queued for save' ) ) ).
  ENDMETHOD.

ENDCLASS.


CLASS lsc_{{DATA_MODEL_LOWER}} DEFINITION INHERITING FROM cl_abap_behavior_saver.
  PROTECTED SECTION.
    METHODS save_modified REDEFINITION.
    METHODS finalize     REDEFINITION.
    METHODS cleanup      REDEFINITION.
    METHODS cleanup_finalize REDEFINITION.
ENDCLASS.

CLASS lsc_{{DATA_MODEL_LOWER}} IMPLEMENTATION.

  METHOD save_modified.
    DATA(lo_buffer) = lcl_buffer=>get_instance( ).
    IF lo_buffer->gdt_buffer IS NOT INITIAL.
      MODIFY {{TABLE}} FROM TABLE @lo_buffer->gdt_buffer.
      CLEAR lo_buffer->gdt_buffer.
    ENDIF.
  ENDMETHOD.

  METHOD finalize.
  ENDMETHOD.

  METHOD cleanup.
    lcl_buffer=>get_instance( )->gdt_buffer = VALUE #( ).
  ENDMETHOD.

  METHOD cleanup_finalize.
  ENDMETHOD.

ENDCLASS.
