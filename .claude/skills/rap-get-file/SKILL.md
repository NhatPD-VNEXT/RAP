---
name: rap-get-file
description: "Parse an uploaded file (XLSX/CSV/TXT) attachment in a RAP managed BO into an internal table on ABAP Cloud/BTP. Pattern: Fiori file-upload field (attachment RAWSTRING + mimetype + filename) → DETERMINE ON MODIFY determination (detUploadXlsxData) that deletes old child items, calls ZCL_COM_FILE_UPLOAD=>get_from_upload_data (XCO xco_cp_xlsx for xlsx, code page 932 for CSV), maps parsed rows to CREATE BY \\_items, then validate. Engine class ZCL_COM_FILE_UPLOAD wraps xco_cp_xlsx=>document->for_file_content + row_stream->write_to. Reference: ZBP_I_MF902_01 (purchase requisition upload) and ZBP_I_VI911_01 (sales quote upload) on NKK. Trigger on: 'file upload RAP', 'xlsx upload', 'detUploadXlsxData', 'get_from_upload_data', 'ZCL_COM_FILE_UPLOAD', 'xco_cp_xlsx', 'attachment mimetype filename', 'CREATE BY _items from file', 'parse excel ABAP Cloud', 'CSV upload codepage 932', 'iv_start_row', 'row_stream write_to'."
---

# RAP File Upload / Parse (XLSX・CSV)

Đọc 1 file đính kèm (XLSX/CSV/TXT) trên Fiori upload field của RAP managed BO và đổ vào child entity. Engine: `ZCL_COM_FILE_UPLOAD` (XCO `xco_cp_xlsx`). Reference: `ZBP_I_MF902_01`, `ZBP_I_VI911_01` (NKK).

## ⛔ BẮT BUỘC — luôn dùng common class

Mọi parse file upload trong RAP **PHẢI** đi qua `ZCL_COM_FILE_UPLOAD=>get_from_upload_data`. KHÔNG:
- Gọi trực tiếp `xco_cp_xlsx=>document->for_file_content( )` / tự viết XCO row_stream trong handler.
- Tự parse CSV bằng `SPLIT`/`cl_abap_*` trong handler.
- Tạo class/method upload mới song song.

Cần thêm format/logic mới → mở rộng chính `ZCL_COM_FILE_UPLOAD` (báo user trước khi sửa common class), không bypass.

## 1. Kiến trúc

```
Fiori upload (attachment + mimetype + filename trên header entity)
        │  user nhấn Save / action
        ▼
DETERMINE ON MODIFY: detUploadXlsxData     ← determination trên header
        │ 1. READ header (ALL FIELDS)
        │ 2. xóa child items cũ (READ BY \_items → MODIFY DELETE)
        │ 3. ZCL_COM_FILE_UPLOAD=>get_from_upload_data( attachment,mimetype,filename ) → ldt_select
        │ 4. map ldt_select → %target → MODIFY CREATE BY \_items
        │ 5. validateData (VALIDATE ON SAVE riêng / gọi inline)
        ▼
Child entity (items) chứa dữ liệu đã parse
```

Header entity cần 3 field upload (theo MF902/VI911):
- `attachment` — `RAWSTRING` (nội dung file binary)
- `mimetype`   — `c LENGTH 128`
- `filename`   — string

BDEF: khai báo `determination detUploadXlsxData on modify { field attachment; }` (hoặc on `{ create; }`). VI911 đặt tên determination `detuploadxlsxdata` FOR DETERMINE ON MODIFY.

## 2. Engine class — ZCL_COM_FILE_UPLOAD

### Signature `get_from_upload_data`
```abap
get_from_upload_data(
  EXPORTING
    if_mimetype  TYPE string          " lds_data-mimetype
    if_data      TYPE xstring         " lds_data-attachment (RAWSTRING)
    if_filename  TYPE string          " lds_data-filename
    iv_start_row TYPE i               " dòng bắt đầu đọc (xlsx có header → 2; VI911 dùng 1)
    if_codepage  TYPE ...             " CSV: xco_cp_character=>code_page->for('932') (Shift-JIS)
  CHANGING
    ct_rows      TYPE STANDARD TABLE  " internal table đích, 1 component = 1 cột theo thứ tự
).
```

