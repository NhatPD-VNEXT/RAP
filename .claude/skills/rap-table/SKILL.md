---
name: rap-table
description: "DDIC database table (TABL) development for SAP RAP on ABAP Cloud/BTP. Covers creating persistent tables and draft tables (_D) with correct field types, currency/quantity annotation syntax, and standard admin fields. Use this skill whenever the user wants to create or modify a DDIC table, ZM*T persistence table, draft table, or needs to fix currency/quantity annotation errors at TABL level. Trigger on: 'TABL', 'database table', 'persistent table', 'draft table', 'create table', '@AbapCatalog.tableCategory', '@Semantics.amount.currencyCode' (table level), '@Semantics.quantity.unitOfMeasure' (table level)."
---

# RAP DDIC Table (TABL) Development

Tạo/sửa DDIC table cho RAP managed BO trên ABAP Cloud. Áp dụng cho persistence table (`ZxxxxT`) và draft table (`ZxxxxT_D`).

## Header annotations chuẩn

> **KHÔNG chèn block `[変更履歴]` vào TABL.** Source table bắt đầu thẳng bằng `@EndUserText.label` — rule `abap-cloud-naming.md` § Version History Header miễn TABL (lịch sử theo dõi qua transport). Header chỉ áp cho CLAS/DDLS/BDEF/DDLX/SRVD.

```
@EndUserText.label : '<Table description>'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #RESTRICTED
define table <table_name_lowercase> {
  ...
}
```

## Currency / Quantity annotation — BẮT BUỘC qualified syntax

ABAP Cloud DDIC table KHÔNG chấp nhận `abap.curr`/`abap.cuky` ở dạng generic — sinh lỗi severity E:
- `Annotation with reference to currency code for field XXX is missing/uncomplete`
- `テーブル CURRENCY の使用は許可されません` (nếu dùng `abap.cuky`/`waers` raw)

**Fix đã verify (ZM909T)**: dùng annotation reference dạng **qualified `'<table_name>.<field_name>'`** (KHÔNG phải chỉ `'<field_name>'`), và field currency/unit khai báo type **dựa trên data element domain-specific** (ví dụ `/dmo/currency_code`, hoặc data element tự định nghĩa kế thừa domain CUKY/UNIT) — KHÔNG dùng raw `abap.cuky`/`waers`/`abap.unit` không reference.

```
@Semantics.amount.currencyCode : '<table_name>.currency_code'
booking_fee   : /dmo/booking_fee;     -- hoặc data element CURR riêng

@Semantics.amount.currencyCode : '<table_name>.currency_code'
total_price   : /dmo/total_price;

@Semantics.quantity.unitOfMeasure : '<table_name>.quantity_unit'
quantity_01   : menge_d;

quantity_unit : meins;
currency_code : /dmo/currency_code;   -- KHÔNG cần (và KHÔNG được) thêm @Semantics.currencyCode: true ở field này — annotation đó invalid ở TABL level (severity W, sẽ disappear), bỏ qua.
```

> Nếu case không có sẵn data element domain-specific phù hợp (`/dmo/...`), tạo Data Element (`ZZ...`) riêng kế thừa domain `CUKY`/`UNIT` rồi dùng tương tự — KHÔNG dùng `abap.cuky`/`abap.unit` trực tiếp ở TABL.

## Standard admin fields (managed BO)

```
created_by             : abp_creation_user;
created_at             : abp_creation_tstmpl;
local_last_changed_by  : abp_locinst_lastchange_user;
local_last_changed_at  : abp_locinst_lastchange_tstmpl;
last_changed_at        : abp_lastchange_tstmpl;
```

(không dùng `timestampl` raw / `abp_lastchange_user` đơn lẻ — dùng đúng các data element `abp_*` ở trên để khớp BDEF `etag`/`total etag`/`%admin` mapping chuẩn.)

## Draft table (`_D`)

> **BẮT BUỘC**: Field names trong draft table phải khớp **CDS element names** (CamelCase → lowercase, không underscore), KHÔNG phải DB column names của persistence table.
> Ví dụ: persistence `receive_date as ReceiveDate` → draft field `receivedate` (DB col `RECEIVEDATE`), không phải `receive_date`.
> Verified từ reference `ZMF901_VN_D`: `TRAVELID`, `BEGINDATE`, `CURRENCYCODE`… (không có underscore).

Cùng field list với persistence table (rename theo CDS element) + thêm (chú ý dấu ngoặc kép quanh `%admin` — bắt buộc vì `%` là ký tự đặc biệt):

```
"%admin" : include sych_bdl_draft_admin_inc;
```

> KHÔNG dùng `abp_behv_mngd_admin_draft` hoặc `abp_draft_admin_inc` — cả 2 đều severity E "テーブル ... を含めることは許可されません" (table include not allowed). `sych_bdl_draft_admin_inc` (package `SABP_COMPILER`, "Standard Include for Draft Administration (BDL Syntax Check)") là include đúng — verified activate `success` + sinh đủ field draft admin (`DRAFTENTITYCREATIONDATETIME`, `DRAFTENTITYLASTCHANGEDATETIME`, `DRAFTADMINISTRATIVEDATAUUID`, `DRAFTENTITYOPERATIONCODE`, `HASACTIVEENTITY`, `DRAFTFIELDCHANGES`).

Description: `<Persistence table description> (Draft)`.

## MCP Create Workflow — sap-adt (1 call: source + activate)

`create_object("TABL", ..., source=...)` ghi full DDL source + activate trong 1 call (không còn lock/update/activate riêng như VSP). KHÔNG khai báo `key client` trong source — server tự thêm; trùng → lỗi "Field CLIENT is specified twice".

```
create_object(system,
  object_type="TABL",
  name="ZXXXXT",
  package="<package>",
  description="<desc>",
  source="<full DDL source — KHÔNG có dòng key client>")
```

Object đã tồn tại → sửa bằng `update_source(system, "TABL", "ZXXXXT", source="<full DDL>", activate=True)`.

> Check trước activate: `syntax_check(system, "TABL", "ZXXXXT", version="inactive")` (sau `update_source(activate=False)`), hoặc đọc activation log khi `activate=True`. Có `severity:"E"` → STOP, báo nguyên văn (per `rap-generate § 4.2`).

## Verify

```
get_source(system, "TABL", "ZXXXXT")   // confirm source + đã active
```

sap-adt **không** có tool đọc data table (VSP `query TABL_CONTENTS`/SQL không còn). Nếu cần confirm DB-level table đã generate → kiểm tra trong ADT thủ công. Activation báo `success` nhưng nghi bảng chưa generate → STOP, báo user (không tự debug nhiều cách, theo `rap-generate § 4.3`).

## Reference

Verified pattern: `ZMF901_VN` (package tham khảo) — currency field `/dmo/currency_code` + qualified annotation `'zmf901_vn.currency_code'`; quantity field `menge_d`/`meins` + `'zmf901_vn.quantity_unit'`.
