---
name: rap-comm-outbound
description: "Call external OData V4 services from ABAP Cloud/BTP via Communication Arrangement. Covers Consumption Model (ZSC_OD_*) auto-generating proxy classes, Communication Scenario (SCO1), Outbound Service (SCO3/REST), Communication Arrangement (admin), and runtime patterns: cl_http_destination_provider, cl_web_http_client_manager, /iwbep/cl_cp_factory_remote, batch+changeset, entity PATCH update, Function Import POST, If-Match header, exception ladder (cx_http_dest_provider_error / /iwbep/cx_cp_remote / /iwbep/cx_gateway / cx_web_http_client_error), error JSON parsing. Reference pattern: VI902 (calling A_OutbDeliveryHeader PATCH + POST_GOODS_ISSUE function import). Trigger on: 'outbound API', 'consumption model', 'ZSC_OD_', 'ZOS_', 'communication arrangement', 'communication scenario', 'outbound service', 'client proxy', '/iwbep/cl_cp_factory_remote', 'create_v2_remote_proxy', 'create_resource_for_entity_set', 'create_resource_for_function', 'create_request_for_batch', 'create_request_for_changeset', 'set_if_match', 'cx_http_dest_provider_error', 'cx_cp_remote', 'PATCH update', 'POST_GOODS_ISSUE', 'A_OUTB_DELIVERY'."
---

# RAP Communication Outbound (OData V4 Client)

Gọi OData V4 service từ ABAP Cloud (vd gọi `A_OutbDeliveryHeader` để update + POST_GOODS_ISSUE) — tham chiếu **ZRAP_IF_VI902** (handler `ZCL_HS_VI902_01` gọi outbound).

## Reference files (progressive disclosure — đọc khi tới bước tương ứng)

| Step | Nội dung | File |
|------|---------|------|
| Step 4 | Runtime setup destination + OData V4 proxy (full code) | `references/runtime-proxy.md` |
| Step 5–7, 10–12 | PATCH update, Function import, Batch+ChangeSet, date/time convert, extract response, verify (full code) | `references/operations.md` |
| Step 8–9 | Exception ladder + parse remote error JSON (full code) | `references/errors.md` |

SKILL.md này = index + Critical rules mỗi step. Code khối lớn nằm ở reference file — chỉ đọc khi generate object đó (tránh nạp full context). Step 1–3 (ADT/admin config) prose đầy đủ ngay dưới đây.

## Templates

| Object | Template |
|--------|---------|
| Outbound client class | `.claude/templates/clas/zcl-outbound-client.abap` |
| Consumption Model `ZSC_OD_*` | **Manual ADT** — New → Service Consumption Model from Remote |
| Communication Scenario `ZRAP_IF_*` | **Manual ADT** |
| Communication Arrangement | **Manual Fiori admin** (runtime config) |

## When to use

- Gọi SAP S/4 standard OData API từ Z code (vd A_PurchaseOrder, A_OutbDelivery, A_SalesOrder)
- Gọi 3rd-party OData service
- Cần batch (transaction) + changeset (atomic group) trên nhiều operation

KHÔNG dùng cho:
- Internal EML BO call → dùng skill `rap-bo-interface`
- HTTP REST non-OData → dùng `cl_http_destination_provider` + `cl_web_http_client` thẳng + JSON parser

## Object inventory

| # | Object | Type | Naming | Tạo qua |
|---|--------|------|--------|---------|
| 1 | Consumption Model | SRVC | `ZSC_OD_<5chars>_<NN>` | ADT từ Service URL (auto-sinh class proxy) |
| 1g | Auto-generated proxy class | CLAS | `ZSC_OD_<5chars>_<NN>` (cùng tên) | ADT auto |
| 2 | Communication Scenario | SCO1 | `<PACKAGE_NAME>` (vd `ZRAP_IF_VI902`) | ADT thủ công |
| 3 | Outbound Service | SCO3 | `ZOS_<5chars>_<NN>_<TYPE>` (TYPE = REST/SOAP) | Trong Communication Scenario |
| 4 | Communication Arrangement | (admin) | manual config in S/4 Cloud admin | UI: "Communication Arrangements" |

## Step 1 — Consumption Model (ZSC_OD_*)

