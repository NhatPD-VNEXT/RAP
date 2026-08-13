---
name: rap-parallel-multithread
description: Use when mass-processing a large input table in parallel work processes on ABAP Cloud — split N rows into chunks, run() spawns multiple RFC LUWs (multi-thread), each worker loops its chunk and may COMMIT ENTITIES, then reassemble all results. Pattern: orchestrator class inheriting cl_abap_parallel with constructor p_num_tasks/p_percentage, execute_parallel(it_input, if_num_task) chunking + EXPORT table TO DATA BUFFER per work package, do() redefinition loops the chunk, plus sequential single-item fallback class when num_task is 0. Reference pattern VI901 (TSV upload → mass SO/PO creation). Trigger on 'parallel mass processing', 'multi thread', 'cl_abap_parallel chunk', 'p_num_tasks', 'p_percentage', 't_in_tab', 't_out_tab', 'work package', 'run( p_in_tab', 'chunk size', 'parallel determination on save', 'execute_parallel table'.
---

# rap-parallel-multithread

## Overview

Khác với `rap-parallel-bo-call` (1 record → 1 LUW chỉ để được phép `COMMIT ENTITIES` trong handler), skill này dùng khi phải **xử lý hàng loạt N dòng** (vd file upload → tạo SO/PO mỗi dòng) và muốn chạy **đa luồng** để tăng throughput.

`cl_abap_parallel` tạo nhiều RFC work process song song. Mỗi line của `p_in_tab` = 1 **work package** = 1 RFC LUW riêng. Vì thế:
- COMMIT ENTITIES được phép trong `do()` (LUW riêng, ngoài behavior handler).
- Mỗi dòng input phải **serialize** qua `DATA BUFFER` (không truyền được object phức tạp qua RFC).
- **Chunking bắt buộc**: gói nhiều dòng vào 1 work package để giảm overhead spawn RFC — KHÔNG mỗi dòng 1 WP.

Reference: package `ZRAP_IF_VI901` (HAX). 3 class:
- `ZCL_VI901_01` — orchestrator đa luồng (chunk).
- `ZCL_VI901_03` — phiên bản single-item (fallback tuần tự khi num_task = 0).
- `ZCL_VI901_02` — nested parallel-bo-call (PO creation cần COMMIT) gọi từ trong worker → xem `rap-parallel-bo-call`.

## Khi nào dùng

| Tình huống | Skill |
|-----------|-------|
| Xử lý 1 record, chỉ cần COMMIT ENTITIES trong handler | `rap-parallel-bo-call` |
| Mass-process bảng N dòng, muốn đa luồng / chia tải | **rap-parallel-multithread** (skill này) |
| Worker lại cần gọi BO + COMMIT lồng bên trong | kết hợp: orchestrator (skill này) gọi → mỗi item dùng `rap-parallel-bo-call` |

## Class Structure — orchestrator

```abap
CLASS zcl_xxx_01 DEFINITION
  PUBLIC FINAL
  INHERITING FROM cl_abap_parallel
  CREATE PUBLIC.

  PUBLIC SECTION.
    " input = 1 dòng nghiệp vụ (table type cho cả batch)
    TYPES: gts_parallel_input TYPE zi_xxx_02,
           gtt_parallel_input TYPE TABLE OF zi_xxx_02.

    " output: gói result + fatal_text (lỗi dump worker)
    TYPES: BEGIN OF gts_parallel_output,
             fatal_text    TYPE string,
             file_item_upd TYPE gtt_xxx_02,   " kết quả nghiệp vụ
           END OF gts_parallel_output.
    TYPES: gtt_parallel_output TYPE TABLE OF gts_parallel_output WITH DEFAULT KEY.

    METHODS execute_parallel
      IMPORTING it_input         TYPE gtt_parallel_input
                if_num_task      TYPE i
      RETURNING VALUE(rt_output) TYPE gtt_parallel_output.

    METHODS do REDEFINITION.        " worker

    METHODS main_process            " logic 1 dòng
      IMPORTING is_input        TYPE gts_parallel_input
      RETURNING VALUE(rs_ouput) TYPE gts_parallel_output.
ENDCLASS.
```

## execute_parallel — orchestrator (chạy trong handler LUW)

Chia input thành chunk, mỗi chunk EXPORT thành 1 work package, `run()` spawn song song, rồi gom kết quả.

