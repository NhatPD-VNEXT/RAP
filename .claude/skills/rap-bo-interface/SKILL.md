---
name: rap-bo-interface
description: "Call SAP standard RAP BO interfaces (I_SalesOrderTP, I_OutboundDeliveryTP, I_PurchaseOrderTP, I_BillingDocumentTP, etc.) from custom ABAP code via EML. Covers MODIFY ENTITIES OF / READ ENTITIES, deep CREATE BY associations with %cid/%cid_ref, FAILED/REPORTED/MAPPED EARLY and LATE response handling, COMMIT ENTITIES with line-level error mapping, ROLLBACK ENTITIES, and audit-grade message collection. Trigger on: 'BO interface', 'I_SalesOrderTP', 'EML', 'MODIFY ENTITIES', 'CREATE BY', 'deep CREATE', '%cid', '%cid_ref', 'COMMIT ENTITIES', 'FAILED response', 'REPORTED response', 'MAPPED response', 'sales order creation', 'delivery creation', 'BO call', 'error per line'."
---

# RAP BO Interface — EML Consumption Pattern

This skill helps you correctly call **SAP standard RAP BO interfaces** (the `I_*TP` business objects) from custom ABAP code in ABAP Cloud/BTP. It is the canonical way to create/update/delete SAP standard business documents (sales orders, deliveries, purchase orders, etc.) — replacing legacy BAPIs.

When the spec says **"use BO interface"**, this is the skill.

## Reference files (progressive disclosure — đọc khi tới bước tương ứng)

| Section (heading) | Nội dung | File |
|-------------------|---------|------|
| Pre-flight Checklist · Type Declarations · Deep CREATE Pattern | Pre-flight steps + CREATE table type decls + %cid_ref deep-create (full code) | `references/preflight-and-create.md` |
| Response Structures · Full Pattern (process_one_so) · RAP LUW Boundaries | Response anatomy, EARLY/LATE table, full method, commit/rollback (full code) | `references/responses-and-commit.md` |
| Line-Level Error Mapping · Filtering Messages · Extracting Message Components | Per-line map algorithm, blacklist filter, %msg extraction (full code) | `references/error-mapping.md` |

SKILL.md này = index + Critical rules mỗi section. Code khối lớn nằm ở reference file — chỉ đọc khi generate object đó (tránh nạp full context).

## When to Use

- Creating sales orders via `I_SalesOrderTP`
- Creating outbound deliveries via `I_OutboundDeliveryTP`
- Creating purchase orders via `I_PurchaseOrderTP`
- Creating billing documents via `I_BillingDocumentTP`
- Any custom batch job that calls a SAP-released `I_*TP` interface
- Need to map errors back to **input lines** (audit log, status table per row)

## Tools Used

- `sap_get_object_details` (object_type: "BDEF") — read BDEF to find allowed entities, fields, actions, associations
- `sap_get_object_details` (object_type: "DDLS") — read projection view to verify field names
- `GetSource` — read existing ABAP class
- `WriteSource` / `EditSource` — write/edit class
- `SyntaxCheck` → `Activate`
- `mcp__sap-docs__search` / `fetch` — verify EML semantics

## Pre-flight Checklist — DO THIS FIRST

Verify BEFORE writing a single line of EML. → Full steps + code: **`references/preflight-and-create.md` § Pre-flight Checklist**.

Critical:
- BDEF must be `released for cloud development`; note `implementation type` (managed for SAP standard).
- Map the composition tree from the BDEF — root-level vs child-level associations; traverse **one level at a time** with `CREATE BY`.
- Verify exact field names via DDLS (e.g. `ConditionRateAmount` exists, `ConditionRateValue` does NOT). Do not guess.
- Read field flags: `readonly`/key → exclude from `FIELDS ( ... )`; `mandatory` → must include.

## Type Declarations — TABLE FOR CREATE

