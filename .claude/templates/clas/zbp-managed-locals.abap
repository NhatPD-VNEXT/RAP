*"* use this source file for the definition and implementation of
*"* local helper classes, interface definitions and type
*"* declarations

CLASS lhc_Header DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.

    METHODS get_instance_features FOR INSTANCE FEATURES
      IMPORTING keys REQUEST requested_features FOR Header RESULT result.

    METHODS vldBeforeSave FOR VALIDATE ON SAVE
      IMPORTING keys FOR Header~vldBeforeSave.

    " Optional: determination on modify / on save
    METHODS det_default_values FOR DETERMINE ON MODIFY
      IMPORTING keys FOR Header~det_default_values.

ENDCLASS.

CLASS lhc_Header IMPLEMENTATION.

  METHOD get_instance_features.
    " Feature control: which fields editable / which actions enabled per instance
    READ ENTITIES OF {{DATA_MODEL}} IN LOCAL MODE
      ENTITY Header
        FIELDS ( SalesOrder DocumentNumber )
        WITH CORRESPONDING #( keys )
      RESULT DATA(ldt_header)
      FAILED failed.

    result = VALUE #( FOR ls_header IN ldt_header
                      ( %tky                = ls_header-%tky
                        %field-DocumentNumber = COND #(
                          WHEN ls_header-DocumentNumber IS NOT INITIAL
                          THEN if_abap_behv=>fc-f-read_only
                          ELSE if_abap_behv=>fc-f-unrestricted ) ) ).
  ENDMETHOD.

  METHOD vldBeforeSave.
    READ ENTITIES OF {{DATA_MODEL}} IN LOCAL MODE
      ENTITY Header
        FIELDS ( DocumentNumber )
        WITH CORRESPONDING #( keys )
      RESULT DATA(ldt_header).

    LOOP AT ldt_header INTO DATA(ls_header).
      IF ls_header-DocumentNumber IS INITIAL.
        APPEND VALUE #( %tky = ls_header-%tky ) TO failed-header.
        APPEND VALUE #( %tky = ls_header-%tky
                        %msg = new_message_with_text(
                                 severity = if_abap_behv_message=>severity-error
                                 text     = 'Document Number is required' )
                      ) TO reported-header.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD det_default_values.
    " Default value logic — runs on every modify
  ENDMETHOD.

ENDCLASS.


CLASS lsc_{{DATA_MODEL_LOWER}} DEFINITION INHERITING FROM cl_abap_behavior_saver.
  PROTECTED SECTION.
    METHODS save_modified REDEFINITION.
ENDCLASS.

CLASS lsc_{{DATA_MODEL_LOWER}} IMPLEMENTATION.
  METHOD save_modified.
    " Custom save logic. Managed save handled by framework — chỉ override khi cần unmanaged flush.
  ENDMETHOD.
ENDCLASS.