Logic dispatch theo mimetype/đuôi file:
- `application/vnd.openxmlformats[-officedocument.spreadsheetml.sheet]` → xlsx
- `text/csv` | `text/plain` → csv
- `application/octet-stream` → đọc đuôi filename (`xlsx` / `csv` / `txt`)
- Bắt `cx_root` nội bộ → không raise; nếu file lỗi `ct_rows` rỗng (xem Gotchas).

### Cốt lõi xlsx (`get_from_xlsx_data`) — XCO
```abap
DATA(lo_xlsx) = xco_cp_xlsx=>document->for_file_content( if_data ).
DATA(lo_ws)   = lo_xlsx->read_access( )->get_workbook( )->worksheet->at_position( 1 ).
" số cột = số component của line type ct_rows
DATA(lo_pat) = xco_cp_xlsx_selection=>pattern_builder->simple_from_to(
  )->from_column( xco_cp_xlsx=>coordinate->for_numeric_value( 1 )
  )->to_column(   xco_cp_xlsx=>coordinate->for_numeric_value( ldf_struclen )
  )->from_row(    xco_cp_xlsx=>coordinate->for_numeric_value( if_start_row )
  )->get_pattern( ).
lo_ws->select( lo_pat )->row_stream( )->operation->write_to( REF #( ct_rows )
  )->if_xco_xlsx_ra_operation~execute( ).
```
→ **Thứ tự field của line type `ct_rows` = thứ tự cột Excel.** Khai struct local đúng thứ tự cột, đủ số cột.

## 3. Determination template (rút gọn từ MF902/VI911)

```abap
METHOD detuploadxlsxdata.
  " struct local: 1 field / 1 cột Excel, ĐÚNG thứ tự cột
  TYPES: BEGIN OF lts_row,
           col1 TYPE zc_xxx_02-field1,
           col2 TYPE zc_xxx_02-field2,
           " ...
         END OF lts_row.
  DATA: ldt_select TYPE TABLE OF lts_row,
        ldt_create TYPE TABLE FOR CREATE zi_xxx_01\_items,
        lds_create LIKE LINE OF ldt_create,
        lds_ct     LIKE LINE OF lds_create-%target.
  DATA: ldf_numb TYPE n LENGTH 4.
  DATA  lds_reported LIKE LINE OF reported-header.

  READ ENTITIES OF zi_xxx_01 IN LOCAL MODE
    ENTITY header ALL FIELDS WITH CORRESPONDING #( keys )
    RESULT DATA(ldt_hdr).

  " 1) xóa child cũ
  IF ldt_hdr IS NOT INITIAL.
    READ ENTITIES OF zi_xxx_01 IN LOCAL MODE
      ENTITY header BY \_items ALL FIELDS WITH CORRESPONDING #( ldt_hdr )
      RESULT DATA(ldt_items_old).
    DATA ldt_del TYPE TABLE FOR DELETE zi_xxx_01\\items.
    MOVE-CORRESPONDING ldt_items_old TO ldt_del.
    MODIFY ENTITIES OF zi_xxx_01 IN LOCAL MODE
      ENTITY items DELETE FROM ldt_del.
  ENDIF.

  LOOP AT ldt_hdr INTO DATA(lds_hdr).
    CHECK lds_hdr-attachment IS NOT INITIAL
      AND lds_hdr-mimetype   IS NOT INITIAL
      AND lds_hdr-filename   IS NOT INITIAL.

    " 2) parse file
    TRY.
        zcl_com_file_upload=>get_from_upload_data(
          EXPORTING if_mimetype  = lds_hdr-mimetype
                    if_data      = lds_hdr-attachment
                    if_filename  = lds_hdr-filename
                    iv_start_row = 2                       " 2: bỏ dòng tiêu đề
                    if_codepage  = xco_cp_character=>code_page->for( iv_value = '932' )
          CHANGING  ct_rows      = ldt_select ).
      CATCH cx_root INTO DATA(ldo_root).
        lds_reported = VALUE #( %tky = lds_hdr-%tky ).
        lds_reported-%msg = new_message( severity = ms-error id = 'ZRAP_COM_00'
                                         number = '000' v1 = ldo_root->get_longtext( ) ).
        APPEND lds_reported TO reported-header.
    ENDTRY.
    CHECK ldt_select IS NOT INITIAL.

    " 3) map → %target
    CLEAR lds_create.
    LOOP AT ldt_select INTO DATA(lds_row) WHERE col1 IS NOT INITIAL.
      CLEAR lds_ct.
      ldf_numb += 1.
      MOVE-CORRESPONDING lds_hdr TO lds_ct.
      MOVE-CORRESPONDING lds_row TO lds_ct.
      lds_ct-%cid  = |%CIDS_{ ldf_numb }|.
      lds_ct-field1 = |{ lds_row-col1 ALPHA = IN }|.       " chuẩn hóa key khi cần
      APPEND lds_ct TO lds_create-%target.
    ENDLOOP.

    " 4) CREATE BY \_items
    MOVE-CORRESPONDING lds_hdr TO lds_create.
    MODIFY ENTITIES OF zi_xxx_01 IN LOCAL MODE
      ENTITY header CREATE BY \_items
      FIELDS ( field1 field2 /* ... */ )
      WITH VALUE #( ( %tky = lds_hdr-%tky %target = lds_create-%target ) )
      MAPPED DATA(lds_map) FAILED DATA(lds_fail) REPORTED DATA(lds_rep).

    CLEAR: lds_hdr-attachment, lds_hdr-mimetype, lds_hdr-filename.
  ENDLOOP.
ENDMETHOD.
```

