---
name: rap-badi-extension
description: "Extend a standard S/4HANA Public Cloud process (項目追加 / custom-field logic) via released BAdI + Enhancement Implementation on ABAP Cloud — NOT a custom RAP BO. Pattern: a class ZCL_<purpose>_<PJ>_NN implements if_badi_interface + one released BAdI interface (e.g. Purchase Requisition: if_pph_mrp_purreq_cfl~modify_purreq to default/derive custom fields during MRP conversion, if_mm_pur_s4_pr_fldcntrl~modify_fieldcontrols for field control readonly/mandatory/hidden/optional via fieldselection_table + fieldstatus codes -/*/+/., if_mm_pur_s4_pr_check~check for validation appending to messages + haserror flag), wired to a released enhancement spot through an Enhancement Implementation ENHO/XH ZBADI_<PJ>_NN. Custom fields are Key-User YY1_*_PRI fields exposed to the BAdI; master-existence/validation logic in a local helper class (CCIMP lhcl_helper); messages via message class (ZRAP_COM_99 / standard FF, LR). Applies to PR/PO/SO/delivery/BP extension. Reference: MF905 (購買依頼項目追加), also MF904/MF938/PF905/PF906/VF903/VF913/YF004. Trigger on: '項目追加', 'custom field', 'extend standard', 'BAdI', 'if_badi_interface', 'enhancement implementation', 'ENHO', 'ZBADI_', 'field control', 'modify_fieldcontrols', 'fieldselection_table', 'fieldstatus', 'if_mm_pur_s4_pr_check', 'if_mm_pur_s4_pr_fldcntrl', 'if_pph_mrp_purreq_cfl', 'modify_purreq', 'YY1_', 'released BAdI', 'purchaserequisitionhaserror', 'Key User field logic'."
---

# Standard S/4 Extension via Released BAdI (項目追加)

Pattern để **mở rộng process standard S/4 Public Cloud** (thêm logic cho custom field, field control, validation) — dùng cho các case **項目追加** trong `ZRAP_FUN`. **KHÔNG phải RAP BO custom**: implement **released BAdI** trên released enhancement spot. Tham chiếu **MF905** (購買依頼項目追加).

## When to use

- Thêm custom field (Key User `YY1_*`) vào standard object (PR/PO/SO/delivery/BP…) rồi cần: **defaulting/derivation**, **field control** (readonly/mandatory), **validation**, **consistency check** khi tạo/sửa bản ghi standard.
- Đấu logic vào **released BAdI** của standard process (không sửa được BO standard).

KHÔNG dùng cho:
- BO nghiệp vụ custom hoàn toàn (bảng Z riêng) → **`rap-managed-bo`**.
- Đọc/ghi standard BO qua EML từ code riêng → **`rap-bo-interface`**.
- File upload → tạo standard doc → **`rap-get-file`** + `rap-bo-interface`.

## Object inventory (per extension case)

| # | Object | Type | Naming | Deploy |
|---|--------|------|--------|--------|
| 1 | BAdI implementation class | CLAS | `ZCL_<purpose>_<PJ>_NN` | clas-confirm (MCP `create_object` + `update_class_include`) |
| 2 | Enhancement Implementation | ENHO/XH | `ZBADI_<PJ>_NN` | **manual ADT** (New → BAdI Enhancement Implementation) |
| 3 | (opt) common/helper class | CLAS | `ZCL_COMMON_PROC` / `ZCL_MODIFY_ITEM_<PJ>_NN` | clas-confirm |
| 4 | Custom fields `YY1_*` | (Key User) | `YY1_<obj>_<name>_PRI` | **manual** (Custom Fields app / adaptation) |
| 5 | Message class | MSAG | `ZRAP_COM_99` (dùng chung) | reuse |

> BAdI wiring (ENHO) + custom field publish (Key User) là **manual** — sap-adt không tạo. Skill sinh **class implementation**. 1 case có thể có nhiều class (mỗi BAdI 1 class), gom trong sub-package `ZRAP_FUN_<PJ>_NN`.

## Cấu trúc class BAdI (bắt buộc)

```abap
CLASS zcl_<purpose>_<pj>_nn DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES if_badi_interface.         " luôn có
    INTERFACES <released_badi_interface>. " 1 BAdI interface cụ thể
  ...
ENDCLASS.
```

