# rap-managed-bo — Behavior Implementation + Helper (full code)

> Chi tiết Step 8–9 của SKILL.md. Reference package **ZRAP_IF_VI901**.
> Class `ZBP_I_VI901_01` do ADT tự sinh skeleton sau khi BDEF activate. Logic thật nằm trong **CCIMP include / Local Types**, KHÔNG nằm trong global class.
> **MCP sap-adt**: read local types qua `get_class_include(system, "<class>", "implementations")`; edit qua `update_class_include(system, "<class>", "implementations", source)`. Deploy class: hỏi user confirm MCP vs local snapshot (xem `agent-generate-code.md` + `rap-generate § 2.CLAS`).

## Skeleton handler class (CCIMP `locals_imp`)

```abap
CLASS lhc_header DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PUBLIC SECTION.
    DATA:
      gdf_count_total   TYPE i VALUE 0,
      gdf_count_success TYPE i VALUE 0,
      gdf_count_warning TYPE i VALUE 0,
      gdf_count_error   TYPE i VALUE 0.

    CONSTANTS:
      gcf_criticality_error   TYPE i VALUE 1,
      gcf_criticality_warning TYPE i VALUE 2,
      gcf_criticality_success TYPE i VALUE 3.

  PRIVATE SECTION.
    METHODS get_instance_features FOR INSTANCE FEATURES
      IMPORTING keys REQUEST requested_features FOR header RESULT result.

    METHODS get_instance_authorizations FOR INSTANCE AUTHORIZATION
      IMPORTING keys REQUEST requested_authorizations FOR header RESULT result.

    METHODS get_global_authorizations FOR GLOBAL AUTHORIZATION
      IMPORTING REQUEST requested_authorizations FOR header RESULT result.

    METHODS precheck_delete FOR PRECHECK
      IMPORTING keys FOR DELETE header.

    METHODS get_data_file FOR DETERMINE ON MODIFY
      IMPORTING keys FOR header~getdatafile.

    METHODS create_so_po_documents FOR DETERMINE ON SAVE
      IMPORTING keys FOR header~createsopodocuments.

    METHODS vld_before_save FOR VALIDATE ON SAVE
      IMPORTING keys FOR header~vldbeforesave.
ENDCLASS.

CLASS lhc_header IMPLEMENTATION.
  METHOD get_instance_features.   ENDMETHOD.
  METHOD get_instance_authorizations. ENDMETHOD.
  METHOD get_global_authorizations.   ENDMETHOD.

  METHOD precheck_delete.
    DATA lds_reported LIKE LINE OF reported-header.
    LOOP AT keys INTO DATA(lds_key).
      IF lds_key-%is_draft = '00'.  " Active data, không cho delete
        CLEAR lds_reported.
        lds_reported-%tky = lds_key-%tky.
        lds_reported-%msg = new_message( id       = 'ZRAP_COM_99'
                                         number   = '007'
                                         severity = if_abap_behv_message=>severity-error ).
        APPEND lds_reported TO reported-header.
        APPEND VALUE #( %tky = lds_key-%tky ) TO failed-header.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD get_data_file.
    " Determination on modify — chạy khi field Attachment thay đổi
    READ ENTITIES OF zi_vi901_01 IN LOCAL MODE
      ENTITY header ALL FIELDS WITH CORRESPONDING #( keys )
      RESULT DATA(ldt_file_header)
      FAILED DATA(lds_header_failed).

    CHECK ldt_file_header IS NOT INITIAL.
    DATA(lds_files) = ldt_file_header[ 1 ].

    " ... business logic (parse file, build items) ...

    DATA: ldt_item_create TYPE TABLE FOR CREATE zi_vi901_01\_item.
    DATA  lds_item_create LIKE LINE OF ldt_item_create.

    " Build child items
    APPEND INITIAL LINE TO lds_item_create-%target ASSIGNING FIELD-SYMBOL(<lds_item>).
    <lds_item>-%key-attachmentuuid = lds_files-attachmentuuid.
    <lds_item>-%is_draft           = lds_files-%is_draft.
    " ... set fields ...

    lds_item_create-%is_draft       = lds_files-%is_draft.
    lds_item_create-attachmentuuid  = lds_files-attachmentuuid.
    APPEND lds_item_create TO ldt_item_create.

    MODIFY ENTITIES OF zi_vi901_01 IN LOCAL MODE
      ENTITY header
      CREATE BY \_item
        FIELDS ( customercode kitcode itemcode ... )
        AUTO FILL CID WITH ldt_item_create
      REPORTED DATA(ldt_reported_create).
  ENDMETHOD.

  METHOD create_so_po_documents.
    " Determination on save — chạy ngay trước save phase
    READ ENTITIES OF zi_vi901_01 IN LOCAL MODE
      ENTITY header BY \_item ALL FIELDS WITH CORRESPONDING #( keys )
      RESULT DATA(ldt_file_item)
      FAILED DATA(lds_read_failed).
    CHECK ldt_file_item IS NOT INITIAL.

    " Gọi helper class — chi tiết EML BO interface xem skill rap-bo-interface
    DATA(lo_helper) = NEW zcl_vi901_01( ).
    " ... loop + execute ...

    DATA ldt_data_for_item_upd TYPE TABLE FOR UPDATE zi_vi901_01\\item.
    " ... build update table ...

    MODIFY ENTITIES OF zi_vi901_01 IN LOCAL MODE
      ENTITY item
      UPDATE FIELDS ( sddocno sditemno prno pritemno ... )
      WITH ldt_data_for_item_upd
      REPORTED DATA(ldt_update_item_reported).

    MODIFY ENTITIES OF zi_vi901_01 IN LOCAL MODE
      ENTITY header
      UPDATE FIELDS ( totalcount successcount warningcount errorcount )
      WITH VALUE #( (
        %is_draft    = keys[ 1 ]-%is_draft
        %key         = keys[ 1 ]-%key
        totalcount   = gdf_count_total
        successcount = gdf_count_success
        warningcount = gdf_count_warning
        errorcount   = gdf_count_error
      ) )
      REPORTED DATA(lds_update_header_reported).

    reported = CORRESPONDING #( DEEP lds_update_header_reported ).
  ENDMETHOD.

  METHOD vld_before_save.
    READ ENTITIES OF zi_vi901_01 IN LOCAL MODE
      ENTITY header FIELDS ( AttachmentUUID FileName ) WITH CORRESPONDING #( keys )
      RESULT DATA(ldt_headers).

    READ ENTITIES OF zi_vi901_01 IN LOCAL MODE
      ENTITY header BY \_item FIELDS ( itemuuid ) WITH CORRESPONDING #( keys )
      RESULT DATA(ldt_items).

    IF ldt_items IS INITIAL.
      APPEND VALUE #( %tky = keys[ 1 ]-%tky ) TO failed-header.
      APPEND VALUE #( %tky = keys[ 1 ]-%tky
                      %msg = new_message( id       = 'ZRAP_COM_99'
                                          number   = '005'
                                          severity = if_abap_behv_message=>severity-error ) )
        TO reported-header.
    ENDIF.
  ENDMETHOD.
ENDCLASS.
```

