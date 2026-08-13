# rap-comm-outbound — Runtime setup (destination + proxy)

> Reference cho **SKILL.md § Step 4 — Runtime: Setup destination + proxy**. Đọc khi generate code khởi tạo outbound client.

## Step 4 — Runtime: Setup destination + proxy

```abap
CONSTANTS:
  gcf_comm_scenario TYPE if_com_management=>ty_cscn_id                 VALUE 'ZRAP_IF_VI902',
  gcf_service_id    TYPE if_com_management=>ty_cscn_outb_srv_id        VALUE 'ZOS_VI902_01_REST',
  gcf_model_id      TYPE /iwbep/if_cp_runtime_types=>ty_proxy_model_id VALUE 'ZSC_OD_VI902_01'.

DATA:
  lo_destination  TYPE REF TO if_http_destination,
  lo_http_client  TYPE REF TO if_web_http_client,
  lo_client_proxy TYPE REF TO /iwbep/if_cp_client_proxy.

TRY.
    " 1. Get HTTP destination từ Communication Arrangement
    lo_destination = cl_http_destination_provider=>create_by_comm_arrangement(
      comm_scenario = gcf_comm_scenario
      service_id    = gcf_service_id ).

    " 2. Build HTTP client
    lo_http_client = cl_web_http_client_manager=>create_by_http_destination( lo_destination ).
    ASSERT lo_http_client IS BOUND.

    " 3. Build OData V4 proxy (chọn create_v2_remote_proxy bất chấp tên — đây là OData V4 proxy version 2 của framework)
    lo_client_proxy = /iwbep/cl_cp_factory_remote=>create_v2_remote_proxy(
      EXPORTING
        is_proxy_model_key       = VALUE #(
          repository_id       = 'DEFAULT'
          proxy_model_id      = gcf_model_id
          proxy_model_version = '0001' )
        io_http_client           = lo_http_client
        iv_relative_service_root = '' ).
    ASSERT lo_client_proxy IS BOUND.

  CATCH cx_http_dest_provider_error INTO DATA(lx_dest).
    " Communication Arrangement không tồn tại / không active
    " ...
ENDTRY.
```
