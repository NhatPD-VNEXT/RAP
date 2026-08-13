# CDS Field Type Rules — ABAP Cloud

> **Lưu ý — DDIC Table (TABL)**: Quy tắc currency/quantity bên dưới áp dụng cho CDS view/abstract entity. Ở **TABL level** cú pháp annotation reference khác (qualified `'<table>.<field>'` + data element domain-specific, KHÔNG dùng `abap.cuky`/`abap.unit` raw) — xem skill `rap-table`.

## Quy tắc bắt buộc khi khai báo field trong CDS (view entity và abstract entity)

### 1. Tiền tệ (Currency Amount)

- **Dùng `abap.curr(p,s)`** — KHÔNG dùng `abap.dec` cho field là số tiền.
- **Bắt buộc thêm annotation** `@Semantics.amount.currencyCode: '<CurrencyField>'` trỏ đến currency key field trong cùng entity.
- Currency key field: dùng `abap.cuky`. **`@Semantics.currencyCode: true` KHÔNG được phép trên view entity** ("Annotation Semantics.currencyCode is not allowed in view entities" — severity E) — chỉ expose field cuky thường, không thêm annotation này ở CDS view.

```sql
Currency     : abap.cuky;

@Semantics.amount.currencyCode: 'Currency'
Amount1      : abap.curr(24,2);
```

### 2. Số lượng (Quantity)

- **Dùng `abap.quan(p,s)`** chỉ khi có field đơn vị (`abap.unit`) trong cùng entity.
- `@Semantics.quantity.unitOfMeasure: '<UnitField>'` trỏ đến field đơn vị.
- Nếu không có field đơn vị (unit hardcode trong implementation) → **dùng `abap.dec(p,s)` thay thế** để tránh thiếu reference.

```sql
@Semantics.quantity.unitOfMeasure: 'QuantityUnit'
Quantity     : abap.quan(15,3);

@Semantics.unitOfMeasure: true
QuantityUnit : abap.unit;
```

### 3. Ngày tháng từ hệ thống ngoài

- `abap.dats` → OData V4 nhận ISO format `2026-01-01` (string).
- Nếu hệ thống ngoài gửi số YYYYMMDD (ví dụ `20260101`) → dùng `abap.numc(8)` và convert thủ công.
- **Phải confirm format input** trước khi chọn type — ghi vào Open Questions nếu chưa rõ.

### 4. Abstract Entity cho RAP Action Parameter

- Tên tối đa **30 ký tự**.
- Bắt buộc có **ít nhất 1 `key` field** (có thể là dummy `RequestId : abap.numc(10)`).
- Cần **2 abstract entities riêng biệt**: input (`ZI_...`) và output (`ZO_...`).
- **Flat parameter** (không có `deep` keyword) → works với OData V4 ✓.
- **`$self` bị cấm** với `strict(2)` → dùng tên entity cụ thể.
- BDEF type phải là `abstract;` (không phải `managed`).

```sql
-- Input entity
@EndUserText.label: '...'
@Metadata.allowExtensions: false
define abstract entity ZI_XXXXX_01_VN
{
  key RequestId : abap.numc(10);
  ...
}

-- Output entity
define abstract entity ZO_XXXXX_01_VN
{
  key SomeKey : abap.char(1);
  ...
}
```

```abap
-- BDEF
abstract;
strict(2);
define behavior for ZI_XXXXX_01_VN alias ...
{
  static action ProcessXxx
    parameter ZI_XXXXX_01_VN
    result [0..1] ZO_XXXXX_01_VN;
}
```

### 5. Checklist trước khi finalize CDS design

| Loại field | Kiểm tra |
|-----------|---------|
| Số tiền | `abap.curr` + `@Semantics.amount.currencyCode` trỏ đúng field |
| Currency key | `abap.cuky` + `@Semantics.currencyCode: true` |
| Số lượng | `abap.quan` chỉ khi có unit field; nếu không có unit field → `abap.dec` |
| Ngày từ external | Confirm ISO vs integer format trước khi chọn `abap.dats` vs `abap.numc(8)` |
| Abstract entity name | ≤ 30 ký tự |
| Abstract entity | Có key field (dù dummy) |
| Action BDEF | `abstract; strict(2);` + `static action ... parameter ... result [0..1] ...` |
