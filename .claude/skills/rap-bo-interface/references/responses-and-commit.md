# rap-bo-interface — Responses, full pattern, LUW (full code)

Covers SKILL.md sections:
- **Response Structures — Full Anatomy**
- **Full Pattern — process_one_so with Line-Level Error Mapping**
- **RAP LUW Boundaries**

---

## Response Structures — Full Anatomy

Every RAP response has nested internal tables, one per entity in the composition tree:

```
lds_failed (FAILED EARLY i_salesordertp)
  ├── salesorder                      → root entity failures
  ├── salesorderitem                  → item failures
  ├── salesorderitempricingelement    → pricing failures
  ├── salesorderpartner               → ...
  └── ... one per entity in composition

lds_mapped (MAPPED EARLY i_salesordertp)
  └── salesorder, salesorderitem, ... → %cid → %key mapping

lds_reported (REPORTED EARLY i_salesordertp)
  └── salesorder, salesorderitem, ... → messages
```

### EARLY vs LATE — critical difference

| Phase | `%cid` available | `%key` available | When populated |
|-------|:---:|:---:|---|
| `FAILED EARLY`    | ✅ | ✅ | Reject at MODIFY (auth, mandatory field, validation `on modify`) |
| `REPORTED EARLY`  | ✅ | ✅ | Any message during MODIFY (errors, warnings, info) |
| `MAPPED EARLY`    | ✅ | ✅ | **Only successfully created instances** — `%cid → %key` mapping |
| `FAILED LATE`     | ❌ | ✅ | Save sequence rejected instance (`validation on save`, save_modified, finalize) |
| `REPORTED LATE`   | ❌ | ✅ | Messages from save phase |

**Why this matters:**
After MODIFY succeeds but COMMIT fails, you have:
- LATE structures with **only %key** of failed instances
- For CREATE operations, **input doesn't carry the key** (framework assigns it)
- → You MUST capture MAPPED EARLY to build a `%key → %cid → input_line` map.

---

## Full Pattern — process_one_so with Line-Level Error Mapping

```abap
METHOD process_one_so.
  DATA ldt_create_item    TYPE gtt_create_item.
  DATA ldt_create_pricing TYPE gtt_create_pricing.

  "Step 1: build CREATE tables (one entry per input line)
  "        — assign %cid = |L{idx}| for items, |P{idx}| for pricing
  build_create_table( EXPORTING it_lines          = is_input-lines
                      IMPORTING et_create_item    = ldt_create_item
                                et_create_pricing = ldt_create_pricing ).

  IF ldt_create_item IS INITIAL.
    RETURN.
  ENDIF.

  "Step 2: MODIFY ENTITIES — capture FAILED + MAPPED + REPORTED EARLY
  MODIFY ENTITIES OF i_salesordertp
    ENTITY salesorder
      CREATE BY \_item
      FIELDS ( product requestedquantity requestedquantityunit plant ... )
      WITH ldt_create_item
    ENTITY salesorderitem
      CREATE BY \_itempricingelement
      FIELDS ( conditiontype conditionrateamount conditioncurrency ... )
      WITH ldt_create_pricing
    FAILED   DATA(lds_failed)
    MAPPED   DATA(lds_mapped)
    REPORTED DATA(lds_reported).

  "Step 3: COMMIT ENTITIES — capture FAILED + REPORTED LATE
  COMMIT ENTITIES
    RESPONSE OF i_salesordertp
      FAILED   DATA(lds_commit_failed)
      REPORTED DATA(lds_commit_reported).
  DATA(ldf_commit_subrc) = sy-subrc.

  DATA(ldf_commit_fail) = xsdbool(
       ldf_commit_subrc <> 0
    OR lds_commit_failed-salesorder                   IS NOT INITIAL
    OR lds_commit_failed-salesorderitem               IS NOT INITIAL
    OR lds_commit_failed-salesorderitempricingelement IS NOT INITIAL ).

  "Step 4: collect messages per input line (see next section)
  collect_messages_per_cid(
    EXPORTING it_lines           = is_input-lines
              is_failed_early    = lds_failed
              is_reported_early  = lds_reported
              is_mapped_early    = lds_mapped
              is_failed_late     = lds_commit_failed
              is_reported_late   = lds_commit_reported
              if_commit_subrc    = ldf_commit_subrc
    IMPORTING et_results         = es_output-results ).

  "Step 5: rollback on commit fail
  IF ldf_commit_fail = abap_true.
    ROLLBACK ENTITIES.
    RETURN.
  ENDIF.
ENDMETHOD.
```

---

## RAP LUW Boundaries

`COMMIT ENTITIES` ends a RAP LUW. After commit:
- **Success:** transactional buffer cleared, instances persisted
- **Failure:** buffer still contains modifications — **MUST call ROLLBACK ENTITIES** to clear, otherwise next MODIFY will see stale state

```abap
COMMIT ENTITIES RESPONSE OF i_salesordertp FAILED ... REPORTED ... .
IF sy-subrc <> 0 OR lds_commit_failed IS NOT INITIAL.
  ROLLBACK ENTITIES.
ENDIF.
```

Also `ROLLBACK ENTITIES` after MODIFY if you decide not to commit (e.g., business decision based on FAILED EARLY).
