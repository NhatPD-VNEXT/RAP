---
name: rap-cds
description: "CDS view entity development for SAP RAP on ABAP Cloud/BTP. Covers creating and modifying CDS root view entities, child view entities, projection views, and metadata extensions with proper annotations for Fiori UI, search help, value help, and OData. Use this skill whenever the user wants to create or modify CDS views, add annotations, build data models, define associations/compositions, create projection views, or add metadata extensions. Trigger on: 'CDS view', 'annotations', 'data model', 'view entity', 'projection', 'metadata extension', '@UI', '@Search', 'value help', 'composition', 'association'."
---

# RAP CDS View Entity Development

This skill helps create and modify CDS view entities for RAP Business Objects on ABAP Cloud/BTP, with proper annotations for Fiori Elements UI rendering.

## Reference files (progressive disclosure — đọc khi tới phần tương ứng)

| Section | Nội dung | File |
|---------|---------|------|
| CDS View Entity Types in RAP + Composition and Association Patterns | Layered architecture (interface/projection/metadata) + composition/association code | `references/view-types-composition.md` |
| Essential Annotations | Semantic, Amount/Quantity, UI (@UI), Search, Value Help — full code | `references/annotations.md` |
| Projection View Pattern + Metadata Extension Pattern | Full projection view + DDLX code | `references/projection-metadata.md` |

SKILL.md này = index + Critical rules. Code khối lớn nằm ở reference file — chỉ đọc khi generate object đó (tránh nạp full context).

## Templates

| Object | Template |
|--------|---------|
| Root view entity (managed) | `.claude/templates/cds/cds-root-view-managed.cds` |
| Child view entity | `.claude/templates/cds/cds-child-view.cds` |
| Projection view | `.claude/templates/cds/cds-projection.cds` |
| Root custom entity | `.claude/templates/cds/cds-custom-entity.cds` |
| Metadata Extension | **Manual ADT** — MCP `edit DDLX` không hỗ trợ |

## Tools Used

- `GetSource` (object_type: "DDLS") — read existing CDS views
- `WriteSource` (object_type: "DDLS") — create/update CDS views
- `EditSource` — surgical edits to existing CDS views
- `Activate` — activate CDS objects
- `SyntaxCheck` — validate before activation
- `GetCDSDependencies` — understand CDS dependency trees
- `SearchObject` — find existing CDS entities

## CDS View Entity Types in RAP

RAP uses a layered CDS architecture: interface view entities (R-layer, core data model), projection view entities (C-layer, service-specific), and CDS metadata extensions (decouple UI metadata from data model).

Critical:
- Interface root: `define root view entity` + `composition [0..*] of <Child> as _<Name>`
- Projection root: `provider contract transactional_query` + `as projection on <Interface>`
- Metadata Extension: `@Metadata.layer: #CONSUMER` + `annotate view <Projection> with`

→ Code đầy đủ 3 tầng: **`references/view-types-composition.md` § CDS View Entity Types in RAP**.

## Composition and Association Patterns

Root→Child composition, Child→Grandchild, Cross-BO association, và cardinality options.

Critical:
- Parent→child: `composition [0..*] of <Child> as _<Name>`
- Child→parent: `association to parent <Parent> as _<Name> on $projection.<Key> = _<Name>.<Key>`
- Cross-BO: `association [0..1] to <Entity> as _<Name> on ...`
- Cardinality: `[0..1]` optional to-one · `[1..1]`/`[1]` mandatory to-one · `[0..*]`/`[*]` to-many · `[1..*]` one-or-many

→ Code đầy đủ: **`references/view-types-composition.md` § Composition and Association Patterns**.

## Essential Annotations

Semantic (interface admin fields), Amount/Quantity, UI (@UI), Search, Value Help annotations.

Critical:
- Admin fields interface layer: `@Semantics.user.*` / `@Semantics.systemDateTime.*` (framework auto-fill)
- Amount: `@Semantics.amount.currencyCode: '<Field>'`; Quantity: `@Semantics.quantity.unitOfMeasure: '<Field>'` (xem `.claude/rules/cds-field-types.md`)
- @UI ở projection/DDLX layer: `@UI.headerInfo`, `@UI.lineItem`, `@UI.identification`, `@UI.selectionField`, `@UI.facet`, `@UI.fieldGroup`
- Search: `@Search.searchable: true` (view), `@Search.defaultSearchElement: true` (field)
- Value Help: `@Consumption.valueHelpDefinition: [{ entity: { name, element } }]` (+ optional `additionalBinding`)

→ Code đầy đủ tất cả nhóm: **`references/annotations.md` § Essential Annotations**.

## Projection View Pattern

Projection view (`ZC_*`) expose interface layer cho consumer, gắn value help + text association + amount semantics.

Critical:
- `provider contract transactional_query` cho root projection
- `redirected to composition child <Child>` / `redirected to parent <Parent>`
- `@Metadata.allowExtensions: true` để cho phép DDLX
- `@AccessControl.authorizationCheck: #NOT_REQUIRED` (default)

→ Code đầy đủ: **`references/projection-metadata.md` § Projection View Pattern**.

## Metadata Extension Pattern

Tách @UI annotations ra DDLX file riêng (cùng tên projection) — external-ref bởi `rap-managed-bo § Step 10` và `agent-generate-code § DDLX`.

Critical:
- `@Metadata.layer: #CONSUMER` + `annotate view <Projection> with`
- `@UI.facet` (COLLECTION / FIELDGROUP_REFERENCE / LINEITEM_REFERENCE) cho object page layout
- `@UI.lineItem` / `@UI.selectionField` / `@UI.identification` / `@UI.fieldGroup` per field
- `@UI.hidden: true` cho key/admin fields
- Metadata Extension (DDLX) tạo **Manual ADT** — MCP `edit DDLX` không hỗ trợ

→ Code đầy đủ: **`references/projection-metadata.md` § Metadata Extension Pattern**.

## Common Tasks

### Adding a new field to an existing CDS view
1. `GetSource` to read the current CDS DDL
2. `EditSource` to add the field in the select list
3. Update the BDEF mapping if needed (`EditSource` on BDEF)
4. `Activate` the CDS view, then the BDEF

### Adding an association
1. Add the association definition after `as select from`
2. Expose the association in the select list
3. For projections, use `redirected to` syntax

### Checking CDS dependencies
Use `GetCDSDependencies` to understand what tables/views a CDS entity reads from.

## Validation Checklist

Before activating a CDS view, verify:
- All field aliases use CamelCase (ABAP Cloud convention)
- Semantic annotations are on the correct fields
- Compositions use `composition [cardinality] of ChildEntity`
- Parent associations use `association to parent ParentEntity`
- Currency/quantity reference fields point to exposed fields
- `@AccessControl.authorizationCheck` is specified (use `#NOT_REQUIRED` as default)
