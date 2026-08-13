# rap-behavior — EML Reference & Batch/Error Containment (full code)

> Chi tiết các section `## EML Quick Reference` và `## EML Batch Pattern & Error Containment` của SKILL.md.

## EML Quick Reference

Entity Manipulation Language is the ABAP syntax for working with RAP BO instances:

```abap
" Read
READ ENTITIES OF ZR_Travel IN LOCAL MODE
  ENTITY Travel
  FIELDS ( TravelID OverallStatus )
  WITH CORRESPONDING #( keys )
  RESULT DATA(travels).

" Read by association
READ ENTITIES OF ZR_Travel IN LOCAL MODE
  ENTITY Travel BY \_Booking
  ALL FIELDS
  WITH CORRESPONDING #( keys )
  RESULT DATA(bookings).

" Modify (update)
MODIFY ENTITIES OF ZR_Travel IN LOCAL MODE
  ENTITY Travel
  UPDATE FIELDS ( OverallStatus )
  WITH VALUE #( ( %tky = travel-%tky OverallStatus = 'A' ) )
  FAILED failed REPORTED reported.

" Create
MODIFY ENTITIES OF ZR_Travel IN LOCAL MODE
  ENTITY Travel
  CREATE FIELDS ( AgencyID CustomerID ... )
  WITH VALUE #( ( %cid = 'NEW1' AgencyID = '001' ... ) )
  MAPPED mapped FAILED failed REPORTED reported.

" Delete
MODIFY ENTITIES OF ZR_Travel IN LOCAL MODE
  ENTITY Travel
  DELETE FROM VALUE #( ( %tky = travel-%tky ) )
  FAILED failed REPORTED reported.

" Execute action
MODIFY ENTITIES OF ZR_Travel IN LOCAL MODE
  ENTITY Travel
  EXECUTE acceptTravel FROM CORRESPONDING #( keys )
  FAILED failed REPORTED reported.
```

## EML Batch Pattern & Error Containment

### Anti-pattern — KHÔNG gọi EML trong LOOP per-item

```abap
" SAI: 1 EML call / 1 item -> N round-trips, COMMIT từng row
LOOP AT lt_items INTO DATA(ls_item).
  MODIFY ENTITIES OF i_salesordertp
    ENTITY salesorder CREATE BY \_item
    FIELDS ( ... ) WITH VALUE #( ( %key-salesorder = ls_item-so ... ) )
    FAILED failed REPORTED reported.
  COMMIT ENTITIES.
ENDLOOP.
```

Trích SAP Help (`ABAPCOMMIT_ENTITIES`):
> "ABAP EML statements should not be used in loops. Using them can have a performance impact because it can result in multiple single database accesses. There should be only one ABAP EML statement..."

### Pattern đúng — gom internal table, 1 MODIFY cho N rows

```abap
" 1. Build payload table với %cid unique cho từng row
DATA: lt_create   TYPE TABLE FOR CREATE i_salesordertp\_item,
      lt_cid_map  TYPE HASHED TABLE OF gts_cid_map WITH UNIQUE KEY cid,
      lf_seq      TYPE i VALUE 0.

LOOP AT lt_items INTO DATA(ls_item).
  lf_seq += 1.
  DATA(lf_cid) = |ITEM_{ lf_seq WIDTH = 10 PAD = '0' }|.   " unique trong batch
  INSERT VALUE #( cid = lf_cid item_uuid = ls_item-uuid ) INTO TABLE lt_cid_map.
  APPEND VALUE #( %key-salesorder = ls_item-so
                  %target = VALUE #( ( %cid = lf_cid product = ls_item-product ... ) )
                ) TO lt_create.
ENDLOOP.

" 2. 1 MODIFY cho TẤT CẢ rows
MODIFY ENTITIES OF i_salesordertp
  ENTITY salesorder CREATE BY \_item FIELDS ( ... ) WITH lt_create
  MAPPED   DATA(ls_mapped)      " %cid -> key thật
  FAILED   DATA(ls_failed_mod)  " row lỗi (EARLY, có %cid)
  REPORTED DATA(ls_reported_mod).

" 3. COMMIT 1 lần (long form để lấy LATE failures)
COMMIT ENTITIES RESPONSE OF i_salesordertp
  FAILED   DATA(ls_failed_cmt)  " LATE — KHÔNG có %cid, chỉ có %key
  REPORTED DATA(ls_reported_cmt).
```

### Error containment — 2 phase khác nhau

| Phase | Type | Định danh row lỗi | Khi 1 row lỗi |
|---|---|---|---|
| **MODIFY** | `FAILED EARLY` | `%cid` (string bạn đặt) | Row khác **vẫn ở trong buffer**, sẽ commit OK (partial success) |
| **COMMIT** | `FAILED LATE` | `%key` (không có `%cid`) | **All-or-nothing** — không row nào persist xuống DB |

`sy-subrc` sau `COMMIT ENTITIES`:
- `0` — commit thành công
- `4` — lỗi early save phase (`finalize`, `check_before_save`) → buffer **còn nguyên**, có thể fix + retry
- `8` — lỗi late save phase (`save`, `save_modified`) → RAP tự clear buffer + ROLLBACK WORK, **phải `ROLLBACK ENTITIES`** trước khi modify tiếp

### Map ngược về business key

- MODIFY failure: dùng `%cid` từ `ls_failed_mod` → tra `lt_cid_map` → ra business key (vd `item_uuid`).
- COMMIT failure: LATE response **không có `%cid`**. Phải lưu `ls_mapped` từ MODIFY (`%cid → %key`) rồi dùng `%key` trong `ls_failed_cmt` để tra ngược qua mapped.

### 2 strategy khi áp dụng cho mass upload

Vì COMMIT all-or-nothing, lựa chọn nghiệp vụ:

- **Strict** — 1 batch toàn bộ, 1 row sai → fail hết file. Pre-validate sạch trước MODIFY để giảm xác suất COMMIT fail.
- **Per-group batch** — group theo business unit (vd theo `salesorder`), 1 MODIFY + 1 COMMIT cho mỗi group. 1 group lỗi → chỉ group đó rollback, group khác vẫn save. Trade-off: N group EML call thay vì 1, nhưng vẫn ít hơn N×row.

Chọn strategy là **quyết định nghiệp vụ**, không phải technical default.

### Tài liệu SAP chính thức

- [ABAPCOMMIT_ENTITIES](https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US/ABAPCOMMIT_ENTITIES.html) — "`COMMIT ENTITIES` follows an all or nothing approach" + bảng `sy-subrc` semantics
- [ABAPTYPE_RESPONSE_FOR](https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US/ABAPTYPE_RESPONSE_FOR.html) — components `FAILED EARLY` vs `FAILED LATE` (`%cid` not available in LATE)
- [Implementation Contract: CREATE](https://help.sap.com/docs/ABAP_Cloud/f055b8bf582d4f34b91da667bc1fcce6/77ff4292196341ca87a2954f5c6f1c33.html) — "one row for every created instance in `mapped`... one row for each failed instance identifier in `failed`"
- [Common Response Parameters](https://help.sap.com/docs/ABAP_Cloud/f055b8bf582d4f34b91da667bc1fcce6/306207b3859840e48ca0026e4032dfe6.html) — ví dụ MODIFY ok nhưng COMMIT fail (validate on save)
- [ABENCOMMIT_ENTITIES_SH_LO_ABEXA](https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US/ABENCOMMIT_ENTITIES_SH_LO_ABEXA.html) — demo all-or-nothing với 3 valid + 3 invalid → 0 saved