**Tạo qua ADT** (KHÔNG có MCP tool):
1. Right-click package → New → Service Consumption Model
2. Name: `ZSC_OD_<5chars>_<NN>` (OD = OData, hoặc RF = RFC, WS = Web Service)
3. Service Type: OData V4 Remote (hoặc V2)
4. Source: upload metadata XML (lấy từ `https://<host>/sap/opu/odata4/<service_path>/$metadata`)
5. ADT auto-generate class `ZSC_OD_<5chars>_<NN>` chứa:
   - Tất cả type cho Entity, ComplexType, Function/Action parameter
   - Key structures (`tys_a_outb_delivery_header_typ`...)
   - Parameter structures (`tys_parameters_1` cho function 1, etc.)

KHÔNG sửa class proxy — re-generate khi metadata thay đổi.

### Naming variants

| Service type | Suffix |
|--------------|--------|
| OData | `OD` |
| RFC | `RF` |
| Web Service / SOAP | `WS` |

## Step 2 — Communication Scenario (SCO1)

**Tạo qua ADT** (KHÔNG có MCP):
1. Right-click package → New → Communication Scenario
2. Name: `<PACKAGE_NAME>` (= tên package) — convention vì 1 package 1 scenario
3. Add **Outbound Service**:
   - Name: `ZOS_<5chars>_<NN>_REST` (REST cho OData V4)
   - Communication Arrangement Service ID: cùng tên `ZOS_*_REST`
   - Reference Consumption Model `ZSC_OD_<5chars>_<NN>`

## Step 3 — Communication Arrangement (Admin)

**Bên S/4 Cloud admin App** (KHÔNG có code):
1. App "Communication Arrangements" → New
2. Scenario: chọn `<PACKAGE_NAME>` vừa tạo
3. Communication System: chọn/tạo system pointing to target host
4. Outbound Service: tự lookup từ scenario, fill URL path
5. Save → Activate

→ Admin có thể swap host (sandbox vs prod) qua Communication System mà không sửa code.

## Step 4 — Runtime: Setup destination + proxy

Get HTTP destination từ Communication Arrangement → build HTTP client → build OData V4 proxy. → Code đầy đủ: **`references/runtime-proxy.md`**.

Critical:
- `cl_http_destination_provider=>create_by_comm_arrangement( comm_scenario = ... service_id = ... )` — KHÔNG hardcode URL
- `cl_web_http_client_manager=>create_by_http_destination( ... )` build client
- `/iwbep/cl_cp_factory_remote=>create_v2_remote_proxy` cho OData V4 (bất chấp tên "v2" — đây là proxy framework version 2)
- `proxy_model_version = '0001'`, `repository_id = 'DEFAULT'`

## Step 5 — Pattern: Update entity (PATCH)

Navigate entity by key → `create_request_for_update( ...gcs_update_semantic-patch )`. → Code đầy đủ: **`references/operations.md` § Step 5**.

Critical:
- Entity set name UPPERCASE (`'A_OUTB_DELIVERY_HEADER'`) khớp metadata
- `set_if_match( '*' )` mandatory cho update on SAP standard
- `set_business_data` kèm `it_provided_property` (UPPERCASE field names) để PATCH chỉ field cần update, tránh overwrite null

## Step 6 — Pattern: Function import (POST action)

`create_resource_for_function( 'POST_GOODS_ISSUE' )` → set_parameter → create_request. → Code đầy đủ: **`references/operations.md` § Step 6**.

Critical: `set_if_match( '*' )` + `set_http_method( ...gcs_http_method-post )`. Parameter struct (`tys_parameters_N`) auto-sinh trong consumption model class.

## Step 7 — Pattern: Batch + ChangeSet (atomic group)

`create_request_for_batch` → `create_request_for_changeset` → add operations → execute. → Code đầy đủ: **`references/operations.md` § Step 7**.

Critical:
- ChangeSet = atomic group (1 fail → tất cả rollback); non-changeset ops trong batch independent
- Batch = 1 HTTP roundtrip; `check_execution( )` để verify từng request
- Use case: PATCH header + POST goods issue cùng changeset → cả hai thành công hoặc không gì xảy ra

## Step 8 — Exception ladder (BẮT BUỘC)

Catch từ specific → generic. → Code đầy đủ: **`references/errors.md` § Step 8**.

