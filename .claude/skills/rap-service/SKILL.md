---
name: rap-service
description: "Create Service Definition (SRVD) and Service Binding (SRVB) on ABAP Cloud/BTP. Covers exposing root entities, projection views, value help (VH), aliases via 'as'; binding types U4 (OData V4 UI / Fiori), U4W (OData V4 Web API for system-to-system), U2 (OData V2 UI), U2W (OData V2 Web API), AS (SQL Web API). Decide Fiori UI vs Web API correctly. Reference packages: VI901 (Fiori UI U4), MI901 (action service U4), VI902-style (Web API patterns). Trigger on: 'service definition', 'service binding', 'SRVD', 'SRVB', 'expose entity', 'OData V4', 'OData V2', 'U4', 'U4W', 'U2', 'U2W', 'AS binding', 'Fiori UI binding', 'Web API binding', 'A2X', 'system-to-system service'."
---

# RAP Service Definition + Service Binding

Expose RAP BO (managed/unmanaged/projection/custom entity) ra ngoài qua OData/SQL. Tham chiếu **VI901** (Fiori UI), **MI901** (action service), **VI902** (HTTP service không dùng SRVD/SRVB).

## Templates

| Object | Template |
|--------|---------|
| Service Definition `ZSD_*` | `.claude/templates/service/srvd-service-definition.srvd` |
| Service Binding U4 (Fiori) | `.claude/templates/service/srvb-binding-u4.json` |
| Service Binding U4W (Web API) | `.claude/templates/service/srvb-binding-u4w.json` |

## When to use

Sau khi BDEF + (projection BDEF) đã activate thành công. Service đứng sau cùng trong RAP architecture order.

## Quyết định Binding Type — CRITICAL

| Use case | Binding Type | Suffix file | OData |
|----------|--------------|-------------|-------|
| Fiori Elements (List Report + Object Page) | **U4** | `ZSB_U4_<NAME>` | V4 — UI |
| Fiori Elements (legacy app, ít gặp) | **U2** | `ZSB_U2_<NAME>` | V2 — UI |
| System-to-system inbound (custom Web API, action gọi từ ACMS/middleware) | **U4W** | `ZSB_U4W_<NAME>` | V4 — Web API (A2X) |
| System-to-system inbound thuần API (A2X, kind G4BA) | **A4** | `ZSB_A4_<NAME>` | V4 — Web API (A2X) |
| Legacy WebService consumer | **U2W** | `ZSB_U2W_<NAME>` | V2 — Web API |
| SQL access (analytical client) | **AS** | `ZSB_AS_<NAME>` | SQL — Web API |

**Sai binding = bug nặng**:
- Dùng `U4` cho system-to-system → app sẽ render UI metadata không cần thiết, authentication mismatch
- Dùng `U4W` cho Fiori → app không load được vì thiếu UI annotations

## Service Definition (SRVD)

### Pattern 1 — Expose 1 entity (action service như MI901)

```sql
@EndUserText.label: '<service label>'
define service ZSD_MI901_01 {
  expose ZI_MI901_03;
}
```

### Pattern 2 — Expose multi-entity với alias + VH (managed BO như VI901)

```sql
@EndUserText.label: '<service label>'
define service ZSD_VI901_01 {
  expose ZC_VI901_01      as ImportHistoryHeader;
  expose ZC_VI901_02      as ImportHistoryItem;
  expose I_BusinessUserVH as BusinessUserVH;
}
```

**Rule**:
- Managed BO Fiori UI → expose **projection** entities (`ZC_*`), KHÔNG expose interface (`ZI_*`)
- Action-only / Custom entity → expose entity gốc
- VH entity (`I_*VH`) cần expose để value help hoạt động trên Fiori
- Dùng `as <Alias>` để tên public clean (không lộ Z prefix)
- Description: `Service Definition for <NAME>`

### Naming

- `ZSD_<5chars>_<NN>` — IPS Ver4.0
- Với local variant → `ZSD_<5chars>_<NN>_VN`
- NN cùng số với projection chính (vd projection `ZC_VI901_01` → service `ZSD_VI901_01`)

## Service Binding (SRVB)

SRVB là object kiểu metadata + runtime info, KHÔNG có source code chuẩn để edit như SRVD. Tạo qua:

- **MCP sap-adt**: `create_object(system, "SRVB", "<NAME>", "<package>", "<description>", service_definition="ZSD_<NAME>", binding_version="V4")` — sap-adt hỗ trợ tạo SRVB (cần `service_definition`; `binding_version` `V4`/`V2` theo OData version của binding). Activate xong tự generate runtime. Đọc lại: `get_source_by_uri` (SRVB không qua `get_source`).
- **ADT** (nếu cần chỉnh binding type/option đặc thù): Right-click package → New → Service Binding → chọn:
  - Binding Type (U4/U4W/U2/U2W/AS)
  - Service Definition reference (`ZSD_<5chars>_<NN>`)
  - Service Name (= SRVB name)

### Naming