- **PHẢI** `INTERFACES if_badi_interface` + đúng 1 released BAdI interface.
- Class released? Không cần — class custom. Nhưng BAdI interface + spot PHẢI **released for Cloud** (C1/C0). Verify bằng `api_release_state` trước khi implement.
- Wire class vào BAdI qua Enhancement Implementation ZBADI_* (manual): chọn enhancement spot released → BAdI definition → set implementing class.

## 3 loại BAdI hay dùng (ví dụ Purchase Requisition)

### A. Defaulting / derivation — `if_pph_mrp_purreq_cfl~modify_purreq`

Điền/đổi giá trị custom field khi standard tạo bản ghi (vd MRP tạo PR):

```abap
METHOD if_pph_mrp_purreq_cfl~modify_purreq.
  MOVE-CORRESPONDING purchaserequisition         TO s_item.          " mmpur_s_pr_item_import
  MOVE-CORRESPONDING purchaserequisition_changed TO s_item_change.   " mmpur_s_pr_itm_change
  zcl_common_proc=>set_itemfield(
    EXPORTING im_purrequisitionitem     = s_item
              im_purreqaccassgnmt_table = t_acc
    CHANGING  ch_purrequisitionitemchange = s_item_change ).
  MOVE-CORRESPONDING s_item_change TO purchaserequisition_changed.   " trả về change structure
ENDMETHOD.
```

### B. Field control — `if_mm_pur_s4_pr_fldcntrl~modify_fieldcontrols`

Set readonly/mandatory/hidden/optional cho từng field qua `fieldselection_table`:

```abap
CONSTANTS: BEGIN OF c_fieldstatus,
             hidden    TYPE mmpur_s_pr_fldsel-fieldstatus VALUE '-',
             display   TYPE mmpur_s_pr_fldsel-fieldstatus VALUE '*',   " readonly
             mandatory TYPE mmpur_s_pr_fldsel-fieldstatus VALUE '+',
             optional  TYPE mmpur_s_pr_fldsel-fieldstatus VALUE '.',
           END OF c_fieldstatus.

METHOD if_mm_pur_s4_pr_fldcntrl~modify_fieldcontrols.
  " phân biệt CREATE vs CHANGE: đếm bản ghi đã tồn tại
  SELECT COUNT(*) FROM i_purchaserequisitionitemapi01 WITH PRIVILEGED ACCESS
    WHERE purchaserequisition = @purchaserequisitionitem-purchaserequisition
      AND purchaserequisitionitem = @purchaserequisitionitem-purchaserequisitionitem.
  DATA(ldf_mode) = COND string( WHEN sy-subrc = 0 THEN 'CHANGE' ELSE 'CREATE' ).

  LOOP AT fieldselection_table ASSIGNING FIELD-SYMBOL(<f>).
    CASE <f>-field.
      WHEN 'YY1_..._PRI' OR 'YY1_..._PRI'.   <f>-fieldstatus = c_fieldstatus-display.
      WHEN 'YY1_REQUESTER_PRI'.              <f>-fieldstatus = c_fieldstatus-mandatory.
      WHEN 'YY1_..._PRI'.
        <f>-fieldstatus = SWITCH #( is_subcon WHEN abap_true THEN c_fieldstatus-display
                                                              ELSE c_fieldstatus-optional ).
      WHEN OTHERS.                           <f>-fieldstatus = c_fieldstatus-optional.
    ENDCASE.
  ENDLOOP.
ENDMETHOD.
```

### C. Validation — `if_mm_pur_s4_pr_check~check`

Kiểm tra + append message, set error flag:

```abap
METHOD if_mm_pur_s4_pr_check~check.
  LOOP AT purchaserequisitionitem_table ASSIGNING FIELD-SYMBOL(<item>).
    DATA(ro) = NEW lhcl_helper( im_req_header = purchaserequisition
                                im_req_item   = <item>
                                im_acc_asgn   = ldt_acc_for_item ).
    IF NOT ro->exist_check_4_revision_minor( ).
      APPEND VALUE #( messagetype = 'E' messageid = 'ZRAP_COM_99' messagenumber = 025
                      documentnumber = <item>-purchaserequisition
                      documentitemnumber = <item>-purchaserequisitionitem ) TO messages.
      purchaserequisitionhaserror = abap_true.
    ENDIF.
    " ... các check khác (currency FF/112, supplier LR/242, requester ZRAP_COM_99/129, consistency…)
  ENDLOOP.
ENDMETHOD.
```

