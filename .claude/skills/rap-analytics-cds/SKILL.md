---
name: rap-analytics-cds
description: "Build analytical CDS (cube / dimension / analytical query) on ABAP Cloud/BTP for SAC dashboards & reports (ZRAP_BI pattern). A layered chain of Data Model interface views ZI_<PJ>_NN: leaf calc views aggregate/compute, a COMPOSITE cube view joins them (left outer join) and derives measures via cast/case/floor/round/substring/dats_days_between/currency_conversion, using $projection self-reference. Header annotations @Analytics.dataCategory:#CUBE (or #DIMENSION), @ObjectModel.modelingPattern:#ANALYTICAL_QUERY, @ObjectModel.supportedCapabilities:[#ANALYTICAL_PROVIDER,#SQL_DATA_SOURCE,#CDS_MODELING_DATA_SOURCE,#ANALYTICAL_QUERY,#EXTERNAL_DATA_PROVIDER], @VDM.viewType:#COMPOSITE, with parameters passed down via Sub(P_x:$parameters.P_x). Measures need @Semantics.quantity.unitOfMeasure / @Semantics.amount.currencyCode + null-guard case when x is null then cast(0 as abap.quan). NOT transactional Fiori CDS (→ rap-cds). Reference packages: MB901 (在庫ダッシュボード SAC), FB901-903 (在庫レポート/ダッシュボード). Trigger on: 'analytical CDS', 'analytics', 'cube', 'dimension', 'SAC', 'dashboard', 'ZRAP_BI', '@Analytics.dataCategory', '#CUBE', '#ANALYTICAL_QUERY', 'modelingPattern', 'supportedCapabilities', 'ANALYTICAL_PROVIDER', 'VDM.viewType', 'COMPOSITE', 'with parameters CDS', 'currency_conversion', 'dats_days_between', '$projection', 'analytical query'."
---

# RAP Analytical CDS (Cube / Query — ZRAP_BI)

Pattern cho **ZRAP_BI**: CDS phân tích (không giao dịch) làm nguồn cho **SAC dashboard / report**. Chuỗi view **Data Model** phân lớp `ZI_<PJ>_NN`: các leaf view tính/aggregate, 1 **composite cube** join lại và derive measure. Tham chiếu **MB901** (在庫ダッシュボード), **FB901-903** (在庫レポート/ダッシュボード).

## When to use

- Data cho SAC / analytical report (KPI, tồn kho, quay vòng, tổng hợp theo tháng/plant…).
- Cần cube/dimension/query analytical, tham số hoá (kỳ, ngày), tính toán nhiều tầng.

KHÔNG dùng cho:
- CDS giao dịch Fiori (list report / object page / value help / composition) → **`rap-cds`**.
- Extraction CDS để job đẩy CSV ra DWH → **`rap-if-dwh-send`** (view thường, không annotation analytical).

> Analytical vs transactional: analytical view khai `@Analytics.dataCategory` + `@ObjectModel.modelingPattern:#ANALYTICAL_QUERY` + `supportedCapabilities`; transactional dùng `@UI`/`@Search`/composition. KHÔNG trộn 2 nhóm annotation.

## Object inventory (per BI case)

| # | Object | Naming | Vai trò | Deploy |
|---|--------|--------|---------|--------|
| 1..N | Leaf calc views | `ZI_<PJ>_NN` | aggregate/compute từng chỉ tiêu (1 view/1 nguồn) | auto (MCP) |
| top | Composite cube | `ZI_<PJ>_01` | join leaf + derive measure | auto |
| (opt) | Analytical query | `ZC_<PJ>_0N` | projection `@Analytics.query:true` cho SAC | auto |

> BI case thường KHÔNG có TABL/BDEF/SRVB (đọc từ standard CDS/table). SAC tiêu thụ trực tiếp analytical query (InA), không cần OData binding.

## Step 1 — Header annotations (cube composite)

```sql
@AbapCatalog.viewEnhancementCategory: [#NONE]
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Data Model : 在庫ダッシュボード用データ'
@Metadata.ignorePropagatedAnnotations: true
@ObjectModel.modelingPattern: #ANALYTICAL_QUERY
@Analytics.dataCategory: #CUBE
@ObjectModel.supportedCapabilities: [
    #ANALYTICAL_PROVIDER,
    #SQL_DATA_SOURCE,
    #CDS_MODELING_DATA_SOURCE,
    #ANALYTICAL_QUERY,
    #EXTERNAL_DATA_PROVIDER ]
@VDM.viewType: #COMPOSITE
define view entity ZI_<PJ>_01
  with parameters
    P_StartDate : vdm_v_start_date,
    P_EndDate   : vdm_v_end_date
  as select from ZI_<PJ>_02( P_StartDate : $parameters.P_StartDate,
                             P_EndDate   : $parameters.P_EndDate ) as _Base
  ...
```

- `@Analytics.dataCategory`: `#CUBE` (fact + measure) hoặc `#DIMENSION` (master/text lookup).
- `@ObjectModel.modelingPattern: #ANALYTICAL_QUERY` + `supportedCapabilities` (list ở trên) → engine nhận là analytical provider.
- `@VDM.viewType: #COMPOSITE` cho view join nhiều nguồn; leaf thường `#BASIC`.
- `@AccessControl.authorizationCheck: #NOT_REQUIRED` phổ biến ở BI (data đã lọc), nhưng cân nhắc DCL nếu cần bảo mật.

