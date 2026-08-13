# rap-if-dwh-send — Extraction chunk + SVF send + local test (full code)

> Chi tiết Step 5–7 của SKILL.md: `head_proc` (đọc CDS + build + chunk), `m_post_to_api_head` (gửi DataSpider qua engine SVF), `if_oo_adt_classrun~main` (local test). Reference package **CI901**.

## Step 5 — head_proc: đọc CDS + build + chunk

1. SELECT từ `ZI_<PJ>_NN` **`WITH PRIVILEGED ACCESS`**, filter theo range (`IN @gr_*`, `>= @gdf_tstmp`). `RETURN` sớm nếu `sy-subrc <> 0`.
2. Lấy limit gửi từ ZY043T:
```abap
SELECT SINGLE zzvalue07 FROM zy043t WITH PRIVILEGED ACCESS
  WHERE div = @if_div AND zztype = 'B' AND zzseqno = '0001'
  INTO @DATA(ldf_limitcnt).
```
3. LOOP data → `data_set_head` đổ từng row vào `gts_svf_data_head` → `APPEND` vào `gds_out_dat_head-data` → gọi `m_post_to_api_head( if_div if_limitcnt )` mỗi vòng (nó tự chờ đủ chunk mới gửi).
4. Sau loop: **flush cuối** với `if_limitcnt = 0` (ép gửi phần còn lại).

Format value khi build row:
- **Số tiền**: external format kèm currency → `lds-Amount = |{ raw CURRENCY = cur }|`.
- **Dấu âm**: `IF v < 0. r = |-{ abs( v ) }|. ELSE. r = v.` (helper `data_set_minus`).

## Step 6 — m_post_to_api_head: gửi DataSpider qua engine SVF

```abap
METHOD m_post_to_api_head.
  DATA ldf_ds_err_msg TYPE string.
  TRY.
      DATA(ldf_line) = lines( gds_out_dat_head-data ).
      IF ldf_line <> 0. CLEAR gdf_nodata. ENDIF.
      " chunk gate: nếu còn limit và chưa đủ → chờ (RETURN); flush cuối truyền limit=0
      IF if_limitcnt > 0 AND ldf_line < if_limitcnt. RETURN. ENDIF.

      zcl_zrap_com_00=>process_date_time_output(
        IMPORTING ef_date = DATA(gdf_date) ef_time = DATA(gdf_time) ef_timestamp = DATA(gdf_ts) ).

      " 1) set out_parameter (fileid = mã file DataSpider quy ước)
      zcl_svf_output=>out_param_set(
        EXPORTING if_div = if_div  if_fileid = 'CO0101-ZAIMUKEIKAKUDATA'
                  if_date = gdf_date  if_time = gdf_time
        CHANGING  cs_out_parameter = gds_out_dat_head-param ).

      " 2) header field-id (tên cột CSV)
      field_set_head( CHANGING cs_field = gds_out_dat_head-field ).

      " 3) gửi + nhận retry/warn/err
      DATA(ldf_subrc) = zcl_svf_output=>svf_output_proc(
        EXPORTING if_div = if_div  is_out_dat = gds_out_dat_head
        IMPORTING ef_ds_err_msg = ldf_ds_err_msg
                  ef_warm_msg   = DATA(gdf_warm)  ef_retry_cnt = DATA(gdf_retry)
                  ef_cause_msg  = DATA(gdf_cause) ).

      IF ldf_subrc = 0.
        IF gdf_retry > 0 OR gdf_warm IS NOT INITIAL.
          MESSAGE s030(zrap_com_00) WITH gdf_retry gdf_warm gdf_cause INTO DATA(m).
          m_add_text_to_app_log( if_severity = if_bali_constants=>c_severity_warning if_text = m ).
        ENDIF.
        MESSAGE s029(zrap_com_00) WITH TEXT-t01 ldf_line INTO m.   " 送信件数 xxx件
        m_add_text_to_app_log( m ).
      ELSE.
        gdf_err_flg = 'E'.
        MESSAGE s013(zrap_com_00) WITH space INTO m.
        m_add_text_to_app_log( if_severity = if_bali_constants=>c_severity_error
                               if_text = |{ m } { ldf_ds_err_msg }| ).
      ENDIF.
      CLEAR gds_out_dat_head.            " reset buffer sau mỗi chunk
    CATCH cx_root INTO DATA(lx).
      gdf_err_flg = 'E'.
      " ... log error + CLEAR gds_out_dat_head
  ENDTRY.
ENDMETHOD.
```

- `field_set_head` (tên cột) ↔ `data_set_head` (giá trị): index `fieldNNN` PHẢI khớp 1-1.
- `out_param_set` nhận `if_fileid` = mã file quy ước với DataSpider (đặt trong code, hỏi user/BD nếu chưa rõ).
- `svf_output_proc` trả `subrc=0` là OK; nó tự retry (trả `ef_retry_cnt`) → log warning s030, không coi là fail.

## Step 7 — Local test: if_oo_adt_classrun~main

Cho phép F9 chạy thử trong ADT (ngoài scheduler):

```abap
METHOD if_oo_adt_classrun~main.
  TRY.
      me->out = out.
      DATA lt_sel TYPE if_apj_rt_exec_object=>tt_templ_val.
      lt_sel = VALUE #( ( selname = 'P_TSTMP' sign = 'I' option = 'EQ' low = '20250514' ) ).
      if_apj_rt_exec_object~execute( lt_sel ).
    CATCH cx_root INTO DATA(lx).
      out->write( lx->get_text( ) ).
  ENDTRY.
ENDMETHOD.
```

`m_add_text_to_app_log` phân nhánh: `IF sy-batch = abap_true` → ghi app log (`save_log( assign_to_current_appl_job = abap_true )`); ELSE → `out->write(...)` (test run in ra console).
