# rap-comm-outbound — Operations (PATCH / Function / Batch / response / verify)

> Reference cho **SKILL.md § Step 5, 6, 7, 10, 11, 12**. Đọc khi generate code build outbound operations.

## Step 5 — Pattern: Update entity (PATCH)

```abap
DATA: ls_entity_key             TYPE zsc_od_vi902_01=>tys_a_outb_delivery_header_typ,
      lds_business_data_patch   TYPE zsc_od_vi902_01=>tys_a_outb_delivery_header_typ,
      lo_resource               TYPE REF TO /iwbep/if_cp_resource_entity,
      lo_patch_request          TYPE REF TO /iwbep/if_cp_request_update.

" 1. Set entity key
ls_entity_key = VALUE #( delivery_document = if_outbound_doc ).

" 2. Build payload
lds_business_data_patch = VALUE #(
  actual_goods_movement_date = ldf_timeslamp
  actual_goods_movement_time = cl_abap_context_info=>get_system_time( ) ).

" 3. Navigate to entity instance
lo_resource = lo_client_proxy->create_resource_for_entity_set( 'A_OUTB_DELIVERY_HEADER' )
                ->navigate_with_key( ls_entity_key ).

" 4. Create PATCH request (PATCH semantic = update fields được chỉ định)
lo_patch_request = lo_resource->create_request_for_update(
  /iwbep/if_cp_request_update=>gcs_update_semantic-patch ).

" 5. If-Match header (mandatory cho update on SAP standard)
lo_patch_request->set_if_match( '*' ).

" 6. Set business data + tell framework field nào được provide (tránh overwrite null)
DATA ldt_fields_update TYPE /iwbep/if_cp_runtime_types=>ty_t_property_path.
ldt_fields_update = VALUE #( ( |ACTUAL_GOODS_MOVEMENT_DATE| )
                             ( |ACTUAL_GOODS_MOVEMENT_TIME| ) ).
lo_patch_request->set_business_data(
  EXPORTING
    is_business_data     = lds_business_data_patch
    it_provided_property = ldt_fields_update ).
```

**Note**:
- Entity set name UPPERCASE (`'A_OUTB_DELIVERY_HEADER'`) — phải khớp với metadata
- Field names trong `ldt_fields_update` UPPERCASE
- `set_if_match( '*' )` = update bất kể etag (SAP standard endpoints thường yêu cầu)
- Date type `actual_goods_movement_date` thường là `timestamp` (DateTimeOffset trong OData V4) — convert qua `CONVERT DATE ... TIME ... INTO TIME STAMP ... TIME ZONE 'UTC'`

## Step 6 — Pattern: Function import (POST action)

```abap
DATA: lds_parameter        TYPE zsc_od_vi902_01=>tys_parameters_6,
      lo_function          TYPE REF TO /iwbep/if_cp_resource_function,
      lo_function_request  TYPE REF TO /iwbep/if_cp_request_function.

" 1. Build parameter (struct sinh tự động trong consumption model class)
lds_parameter = VALUE #( delivery_document = if_outbound_doc ).

" 2. Get function resource
lo_function = lo_client_proxy->create_resource_for_function( 'POST_GOODS_ISSUE' ).
lo_function->set_parameter( is_parameter = lds_parameter ).

" 3. Create request
lo_function_request = lo_function->create_request( ).
lo_function_request->set_if_match( '*' ).
lo_function_request->set_http_method( /iwbep/if_v4_pm_types=>gcs_http_method-post ).
```

## Step 7 — Pattern: Batch + ChangeSet (atomic group)

Multiple operations cần atomic (success/fail together):

```abap
DATA: lo_batch_request     TYPE REF TO /iwbep/if_cp_request_batch,
      lo_changeset_request TYPE REF TO /iwbep/if_cp_request_changeset.

" 1. Batch container
lo_batch_request = lo_client_proxy->create_request_for_batch( ).

" 2. ChangeSet — operations bên trong sẽ atomic
lo_changeset_request = lo_batch_request->create_request_for_changeset( ).

" 3. Add operations (build PATCH + Function request như trên)
lo_changeset_request->add_request( io_request = lo_function_request ).
lo_changeset_request->add_request( io_request = lo_patch_request ).

" 4. Add changeset to batch
lo_batch_request->add_request( lo_changeset_request ).

" 5. Execute (1 HTTP roundtrip cho tất cả)
lo_batch_request->execute( ).

" 6. Check results
DATA(lo_check_batch) = lo_batch_request->check_execution( ).
DATA(lo_check_post)  = lo_changeset_request->check_execution( ).
```

**Semantics**:
- Batch: 1 HTTP call, có thể chứa nhiều ChangeSets
- ChangeSet: atomic group — nếu 1 operation fail thì tất cả rollback
- Non-changeset operations trong batch: independent (1 fail không ảnh hưởng cái khác)
- Use case: PATCH delivery header + POST goods issue trong cùng changeset = đảm bảo cả hai thành công hoặc không gì xảy ra

## Step 10 — Date/Time conversion

OData V4 `Edm.DateTimeOffset` map sang ABAP `timestamp` (DEC15):

```abap
DATA: ldf_timestamp TYPE timestampl,
      ldf_timezone  TYPE timezone VALUE 'UTC'.

CONVERT DATE if_movement_date
        TIME '000000'
        INTO TIME STAMP ldf_timestamp
        TIME ZONE ldf_timezone.

" Sử dụng:
lds_business_data_patch = VALUE #(
  actual_goods_movement_date = ldf_timestamp
  actual_goods_movement_time = cl_abap_context_info=>get_system_time( ) ).
```

## Step 11 — Extract response data

Sau khi `execute( )` thành công, lấy data từ response object:

```abap
DATA: lo_function_response TYPE REF TO /iwbep/if_cp_response_function,
      lt_business_data     TYPE TABLE OF ....

lo_function_response = lo_function_request->execute( ).
lo_function_response->get_business_data( IMPORTING ea_response_data = lt_business_data ).
```

## Step 12 — Verify outbound result (SELECT lookup)

Sau khi POST_GOODS_ISSUE thành công, query material document để đối chiếu:

```abap
SELECT i_materialdocumentitemtp~materialdocument,
       i_materialdocumentitemtp~materialdocumentyear,
       i_materialdocumentitemtp~deliverydocument,
       i_materialdocumentitemtp~deliverydocumentitem
  FROM i_materialdocumentitemtp WITH PRIVILEGED ACCESS
  INNER JOIN @gdt_request AS request
    ON i_materialdocumentitemtp~deliverydocument     = request~outbounddelivery
   AND i_materialdocumentitemtp~deliverydocumentitem = request~outbounddeliveryitem
  WHERE i_materialdocumentitemtp~reversedmaterialdocument IS INITIAL
    AND i_materialdocumentitemtp~goodsmovementiscancelled IS INITIAL
  INTO CORRESPONDING FIELDS OF TABLE @et_matdoc.
```

`WITH PRIVILEGED ACCESS` cần thiết khi user gọi HTTP service không có auth cho `i_materialdocumentitemtp`.