Each deep-CREATE level needs its own `TABLE FOR CREATE` type; response types split EARLY vs LATE. → Full code: **`references/preflight-and-create.md` § Type Declarations`**.

Critical:
- Single `\` = association from current entity; `\\<alias>` = navigate *through* that entity (use the BDEF **entity alias**, not CDS view name).
- Declare `RESPONSE FOR FAILED/REPORTED/MAPPED EARLY` (MODIFY phase) and `FAILED/REPORTED LATE` (COMMIT phase) separately.

## Deep CREATE Pattern — Multi-Level via %cid_ref

Grandchildren CANNOT nest in parent's `%target`; each level = own `CREATE BY` block linked by `%cid_ref`. → Wrong/Correct code: **`references/preflight-and-create.md` § Deep CREATE Pattern`**.

Critical:
- `%cid` unique across the entire MODIFY; `%cid_ref` points to a `%cid` in the **same** MODIFY.
- One MODIFY, multiple `ENTITY … CREATE BY \_assoc … WITH ldt_…` blocks.
- `FIELDS ( ... )` = only non-key, non-readonly data fields; never include `%cid` itself.

## Response Structures — Full Anatomy

Each response has one nested internal table per entity in the composition tree. → Diagram + EARLY/LATE table: **`references/responses-and-commit.md` § Response Structures`**.

Critical:
- EARLY has `%cid` + `%key`; LATE has **only `%key`** (no `%cid`).
- `MAPPED EARLY` = successfully created instances only → the `%cid → %key` source of truth.
- After MODIFY-ok but COMMIT-fail, CREATE input carries no key → you MUST build a `%key → %cid → input_line` map from MAPPED EARLY.

## Full Pattern — process_one_so with Line-Level Error Mapping

5-step method: build CREATE tables → MODIFY (FAILED+MAPPED+REPORTED EARLY) → COMMIT (FAILED+REPORTED LATE) → collect messages per line → rollback on fail. → Full method code: **`references/responses-and-commit.md` § Full Pattern`**.

Critical:
- Assign `%cid = |L{idx}|` / `|P{idx}|` systematically so idx is recoverable.
- Commit-fail detection = `sy-subrc <> 0` OR any `lds_commit_failed-<entity>` not initial.

## Line-Level Error Mapping — Full Algorithm

For each input line return `status` + `message` reflecting its real fate. → Stages A/B/C + code: **`references/error-mapping.md` § Line-Level Error Mapping`**.

Critical:
- Reverse map `%key → %cid` from MAPPED EARLY (hashed table); cid format `L{idx}` → recover idx.
- Stage A match by `%cid` (EARLY); Stage B match by `%key` via reverse map (LATE); header-level fail broadcasts to all lines.
- `reported_late` without a matching `failed_late` still attaches (info/warning).
- Stage C: status ERROR if any fail path; dedupe messages per line.

## Filtering Messages — Blacklist Pattern

Suppress non-error informational messages in a dedicated `is_message_skipped` helper, applied inside `collect_messages_per_cid` before appending. → Code: **`references/error-mapping.md` § Filtering Messages`**.

## Extracting Message Components

Pull MSGID/MSGNO/MSGVn/text from each `%msg` reference. → Code: **`references/error-mapping.md` § Extracting Message Components`**.

Critical:
- `if_t100_message~t100key` → MSGID/MSGNO; `if_t100_dyn_msg~msgvN` → variables; `if_message~get_longtext( )` → long text (best for audit logs).
- Always guard `IF lds_rep-%msg IS BOUND`.

## RAP LUW Boundaries

`COMMIT ENTITIES` ends a RAP LUW. → Code: **`references/responses-and-commit.md` § RAP LUW Boundaries`**.

Critical:
- On commit fail the transactional buffer is NOT cleared — **MUST `ROLLBACK ENTITIES`** or the next MODIFY sees stale state.
- Also rollback after MODIFY if you decide (business logic) not to commit.

## Common Pitfalls

