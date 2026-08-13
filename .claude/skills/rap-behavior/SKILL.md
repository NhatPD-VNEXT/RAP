---
name: rap-behavior
description: "Implement and enhance RAP behavior definitions and behavior implementations on ABAP Cloud/BTP. Covers adding validations, determinations, actions (instance/static/factory), draft handling, authorization, side effects, business events, and feature control to managed RAP BOs. Use this skill whenever the user wants to add business logic to a RAP BO, implement validations, create actions, add draft support, implement authorization checks, add determinations, or enhance behavior. Trigger on: 'validation', 'determination', 'action', 'draft', 'authorization', 'side effect', 'business event', 'BDEF', 'behavior definition', 'behavior implementation', 'handler method', 'saver class', 'EML'."
---

# RAP Behavior Definition & Implementation

This skill helps you add business logic to managed RAP BOs on ABAP Cloud/BTP through behavior definitions (BDEF) and their implementations in ABAP Behavior Pools (ABP).

## Reference files (progressive disclosure — đọc khi tới section tương ứng)

| Section (heading trong SKILL.md) | Nội dung | File |
|----------------------------------|----------|------|
| Adding Validations, Adding Determinations | BDEF decl + full ABAP handler impl | `references/validations-determinations.md` |
| Adding Actions | instance/static/factory action + dynamic feature control (full ABAP) | `references/actions-features.md` |
| Draft Handling, Authorization, Side Effects, Business Events | BDEF + impl full code | `references/draft-auth-events.md` |
| EML Quick Reference, EML Batch Pattern & Error Containment | EML snippets + batch/error-containment + SAP docs | `references/eml.md` |

SKILL.md này = index + Critical rules mỗi section. Code khối lớn nằm ở reference file — chỉ đọc khi implement section đó (tránh nạp full context).

## Templates

| Pattern | Template |
|---------|---------|
| BDEF managed + draft | `.claude/templates/bdef/bdef-managed-draft.bdef` |
| BDEF unmanaged + static action | `.claude/templates/bdef/bdef-unmanaged-static-action.bdef` |
| BDEF abstract (action parameter/result entity) | `.claude/templates/bdef/bdef-abstract-action.bdef` |
| BDEF projection | `.claude/templates/bdef/bdef-projection.bdef` |
| Behavior Impl local types (managed) | `.claude/templates/clas/zbp-managed-locals.abap` |
| Behavior Impl locals (unmanaged + buffer) | `.claude/templates/clas/zbp-unmanaged-buffer.abap` |

## Tools Used

- `GetSource` (object_type: "BDEF") — read behavior definitions
- `GetSource` (object_type: "CLAS") — read behavior implementation classes
- `WriteSource` / `EditSource` — modify BDEF and class source
- `SyntaxCheck` — validate changes
- `Activate` — activate objects
- `RunUnitTests` — verify behavior

## Architecture Overview

RAP separates behavior declaration from implementation:

1. **BDEF** (BDL syntax) — declares WHAT operations/features exist
2. **ABP class** (ABAP) — implements HOW they work
   - **Handler class** (CCIMP include / Local Types) — handles individual operations
   - **Saver class** (CCIMP include) — handles save sequence

## Adding Validations

Validations check data consistency before saving, rejecting invalid instances with error messages. BDEF: `validation <name> on save { create; field ...; }`; impl method `FOR VALIDATE ON SAVE` populates cả `failed` và `reported`.

Critical:
- Dùng `IN LOCAL MODE` cho EML read trong handler (bypass auth check)
- Rejected instance PHẢI append cả `failed-<entity>` và `reported-<entity>`
- `%element-FieldName = if_abap_behv=>mk-on` để highlight field lỗi trên UI
- Mỗi validation 1 concern

→ Code đầy đủ (Step 1 BDEF + Step 2 handler + Best Practices): `references/validations-determinations.md` § Adding Validations.

## Adding Determinations

Determinations tự động compute/modify field value theo trigger. BDEF: `determination <name> on modify|save { ... }`.

Critical:
- `on modify` — chạy ngay khi buffer đổi (result có trong transaction); `on save` — chạy trong save sequence
- Impl thường READ → filter instance cần set → MODIFY UPDATE FIELDS trong LOCAL MODE
- Gộp `reported` từ MODIFY về `reported` của method (`CORRESPONDING #( DEEP ... )`)