- `ZSB_<BindingType>_<5chars>_<NN>` — vd:
  - Fiori UI: `ZSB_U4_VI901_01`
  - Web API: `ZSB_U4W_MI902_01_VN`
  - Legacy V2 Web API: `ZSB_U2W_XX001_01`
  - A2X thuần API (kind G4BA): `ZSB_A4_PI901_01`
- Description: `Service Binding for ZSD_<NAME>` hoặc reuse business label

### Sau khi tạo SRVB

ADT tự sinh các object phụ:
- `G4BA <SRVB_NAME>` — OData V4 binding adapter
- `SICF/TYP <SRVB>_<long_hash>` — Internet Communication Framework service node
- `UIAD/TYP <SRVB>_UI5R` (chỉ U4 UI) — Fiori UI metadata
- `SUSH <hash>` — IAM scope handle

KHÔNG sửa các object này — auto-generated.

### Activate + Publish

1. Activate SRVB trong ADT
2. Trên SRVB Service Tab → click "Publish" để đăng ký vào ICF
3. Local Service URL hiện ra dạng: `/sap/opu/odata4/sap/<srvb_lower>/srvd_a2x/sap/<srvd_lower>/0001/`

## Authorization wiring

Mỗi SRVB tự sinh ra hệ thống IAM object cần config thủ công trong ADT (KHÔNG có MCP tool):

| Object | Type | Mục đích |
|--------|------|----------|
| `ZBC_<5chars>_<NN>` | SIA1 | Business Catalog — chứa các app/service |
| `ZIAM_<U4>_<5chars>_<NN>_EXT` (UI) | SIA6 | IAM App External (Fiori UI launcher) |
| `ZIAM_<5chars>_<NN>_EXT` (Web API) | SIA6 | IAM App External (system user binding) |
| `<SRVB>_0001_G4BA_IBS` | SIA6 | Inbound service auto-binding |
| `ZBC_<5chars>_<NN>_0001` | SIA7 | Catalog assignment to user role |

**Naming nuance** (xem VI901 vs MI901):
- IAM App Fiori UI dạng `ZIAM_U4_<5chars>_<NN>_EXT` — có `_U4_`
- IAM App pure Web API dạng `ZIAM_<5chars>_<NN>_EXT` — KHÔNG có `_U4_`

Quy trình IAM thủ công:
1. Tạo Business Catalog (`ZBC_*`) qua ADT → IAM
2. Add SRVB vào catalog
3. Add Business User → Business Role → Catalog → đăng nhập test

## Communication Scenario (cho Web API)

Khi dùng `U4W` cho system-to-system, cần Communication Scenario (SCO2) để client bên ngoài (ACMS, middleware) có thể gọi với credentials riêng. ADT auto-generate:

- `<SRVB>_0001_G4BA` (SCO2) — Inbound Communication Scenario

Sau khi activate SRVB → admin S/4 Cloud:
1. Create Communication System (giữ host + auth method)
2. Create Communication Arrangement chỉ định Communication Scenario auto-generated
3. Cung cấp endpoint URL + credentials cho client

Xem skill **rap-comm-outbound** cho outbound (gọi ra ngoài).

## Pattern matrix theo BO type

| BO type | Expose | Binding |
|---------|--------|---------|
| Managed BO + Fiori UI (vd VI901) | `ZC_*` projection + VH entities | `U4` |
| Managed BO + system-to-system | `ZC_*` projection (vẫn dùng projection để có draft) | `U4W` |
| Unmanaged BO + static action (vd MI901 SendSelectedData) | Root entity `ZI_*` | `U4` (nếu cần monitor list) hoặc `U4W` (action import từ system) |
| Custom Entity với Query Provider (vd MI901 ZI_MI901_03) | Root custom entity `ZI_*` | `U4` (read-only Fiori list) |
| Read-only analytics CDS | Projection CDS | `U4` hoặc `AS` |

## Validation checklist

- [ ] SRVD expose **projection** cho managed BO Fiori (không expose `ZI_*` trực tiếp)
- [ ] VH entities được expose nếu projection có `@Consumption.valueHelpDefinition`
- [ ] Naming SRVD: `ZSD_<5chars>_<NN>` (+ `_VN` nếu local)
- [ ] Description SRVD: `Service Definition for <NAME>` hoặc business label
- [ ] Binding type khớp use case (U4 Fiori vs U4W Web API)
- [ ] SRVB đã publish (Service URL có sẵn)
- [ ] IAM App + Business Catalog đã tạo + assign role (KHÔNG có MCP, thủ công ADT)
- [ ] Communication Arrangement tạo (chỉ với U4W)

## Reference

- VI901: `ZSD_VI901_01` (multi-entity + VH expose) + `ZSB_U4_VI901_01` (Fiori UI)
- MI901: `ZSD_MI901_01` (single custom entity) + `ZSB_U4_MI901_01` (Fiori monitor list)
- VI902: không dùng SRVD/SRVB — dùng HTTP Service (xem skill rap-http-service)
