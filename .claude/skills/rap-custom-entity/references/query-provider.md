# rap-custom-entity — Custom Entity CDS + Query Provider (full code)

> Chi tiết code Step 1, Step 2, Exception classes, BDEF của SKILL.md. Reference package **ZRAP_IF_MI901** (`ZI_MI901_03` + `ZCL_MI901_03`).

## Step 1 — Custom Entity CDS

```sql
@EndUserText.label: '<entity label>'
@ObjectModel.query.implementedBy: 'ABAP:ZCL_MI901_03'
@Metadata.allowExtensions: true
define root custom entity ZI_MI901_03
{
  key PurchaseOrder         : abap.char(10);
  key PurchaseOrderItem     : abap.numc(5);
      PurchaseOrderDate     : abap.dats(8);
      SendReferenceDate     : abap.dats(8);

      @Semantics.unitOfMeasure: true
      PurchaseOrderQuantityUnit : meins;

      DocumentCurrency : abap.cuky(5);

      @Semantics.amount.currencyCode: 'DocumentCurrency'
      NetPriceAmount : abap.curr(11,2);

      @Semantics.quantity.unitOfMeasure: 'PurchaseOrderQuantityUnit'
      OrderQuantity  : abap.quan(13,3);

      Material        : abap.char(40);
      Plant           : abap.char(4);
      IFID            : abap.char(30);
      Supplier        : abap.char(30);
      // ... other fields
}
```

## Step 2 — Query Provider Class