## Pattern cheatsheet

| Mục đích | Method declaration | Tham số chính |
|---------|-------------------|--------------|
| Validation on save | `FOR VALIDATE ON SAVE IMPORTING keys FOR <alias>~<validation_name>` | `keys`, append `reported`/`failed` |
| Determination on modify | `FOR DETERMINE ON MODIFY IMPORTING keys FOR <alias>~<det_name>` | `keys` |
| Determination on save | `FOR DETERMINE ON SAVE IMPORTING keys FOR <alias>~<det_name>` | `keys` |
| Precheck | `FOR PRECHECK IMPORTING keys FOR <op> <alias>` | `keys`, append `reported`/`failed` |
| Instance features | `FOR INSTANCE FEATURES IMPORTING keys REQUEST requested_features FOR <alias> RESULT result` | set `result-%action-<name>` = `#disabled/#enabled` |
| Instance authorization | `FOR INSTANCE AUTHORIZATION IMPORTING keys REQUEST requested_authorizations FOR <alias> RESULT result` | `result-%update / %delete / %action-<name>` |
| Global authorization | `FOR GLOBAL AUTHORIZATION IMPORTING REQUEST requested_authorizations FOR <alias> RESULT result` | `result-%create` |
| Action (instance) | `FOR MODIFY IMPORTING keys FOR ACTION <alias>~<action_name> RESULT result` | `keys-%param`, append `result` |

## EML patterns

**Read entities**:
```abap
READ ENTITIES OF zi_xxx IN LOCAL MODE
  ENTITY <alias> ALL FIELDS WITH CORRESPONDING #( keys )
  RESULT DATA(ldt_x)
  FAILED DATA(lds_f).

" Read by association
READ ENTITIES OF zi_xxx IN LOCAL MODE
  ENTITY <alias> BY \_<assoc> ALL FIELDS WITH CORRESPONDING #( keys )
  RESULT DATA(ldt_children).

" Specific fields
READ ENTITIES OF zi_xxx IN LOCAL MODE
  ENTITY <alias> FIELDS ( Field1 Field2 ) WITH CORRESPONDING #( keys )
  RESULT DATA(ldt_x).
```

**Create children**:
```abap
DATA ldt_create TYPE TABLE FOR CREATE zi_xxx\_<assoc>.
DATA lds_create LIKE LINE OF ldt_create.

APPEND INITIAL LINE TO lds_create-%target ASSIGNING FIELD-SYMBOL(<lds_target>).
<lds_target>-%key-<parent_key>  = ...
<lds_target>-%is_draft          = ...
" set fields

lds_create-%is_draft       = ...
lds_create-<parent_key>    = ...
APPEND lds_create TO ldt_create.

MODIFY ENTITIES OF zi_xxx IN LOCAL MODE
  ENTITY <parent_alias>
  CREATE BY \_<assoc>
    FIELDS ( field1 field2 ... )
    AUTO FILL CID WITH ldt_create
  REPORTED DATA(ldt_rep).
```

