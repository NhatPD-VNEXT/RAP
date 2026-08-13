---
name: rap-parallel-bo-call
description: Use when a RAP behavior handler (validation, determination, action) needs to call an external BO interface (EML MODIFY ENTITIES) and COMMIT ENTITIES, which is forbidden inside a RAP handler. Pattern: inherit from cl_abap_parallel, package input into DATA BUFFER, run() spawns a separate RFC LUW where COMMIT ENTITIES is allowed, import result back from DATA BUFFER.
---

# rap-parallel-bo-call

## Overview

Inside a RAP behavior handler you cannot call `COMMIT ENTITIES` / `COMMIT WORK` — it raises a runtime error. When the action logic must call an external transactional BO interface (e.g. `I_SlsPrcgConditionRecordTP_2`) and commit, wrap the EML + commit in a helper class that inherits `cl_abap_parallel`. The `do()` redefinition runs inside a separate RFC work process (new LUW), so `COMMIT ENTITIES` is permitted.

## Class Structure

```abap
CLASS zcl_xxx DEFINITION
  PUBLIC
  INHERITING FROM cl_abap_parallel
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    TYPES: BEGIN OF gts_request,
             " --- input fields ---
             material    TYPE ...,
             changetype  TYPE ...,
             " --- output fields (packed into same structure) ---
             status      TYPE c LENGTH 1,     " S / E
             message     TYPE string,
           END OF gts_request.

    METHODS do REDEFINITION.

    METHODS call_bo_and_commit
      IMPORTING ids_request TYPE <action_param_type>
      EXPORTING edf_status  TYPE c
                edf_message TYPE string.
ENDCLASS.
```

## call_bo_and_commit — caller side (runs inside behavior handler LUW)

```abap
METHOD call_bo_and_commit.
  DATA: ldf_xinput  TYPE LINE OF cl_abap_parallel=>t_in_tab,
        ldt_xinput  TYPE cl_abap_parallel=>t_in_tab,
        ldt_xoutput TYPE cl_abap_parallel=>t_out_tab.

  DATA(lds_req) = VALUE gts_request(
    material   = ids_request-material
    changetype = ids_request-changetype
    " ... map all input fields
  ).

  EXPORT param_input = lds_req TO DATA BUFFER ldf_xinput.
  APPEND ldf_xinput TO ldt_xinput.

  " Spawns parallel RFC — do() runs in separate LUW
  run( EXPORTING p_in_tab  = ldt_xinput
       IMPORTING p_out_tab = ldt_xoutput ).

  IF ldt_xoutput IS NOT INITIAL.
    DATA(lds_out_raw) = ldt_xoutput[ 1 ].
    TRY.
        IMPORT param_output = DATA(lds_result) FROM DATA BUFFER lds_out_raw.
        edf_status  = lds_result-status.
        edf_message = lds_result-message.
      CATCH cx_root.
        edf_status  = 'E'.
        edf_message = 'Parallel task result import error'.
    ENDTRY.
  ELSE.
    edf_status  = 'E'.
    edf_message = 'Parallel task returned no output'.
  ENDIF.
ENDMETHOD.
```

## do — worker side (runs in separate RFC LUW — COMMIT allowed here)

```abap
METHOD do.
  DATA lds_req TYPE gts_request.
  DATA lds_result TYPE gts_request.
  DATA ldf_message TYPE string.

  " 1. Unpack input
  IMPORT param_input = lds_req FROM DATA BUFFER p_in.

  " 2. EML MODIFY external BO
  DATA ldt_create TYPE TABLE FOR CREATE i_slsprcgconditionrecordtp_2.
  " ... fill ldt_create ...

  MODIFY ENTITIES OF i_slsprcgconditionrecordtp_2
    ENTITY salespricingconditionrecord
    CREATE FROM ldt_create
    CREATE BY \_validity FROM ldt_validity
    MAPPED DATA(lds_mapped)
    FAILED DATA(lds_failed)
    REPORTED DATA(lds_reported) ##EML_IN_LOOP_OK.

  IF lds_failed IS INITIAL.
    COMMIT ENTITIES
      RESPONSE OF i_slsprcgconditionrecordtp_2
      FAILED DATA(lds_fail_cm)
      REPORTED DATA(lds_rep_cm).

    IF lds_fail_cm IS INITIAL.
      lds_result-status  = 'S'.
      lds_result-message = '処理が完了しました'.
    ELSE.
      " collect messages from lds_rep_cm
      lds_result-status = 'E'.
      LOOP AT lds_rep_cm-salespricingconditionrecord
        ASSIGNING FIELD-SYMBOL(<msg>)
        WHERE %msg->if_t100_dyn_msg~msgty = if_bali_constants=>co_severity_error.
        ldf_message = COND #( WHEN ldf_message IS INITIAL
                              THEN |{ <msg>-%msg->if_message~get_text( ) }|
                              ELSE |{ ldf_message }/{ <msg>-%msg->if_message~get_text( ) }| ).
      ENDLOOP.
      lds_result-message = ldf_message.
    ENDIF.
  ELSE.
    " collect messages from lds_reported before commit
    lds_result-status = 'E'.
    " ... same loop pattern on lds_reported ...
  ENDIF.

  " 3. Pack output
  EXPORT param_output = lds_result TO DATA BUFFER p_out.
ENDMETHOD.
```

## Key Rules

| Rule | Why |
|------|-----|
| `INHERITING FROM cl_abap_parallel` | Enables `run()` → RFC → new LUW |
| ALL fields (input + output) in ONE `gts_*` structure | `EXPORT/IMPORT DATA BUFFER` serializes one object at a time |
| `##EML_IN_LOOP_OK` if EML inside loop | Suppress warning; ensure it's intentional |
| Never `COMMIT` in the calling method | It's still inside the behavior handler LUW |
| Check `ldt_xoutput IS NOT INITIAL` | `run()` can return empty on RFC error |
| Direct `INSERT INTO <custom_table>` for IF log inside `do()` | Avoid nested RAP managed BO EML in parallel LUW; simpler and safe for own tables |

## Entity Alias in EML

Always use the **alias** defined in the BDEF, not the raw entity name:
```abap
-- BDEF: define behavior for I_SlsPrcgConditionRecordTP_2 alias SalesPricingConditionRecord
MODIFY ENTITIES OF i_slsprcgconditionrecordtp_2
  ENTITY salespricingconditionrecord   " <-- alias, lowercase
  CREATE FROM ...
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| `COMMIT ENTITIES` inside behavior handler directly | Move all EML + commit into `do()` |
| Using separate `gts_input` + `gts_output` types | Use ONE structure with both input and output fields |
| Forgetting `##EML_IN_LOOP_OK` when EML is inside `LOOP` | Add pragma to suppress warning |
| Reading result via `ldt_xoutput[ 1 ]` without IS NOT INITIAL check | Always guard — RFC can fail silently |
| `IMPORT FROM DATA BUFFER lds_out_raw` where `lds_out_raw` = line directly | Works, but type must be `XSTRING` (which `cl_abap_parallel=>t_out_tab` line is) |