→ Code đầy đủ: `references/validations-determinations.md` § Adding Determinations.

## Adding Actions

Actions là custom operation ngoài CRUD chuẩn: instance action (`action ( features : instance ) ...`), static action (`static action ...`), factory action (`factory action ... [1]`), cộng dynamic feature control qua `get_instance_features`.

Critical:
- Instance action trả `result [1] $self` → sau MODIFY phải READ lại instance và fill `%param`
- Factory action dùng `%cid_ref` từ `keys[ ... ]` khi CREATE instance mới
- Dynamic feature: method `get_instance_features` set `%action-<name> = if_abap_behv=>fc-o-enabled|disabled` theo state

→ Code đầy đủ (instance/static/factory + feature control): `references/actions-features.md` § Adding Actions.

## Draft Handling

Draft cho phép save-as-you-go editing trong Fiori. Khai `with draft;` ở header BDEF + `draft table` + draft actions trên root entity.

Critical:
- Header: `with draft;` + `strict ( 2 );` + `draft table <table>_d` + `lock master total etag <field>`
- Draft actions chuẩn: `Resume / Edit / Activate optimized / Discard`
- `draft determine action Prepare { validation ...; }` — chỉ gán được validation/determination `on save`
- Child association: thêm `with draft` (vd `association _Booking { create; with draft; }`)

→ Code đầy đủ: `references/draft-auth-events.md` § Draft Handling.

## Authorization

Global authorization (`authorization master ( global )` → `get_global_authorizations`) và instance authorization (`authorization master ( global, instance )` → `get_instance_authorizations`).

Critical:
- Global: dùng `AUTHORITY-CHECK OBJECT ...`, set `%create/%update/%delete = if_abap_behv=>auth-allowed|unauthorized`
- Instance: READ instance theo state rồi set `%update/%delete` per `%tky`

→ Code đầy đủ: `references/draft-auth-events.md` § Authorization.

## Side Effects

Side effects trigger UI refresh khi field đổi. Chỉ khai trong BDEF (`side effects { field X affects field Y; action A affects ...; }`) — KHÔNG cần implementation.

→ Ví dụ đầy đủ: `references/draft-auth-events.md` § Side Effects.

## Business Events

Async communication giữa các BO. BDEF: `event <name> parameter <ABSTRACT_ENTITY>;`; raise trong saver class bằng `RAISE ENTITY EVENT <root>~<name> FROM VALUE #( ... )`.

→ Code đầy đủ (BDEF + saver `save_modified`): `references/draft-auth-events.md` § Business Events.

## EML Quick Reference

Entity Manipulation Language — cú pháp ABAP thao tác instance RAP BO: READ / READ BY association / MODIFY (UPDATE/CREATE/DELETE) / EXECUTE action, đều `IN LOCAL MODE` trong handler.

→ Snippet đầy đủ mọi thao tác: `references/eml.md` § EML Quick Reference.

## EML Batch Pattern & Error Containment

KHÔNG gọi EML trong LOOP per-item (N round-trip, COMMIT từng row). Gom internal table → 1 MODIFY cho N rows → 1 COMMIT.

Critical:
- `%cid` unique per row trong batch; lưu `mapped` (`%cid → %key`) để map ngược
- MODIFY = `FAILED EARLY` (có `%cid`, partial success OK); COMMIT = `FAILED LATE` (chỉ `%key`, all-or-nothing)
- `sy-subrc` sau COMMIT: `0` OK; `4` early save fail (buffer còn, retry được); `8` late save fail (phải `ROLLBACK ENTITIES` trước khi modify tiếp)
- Strategy mass upload (Strict vs Per-group batch) là **quyết định nghiệp vụ**, không phải technical default

→ Full pattern + error-containment table + SAP docs: `references/eml.md` § EML Batch Pattern & Error Containment.

## Workflow for Adding Behavior

1. **Read current BDEF**: `GetSource(name: "ZR_TRAVEL", object_type: "BDEF")`
2. **Read current ABP class**: `GetSource(name: "ZBP_R_TRAVEL", object_type: "CLAS", include: "implementations")`
3. **Edit BDEF** to add declaration: `EditSource` on the BDEF URL
4. **Edit ABP** to add method declaration and implementation
5. **Syntax check** both BDEF and class
6. **Activate** both (BDEF first, then class)
7. **Run unit tests** to verify
