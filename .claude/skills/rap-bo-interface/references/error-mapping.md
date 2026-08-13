# rap-bo-interface — Line-level error mapping + messages (full code)

Covers SKILL.md sections:
- **Line-Level Error Mapping — Full Algorithm**
- **Filtering Messages — Blacklist Pattern**
- **Extracting Message Components**

---

## Line-Level Error Mapping — Full Algorithm

Goal: for each input line, return `status` + `message` reflecting its actual fate (success / EARLY-rejected / LATE-rejected / header-failed).

### Build forward + reverse maps

```abap
"Forward: %cid → input line index
"  (built from input table during build_create_table — same idx assignment)
"Reverse: %key → %cid (from MAPPED EARLY)
TYPES: BEGIN OF gts_key2cid_item,
         salesorderitem TYPE i_salesorderitemtp-salesorderitem,
         cid            TYPE string,
       END OF gts_key2cid_item.
DATA ldt_key2cid_item TYPE HASHED TABLE OF gts_key2cid_item
                      WITH UNIQUE KEY salesorderitem.

LOOP AT is_mapped_early-salesorderitem INTO DATA(lds_m_it).
  INSERT VALUE #( salesorderitem = lds_m_it-%key-salesorderitem
                  cid            = CONV string( lds_m_it-%cid ) )
         INTO TABLE ldt_key2cid_item.
ENDLOOP.

"Helper: cid → idx (cid format = "L{idx}")
" extract idx from cid:  ldf_idx = CONV i( substring( ldf_cid+1 ) ).
```

### Stage A — apply EARLY (per %cid)

```abap
"For each input line idx (cid = L{idx}):
"  1. failed_early.salesorderitem[%cid=L{idx}] → status=ERROR
"  2. failed_early.salesorderitempricingelement[%cid=P{idx}] → status=ERROR
"  3. reported_early.*[%cid=L{idx} OR P{idx}] → append msg
```

### Stage B — apply LATE (per %key) via reverse map

```abap
"Header-level commit fail (lds_commit_failed-salesorder IS NOT INITIAL):
"  → header message applies to ALL input lines (each line gets a copy)
LOOP AT is_failed_late-salesorder INTO DATA(lds_fl_so).
  "Collect header msgs from is_reported_late-salesorder matching same %key
  "Append to line_msg[ALL idx] and set status=ERROR
ENDLOOP.

"Item-level commit fail:
LOOP AT is_failed_late-salesorderitem INTO DATA(lds_fl_it).
  "Find corresponding cid via reverse map
  READ TABLE ldt_key2cid_item INTO DATA(lds_k2c)
       WITH TABLE KEY salesorderitem = lds_fl_it-%key-salesorderitem.
  IF sy-subrc = 0.
    "Extract idx from cid → mark that line ERROR + append msgs from reported_late
  ENDIF.
ENDLOOP.

"Pricing-level commit fail:
LOOP AT is_failed_late-salesorderitempricingelement INTO DATA(lds_fl_pr).
  "%key has salesorderitem inside → look up item cid → derive line idx
  "Same approach: mark the parent item line ERROR + append msg
ENDLOOP.

"reported_late entries WITHOUT corresponding failed_late entry → still attach msg
"  (severity may be info/warning rather than error)
```

### Stage C — assemble output

For each input line:
- `status` = ERROR if (EARLY failed) OR (LATE failed item) OR (LATE header fail) ; else NORMAL
- `message` = concat of all collected msgs for this line + header msg (if any)
- Deduplicate messages per line (`SORT … DELETE ADJACENT DUPLICATES`)

---

## Filtering Messages — Blacklist Pattern

Some BO interfaces emit messages that are not real errors (informational, expected suppression). Filter them in a dedicated helper:

```abap
METHOD is_message_skipped.
  rf_skip = abap_false.

  "Rule: V1/293 — always skip (incomplete data warning at line level)
  IF if_msgid = 'V1' AND if_msgno = '293'.
    rf_skip = abap_true.
    RETURN.
  ENDIF.

  "Rule: SLS_LORD/801 + msgv2=PPR0 — only skip if free goods or zero condition
  IF if_msgid = 'SLS_LORD' AND if_msgno = '801' AND if_msgv2 = 'PPR0'.
    IF if_condrate_amount <> 0 OR if_is_free_item = abap_true.
      rf_skip = abap_true.
    ENDIF.
  ENDIF.
ENDMETHOD.
```

Apply the filter inside `collect_messages_per_cid` before appending each message.

---

## Extracting Message Components

For every `%msg` reference in REPORTED structures:

```abap
IF lds_rep-%msg IS BOUND.
  DATA(ldf_msgid) = lds_rep-%msg->if_t100_message~t100key-msgid.
  DATA(ldf_msgno) = lds_rep-%msg->if_t100_message~t100key-msgno.
  DATA(ldf_msgv1) = lds_rep-%msg->if_t100_dyn_msg~msgv1.
  DATA(ldf_msgv2) = lds_rep-%msg->if_t100_dyn_msg~msgv2.
  DATA(ldf_text)  = lds_rep-%msg->if_message~get_longtext( ).
  "or get_text( ) for short text
ENDIF.
```

Interfaces:
- `if_t100_message~t100key` → MSGID/MSGNO
- `if_t100_dyn_msg~msgvN` → message variables (V1-V4)
- `if_message~get_text( )` → short text (formatted)
- `if_message~get_longtext( )` → long text (recommended for audit logs)
