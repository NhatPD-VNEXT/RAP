# rap-http-service — Handler class skeleton (Step 2)

> Thuộc SKILL.md `rap-http-service` § Step 2 — Handler Class skeleton. Full TYPES + method declarations của `ZCL_HS_*` implementing `if_http_service_extension`. Reference: `ZCL_HS_VI902_01` trong ZRAP_IF_VI902.

```abap
CLASS zcl_hs_vi902_01 DEFINITION
  PUBLIC
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_http_service_extension.

    CONSTANTS:
      gcf_comm_scenario  TYPE if_com_management=>ty_cscn_id          VALUE 'ZRAP_IF_VI902',
      gcf_service_id     TYPE if_com_management=>ty_cscn_outb_srv_id VALUE 'ZOS_VI902_01_REST',
      gcf_path_gi        TYPE string VALUE '/sap/bc/http/sap/zhs_vi902_01/GoodsIssue',
      gcf_header_content TYPE string VALUE 'content-type',
      gcf_content_type   TYPE string VALUE 'application/json; charset=UTF-8',
      gcf_error          TYPE c LENGTH 1 VALUE 'E',
      gcf_success        TYPE c LENGTH 1 VALUE 'S'.

    " Request payload — type string trước (raw JSON), parse sau
    TYPES:
      BEGIN OF gts_request_string,
        documentcode         TYPE string,
        outbounddelivery     TYPE string,
        outbounddeliveryitem TYPE string,
        material             TYPE string,
        " ...
      END OF gts_request_string,
      gtt_request_string TYPE STANDARD TABLE OF gts_request_string WITH EMPTY KEY.

    " Request after conversion to typed
    TYPES:
      BEGIN OF gts_request,
        documentcode         TYPE i_outbounddeliveryitemtp-goodsmovementtype,
        outbounddelivery     TYPE i_outbounddeliveryitemtp-outbounddelivery,
        outbounddeliveryitem TYPE i_outbounddeliveryitemtp-outbounddeliveryitem,
        material             TYPE i_outbounddeliveryitemtp-material,
        " ...
      END OF gts_request,
      gtt_request TYPE STANDARD TABLE OF gts_request WITH EMPTY KEY.

    " Response payload — string fields for free formatting
    TYPES:
      BEGIN OF gts_response,
        documentcode         TYPE string,
        outbounddelivery     TYPE string,
        outbounddeliveryitem TYPE string,
        status               TYPE string,
        message              TYPE string,
      END OF gts_response,
      gtt_response TYPE STANDARD TABLE OF gts_response.

    " Pretty response — pascal_case keys cho JSON output
    TYPES:
      BEGIN OF lts_response_pretty,
        Document_Code          TYPE string,
        Outbound_Delivery      TYPE string,
        Outbound_Delivery_Item TYPE string,
        status                 TYPE string,
        message                TYPE string,
      END OF lts_response_pretty.

    " Log entry — type table FOR CREATE để insert qua EML
    TYPES: gtt_log TYPE TABLE FOR CREATE zi_vi902_01.

    " Error JSON parser types
    TYPES: BEGIN OF gts_errordetail,
             code         TYPE string,
             message      TYPE string,
             longtext_url TYPE string,
             propertyref  TYPE string,
             severity     TYPE string,
             transition   TYPE abap_bool,
             target       TYPE string,
           END OF gts_errordetail.
    TYPES gtt_errordetails TYPE STANDARD TABLE OF gts_errordetail WITH DEFAULT KEY.
    TYPES: BEGIN OF gts_innererror,
             errordetails TYPE gtt_errordetails,
           END OF gts_innererror.
    TYPES: BEGIN OF gts_message,
             lang  TYPE string,
             value TYPE string,
           END OF gts_message.
    TYPES: BEGIN OF gts_error,
             code       TYPE string,
             message    TYPE gts_message,
             innererror TYPE gts_innererror,
           END OF gts_error.
    TYPES: BEGIN OF gts_response_err,
             error TYPE gts_error,
           END OF gts_response_err.

    " Instance state — collect across requests in batch
    DATA:
      gdt_request       TYPE gtt_request,
      gdt_response      TYPE gtt_response,
      gdt_log           TYPE gtt_log,
      gdf_message_error TYPE string.

    " Methods (xem implementation bên dưới)
    METHODS:
      process_post_gi
        IMPORTING io_request  TYPE REF TO if_web_http_request
                  io_response TYPE REF TO if_web_http_response,
      check_value_request
        IMPORTING it_request    TYPE gtt_request
        EXPORTING et_data_check TYPE gtt_data_check
                  ef_invalid    TYPE abap_bool,
      set_log
        IMPORTING is_request TYPE gts_request
                  if_message TYPE string,
      append_error_message
        IMPORTING if_new_message TYPE string,
      insert_log,
      get_text_error_json
        IMPORTING io_http_error TYPE REF TO /iwbep/cx_cp_remote
        EXPORTING ef_text_error TYPE string.

ENDCLASS.
```