Critical: order `/iwbep/cx_cp_remote` (có error body) → `cx_http_dest_provider_error` → `/iwbep/cx_gateway` → `cx_web_http_client_error` → `cx_root`.

## Step 9 — Parse remote error JSON

Deserialize `io_http_error->http_error_body` qua `/ui2/cl_json` → lấy first `errordetails` message. → Code + JSON format + type note: **`references/errors.md` § Step 9**.

Critical: SAP standard OData V4 error = `error.innererror.errordetails[]`; type definitions xem skill **rap-http-service** § Step 2.

## Step 10 — Date/Time conversion

OData V4 `Edm.DateTimeOffset` map sang ABAP `timestamp` (DEC15) qua `CONVERT DATE ... INTO TIME STAMP ... TIME ZONE 'UTC'`. → Code: **`references/operations.md` § Step 10**.

## Step 11 — Extract response data

Sau `execute( )` thành công lấy data qua `lo_..._response->get_business_data( ... )`. → Code: **`references/operations.md` § Step 11**.

## Step 12 — Verify outbound result (SELECT lookup)

Query material document đối chiếu sau POST_GOODS_ISSUE (SELECT ... `WITH PRIVILEGED ACCESS`). → Code: **`references/operations.md` § Step 12**.

## Validation checklist

- [ ] ZSC_OD_* consumption model đã tạo + activate (proxy class auto-generate xong)
- [ ] Communication Scenario SCO1 = tên package (vd `ZRAP_IF_VI902`)
- [ ] Outbound Service `ZOS_<5chars>_<NN>_REST` đã add vào scenario
- [ ] Communication Arrangement đã setup bên admin (Communication System + Arrangement)
- [ ] Code dùng `cl_http_destination_provider=>create_by_comm_arrangement` (KHÔNG hardcode URL)
- [ ] Proxy version: `create_v2_remote_proxy` cho OData V4 (đừng nhầm OData V2)
- [ ] `set_if_match( '*' )` cho PATCH (mandatory với SAP standard)
- [ ] `set_business_data` kèm `it_provided_property` để PATCH chỉ field cần update
- [ ] Entity set/Function name UPPERCASE khớp metadata
- [ ] Batch + ChangeSet khi cần atomic
- [ ] Exception ladder đầy đủ: `/iwbep/cx_cp_remote` → `cx_http_dest_provider_error` → `/iwbep/cx_gateway` → `cx_web_http_client_error` → `cx_root`
- [ ] Error JSON parser cho `/iwbep/cx_cp_remote->http_error_body`
- [ ] Date OData V4 → `timestamp` (DEC15) qua `CONVERT DATE ... INTO TIME STAMP`

## Common pitfalls

| Lỗi | Triệu chứng | Fix |
|-----|------------|-----|
| Hardcode URL trong code | Admin không thể swap host sandbox/prod | Dùng `cl_http_destination_provider=>create_by_comm_arrangement` |
| Quên `set_if_match( '*' )` | PATCH fail with 412 Precondition Failed | Set trước khi execute |
| Quên `it_provided_property` | PATCH overwrite field null về initial | Liệt kê đúng field upload |
| Entity set name lowercase | 404 Not Found | UPPERCASE (`'A_OUTB_DELIVERY_HEADER'`) |
| Date type Edm.DateTimeOffset chỉ pass `abap.dats` | Type mismatch | Convert sang `timestamp` (DEC15) |
| Communication Arrangement chưa active | `cx_http_dest_provider_error` runtime | Activate trong admin |
| Re-generate proxy nhưng quên activate | Type mismatch khi compile | Activate ZSC_OD_* class |
| Chỉ catch `cx_root` | Mất chi tiết error response | Catch `/iwbep/cx_cp_remote` riêng để parse `http_error_body` |

## Reference

- Package mẫu: `ZRAP_IF_VI902`
- Files: `ZSC_OD_VI902_01` (consumption model + auto-gen class), `ZHS_VI902_01` + `ZCL_HS_VI902_01` (calls outbound)
- SCO1: `ZRAP_IF_VI902` (Communication Scenario, = package name)
- SCO3: `ZOS_VI902_01_REST` (Outbound Service)
- OData V4 standard endpoint dùng làm reference: `A_OutbDeliveryHeader` + Function `POST_GOODS_ISSUE`
- Full code: `references/runtime-proxy.md`, `references/operations.md`, `references/errors.md`