## 4. Naming alias (V1.03 lesson từ VI911)

Nếu BDEF dùng **alias** (`header`, `items`) thì handler/READ/MODIFY/`reported-*`/`failed-*`/`mapped-*` phải dùng alias, KHÔNG dùng tên CDS (`reported-zi_vi911_01` → `reported-header`). MF902 dùng tên CDS gốc (`reported-zi_mf902_01`, ENTITY `zi_mf902_01`); VI911 đã migrate sang alias. Theo alias đã khai trong BDEF của case.

## 5. Conversion thường gặp (MF902)
- Key/số có leading zero: `|{ val ALPHA = IN }|`.
- Material: `zcl_com_conv=>conv_matn1_in( if_input = ... )`.
- Unit: `zcl_com_conv=>conv_cunit_in( if_input = ... )`.

## 6. Gotchas
- **Thứ tự cột = thứ tự component** của line type `ct_rows`; sai thứ tự → lệch cột, không báo lỗi. Đủ số component cho mọi cột định đọc.
- `get_from_upload_data` **nuốt exception** xlsx/csv nội bộ (CATCH cx_root, không re-raise) → file hỏng/đuôi sai trả `ct_rows` rỗng. Sau khi gọi phải `CHECK ldt_select IS NOT INITIAL` rồi báo lỗi nghiệp vụ.
- `iv_start_row`: xlsx có dòng tiêu đề → `2`; không header → `1` (VI911 dùng 1, MF902 dùng 2). Confirm theo template file.
- CSV tiếng Nhật → `if_codepage` '932' (Shift-JIS); xlsx bỏ qua codepage.
- Xóa child cũ **trước** khi re-parse để upload lại không nhân đôi item.
- Đọc nội dung file authoritative live qua `get_class_method_source(class_name='ZCL_COM_FILE_UPLOAD', method='get_from_upload_data')` — engine dùng chung, đừng copy cứng.

## Reference Pattern Lookup
- `ZBP_I_MF902_01` (NKK) — 購買依頼 upload, xác định cột purchase requisition, `iv_start_row=2`, conv matn1/cunit.
- `ZBP_I_VI911_01` (NKK) — 見積 upload, alias `header`/`items`, `iv_start_row=1`, validateData FOR VALIDATE ON SAVE + updateBusinessObject FOR DETERMINE ON SAVE.
- Engine: `ZCL_COM_FILE_UPLOAD` (`get_from_upload_data` / `get_from_xlsx_data` / `get_from_csv_data`).