- `messages` = bảng message chuẩn của BAdI (messagetype/id/number + variable1..4 + documentnumber/itemnumber).
- Set `<obj>haserror = abap_true` để standard reject save.
- Logic check tách vào **local helper class `lhcl_helper`** (CCIMP) — nhận header/item/accassignment, expose `exist_check_*` / `consist_check_*` trả boolean.

## Rules — bắt buộc

1. Class `INTERFACES if_badi_interface` + đúng BAdI interface released (verify `api_release_state`).
2. Custom field tham chiếu bằng tên Key User `YY1_<obj>_<name>_PRI` (không tự chế field DDIC).
3. SELECT trong BAdI dùng `WITH PRIVILEGED ACCESS` (context standard, tránh DCL chặn).
4. Defaulting: chỉ ghi vào **change structure** (`*_changed`), MOVE-CORRESPONDING ra/vào.
5. Field control: dùng đúng `fieldstatus` code `-`/`*`/`+`/`.`; phân biệt CREATE/CHANGE khi cần.
6. Validation: append `messages` + set `haserror`; KHÔNG raise exception (standard nuốt).
7. Variable naming theo IPS Ver4.0 (`ldf_`, `lds_`, `ro_`…); các param BAdI giữ nguyên tên chuẩn.
8. ENHO `ZBADI_<PJ>_NN` tạo manual + activate — class không có tác dụng nếu chưa wire.

## Validation checklist

- [ ] Class implements `if_badi_interface` + 1 released BAdI interface (đã check `api_release_state`)
- [ ] Enhancement Implementation `ZBADI_<PJ>_NN` (ENHO) wire class vào spot — manual, activate
- [ ] Custom field `YY1_*_PRI` đã publish qua Key User trước khi code
- [ ] Defaulting: ghi vào `*_changed` (change structure), không đụng import gốc
- [ ] Field control: `fieldstatus` đúng code, phân biệt CREATE/CHANGE
- [ ] Validation: `messages` + `haserror`, không raise exception
- [ ] SELECT `WITH PRIVILEGED ACCESS`
- [ ] Check logic tách helper `lhcl_helper` (CCIMP), trả boolean
- [ ] Message class tồn tại (ZRAP_COM_99 / standard FF/LR…)

## Common pitfalls

| Lỗi | Triệu chứng | Fix |
|-----|------------|-----|
| BAdI/spot không released Cloud | Không implement được / activate fail | Verify `api_release_state` (C0/C1) trước |
| Ghi vào import gốc thay vì `*_changed` | Giá trị không được standard nhận | MOVE ra `*_changed` |
| Raise exception trong check | Dump / standard không hiện message | Append `messages` + set `haserror` |
| `fieldstatus` sai code | Field không đổi trạng thái | Dùng `-`/`*`/`+`/`.` đúng |
| Quên `WITH PRIVILEGED ACCESS` | SELECT rỗng trong context standard | Thêm vào |
| Class chưa wire ENHO | Logic không chạy | Tạo + activate `ZBADI_*` |
| Không phân biệt CREATE/CHANGE | Field control sai khi sửa | Đếm bản ghi tồn tại → mode |

## Reference

- **MF905** `ZRAP_FUN_MF905` (購買依頼項目追加): `ZCL_MRP_PURREQ_CFL__MF905_01` (`if_pph_mrp_purreq_cfl~modify_purreq`), `ZCL_FLDCNTRL_SIMPLE_MF905_01` (`if_mm_pur_s4_pr_fldcntrl~modify_fieldcontrols`), `ZCL_CHECK_MF905_01` (`if_mm_pur_s4_pr_check~check`), helper `ZCL_COMMON_PROC`/`ZCL_MODIFY_ITEM_MF905_01`, ENHO `ZBADI_MF905_01/02/03`, field `YY1_MMPURREQ_IM_*_PRI`.
- Cùng loại: MF904/MF938 (発注/入出庫項目追加), PF905/PF906/PF909 (計画手配/製造指図/作業手順), VF903/VF913 (受注/出荷項目追加), YF004/YF901 (品目/BP項目追加) — mỗi standard object có bộ BAdI riêng (check/fldcntrl/determination).
- Standard RAP BO qua EML: **`rap-bo-interface`**; custom BO: **`rap-managed-bo`**.