```abap
METHOD execute_parallel.
  DATA: ldt_xinput  TYPE cl_abap_parallel=>t_in_tab,
        ldt_xoutput TYPE cl_abap_parallel=>t_out_tab,
        lds_xinput  TYPE LINE OF cl_abap_parallel=>t_in_tab,
        lds_xoutput TYPE LINE OF cl_abap_parallel=>t_out_tab.
  DATA: ldt_input_chunk  TYPE STANDARD TABLE OF gts_parallel_input,
        ldt_output_chunk TYPE STANDARD TABLE OF gts_parallel_output,
        lds_input        TYPE gts_parallel_input,
        ldf_total        TYPE p.

  ldf_total = lines( it_input ).
  IF ldf_total = 0. RETURN. ENDIF.

  " 1. Quyết định chunk size: cap trần để 1 WP không quá nặng
  DATA ldf_chunk_sz TYPE i.
  IF ldf_total > 200.
    ldf_chunk_sz = 40.
  ELSE.
    ldf_chunk_sz = ceil( ldf_total / if_num_task ).
  ENDIF.

  " 2. Serialize từng chunk (table TO DATA BUFFER) thành 1 work package
  DATA(ldf_from) = 1.
  WHILE ldf_from <= ldf_total.
    DATA(ldf_to) = ldf_from + ldf_chunk_sz - 1.
    IF ldf_to > ldf_total. ldf_to = ldf_total. ENDIF.

    CLEAR ldt_input_chunk.
    LOOP AT it_input FROM ldf_from TO ldf_to INTO lds_input.
      APPEND lds_input TO ldt_input_chunk.
    ENDLOOP.

    CLEAR lds_xinput.
    EXPORT param_input = ldt_input_chunk TO DATA BUFFER lds_xinput.
    APPEND lds_xinput TO ldt_xinput.
    ldf_from = ldf_to + 1.
  ENDWHILE.

  " 3. Spawn đa luồng — mỗi line ldt_xinput = 1 RFC LUW
  run( EXPORTING p_in_tab  = ldt_xinput
       IMPORTING p_out_tab = ldt_xoutput ).

  " 4. Deserialize + gom kết quả mọi work package
  LOOP AT ldt_xoutput INTO lds_xoutput.
    CLEAR ldt_output_chunk.
    IF lds_xoutput-result IS NOT INITIAL.
      IMPORT param_output = ldt_output_chunk FROM DATA BUFFER lds_xoutput-result.

      " lỗi dump/exception bất ngờ của worker nằm ở -message
      IF lds_xoutput-message IS NOT INITIAL.
        LOOP AT ldt_output_chunk ASSIGNING FIELD-SYMBOL(<lfs>).
          <lfs>-fatal_text = lds_xoutput-message.
        ENDLOOP.
      ENDIF.
      APPEND LINES OF ldt_output_chunk TO rt_output.
    ENDIF.
  ENDLOOP.
ENDMETHOD.
```

## do — worker (mỗi chunk chạy trong RFC LUW riêng; COMMIT được phép)

```abap
METHOD do.
  DATA: ldt_input_chunk  TYPE STANDARD TABLE OF gts_parallel_input,
        ldt_output_chunk TYPE STANDARD TABLE OF gts_parallel_output,
        lds_input        TYPE gts_parallel_input,
        lds_output       TYPE gts_parallel_output.

  " 1. Nhận cả chunk từ DATA BUFFER
  IMPORT param_input = ldt_input_chunk FROM DATA BUFFER p_in.

  IF sy-subrc = 0.
    " 2. Loop từng dòng trong chunk → main_process (có thể COMMIT ENTITIES)
    LOOP AT ldt_input_chunk INTO lds_input.
      CLEAR lds_output.
      lds_output = main_process( is_input = lds_input ).
      APPEND lds_output TO ldt_output_chunk.
    ENDLOOP.
  ENDIF.

  " 3. Trả cả chunk output qua DATA BUFFER
  EXPORT param_output = ldt_output_chunk TO DATA BUFFER p_out.
ENDMETHOD.
```

## Driver — gọi từ DETERMINE ON SAVE (behavior pool)

num_task đọc từ bảng customizing → quyết định đa luồng vs tuần tự. Constructor truyền `p_num_tasks` + `p_percentage`.

```abap
" num_task lấy từ customizing (zy043t.zzvalue01)
SELECT SINGLE zzvalue01 FROM zy043t
  WHERE div = @zcl_xxx_01=>gcf_div AND zztype = @... AND zzseqno = @...
  INTO @DATA(ldf_zzvalue01).
DATA(ldf_num_task) = CONV i( ldf_zzvalue01 ).

IF ldf_num_task IS INITIAL.
  " --- tuần tự: single-item class, loop từng dòng ---
  DATA(lo_single) = NEW zcl_xxx_03( ).
  LOOP AT ldt_parallel_input INTO lds_parallel_input.
    DATA(lds_out) = lo_single->execute_parallel( lds_parallel_input ).
    " ... map kết quả ...
  ENDLOOP.
ELSE.
  " --- đa luồng: orchestrator ---
  DATA(lo_multi) = NEW zcl_xxx_01( p_num_tasks  = ldf_num_task   " số WP tối đa
                                   p_percentage = 40 ).           " % WP khả dụng được dùng
  DATA(ldt_out) = lo_multi->execute_parallel( it_input    = ldt_parallel_input
                                              if_num_task = ldf_num_task ).
  " ... loop ldt_out → map về %tky, set criticality/message ...
ENDIF.
```

