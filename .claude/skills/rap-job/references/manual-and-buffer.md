# rap-job — Manual objects (ZAL/ZJC/ZJT) + Buffer pattern (Step 3–5 detail)

Nguồn: SKILL.md § Step 3 (ZAL_*), § Step 4 (ZJC_*/ZJT_*), § Step 5 (Buffer pattern). ZAL/ZJC/ZJT KHÔNG có MCP tool → tạo thủ công trong ADT.

---

## Step 3 — Application Log Object (ZAL_*)

**KHÔNG có MCP tool** → tạo thủ công trong ADT:

1. Right-click package → New → Other ABAP Repository Object → "Application Log Object"
2. Name: `ZAL_<5chars>_<NN>` (vd `ZAL_MI901_01`)
3. Add Subobject (vd `JOB`, `BATCH`) cho phân loại log

Class ZCJ reference object name + subobject làm string constants:

```abap
CONSTANTS:
  application_log_object_name   TYPE if_bali_object_handler=>ty_object VALUE 'ZAL_MI901_01',
  application_log_sub_obj1_name TYPE if_bali_object_handler=>ty_object VALUE 'JOB'.
```

Chi tiết API `cl_bali_*` → xem skill **rap-app-log**.

---

## Step 4 — Job Catalog Entry (ZJC_*) + Template (ZJT_*)

**KHÔNG có MCP tool** → tạo thủ công trong ADT:

### Catalog Entry

1. Right-click package → New → Application Job Catalog Entry
2. Name: `ZJC_<5chars>_<NN>`
3. Description: business label
4. Job Execution Class: reference `ZCJ_<5chars>_<NN>` (cùng số NN)
5. Authorization Object: chọn IAM scope phù hợp
6. Save + Activate

### Template

1. Right-click package → New → Application Job Template
2. Name: `ZJT_<5chars>_<NN>` (cùng số với ZJC)
3. Catalog Entry: chọn `ZJC_*` vừa tạo
4. Parameter Default Values: điền sẵn nếu cần (vd `p_ifid = 'IF006'`)
5. Save + Activate

Template không bắt buộc nếu user muốn nhập parameter mỗi lần chạy. Có template → admin chọn template từ App "Application Jobs" và nhấn Run.

---

## Step 5 — Buffer pattern (khi action call → defer save)

Trong unmanaged BO action (`SendSelectedData` của MI901), không gọi `MODIFY ddic_table` trực tiếp trong handler — push vào singleton buffer để saver phase ghi:

```abap
" In behavior handler (CCIMP local types)
CLASS lcl_buffer DEFINITION CREATE PRIVATE.
  PUBLIC SECTION.
    CLASS-DATA gdt_buffer TYPE STANDARD TABLE OF zm901t WITH EMPTY KEY.
    CLASS-METHODS get_instance RETURNING VALUE(ro_instance) TYPE REF TO lcl_buffer.
  PRIVATE SECTION.
    CLASS-DATA go_instance TYPE REF TO lcl_buffer.
ENDCLASS.

CLASS lcl_buffer IMPLEMENTATION.
  METHOD get_instance.
    IF go_instance IS NOT BOUND.
      go_instance = NEW #( ).
    ENDIF.
    ro_instance = go_instance.
  ENDMETHOD.
ENDCLASS.

" In action handler:
DATA(lo_buffer) = lcl_buffer=>get_instance( ).
lo_buffer->gdt_buffer = ldt_modif.

" In saver class:
CLASS lsc_zi_mi901_03 DEFINITION INHERITING FROM cl_abap_behavior_saver.
  PROTECTED SECTION.
    METHODS save REDEFINITION.
ENDCLASS.

CLASS lsc_zi_mi901_03 IMPLEMENTATION.
  METHOD save.
    DATA(lo_buffer) = lcl_buffer=>get_instance( ).
    IF lo_buffer->gdt_buffer IS NOT INITIAL.
      MODIFY zm901t FROM TABLE @lo_buffer->gdt_buffer.
      CLEAR lo_buffer->gdt_buffer.
    ENDIF.
  ENDMETHOD.
ENDCLASS.
```

> Buffer pattern dùng khi: 1 RAP request có nhiều action calls → cần gom MODIFY thành 1 lần ở save phase để tránh deadlock + giữ atomic.