```abap
CLASS zcl_mi901_03 DEFINITION
  PUBLIC FINAL CREATE PUBLIC.

  PUBLIC SECTION.
    TYPES gtt_data TYPE STANDARD TABLE OF zi_mi901_03 WITH EMPTY KEY.
    INTERFACES if_rap_query_provider.

  PROTECTED SECTION.
  PRIVATE SECTION.
    METHODS check_data
      IMPORTING io_request TYPE REF TO if_rap_query_request
      RAISING   cx_rap_query_provider.

    METHODS get_main_data
      IMPORTING io_request TYPE REF TO if_rap_query_request
      EXPORTING et_data    TYPE gtt_data
      RAISING   cx_rap_query_provider.

    METHODS paging_data
      IMPORTING io_request     TYPE REF TO if_rap_query_request
                it_src_data    TYPE gtt_data
      EXPORTING et_target_data TYPE gtt_data.

    METHODS build_orderby
      CHANGING  it_sort_order     TYPE if_rap_query_request=>tt_sort_elements
      RETURNING VALUE(rf_orderby) TYPE string.

    METHODS build_condition
      IMPORTING io_request          TYPE REF TO if_rap_query_request
      RETURNING VALUE(rf_condition) TYPE string.

    METHODS set_response
      IMPORTING if_record   TYPE int8
                io_request  TYPE REF TO if_rap_query_request
                io_response TYPE REF TO if_rap_query_response
                it_data     TYPE gtt_data.
ENDCLASS.

CLASS zcl_mi901_03 IMPLEMENTATION.

  METHOD if_rap_query_provider~select.
    " 1. Validate parameters
    me->check_data( io_request ).

    " 2. Fetch all matching data (no paging yet)
    me->get_main_data(
      EXPORTING io_request = io_request
      IMPORTING et_data    = DATA(ldt_data) ).

    " 3. Apply paging in-memory
    me->paging_data(
      EXPORTING io_request     = io_request
                it_src_data    = ldt_data
      IMPORTING et_target_data = DATA(ldt_target_data) ).

    " 4. Set response
    me->set_response(
      EXPORTING if_record   = lines( ldt_data )
                io_request  = io_request
                io_response = io_response
                it_data     = ldt_target_data ).
  ENDMETHOD.

  METHOD check_data.
    " Extract specific filter ranges
    TRY.
        DATA(ldt_condition_range) = io_request->get_filter( )->get_as_ranges( ).
      CATCH cx_rap_query_filter_no_range.
        RETURN.
    ENDTRY.

    DATA(ldf_ifid_filter) = VALUE #( ldt_condition_range[ name = 'IFID' ]-range[ 1 ]-low OPTIONAL ).

    " Validate parameter against master data
    SELECT SINGLE zzvalue01
      FROM zy043t
      WHERE zztype = 'A' AND div = @ldf_ifid_filter
      INTO @DATA(ldf_zzvalue01).

    IF ldf_zzvalue01 IS INITIAL.
      RAISE EXCEPTION TYPE lcx_query_error
        EXPORTING textid = lcx_query_error=>no_parameter_config
                  msgv1  = ldf_ifid_filter.
    ENDIF.
  ENDMETHOD.

  METHOD get_main_data.
    DATA(ldf_condition) = me->build_condition( io_request ).

    SELECT * FROM zi_mi901_01
      WHERE (ldf_condition)
      INTO CORRESPONDING FIELDS OF TABLE @et_data.
  ENDMETHOD.

  METHOD build_condition.
    " Get user-provided filter as SQL string
    TRY.
        DATA(ldt_condition_range) = io_request->get_filter( )->get_as_ranges( ).
      CATCH cx_rap_query_filter_no_range.
        RETURN.
    ENDTRY.

    DATA(ldf_date_filter) = VALUE #( ldt_condition_range[ name = 'SENDREFERENCEDATE' ]-range[ 1 ]-low OPTIONAL ).
    DATA(ldf_condition) = io_request->get_filter( )->get_as_sql_string( ).

    " Replace virtual field with actual column
    IF ldf_date_filter IS NOT INITIAL.
      REPLACE ALL OCCURRENCES OF PCRE
        `\s*(SENDREFERENCEDATE)\s*=\s*'[^']*'\s*`
        IN ldf_condition WITH
        | LASTCHANGEDATELOCAL >= { cl_abap_dyn_prg=>quote( ldf_date_filter ) } |.
    ELSE.
      DATA(date_now) = cl_abap_context_info=>get_system_date( ).
      ldf_condition = |{ ldf_condition } AND LASTCHANGEDATELOCAL >= { cl_abap_dyn_prg=>quote( CONV string( date_now ) ) }|.
    ENDIF.

    rf_condition = ldf_condition.
  ENDMETHOD.

  METHOD build_orderby.
    DELETE ADJACENT DUPLICATES FROM it_sort_order COMPARING element_name.

    LOOP AT it_sort_order INTO DATA(lds_sort).
      DATA(ldf_direction) = COND #( WHEN lds_sort-descending = abap_true
                                    THEN 'DESCENDING'
                                    ELSE 'ASCENDING' ).
      rf_orderby = COND #(
        WHEN rf_orderby = '' THEN |{ lds_sort-element_name } { ldf_direction }|
        ELSE                       |{ rf_orderby } ,{ lds_sort-element_name } { ldf_direction }| ).
    ENDLOOP.

    IF rf_orderby IS INITIAL.
      rf_orderby = 'PURCHASEORDER, PURCHASEORDERITEM'.
    ENDIF.
    CONDENSE rf_orderby.
  ENDMETHOD.

  METHOD paging_data.
    DATA(ldf_top)              = io_request->get_paging( )->get_page_size( ).
    DATA(ldf_skip)             = io_request->get_paging( )->get_offset( ).
    DATA(ldf_requested_fields) = io_request->get_requested_elements( ).
    DATA(ldt_sort_order)       = io_request->get_sort_elements( ).

    IF ldf_top < 0.
      ldf_top = 1.
    ENDIF.

    DATA(ldf_sort) = me->build_orderby( CHANGING it_sort_order = ldt_sort_order ).

    SELECT *
      FROM @it_src_data AS it_src_data
      ORDER BY (ldf_sort)
      INTO TABLE @et_target_data
      UP TO @ldf_top ROWS
      OFFSET @ldf_skip.
  ENDMETHOD.

  METHOD set_response.
    IF io_request->is_total_numb_of_rec_requested( ).
      io_response->set_total_number_of_records( if_record ).
    ENDIF.

    IF io_request->is_data_requested( ).
      io_response->set_data( it_data ).
    ENDIF.
  ENDMETHOD.

ENDCLASS.
```

## Exception classes

```abap
" Local error class trong CCAU (locals_def):
CLASS lcx_query_error DEFINITION INHERITING FROM cx_rap_query_provider FINAL.
  PUBLIC SECTION.
    CONSTANTS:
      BEGIN OF no_parameter_config,
        msgid TYPE symsgid VALUE 'ZRAP_COM_99',
        msgno TYPE symsgno VALUE '011',
        attr1 TYPE scx_attrname VALUE 'MSGV1',
      END OF no_parameter_config.
    DATA msgv1 TYPE symsgv.
    METHODS constructor
      IMPORTING textid LIKE if_t100_message=>t100key OPTIONAL
                msgv1  TYPE   symsgv OPTIONAL
                previous LIKE previous OPTIONAL.
ENDCLASS.
```

Hoặc raise trực tiếp `cx_rap_query_provider` với `if_t100_message`.

## Khi cần BDEF

Custom entity có thể có BDEF unmanaged để declare action (vd `SendSelectedData` của MI901):

```abap
unmanaged implementation in class zbp_i_mi901_03 unique;
//strict ( 2 );

define behavior for ZI_MI901_03
//late numbering
lock master
authorization master ( global )
{
  action ( lock : none ) SendSelectedData;
//   static action SendAllData parameter ZA_MI901_03;
}
```

Implementation: xem skill **rap-behavior** (CCIMP class với `FOR ACTION` method).
