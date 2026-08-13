---
name: rap-custom-entity
description: "Build CDS root custom entity with ABAP query provider on ABAP Cloud/BTP. Use when data is NOT backed by a Z table but computed/aggregated dynamically from joins, external sources, or runtime logic. Pattern: @ObjectModel.query.implementedBy: 'ABAP:ZCL_*' + class implementing if_rap_query_provider~select with build_condition (dynamic SQL from io_request->get_filter), build_orderby (from get_sort_elements), paging (from get_paging->get_page_size/get_offset), and set_response (set_data + set_total_number_of_records). Reference pattern: MI901 (ZI_MI901_03 + ZCL_MI901_03 query provider exposing PO data with filter/sort/paging). Trigger on: 'custom entity', 'query provider', 'root custom entity', 'if_rap_query_provider', '@ObjectModel.query.implementedBy', 'io_request', 'io_response', 'get_filter', 'get_paging', 'get_sort_elements', 'set_data', 'set_total_number_of_records', 'dynamic SQL CDS', 'no backing table'."
---

# RAP Custom Entity with Query Provider

CDS entity không có table backing — data sinh runtime qua ABAP class. Tham chiếu **ZI_MI901_03** + **ZCL_MI901_03** (expose PO data từ join CDS với filter/sort/paging logic custom).

## Reference files (progressive disclosure — đọc khi tới bước tương ứng)

| Nội dung | File |
|---------|------|
| Step 1 CDS custom entity + Step 2 query provider class (full code) + Exception classes + BDEF unmanaged | `references/query-provider.md` |

SKILL.md này = index + Critical rules mỗi step. Code khối lớn nằm ở reference file — chỉ đọc khi generate object đó (tránh nạp full context).

## Templates

| Object | Template |
|--------|---------|
| CDS custom entity | `.claude/templates/cds/cds-custom-entity.cds` |
| Query provider class | `.claude/templates/clas/zcl-query-provider.abap` |

## When to use

- Data dynamic (compute from external source, in-memory transform, parameterized query)
- Cần Fiori list report nhưng data không thể model trực tiếp qua CDS join chuẩn
- Action service: expose 1 entity virtual chỉ để hold action (vd `SendSelectedData`)
- Aggregation phức tạp không thể viết bằng pure CDS

KHÔNG dùng cho:
- Static data từ Z table → managed BO (rap-managed-bo)
- Pure CDS aggregation feasible → CDS view + association (rap-cds)
- Read SAP standard với filter đơn giản → projection on standard CDS

## Object inventory

| # | Object | Type | Naming |
|---|--------|------|--------|
| 1 | Custom Entity CDS | DDLS | `ZI_<5chars>_<NN>` |
| 2 | Query Provider Class | CLAS | `ZCL_<5chars>_<NN>` (cùng NN với CDS) |
| (opt) | BDEF (nếu cần action/UI behavior) | BDEF | `ZI_<5chars>_<NN>` (cùng tên CDS) |
| (opt) | Behavior Impl (nếu BDEF) | CLAS | `ZBP_I_<5chars>_<NN>` |
| (opt) | Service Definition + Binding | SRVD + SRVB | `ZSD_*` + `ZSB_U4_*` (xem rap-service) |

## Step 1 — Custom Entity CDS

→ Code DDL đầy đủ: **`references/query-provider.md` § Step 1**.

**Critical**:
- `define root custom entity` — KHÔNG dùng `define view entity` hoặc `define root view entity`
- `@ObjectModel.query.implementedBy: 'ABAP:<ClassName>'` BẮT BUỘC — chỉ runtime class
- Khai báo field type trực tiếp với `abap.*` types (KHÔNG có `as select from`)
- `@Semantics.amount.currencyCode` / `@Semantics.quantity.unitOfMeasure` / `@Semantics.unitOfMeasure: true` vẫn dùng được
- `@Metadata.allowExtensions: true` cho phép DDLX

## Step 2 — Query Provider Class

→ Code class đầy đủ (`select` + `check_data` + `get_main_data` + `build_condition` + `build_orderby` + `paging_data` + `set_response`): **`references/query-provider.md` § Step 2**.

**Critical**:
- Class implements `if_rap_query_provider`; chỉ `if_rap_query_provider~select` phải implement
- Flow: validate → fetch → paging → set_response (check `is_data_requested`/`is_total_numb_of_rec_requested` trước khi set)
- Filter extract via `get_as_ranges( )` + CATCH `cx_rap_query_filter_no_range`; raw WHERE via `get_as_sql_string( )`
- Anti-injection: `cl_abap_dyn_prg=>quote( )` cho mọi string ghép vào dynamic SQL
- Field name CDS ≠ DDIC column → map qua `REPLACE ... PCRE` trong `build_condition`
- Paging: clamp `ldf_top` ≥ 1 (tránh OFFSET error); sort default khi `get_sort_elements( )` empty

## API surface — `if_rap_query_provider`

### `if_rap_query_provider~select`
Entry point. 1 method duy nhất phải implement.

**`io_request` (REF TO if_rap_query_request)** — what client asks:

| Method | Returns | Purpose |
|--------|---------|---------|
| `get_entity_id( )` | string | CDS entity name |
| `is_data_requested( )` | abap_bool | client cần data hay chỉ count? |
| `is_total_numb_of_rec_requested( )` | abap_bool | client yêu cầu `$count`? |
| `get_filter( )` | REF TO if_rap_query_filter | filter object (xem dưới) |
| `get_paging( )` | REF TO if_rap_query_paging | `$top` + `$skip` |
| `get_sort_elements( )` | tt_sort_elements | `$orderby` parsed |
| `get_parameters( )` | tt_parameters | CDS parameters (`( P1 = X )`) |
| `get_requested_elements( )` | tt_requested_elements | `$select` parsed |
| `get_search_expression( )` | string | `$search` query string |
| `get_aggregation( )` | REF TO if_rap_query_aggregation | aggregations (sum/count/avg) |

**`io_response` (REF TO if_rap_query_response)** — what client gets:

| Method | Purpose |
|--------|---------|
| `set_data( it_data )` | data rows (already filtered+sorted+paged) |
| `set_total_number_of_records( iv_count )` | total count (ignore paging) |

### Filter API — `if_rap_query_filter`

| Method | Returns |
|--------|---------|
| `get_as_ranges( )` | structured ranges (vd `[{name:'IFID', range:[{sign:I,option:EQ,low:'X',high:''}]}]`) |
| `get_as_sql_string( )` | filter dưới dạng SQL WHERE string (đã quote, đã escape) |

Pattern:
- `get_as_ranges` khi cần extract field-specific filter để validate
- `get_as_sql_string` khi cần raw WHERE để paste vào dynamic SELECT (kết hợp `REPLACE` để substitute field tên CDS bằng field tên DDIC)

### Paging API — `if_rap_query_paging`

| Method | Returns |
|--------|---------|
| `get_page_size( )` | int8 (`$top`, default 0 = no paging) |
| `get_offset( )` | int8 (`$skip`) |

## Pattern decision

**Pattern 1: Push-down** (SELECT từ DB với WHERE/ORDER/UP TO dynamic):
- Phù hợp khi data trong DB và filter có thể map sang SQL
- Build condition + orderby string động → SELECT trực tiếp với UP TO/OFFSET
- Total count: SELECT COUNT(*) riêng nếu cần
- Hiệu năng tốt nhất

**Pattern 2: In-memory** (như MI901):
- SELECT toàn bộ rồi paging trong ABAP (`SELECT FROM @itab UP TO ldf_top OFFSET ldf_skip`)
- Phù hợp khi data nhỏ hoặc transform phức tạp sau SELECT
- Total count = `lines( ldt_data )`

**Pattern 3: External source**:
- Call external API/microservice → transform → return
- Pagination handled bởi external API → cần map io_request paging sang API page param

## Exception classes

→ Code local error class `lcx_query_error` (INHERITING FROM `cx_rap_query_provider`): **`references/query-provider.md` § Exception classes**.

Hoặc raise trực tiếp `cx_rap_query_provider` với `if_t100_message`.

## Khi cần BDEF

Custom entity có thể có BDEF unmanaged để declare action (vd `SendSelectedData` của MI901). → Code BDEF: **`references/query-provider.md` § Khi cần BDEF**.

Implementation: xem skill **rap-behavior** (CCIMP class với `FOR ACTION` method).

## Validation checklist

- [ ] CDS dùng `define root custom entity` (không `view entity`)
- [ ] `@ObjectModel.query.implementedBy: 'ABAP:ZCL_*'` đúng class name
- [ ] Field type khai báo trực tiếp (`abap.char(N)`, `abap.numc(N)`, `abap.curr(p,s)`...)
- [ ] Class implements `if_rap_query_provider`
- [ ] `select` method check `is_data_requested( )` + `is_total_numb_of_rec_requested( )` trước khi set
- [ ] Filter extract via `get_as_ranges( )` (kèm CATCH `cx_rap_query_filter_no_range`)
- [ ] Dynamic SQL field name từ CDS → DDIC column (REPLACE PCRE pattern)
- [ ] Paging: `get_page_size( )` < 0 → set 1 (tránh OFFSET error)
- [ ] Sort default khi `get_sort_elements( )` empty
- [ ] `cl_abap_dyn_prg=>quote( )` cho mọi string injection trong dynamic SQL (anti-injection)
- [ ] Exception type `cx_rap_query_provider` (hoặc subclass)

## Common pitfalls

| Lỗi | Triệu chứng | Fix |
|-----|------------|-----|
| `define view entity` thay vì `define root custom entity` | Activate fail, mismatch entity type | Đổi keyword |
| Quên `@ObjectModel.query.implementedBy` | Runtime: "No data provider" | Add annotation |
| String concatenation user input vào SQL | SQL injection | `cl_abap_dyn_prg=>quote( value )` |
| Field name CDS có alias khác DDIC | SELECT fail | Map qua REPLACE PCRE trong build_condition |
| Set `set_data` cả khi `is_data_requested = false` | Performance waste, hoặc lỗi | Check trước khi set |
| OFFSET với negative top | DB error | Clamp `ldf_top` ≥ 1 |
| Sort element name lowercase | ORDER BY case mismatch | Pass through hoặc UPPER convert tùy DB |

## Reference

- Package mẫu: `ZRAP_IF_MI901`
- Files: `ZI_MI901_03` (custom entity + query annotation), `ZCL_MI901_03` (query provider full pattern), `ZBP_I_MI901_03` (unmanaged BDEF với action), `ZSD_MI901_01` (service expose), `ZSB_U4_MI901_01` (Fiori binding)
- Full code: `references/query-provider.md`
