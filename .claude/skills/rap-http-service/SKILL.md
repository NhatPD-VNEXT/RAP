---
name: rap-http-service
description: "Build HTTP Inbound Service (REST endpoint) on ABAP Cloud/BTP: ZHS_* HTTP Service object + ZCL_HS_* handler class implementing if_http_service_extension. Covers path routing, JSON deserialize/serialize with /ui2/cl_json (camel_case / pascal_case), HTTP status codes (200/201/400/405/500), response headers, ALPHA conversion, request validation, error message accumulation, log via EML with MODIFY ENTITIES + COMMIT ENTITIES. Use when client sends raw REST/JSON (not OData). Reference pattern: VI902 (ZHS_VI902_01 receiving shipping completion data, calling outbound OData). Trigger on: 'HTTP service', 'HTTP inbound', 'ZHS_', 'ZCL_HS_', 'if_http_service_extension', 'handle_request', 'REST endpoint', 'POST handler', 'JSON deserialize', 'JSON serialize', '/ui2/cl_json', 'pretty_mode', 'set_status', 'set_text', 'set_header_field'."
---

# RAP HTTP Inbound Service

Custom REST endpoint nhận JSON từ hệ thống ngoài (KHÔNG dùng OData) — tham chiếu **ZRAP_IF_VI902** (handler `ZCL_HS_VI902_01` nhận shipping completion data từ ACMS).

## Reference files (progressive disclosure — đọc khi tới bước tương ứng)

| Step | Nội dung | File |
|------|---------|------|
| Step 2 | Handler class skeleton: full TYPES + method declarations | `references/handler-class.md` |
| Step 3–4 | `handle_request` routing + process method (parse/validate/business/respond) | `references/request-processing.md` |
| Step 7–9 | Log via EML + error accumulation + parse outbound OData error JSON | `references/log-error.md` |

SKILL.md này = index + Critical rules mỗi step. Code khối lớn nằm ở reference file — chỉ đọc khi generate object đó (tránh nạp full context).

## Templates

| Object | Template |
|--------|---------|
| Handler class `ZCL_HS_*` | `.claude/templates/clas/zcl-http-handler.abap` |
| HTTP Service `ZHS_*` | **Manual ADT** — New → HTTP Service, name auto-bind handler class |

## When to use

- Client gửi raw JSON qua HTTP POST với path/payload custom (không phải OData v2/v4 protocol)
- Cần điều khiển response format/status code chi tiết
- Endpoint cho IoT/Mobile/Legacy system không hỗ trợ OData

KHÔNG dùng cho:
- Fiori UI → dùng SRVB U4 (rap-service)
- System-to-system OData-aware client → dùng SRVB U4W
- Background batch → dùng rap-job

## Object inventory

| # | Object | Type | Naming |
|---|--------|------|--------|
| 1 | HTTP Service | HTTP | `ZHS_<5chars>_<NN>` |
| 2 | Handler Class | CLAS | `ZCL_HS_<5chars>_<NN>` (auto-bind khi tạo HTTP service) |
| (opt) | Log table | TABL | `Z<5chars>T` |
| (opt) | Log CDS + BDEF | DDLS+BDEF | `ZI_<5chars>_<NN>` + EML create để write log |
| (opt) | Outbound consumption | Multiple | xem skill **rap-comm-outbound** |
| (opt) | Communication Scenario | SCO1 | `ZRAP_IF_<5chars>` (= package name) |

## Step 1 — HTTP Service (ZHS_*)

Custom REST endpoint object, tạo **manual qua ADT** (MCP có thể không support).

Critical:
- Right-click package → New → Other ABAP Repository Object → "HTTP Service"; Name `ZHS_<5chars>_<NN>` (vd `ZHS_VI902_01`)
- ADT auto-prompt Handler Class name → để mặc định `ZCL_HS_<5chars>_<NN>` (drop số 0 đầu nếu cần); sinh skeleton implementing `if_http_service_extension`
- URL endpoint: `/sap/bc/http/sap/<zhs_lower>/<sub_path>` (vd `/sap/bc/http/sap/zhs_vi902_01/GoodsIssue`)

