# rap-if-dwh-send — Job class scaffolding (full code)

> Chi tiết Step 2–4 của SKILL.md: khai báo class (triple interface) + constructor, selection screen `get_parameters`, runtime `execute` + build range. Reference package **CI901** (`ZCJ_CI901_01`).

## Step 2 — Job class: khai báo (triple interface)

```abap
CLASS zcj_<pj>_01 DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES if_apj_dt_exec_object.   " design-time: get_parameters
    INTERFACES if_apj_rt_exec_object.   " runtime: execute( it_parameters )
    INTERFACES if_oo_adt_classrun.      " local test run (F9 trong ADT)
    METHODS constructor.
  PROTECTED SECTION.
  PRIVATE SECTION.
    CONSTANTS application_log_sub_obj1_name TYPE if_bali_object_handler=>ty_object
                                            VALUE 'ZRAP_IF_<PJ>'.   " = tên package
    " struct gửi: param + field(header) + data(rows)
    TYPES: BEGIN OF gts_svf_data_head,
             field001 TYPE string, field002 TYPE string, "... đủ số cột
           END OF gts_svf_data_head.
    DATA: BEGIN OF gds_out_dat_head,
            param TYPE zif_zrap_com_00=>gts_out_parameter,
            field TYPE zif_zrap_com_00=>gts_svf_field,
            data  TYPE STANDARD TABLE OF gts_svf_data_head WITH DEFAULT KEY,
          END OF gds_out_dat_head.
    DATA: application_log TYPE REF TO if_bali_log,
          gdf_nodata      TYPE c VALUE abap_true,
          gdf_err_flg     TYPE c LENGTH 1,
          gr_...           TYPE RANGE OF ...  " 1 range / select-option
          .
    METHODS m_move_to_range
      IMPORTING it_sel TYPE if_apj_rt_exec_object=>tt_templ_val
                if_key TYPE if_apj_dt_exec_object=>ty_templ_val-selname
      CHANGING  ct_range TYPE STANDARD TABLE.
    METHODS head_proc    IMPORTING if_div TYPE zzdiv EXPORTING ef_status TYPE string.
    METHODS field_set_head CHANGING cs_field TYPE zif_zrap_com_00=>gts_svf_field.
    METHODS data_set_head  IMPORTING is_data TYPE ... CHANGING cs_data TYPE gts_svf_data_head.
    METHODS m_post_to_api_head IMPORTING if_div TYPE zzdiv if_limitcnt TYPE i.
    METHODS m_add_text_to_app_log
      IMPORTING !value(if_severity) TYPE if_bali_item_setter=>ty_severity
                                    DEFAULT if_bali_constants=>c_severity_status
                if_text TYPE cl_bali_free_text_setter=>ty_text
      RAISING cx_bali_runtime.
ENDCLASS.
```

Constructor init app log với object **chung** `ZRAP_COM_00`, subobject = tên package:

```abap
METHOD constructor.
  TRY.
      application_log = cl_bali_log=>create_with_header(
        header = cl_bali_header_setter=>create(
          object      = zif_zrap_com_00=>gcf_app_log_object      " 'ZRAP_COM_00'
          subobject   = application_log_sub_obj1_name            " 'ZRAP_IF_<PJ>'
          external_id = '' ) ).
    CATCH cx_bali_runtime INTO DATA(root).
      RAISE EXCEPTION TYPE zcx_xco_runtime_exception EXPORTING previous = root.
  ENDTRY.
ENDMETHOD.
```

## Step 3 — Selection screen: get_parameters

```abap
METHOD if_apj_dt_exec_object~get_parameters.
  et_parameter_def = VALUE #(
    ( kind = if_apj_dt_exec_object=>parameter     datatype = 'D' length = '8'
      selname = 'P_TSTMP'  changeable_ind = abap_true mandatory_ind = abap_false param_text = TEXT-i01 )
    ( kind = if_apj_dt_exec_object=>select_option datatype = 'N' length = '4'
      selname = 'S_RYEAR'  changeable_ind = abap_true mandatory_ind = abap_false param_text = TEXT-i02 )
    " ... thêm select_option khác
  ).
ENDMETHOD.
```

- `kind`: `parameter` (1 giá trị) hoặc `select_option` (range).
- `datatype`/`length`: kiểu DDIC thô (`D`, `N`, `C`…). `param_text` = text symbol (TEXT-i0N).
- `selname` PHẢI khớp với `if_key` khi đọc trong execute.

## Step 4 — Runtime: execute + build range

```abap
METHOD if_apj_rt_exec_object~execute.   " signature: IMPORTING it_parameters TYPE tt_templ_val
  CLEAR: gr_ryear, ... .

  " parameter scalar:
  IF line_exists( it_parameters[ selname = 'P_TSTMP' ] ).
    gdf_tstmp = it_parameters[ selname = 'P_TSTMP' ]-low.
  ENDIF.
  " select-option → range:
  m_move_to_range( EXPORTING it_sel = it_parameters if_key = 'S_RYEAR' CHANGING ct_range = gr_ryear ).

  TRY.
      gdf_nodata = 'X'.                 " sẽ bị clear trong m_post khi có data
      head_proc( EXPORTING if_div = zif_zrap_com_00=>gcs_div-zrap_if_<pj>_1
                 IMPORTING ef_status = DATA(ldf_status) ).
      IF gdf_nodata IS NOT INITIAL.     " no data → status message
        MESSAGE s027(zrap_com_00) INTO DATA(gdt_msg).
        m_add_text_to_app_log( gdt_msg ).
        gdf_err_flg = 'S'.
      ENDIF.
    CATCH cx_root INTO DATA(lx).
      gdf_err_flg = 'E'.
      MESSAGE s013(zrap_com_00) WITH space INTO gdt_msg.
      m_add_text_to_app_log( if_severity = if_bali_constants=>c_severity_error
                             if_text = |{ gdt_msg } { lx->get_text( ) }| ).
  ENDTRY.
ENDMETHOD.

METHOD m_move_to_range.
  LOOP AT it_sel INTO DATA(lw) WHERE selname = if_key.
    APPEND INITIAL LINE TO ct_range ASSIGNING FIELD-SYMBOL(<r>).
    MOVE-CORRESPONDING lw TO <r>.       " sign/option/low/high
  ENDLOOP.
ENDMETHOD.
```