## Key Rules

| Rule | Why |
|------|-----|
| `INHERITING FROM cl_abap_parallel`, `CREATE PUBLIC` | Bật `run()` → RFC → nhiều LUW song song |
| Constructor `p_num_tasks` (số WP) + `p_percentage` (% WP khả dụng) | Giới hạn tải hệ thống; không chiếm hết work process |
| **Chunk** input, không 1 dòng = 1 WP | Spawn RFC tốn kém; chunk giảm số WP, gom IO |
| Cap chunk size (vd >200 → 40 cố định) | Tránh 1 WP quá nặng khi tổng dòng rất lớn |
| `EXPORT/IMPORT param = <table> TO/FROM DATA BUFFER` | Truyền chunk (table) qua RFC; không pass object qua boundary |
| `do()` IMPORT `p_in` → loop → EXPORT `p_out` | Hợp đồng cố định của cl_abap_parallel |
| Đọc lỗi worker ở `p_out_tab[]-message` | Dump/exception bất ngờ trong WP nằm ở `-message`, không phải `-result` |
| Guard `lds_xoutput-result IS NOT INITIAL` | WP fail → result rỗng, bỏ qua an toàn |
| Output structure gói cả `fatal_text` | Truyền text lỗi worker về tầng gọi để set criticality |
| Có class single-item fallback (num_task = 0) | Debug dễ + môi trường không cho parallel; cùng `execute_parallel` API |

## Mapping kết quả về RAP entity

Worker trả `it_input` đã enrich (sddocno, message, criticality...). Tầng gọi map lại bằng key gốc:

```abap
SORT ldt_file_item BY attachmentuuid itemuuid.   " để BINARY SEARCH
LOOP AT ldt_out INTO DATA(lds_o).
  LOOP AT lds_o-file_item_upd INTO DATA(lds_upd).
    READ TABLE ldt_file_item INTO DATA(lds_fi)
      WITH KEY attachmentuuid = lds_upd-attachmentuuid
               itemuuid       = lds_upd-itemuuid BINARY SEARCH.
    IF sy-subrc = 0.
      IF lds_o-fatal_text IS NOT INITIAL.        " worker dump → error
        lds_upd-criticalitysd = gcf_criticality_error.
        lds_upd-sdmessage     = lds_o-fatal_text.
      ENDIF.
      APPEND VALUE #( %tky = lds_fi-%tky  sddocno = lds_upd-sddocno ... )
        TO ldt_data_for_item_upd.
    ENDIF.
  ENDLOOP.
ENDLOOP.
MODIFY ENTITIES OF zi_xxx_01 IN LOCAL MODE ENTITY item UPDATE FIELDS (...) WITH ldt_data_for_item_upd.
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Mỗi dòng input append 1 line vào `p_in_tab` | Chunk nhiều dòng/WP; serialize cả table TO DATA BUFFER |
| Quên xử lý `p_out_tab[]-message` | Worker dump im lặng → mất lỗi; luôn check `-message` |
| Truyền object/ref qua DATA BUFFER | Chỉ serialize data thuần (struct/table) |
| `COMMIT ENTITIES` ở tầng `execute_parallel` | Vẫn trong handler LUW → cấm; chỉ COMMIT trong `do()`/`main_process` |
| Chunk size = ceil(total/num_task) cho mọi cỡ | Tổng lớn → 1 WP khổng lồ; cap trần (vd 40) khi total > ngưỡng |
| Không có đường tuần tự | Thêm class single-item cho num_task=0 (debug + môi trường hạn chế) |
| Map kết quả sai dòng | Dùng key nghiệp vụ (attachmentuuid+itemuuid) + SORT/BINARY SEARCH |

## Deploy (sap-adt)

3 class `ZCL_*` đa luồng deploy được qua `create_object` + `update_class_include` (HỎI CONFIRM mode theo CLAUDE.md). Constructor `p_num_tasks/p_percentage` là của `cl_abap_parallel` (C0 released) — không cần khai báo lại. Sau activate: chạy thử với num_task=0 (tuần tự) trước để verify logic, rồi bật đa luồng.