**Update**:
```abap
DATA ldt_update TYPE TABLE FOR UPDATE zi_xxx\\<alias>.
" build update entries with %tky + fields...

MODIFY ENTITIES OF zi_xxx IN LOCAL MODE
  ENTITY <alias>
  UPDATE FIELDS ( field1 field2 ) WITH ldt_update
  REPORTED DATA(ldt_rep).
```

**Delete**:
```abap
DATA ldt_delete TYPE TABLE FOR DELETE zi_xxx\\<alias>.
MOVE-CORRESPONDING ldt_source TO ldt_delete.

MODIFY ENTITIES OF zi_xxx IN LOCAL MODE
  ENTITY <alias> DELETE FROM ldt_delete.
```

## Message API

```abap
" Simple message từ message class
APPEND VALUE #( %tky = lds_key-%tky
                %msg = new_message( id       = 'ZRAP_COM_99'
                                    number   = '003'
                                    severity = if_abap_behv_message=>severity-error
                                    v1       = ldf_field_name ) )
  TO reported-<alias>.

" Severity options: severity-error / severity-warning / severity-information / severity-success
" Cũng có alias: ms-error, ms-warning... trong vài class
```

## `%is_draft` semantics

| Value | Meaning |
|-------|---------|
| `'00'` | Active record (saved) |
| `'01'` | Draft record |

Check trong precheck/validation để phân biệt logic Active vs Draft.

## Saver class skeleton

```abap
CLASS lsc_zi_vi901_01 DEFINITION INHERITING FROM cl_abap_behavior_saver.
  PROTECTED SECTION.
    METHODS finalize          REDEFINITION.
    METHODS check_before_save REDEFINITION.
    METHODS save              REDEFINITION.
    METHODS cleanup           REDEFINITION.
    METHODS cleanup_finalize  REDEFINITION.
ENDCLASS.

CLASS lsc_zi_vi901_01 IMPLEMENTATION.
  METHOD finalize.   ENDMETHOD.
  METHOD check_before_save. ENDMETHOD.
  METHOD save.
    " Implement nếu cần ghi xuống legacy table (không qua mapping) hoặc buffer pattern
  ENDMETHOD.
  METHOD cleanup.   ENDMETHOD.
  METHOD cleanup_finalize. ENDMETHOD.
ENDCLASS.
```

Trong managed BO bình thường, để `save` rỗng — framework tự ghi qua `mapping for`. Chỉ override khi cần custom logic (vd buffer pattern như MI901).

## Step 9 — Helper class (optional)

Khi cần parallel processing hoặc EML BO interface call phức tạp, viết helper class riêng:

```abap
CLASS zcl_vi901_01 DEFINITION
  PUBLIC FINAL
  INHERITING FROM cl_abap_parallel
  CREATE PUBLIC.

  PUBLIC SECTION.
    TYPES:
      BEGIN OF gts_filedata,
        " TSV/CSV row schema
        customercode TYPE zi_vi901_02-customercode,
        ...
      END OF gts_filedata,
      gtt_filedata TYPE TABLE OF gts_filedata,

      BEGIN OF gts_parallel_input,
        file_item TYPE zi_vi901_02,
      END OF gts_parallel_input,

      BEGIN OF gts_parallel_output,
        file_item_upd TYPE gtt_vi901_02,
      END OF gts_parallel_output.

    CLASS-METHODS convert_data_file
      IMPORTING is_file_data   TYPE gts_filedata
      RETURNING VALUE(rs_item) TYPE zi_vi901_02.

    METHODS execute_parallel
      IMPORTING is_input         TYPE gts_parallel_input-file_item
      RETURNING VALUE(rs_output) TYPE gts_parallel_output.

    METHODS do REDEFINITION.

    METHODS main_process
      IMPORTING is_input        TYPE gts_parallel_input-file_item
      RETURNING VALUE(rs_ouput) TYPE gts_parallel_output.

    METHODS create_salesorder
      IMPORTING is_file_item_proc TYPE gts_parallel_input-file_item
      EXPORTING ef_success TYPE abap_boolean
                ef_message TYPE string
                ef_severity TYPE if_abap_behv_message=>t_severity
                ef_sodoc    TYPE zi_vi901_02-sddocno
                ef_soitemno TYPE zi_vi901_02-sditemno.
ENDCLASS.
```

Nội dung `create_salesorder` / `create_purchaseorder` dùng EML gọi BO interface — xem skill **rap-bo-interface**. Parallel pattern chi tiết — xem skill **rap-parallel-multithread**.
