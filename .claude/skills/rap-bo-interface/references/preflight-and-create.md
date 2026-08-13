# rap-bo-interface — Pre-flight + CREATE tables (full code)

Covers SKILL.md sections:
- **Pre-flight Checklist — DO THIS FIRST**
- **Type Declarations — TABLE FOR CREATE**
- **Deep CREATE Pattern — Multi-Level via %cid_ref**

---

## Pre-flight Checklist — DO THIS FIRST

Before writing a single line of EML, verify:

1. **BDEF exists and is released for cloud:**
   ```
   sap_get_object_details(object_type="BDEF", name="I_SalesOrderTP")
   ```
   - Check `released for cloud development` in the BDEF source
   - Note `implementation type` (almost always `managed` for SAP standard)

2. **Identify the composition tree.** A BDEF declares entities and associations. For `I_SalesOrderTP`:
   ```
   define behavior for I_SalesOrderTP alias SalesOrder
   {
     association _Item            { create; }
     association _PricingElement  { ... }
     association _Partner         { create; }
     ...
   }
   define behavior for I_SalesOrderItemTP alias SalesOrderItem
   {
     association _ItemPricingElement { create; }
     association _ItemPartner        { create; }
     association _ItemText           { create; }
     ...
   }
   ```
   - Root-level associations: navigate from `I_SalesOrderTP`
   - Child-level associations: navigate from `I_SalesOrderItemTP`
   - **You MUST traverse one level at a time** with `CREATE BY` — see Deep CREATE pattern below.

3. **Verify field names in projection view.** Do NOT guess fields like `ConditionRateValue`.
   ```
   sap_get_object_details(object_type="DDLS", name="I_SalesOrderItemPrcgElmntTP")
   ```
   - Valid pricing fields: `ConditionType`, `ConditionRateAmount`, `ConditionCurrency`, `ConditionQuantity`, `ConditionQuantityUnit`, `ConditionAmount`, `ConditionBaseAmount`
   - Field that **does not exist**: `ConditionRateValue` ❌

4. **Read field characteristics from BDEF:**
   - `field ( readonly ) salesorder;` → key, auto-numbered → **do not include in `FIELDS ( ... )`**
   - `field ( mandatory ) salesorderitemcategory;` → must be in `FIELDS`
   - `field ( features : ... ) field_x;` → may be conditionally required

---

## Type Declarations — TABLE FOR CREATE

Each level of deep CREATE needs its own table type. The path syntax is critical:

```abap
"Root-level CREATE (or CREATE BY root association):
TYPES gtt_create_item    TYPE TABLE FOR CREATE i_salesordertp\_item.

"Grandchild via item-level association — DOUBLE backslash for path through entity:
TYPES gtt_create_pricing TYPE TABLE FOR CREATE i_salesordertp\\salesorderitem\_itempricingelement.
TYPES gtt_create_partner TYPE TABLE FOR CREATE i_salesordertp\\salesorderitem\_itempartner.

"Response types — EARLY for MODIFY phase, LATE for COMMIT phase:
TYPES gts_failed_early    TYPE RESPONSE FOR FAILED   EARLY i_salesordertp.
TYPES gts_reported_early  TYPE RESPONSE FOR REPORTED EARLY i_salesordertp.
TYPES gts_mapped_early    TYPE RESPONSE FOR MAPPED   EARLY i_salesordertp.
TYPES gts_failed_late     TYPE RESPONSE FOR FAILED   LATE  i_salesordertp.
TYPES gts_reported_late   TYPE RESPONSE FOR REPORTED LATE  i_salesordertp.
```

**Path rules:**
- Single `\` → from current entity via association
- `\\` (double backslash before entity alias) → "navigate through this entity name"
- The alias between `\\` segments is the **entity alias** declared in BDEF (e.g., `salesorderitem`), not the CDS view name

---

## Deep CREATE Pattern — Multi-Level via %cid_ref

**CANNOT nest grandchild tables inside parent's `%target`.** Each level must be its own `CREATE BY` block, linked by `%cid_ref`.

### Wrong ❌
```abap
APPEND VALUE #(
  %cid = 'L1'
  product = 'MAT-01'
  _itempricingelement = VALUE #( ( ... ) )   "❌ No component _ITEMPRICINGELEMENT in %target
) TO ldt_create_item-%target.
```

### Correct ✅ — Two CREATE BY blocks in ONE MODIFY, linked by %cid_ref
```abap
"Build root-level CREATE table (item)
DATA(ldf_cid_item)    = 'L1'.
DATA(ldf_cid_pricing) = 'P1'.

APPEND VALUE #(
  %key-salesorder = '' "framework will assign
  %target = VALUE #(
    ( %cid    = ldf_cid_item
      product = 'MAT-01'
      requestedquantity      = '10'
      requestedquantityunit  = 'PC'
      plant                  = '1710' ) )
) TO ldt_create_item.

"Build grandchild CREATE table (pricing) — link via %cid_ref pointing to ITEM cid
APPEND VALUE #(
  %cid_ref = ldf_cid_item     "binds this pricing to item with %cid='L1'
  %target  = VALUE #(
    ( %cid                  = ldf_cid_pricing
      conditiontype         = 'PR00'
      conditionrateamount   = '100.00'
      conditioncurrency     = 'USD'
      conditionquantity     = 1
      conditionquantityunit = 'PC' ) )
) TO ldt_create_pricing.

"Single MODIFY with two ENTITY blocks
MODIFY ENTITIES OF i_salesordertp
  ENTITY salesorder
    CREATE BY \_item
    FIELDS ( product requestedquantity requestedquantityunit plant
             storagelocation itemnetweight itemweightunit
             salesorderitemcategory salesorderitemtext )
    WITH ldt_create_item
  ENTITY salesorderitem
    CREATE BY \_itempricingelement
    FIELDS ( conditiontype conditionrateamount conditioncurrency
             conditionquantity conditionquantityunit )
    WITH ldt_create_pricing
  FAILED   DATA(lds_failed)
  MAPPED   DATA(lds_mapped)
  REPORTED DATA(lds_reported).
```

**Key rules:**
- `%cid` must be unique across the entire MODIFY statement
- `%cid_ref` references a `%cid` in the **same** MODIFY (cannot reference a key already in DB — use `%key` for that)
- Field lists `FIELDS ( ... )` must include only **non-key, non-readonly** fields
- Do NOT include `%cid` itself in `FIELDS ( ... )` — only data fields
