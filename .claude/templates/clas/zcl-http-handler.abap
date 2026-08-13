"! <p class="shorttext synchronized" lang="ja">{{CASE_NAME}} HTTP Service Handler</p>
CLASS {{HTTP_HANDLER}} DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_http_service_extension.

  PRIVATE SECTION.

    TYPES: BEGIN OF gts_request_item,
             external_id TYPE string,
             amount      TYPE p LENGTH 13 DECIMALS 2,
             currency    TYPE waers,
             " ... per-business fields ...
           END OF gts_request_item,
           gtt_request_item TYPE STANDARD TABLE OF gts_request_item WITH EMPTY KEY.

    TYPES: BEGIN OF gts_response_item,
             external_id TYPE string,
             status      TYPE string,  " success / error
             message     TYPE string,
           END OF gts_response_item,
           gtt_response_item TYPE STANDARD TABLE OF gts_response_item WITH EMPTY KEY.

    METHODS handle_post
      IMPORTING io_request  TYPE REF TO if_web_http_request
                io_response TYPE REF TO if_web_http_response
      RAISING   cx_web_message_error.

ENDCLASS.


CLASS {{HTTP_HANDLER}} IMPLEMENTATION.

  METHOD if_http_service_extension~handle_request.

    DATA(lv_method) = request->get_header_field( '~request_method' ).
    DATA(lv_path)   = request->get_header_field( '~path' ).

    response->set_header_field(
      i_name  = 'Content-Type'
      i_value = 'application/json' ).

    CASE lv_method.
      WHEN 'POST'.
        TRY.
            handle_post(
              io_request  = request
              io_response = response ).
          CATCH cx_root INTO DATA(lx_root).
            response->set_status( i_code = 500 i_reason_phrase = 'Internal Server Error' ).
            response->set_text( |{ "error": "{ lx_root->get_text( ) }" }| ).
        ENDTRY.

      WHEN OTHERS.
        response->set_status( i_code = 405 i_reason_phrase = 'Method Not Allowed' ).
        response->set_text( '{"error":"only POST supported"}' ).
    ENDCASE.

  ENDMETHOD.

  METHOD handle_post.

    DATA ldt_request  TYPE gtt_request_item.
    DATA ldt_response TYPE gtt_response_item.

    " 1. Deserialize JSON
    TRY.
        /ui2/cl_json=>deserialize(
          EXPORTING json        = io_request->get_text( )
                    pretty_name = /ui2/cl_json=>pretty_mode-camel_case
          CHANGING  data        = ldt_request ).
      CATCH cx_root.
        io_response->set_status( i_code = 400 i_reason_phrase = 'Bad Request' ).
        io_response->set_text( '{"error":"invalid JSON"}' ).
        RETURN.
    ENDTRY.

    IF ldt_request IS INITIAL.
      io_response->set_status( i_code = 400 i_reason_phrase = 'Bad Request' ).
      io_response->set_text( '{"error":"empty request"}' ).
      RETURN.
    ENDIF.

    " 2. Process each item — accumulate per-record result
    DATA(lv_success_count) = 0.
    DATA(lv_error_count)   = 0.

    LOOP AT ldt_request INTO DATA(ls_item).
      TRY.
          " ===== Business logic per item =====
          " - Validate
          " - Call EML to BO interface / call outbound OData / write Z table
          " - Append response item
          " ===================================
          APPEND VALUE #( external_id = ls_item-external_id
                          status      = 'SUCCESS'
                          message     = 'OK' ) TO ldt_response.
          lv_success_count = lv_success_count + 1.
        CATCH cx_root INTO DATA(lx_root).
          APPEND VALUE #( external_id = ls_item-external_id
                          status      = 'ERROR'
                          message     = lx_root->get_text( ) ) TO ldt_response.
          lv_error_count = lv_error_count + 1.
      ENDTRY.
    ENDLOOP.

    " 3. Decide HTTP status
    DATA lv_status TYPE i.
    IF lv_error_count = 0.
      lv_status = 201.
    ELSEIF lv_success_count = 0.
      lv_status = 500.
    ELSE.
      lv_status = 200.    " partial success
    ENDIF.

    " 4. Serialize response
    io_response->set_status( i_code = lv_status ).
    io_response->set_text( /ui2/cl_json=>serialize(
      data        = ldt_response
      pretty_name = /ui2/cl_json=>pretty_mode-pascal_case ) ).

  ENDMETHOD.

ENDCLASS.
