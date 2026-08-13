"! <p class="shorttext synchronized" lang="ja">{{CASE_NAME}} Outbound OData V4 Client</p>
CLASS {{HELPER_CLASS}} DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.

    CONSTANTS:
      gc_comm_scenario TYPE if_a4c_cp_service=>ty_comm_scenario_id VALUE '{{COMM_SCENARIO}}',
      gc_service_id    TYPE if_a4c_cp_service=>ty_service_id       VALUE '{{OUTBOUND_SERVICE_ID}}'.

    "! <p class="shorttext synchronized" lang="ja">PATCH entity update</p>
    METHODS patch_entity
      IMPORTING is_key  TYPE any
                is_data TYPE any
                it_fields TYPE if_web_http_client=>ty_provided_property_tab
      RAISING   cx_root.

    "! <p class="shorttext synchronized" lang="ja">Function Import POST</p>
    METHODS call_function_import
      IMPORTING iv_function TYPE string
                is_params   TYPE any
      RAISING   cx_root.

  PRIVATE SECTION.

    METHODS create_proxy
      RETURNING VALUE(ro_proxy) TYPE REF TO /iwbep/if_cp_client_proxy
      RAISING   cx_root.

    METHODS handle_remote_error
      IMPORTING io_exception TYPE REF TO /iwbep/cx_cp_remote
      RAISING   cx_root.

ENDCLASS.


CLASS {{HELPER_CLASS}} IMPLEMENTATION.

  METHOD create_proxy.

    DATA(lo_destination) = cl_http_destination_provider=>create_by_comm_arrangement(
      comm_scenario = gc_comm_scenario
      service_id    = gc_service_id
      comm_system_id = '' ).

    DATA(lo_http_client) = cl_web_http_client_manager=>create_by_http_destination( lo_destination ).

    ro_proxy = /iwbep/cl_cp_factory_remote=>create_v2_remote_proxy(
      EXPORTING
        is_proxy_details = VALUE #(
          relative_service_root = '/sap/opu/odata4/sap/{{SERVICE_PATH}}/srvd_a2x/sap/{{SERVICE_PATH}}/0001/' )
        io_http_client   = lo_http_client ).

  ENDMETHOD.

  METHOD patch_entity.
    TRY.
        DATA(lo_proxy) = create_proxy( ).

        DATA(lo_request) = lo_proxy->create_resource_for_entity_set( '{{ENTITY_SET}}' )
                                ->navigate_with_key( is_key )
                                ->create_request_for_update( /iwbep/if_cp_request_update=>gcs_update_semantic-patch ).

        lo_request->set_if_match( '*' ).
        lo_request->set_business_data(
          is_business_data    = is_data
          it_provided_property = it_fields ).

        DATA(lo_response) = lo_request->execute( ).

      CATCH /iwbep/cx_cp_remote INTO DATA(lx_remote).
        handle_remote_error( lx_remote ).
      CATCH cx_http_dest_provider_error
            /iwbep/cx_gateway
            cx_web_http_client_error INTO DATA(lx_root).
        RAISE EXCEPTION lx_root.
    ENDTRY.
  ENDMETHOD.

  METHOD call_function_import.
    TRY.
        DATA(lo_proxy) = create_proxy( ).

        DATA(lo_request) = lo_proxy->create_resource_for_function_import( iv_function )
                                ->set_parameter( is_params )
                                ->create_request( ).
        lo_request->set_http_method( /iwbep/if_cp_request=>gcs_http_method-post ).

        DATA(lo_response) = lo_request->execute( ).

      CATCH /iwbep/cx_cp_remote INTO DATA(lx_remote).
        handle_remote_error( lx_remote ).
      CATCH cx_root INTO DATA(lx_root).
        RAISE EXCEPTION lx_root.
    ENDTRY.
  ENDMETHOD.

  METHOD handle_remote_error.
    " Parse JSON error body from remote (Edm error envelope)
    DATA(lv_body) = io_exception->get_http_error_body( ).
    " ... parse + raise application exception ...
    RAISE EXCEPTION TYPE cx_root.
  ENDMETHOD.

ENDCLASS.