## Step 2 — Handler Class skeleton

Class `ZCL_HS_*` khai `INTERFACES if_http_service_extension` + CONSTANTS (comm scenario, path, content-type) + TYPES (request string/typed, response, pretty pascal_case, log FOR CREATE, error JSON) + instance DATA state + method declarations.

Critical:
- Request có **2 tầng type**: `gts_request_string` (raw string, khớp JSON) → `gts_request` (typed, ref DDIC field) sau convert
- Response pretty type dùng `Pascal_Case` field cho output JSON
- Log dùng `TYPE TABLE FOR CREATE zi_*` để insert qua EML
- Instance DATA (`gdt_request/gdt_response/gdt_log/gdf_message_error`) collect cross-request trong batch

→ Code đầy đủ: `references/handler-class.md`

## Step 3 — Entry point: `handle_request`

Route theo path bằng CASE trên `request->get_header_field( '~path' )`; dispatch tới process method; WHEN OTHERS → 400.

Critical:
- 1 ZHS có thể serve nhiều sub-path → CASE phân nhánh theo path constant
- `~path` trả full path incl. service prefix; WHEN OTHERS → 400 + text message

→ Code đầy đủ: `references/request-processing.md` § Step 3

## Step 4 — Process method (parse + validate + business + respond)

Method flow: method check (405) → read body → deserialize JSON (400 nếu fail) → convert string→typed + ALPHA → group + validate + outbound call → log EML → quyết định status → serialize pretty response.

Critical:
- Method ≠ POST → 405; JSON parse fail / empty body / format sai → 400
- ALPHA = IN cho key fields trước khi dùng
- `FREE: gdt_*` cuối method (tránh state leak giữa request)

→ Code đầy đủ: `references/request-processing.md` § Step 4

## Step 5 — HTTP Status code matrix

| Status | When |
|--------|------|
| `201 Created` | All records processed successfully |
| `200 OK` | Partial success (≥1 record success, ≥1 record error) |
| `400 Bad Request` | JSON parse fail / required field missing / format invalid |
| `401 Unauthorized` | Auth fail (framework tự xử trước khi vào handler) |
| `403 Forbidden` | IAM scope mismatch (framework) |
| `405 Method Not Allowed` | Non-POST request hoặc method wrong cho path |
| `500 Internal Server Error` | All records failed / unhandled exception |

**Rule**: Trả lỗi cấu trúc (parse, missing field) → 400. Lỗi nghiệp vụ per record → vẫn 200/201 với status field trong body. Toàn bộ fail → 500.

## Step 6 — JSON conventions

| Direction | pretty_mode | Reason |
|-----------|-------------|--------|
| Deserialize incoming JSON | `camel_case` | Client thường gửi `camelCase` keys |
| Serialize outgoing JSON | `pascal_case` | Output thường yêu cầu `PascalCase` (hoặc giữ camel_case nếu client yêu cầu) |

Lưu ý:
- `/ui2/cl_json=>deserialize` skip field nếu key JSON không khớp ABAP field → cần đảm bảo tên field chính xác
- Field name ABAP lowercase nội bộ → pretty_mode auto-convert

## Step 7 — Log persistence via EML

Persist log qua managed BDEF của table log — `MODIFY ENTITIES OF zi_* ENTITY log CREATE ... AUTO FILL CID WITH gdt_log` + `COMMIT ENTITIES`.

Critical:
- **KHÔNG** `MODIFY ddic_table FROM TABLE` trong HTTP context — dùng EML giữ RAP commit pattern + admin fields
- `COMMIT ENTITIES` (không phải `COMMIT WORK`) — RAP runtime context

→ Code đầy đủ: `references/log-error.md` § Step 7

## Step 8 — Error message accumulation pattern