## Step 2 — Parameter passing xuống sub-view

Khai `with parameters` ở mọi tầng cần, truyền xuống bằng `SubView( P_x : $parameters.P_x )`:

```sql
left outer join ZI_<PJ>_03( P_StartDate : $parameters.P_StartDate,
                            P_EndDate   : $parameters.P_EndDate,
                            P_EvalClass : 'C10',   -- literal cũng hợp lệ
                            P_MVT       : '601' ) as _GIDelivery
  on  _Base.EndDate = _GIDelivery.EndDate
  and _Base.Plant   = _GIDelivery.Plant
  and ...
```

- Dùng data element VDM chuẩn cho param: `vdm_v_start_date`, `vdm_v_end_date`.
- Join theo full key (year-month + company + plant + storage + material + unit) — analytical cần grain nhất quán.

## Step 3 — Measure & computed column

- **Self-reference**: `$projection.<Col>` để dùng lại cột đã tính trong cùng view (thứ tự khai không quan trọng với `$projection`).
- **Cast bắt buộc** khi tính: `cast(... as abap.dec(p,s))`, `abap.quan(p,s)`, `abap.curr(p,s)`, `abap.dats`, `abap.int4`.
- **Null-guard** cho measure từ left join: `case when _X.Qty is null then cast(0 as abap.quan(13,3)) else _X.Qty end`.
- **Hàm SQL analytical**: `floor`, `round(x,n)`, `substring(x,1,6)`, `dats_days_between(d1,d2)`, `currency_conversion( amount => ..., exchange_rate_date => ..., source_currency => ..., target_currency => cast('JPY' as abap.cuky(5)), round => '' )`.
- **Semantics measure** (bắt buộc để SAC hiểu unit/tiền):
```sql
@Semantics.quantity.unitOfMeasure: 'MaterialBaseUnit'
... as AvailableStockQty,

@Semantics.amount.currencyCode: 'CompanyCodeCurrency'
cast( ... as abap.curr(23,2) ) as StockValue,
```
- Key của cube = các dimension (year-month, company, plant, material…); measure là số lượng/tiền/đếm.

## Step 4 — (optional) Analytical query cho SAC

Nếu SAC cần query riêng, tạo projection `ZC_<PJ>_0N` trên cube:

```sql
@Analytics.query: true
@ObjectModel.modelingPattern: #ANALYTICAL_QUERY
define view entity ZC_<PJ>_01
  with parameters P_StartDate : vdm_v_start_date, P_EndDate : vdm_v_end_date
  as projection on ZI_<PJ>_01( P_StartDate : $parameters.P_StartDate,
                              P_EndDate   : $parameters.P_EndDate )
{
  ...  -- @AnalyticsDetails.query.axis / display hierarchy nếu cần
}
```

## Validation checklist

- [ ] Cube: `@Analytics.dataCategory:#CUBE` + `@ObjectModel.modelingPattern:#ANALYTICAL_QUERY` + `supportedCapabilities` list đủ
- [ ] `with parameters` truyền xuống mọi sub-view qua `Sub( P_x : $parameters.P_x )`
- [ ] Mọi computed column `cast(... as abap.<type>)` rõ ràng; dùng `$projection.<Col>` cho self-ref
- [ ] Measure từ left join có null-guard `case when null then cast(0 as ...)`
- [ ] Quantity measure có `@Semantics.quantity.unitOfMeasure`; amount có `@Semantics.amount.currencyCode`
- [ ] `currency_conversion` có `round =>` + `target_currency` cast `abap.cuky`
- [ ] KHÔNG trộn annotation transactional (`@UI`, composition) vào analytical view
- [ ] Leaf `#BASIC`, composite `#COMPOSITE`; grain (key) nhất quán qua các tầng

## Common pitfalls

| Lỗi | Triệu chứng | Fix |
|-----|------------|-----|
| Thiếu `supportedCapabilities`/`dataCategory` | SAC không nhận là analytical provider | Thêm đủ header analytical |
| Không truyền param xuống sub-view | "parameter has no value" / view không active | `Sub( P_x : $parameters.P_x )` mọi tầng |
| Measure không cast | Kiểu suy ra sai / lỗi arithmetic overflow | `cast(... as abap.dec/quan/curr)` |
| Left join measure null | Tổng ra null thay vì 0 | `case when null then cast(0 as abap.quan)` |
| Thiếu semantics unit/currency | SAC hiển thị số trần, không đổi tiền | `@Semantics.quantity/amount.*` |
| `currency_conversion` thiếu round/cast cuky | Syntax error / kết quả sai scale | thêm `round =>` + cast target `abap.cuky(5)` |

## Reference

- **MB901** `ZRAP_BI_MB901`: `ZI_MB901_01` cube (在庫ダッシュボード), leaf `ZI_MB901_02..10` (在庫数量/出庫/受注/為替…), `with parameters P_StartDate/P_EndDate`, `currency_conversion` sang JPY/USD/HKD/CNY/PHP/EUR, quay vòng `InventoryTurnoverMonths` bằng `floor(stock*12/annualSales)`.
- **FB901/FB902/FB903** `ZRAP_BI_FB90x`: 不動在庫調査 / 在庫レポート / 在庫ダッシュボード (`ZI_FB902_01..06`).
- CDS field-type rules chung: xem rule `cds-field-types`; transactional CDS: **`rap-cds`**.
