# rap-http-service — Request routing & processing (Step 3–4)

> Thuộc SKILL.md `rap-http-service` § Step 3 (handle_request routing) và § Step 4 (process method: parse + validate + business + respond).

## Step 3 — Entry point: `handle_request`

```abap
METHOD if_http_service_extension~handle_request.
  DATA(ldf_path) = request->get_header_field( i_name = '~path' ).
  CASE ldf_path.
    WHEN gcf_path_gi.
      me->process_post_gi( io_request = request io_response = response ).
    WHEN OTHERS.
      response->set_status( i_code = 400 ).
      response->set_text( |{ TEXT-007 }| ).  " Path không tồn tại
      RETURN.
  ENDCASE.
ENDMETHOD.
```

**Path routing pattern**:
- 1 ZHS có thể serve nhiều sub-path
- `request->get_header_field( i_name = '~path' )` trả về full path incl. service prefix
- CASE phân nhánh theo path constant
- WHEN OTHERS → 400 với message

## Step 4 — Process method (parse + validate + business + respond)

```abap
METHOD process_post_gi.
  DATA: ldt_string_table TYPE gtt_request_string,
        lds_request      TYPE gts_request,
        ldt_response_pretty TYPE TABLE OF lts_response_pretty.

  " 1. Method check
  IF io_request->get_method( ) <> /iwbep/if_v4_pm_types=>gcs_http_method-post.
    io_response->set_status( i_code = 405 ).
    io_response->set_text( |{ TEXT-007 }| ).    " Method not allowed
    RETURN.
  ENDIF.

  " 2. Read raw JSON body
  DATA(ldf_req_body) = io_request->get_text( ).

  " 3. Deserialize JSON (camel_case keys -> ABAP fields)
  TRY.
      /ui2/cl_json=>deserialize(
        EXPORTING json        = ldf_req_body
                  pretty_name = /ui2/cl_json=>pretty_mode-camel_case
        CHANGING  data        = ldt_string_table ).
    CATCH cx_root.
      io_response->set_status( i_code = 400 ).
      io_response->set_text( |{ TEXT-006 }| ). " Invalid request
      RETURN.
  ENDTRY.

  IF ldt_string_table IS INITIAL.
    io_response->set_status( i_code = 400 ).
    io_response->set_text( |{ TEXT-006 }| ).
    RETURN.
  ENDIF.

  " 4. Convert string → typed + apply ALPHA
  LOOP AT ldt_string_table INTO DATA(ldf_string_table).
    TRY.
        lds_request-outbounddelivery     = |{ ldf_string_table-outbounddelivery     ALPHA = IN }|.
        lds_request-outbounddeliveryitem = |{ ldf_string_table-outbounddeliveryitem ALPHA = IN }|.
        lds_request-documentcode         = ldf_string_table-documentcode.
        lds_request-material             = zcl_com_conv=>conv_matn1_in(
                                             if_input = CONV matnr( ldf_string_table-material ) ).
        " Date validation
        IF strlen( ldf_string_table-actualgoodsmovementdate ) <> 8.
          io_response->set_status( i_code = 400 ).
          io_response->set_text( |{ TEXT-006 }| ).
          RETURN.
        ENDIF.
        APPEND lds_request TO gdt_request.
        CLEAR lds_request.
      CATCH cx_sy_conversion_no_number cx_sy_conversion_no_date.
        io_response->set_status( i_code = 400 ).
        io_response->set_text( |{ TEXT-006 }| ).
        RETURN.
    ENDTRY.
  ENDLOOP.

  " 5. Business processing — group by logical key, validate, call outbound
  LOOP AT gdt_request INTO DATA(lds_grp)
       GROUP BY ( documentcode     = lds_grp-documentcode
                  outbounddelivery = lds_grp-outbounddelivery ).
    DATA: ldt_request TYPE gtt_request, ldf_invalid TYPE abap_bool.
    CLEAR: ldt_request, ldf_invalid, gdf_message_error.
    LOOP AT GROUP lds_grp INTO DATA(lds_item).
      APPEND lds_item TO ldt_request.
    ENDLOOP.

    check_value_request(
      EXPORTING it_request    = ldt_request
      IMPORTING et_data_check = DATA(ldt_data_check)
                ef_invalid    = ldf_invalid ).

    IF ldf_invalid = abap_off.
      process_outbounddelivery( EXPORTING it_request = ldt_request ).
    ENDIF.
  ENDLOOP.

  " 6. Persist log via EML
  insert_log( ).

  " 7. Decide HTTP status based on success/error counts
  DATA(ldf_count_e) = REDUCE i( INIT sum = 0 FOR ls IN gdt_response
                                 WHERE ( status = gcf_error )
                                 NEXT sum = sum + 1 ).
  IF line_exists( gdt_response[ status = gcf_error ] ).
    IF lines( gdt_request ) > ldf_count_e.
      io_response->set_status( i_code = 200 ).    " partial success
    ELSE.
      io_response->set_status( i_code = 500 ).    " all failed
    ENDIF.
  ELSE.
    io_response->set_status( i_code = 201 ).      " all success
  ENDIF.

  " 8. Build pretty response (pascal_case)
  ldt_response_pretty = CORRESPONDING #( gdt_response MAPPING
    document_code          = documentcode
    outbound_delivery      = outbounddelivery
    outbound_delivery_item = outbounddeliveryitem ).

  DATA(ldf_json_string) = /ui2/cl_json=>serialize(
    EXPORTING data        = ldt_response_pretty
              pretty_name = /ui2/cl_json=>pretty_mode-pascal_case ).

  io_response->set_header_field( i_name = gcf_header_content i_value = gcf_content_type ).
  io_response->set_text( ldf_json_string ).

  FREE: gdt_request, gdt_response, gdt_log, gdf_message_error.
ENDMETHOD.
```
