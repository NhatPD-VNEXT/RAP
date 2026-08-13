"! <p class="shorttext synchronized" lang="ja">{{CASE_NAME}} Query Provider</p>
CLASS {{HELPER_CLASS}} DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_rap_query_provider.
  PROTECTED SECTION.
  PRIVATE SECTION.

    METHODS build_where_clause
      IMPORTING io_request  TYPE REF TO if_rap_query_request
      RETURNING VALUE(rv_where) TYPE string
      RAISING   cx_rap_query_provider.

    METHODS build_orderby_clause
      IMPORTING io_request  TYPE REF TO if_rap_query_request
      RETURNING VALUE(rv_orderby) TYPE string.

ENDCLASS.


CLASS {{HELPER_CLASS}} IMPLEMENTATION.

  METHOD if_rap_query_provider~select.

    TRY.
        " 1. Build WHERE từ filter
        DATA(lv_where) = build_where_clause( io_request ).

        " 2. ORDER BY từ sort spec
        DATA(lv_orderby) = build_orderby_clause( io_request ).

        " 3. Paging
        DATA(lo_paging) = io_request->get_paging( ).
        DATA(lv_page_size) = lo_paging->get_page_size( ).
        DATA(lv_offset)    = lo_paging->get_offset( ).
        IF lv_page_size < 1.
          lv_page_size = 100.
        ENDIF.

        " 4. Fetch — push-down version. Use SELECT FROM @itab for in-memory.
        DATA ldt_result TYPE STANDARD TABLE OF {{TABLE}} WITH EMPTY KEY.

        SELECT *
          FROM {{TABLE}}
          WHERE (lv_where)
          ORDER BY (lv_orderby)
          INTO TABLE @ldt_result
          OFFSET @lv_offset
          UP TO @lv_page_size ROWS.

        " 5. Total count (chỉ tính khi UI yêu cầu)
        IF io_request->is_total_numb_of_rec_requested( ) = abap_true.
          SELECT COUNT(*)
            FROM {{TABLE}}
            WHERE (lv_where)
            INTO @DATA(lv_total).
          io_response->set_total_number_of_records( lv_total ).
        ENDIF.

        " 6. Trả data
        IF io_response->is_data_requested( ) = abap_true.
          io_response->set_data( ldt_result ).
        ENDIF.

      CATCH cx_root INTO DATA(lx_root).
        RAISE EXCEPTION TYPE cx_rap_query_provider
          EXPORTING textid   = cx_rap_query_provider=>internal_error
                    previous = lx_root.
    ENDTRY.

  ENDMETHOD.

  METHOD build_where_clause.
    " Extract dạng raw SQL string từ OData filter
    rv_where = io_request->get_filter( )->get_as_sql_string( ).

    " Map CDS field name → DDIC column name (vd SalesOrder → sales_order)
    REPLACE ALL OCCURRENCES OF PCRE `\bSalesOrder\b`     IN rv_where WITH `sales_order` IGNORING CASE.
    REPLACE ALL OCCURRENCES OF PCRE `\bDocumentNumber\b` IN rv_where WITH `document_number` IGNORING CASE.
    " ... thêm mapping cho mỗi field expose ...

    IF rv_where IS INITIAL.
      rv_where = `1 = 1`.
    ENDIF.
  ENDMETHOD.

  METHOD build_orderby_clause.
    DATA(ldt_sort) = io_request->get_sort_elements( ).
    LOOP AT ldt_sort INTO DATA(ls_sort).
      DATA(lv_field) = to_lower( ls_sort-element_name ).
      " Map alias → ddic column theo nhu cầu
      IF rv_orderby IS NOT INITIAL.
        rv_orderby = rv_orderby && `, `.
      ENDIF.
      rv_orderby = rv_orderby && lv_field &&
                   COND #( WHEN ls_sort-descending = abap_true THEN ` DESC` ELSE ` ASC` ).
    ENDLOOP.

    IF rv_orderby IS INITIAL.
      rv_orderby = `sales_order ASC`.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