| # | Pitfall | Fix |
|---|---------|-----|
| 1 | `No component _ITEMPRICINGELEMENT` when nesting grandchild in parent's %target | Split into two `CREATE BY` blocks linked by `%cid_ref` |
| 2 | `No component CONDITIONRATEVALUE` | Check actual fields in `I_SalesOrderItemPrcgElmntTP` — that field does not exist |
| 3 | Including key field (e.g., `salesorder`) in `FIELDS ( ... )` of CREATE | Remove — framework assigns keys |
| 4 | Using `COMMIT WORK` instead of `COMMIT ENTITIES` | Always `COMMIT ENTITIES` in RAP context |
| 5 | Forgetting `ROLLBACK ENTITIES` after commit fail | Add `ROLLBACK ENTITIES.` immediately after detecting commit fail |
| 6 | Assuming `%cid` exists in LATE responses | LATE has only `%key` — use MAPPED EARLY to build %key→%cid reverse map |
| 7 | Flattening all commit messages onto every line | Map LATE entries back via `%key` so each line gets only its own message + header-level message |
| 8 | Calling EML from inside parallel `cl_abap_parallel->do` without isolation | Each parallel session has its own RAP LUW — design 1 task = 1 SO to avoid contention |
| 9 | Re-running MODIFY without ROLLBACK between attempts | Stale buffer state — call ROLLBACK ENTITIES first |
| 10 | `_PartnerFunction` / `_Address` as direct root assoc but used as grandchild | Read BDEF: some partners are item-level, not root-level |

## Quick Reference — Common BO Interfaces

| BO Interface | Root entity alias | Key child assocs |
|--------------|-------------------|------------------|
| `I_SalesOrderTP`         | salesorder        | `_Item`, `_Partner`, `_Text`, `_PricingElement` (item-level: `_ItemPricingElement`, `_ItemPartner`, `_ItemText`) |
| `I_OutboundDeliveryTP`   | outbounddelivery  | `_DeliveryItem`, `_DeliveryPartner`, `_DeliveryText` |
| `I_PurchaseOrderTP`      | purchaseorder     | `_PurchaseOrderItem`, `_PartnerFunction`, `_AccountAssignment` |
| `I_BillingDocumentTP`    | billingdocument   | `_Item`, `_PricingElement`, `_Partner` |

Always verify by reading the BDEF — SAP may add/rename associations across releases.

## Workflow Summary

```
1. sap_get_object_details BDEF — list entities, fields, associations
2. sap_get_object_details DDLS — verify exact field names
3. Declare types: gtt_create_*, gts_failed_*, gts_reported_*, gts_mapped_*
4. build_create_table — assign %cid systematically (L{idx} / P{idx} / T{idx})
5. MODIFY ENTITIES OF — capture FAILED + MAPPED + REPORTED EARLY
6. COMMIT ENTITIES RESPONSE OF — capture FAILED + REPORTED LATE
7. collect_messages_per_cid:
     a. Build %key → %cid reverse map from MAPPED EARLY
     b. EARLY stage: match by %cid
     c. LATE stage: match by %key via reverse map
     d. Header-level fail → broadcast to all lines
     e. Filter blacklisted messages
8. ROLLBACK ENTITIES if commit failed
9. Persist per-line audit log (status table) with line-level messages
```

## Reference Docs

When in doubt, fetch:
- `/abap-docs-cloud/ABAPTYPE_RESPONSE_FOR` — response type anatomy
- `/abap-docs-cloud/ABAPDERIVED_TYPES_CID` and `ABAPDERIVED_TYPES_CID_REF` — %cid semantics
- `/abap-docs-cloud/ABENEML_RESPONSES_ABEXA` — official demo with multi-entity MODIFY
- `/abap-docs-cloud/ABENCOMMIT_ENTITIES_SH_LO_ABEXA` — COMMIT ENTITIES with response

Use `mcp__sap-docs__fetch(id="...")` to retrieve full content of any of these.