Instance attribute `gdf_message_error` tích lũy nhiều lỗi cross-method, separator `/`.

→ Code đầy đủ: `references/log-error.md` § Step 8

## Step 9 — Parse outbound OData error response

Khi gọi OData V4 outbound (skill **rap-comm-outbound**) bị lỗi, error body là JSON structured → deserialize `error.innererror.errordetails[1].message` trả user-friendly text.

→ Code đầy đủ: `references/log-error.md` § Step 9

## Step 10 — Communication Scenario binding

ZHS auto-generate Communication Scenario (SCO1) `<package_name>` (vd `ZRAP_IF_VI902`):
- Type: Inbound
- ZHS service được auto-add làm Inbound Service

Sau khi activate ZHS:
1. Admin tạo Communication System + Communication Arrangement chỉ định scenario này
2. Provide endpoint URL `https://<host>/sap/bc/http/sap/<zhs_lower>/...`
3. Configure auth (Basic / OAuth / Certificate)

## `WITH PRIVILEGED ACCESS` pattern

Khi handler cần SELECT từ SAP standard CDS nhưng user gọi không có auth → dùng `WITH PRIVILEGED ACCESS`:

```abap
SELECT SINGLE baseunit
  FROM i_product WITH PRIVILEGED ACCESS
  WHERE product = @is_request-material
  INTO @lds_log-baseunit.
```

Bypass authorization check của caller — chỉ dùng cho metadata lookup, KHÔNG dùng cho transactional data.

## Validation checklist

- [ ] Handler class implements `if_http_service_extension`
- [ ] `handle_request` route theo `request->get_header_field( '~path' )` với CASE
- [ ] WHEN OTHERS → 400 + text message
- [ ] Method check (`get_method` vs `gcs_http_method-post`) → 405 nếu sai
- [ ] JSON deserialize trong TRY/CATCH → 400 nếu fail
- [ ] Empty body check → 400
- [ ] Date/format validate trước khi vào business logic → 400
- [ ] ALPHA = IN cho key fields
- [ ] HTTP status: 201 all success, 200 partial, 500 all fail, 400 bad input
- [ ] Response `set_header_field( content-type, application/json; charset=UTF-8 )` + `set_text(json)`
- [ ] Log persist qua EML (`MODIFY ENTITIES` + `COMMIT ENTITIES`)
- [ ] `FREE` instance state cuối method (tránh leak giữa request)
- [ ] Outbound error JSON parser nếu gọi OData ngoài

## Common pitfalls

| Lỗi | Triệu chứng | Fix |
|-----|------------|-----|
| Quên `FREE gdt_*` cuối method | State leak qua request sau | `FREE: gdt_request, gdt_response, gdt_log, gdf_message_error.` |
| Dùng `MODIFY ddic_table` trong HTTP context | Mismatch admin fields, bypass framework | Dùng EML `MODIFY ENTITIES OF zi_*` + `COMMIT ENTITIES` |
| Trả 500 cho parse error | Client không biết là input sai | Parse error → 400, business error → 200/500 |
| `WITH PRIVILEGED ACCESS` cho transactional select | Security bypass | Chỉ dùng cho metadata (lookup baseunit, currency...) |
| ALPHA quên cho key field | Key mismatch khi SELECT từ DDIC | `|{ value ALPHA = IN }|` |
| Hardcode path constant nhưng path mismatch | 400 OTHERS | Dùng `request->get_header_field('~path')` → log để debug đúng path |

## Reference

- Package mẫu: `ZRAP_IF_VI902`
- Files: `ZHS_VI902_01` (HTTP service), `ZCL_HS_VI902_01` (handler), `ZI_VI902_01` (log CDS), `ZV903T` (log table), `ZBP_I_VI902_01` (log BDEF/impl), `ZSC_OD_VI902_01` (outbound proxy)
- Full code: `references/handler-class.md`, `references/request-processing.md`, `references/log-error.md`
