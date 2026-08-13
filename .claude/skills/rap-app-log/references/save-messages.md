# rap-app-log — Save Modes, Messages, Reading

Full code cho SKILL.md § Save modes — CRITICAL, Save log với từ message class, Reading logs.

## Save modes — CRITICAL

### Mode 1: `save_log` với `assign_to_current_appl_job = abap_true` (APJ context)

```abap
cl_bali_log_db=>get_instance( )->save_log(
  log                        = application_log
  assign_to_current_appl_job = abap_true ).
```

**When**: Trong APJ job execution class (`if_apj_rt_run~execute` callstack).
**Result**: Log link vào job run → admin nhấn job log → tự jump sang Application Log.
**LUW**: Log tham gia LUW chính của job, commit cùng job.

### Mode 2: `save_log_2nd_db_connection` (non-LUW context)

```abap
cl_bali_log_db=>get_instance( )->save_log_2nd_db_connection( log = application_log ).
```

**When**:
- HTTP service handler khi muốn log SỚM trước khi process tiếp (vd log invalid request → return 400)
- Context không có LUW chính (vd raise exception)
- Test code

**Result**: Log save qua connection thứ 2 → KHÔNG bị rollback nếu LUW chính fail.

**Trade-off**: Log mất tính atomic với business data — có thể log thành công nhưng business fail (hoặc ngược lại).

### Decision matrix

| Context | Method | Reason |
|---------|--------|--------|
| APJ job class (`if_apj_rt_run~execute`) | `save_log( assign_to_current_appl_job = abap_true )` | Tích hợp với job framework |
| HTTP handler logging trước RETURN | `save_log_2nd_db_connection` | Đảm bảo log persist dù response 400 |
| Behavior handler trong RAP transaction | `save_log( assign_to_current_appl_job = abap_false )` | Tham gia RAP LUW |
| Test code | `save_log_2nd_db_connection` | Không phụ thuộc commit thật |

## Save log với từ message class

Thay vì `cl_bali_free_text_setter`, có thể dùng message class:

```abap
DATA ldf_message TYPE cl_bali_free_text_setter=>ty_text.

MESSAGE s011(zrap_com_99) WITH p_ifid INTO ldf_message.
add_text_to_app_log(
  if_severity = if_bali_constants=>c_severity_error
  if_text     = ldf_message ).
```

**Pattern**: `MESSAGE <id>(<class>) WITH <p1> [<p2>...] INTO <var>` — fill text từ message class với placeholders.

Hoặc add BAPI return table:
```abap
application_log->add_messages_from_bapirettab( message_table = lt_bapiret ).
```

Hoặc add ABAP behavior message:
```abap
application_log->add_abap_behavior_message( message = lo_behv_message ).
```

## Reading logs (cho monitoring UI / custom query)

```abap
" Find log by header attributes
DATA(lt_logs) = cl_bali_log_db=>get_instance( )->load_logs_via_filter(
  filter = cl_bali_log_filter=>create(
    object    = 'ZAL_MI901_01'
    subobject = 'JOB' ) ).

LOOP AT lt_logs INTO DATA(lds_log_ref).
  DATA(lo_log) = lds_log_ref->log.
  DATA(lds_header) = lo_log->get_header( ).
  DATA(lt_items) = lo_log->get_all_items( ).
  " ... process items ...
ENDLOOP.
```

Pattern này dùng khi cần build custom Fiori list giám sát log (thay vì App standard).
