# rap-cds — View Types & Composition/Association

> Reference cho SKILL.md § "CDS View Entity Types in RAP" và § "Composition and Association Patterns". Code verbatim.

## CDS View Entity Types in RAP

RAP uses a layered CDS architecture:

### 1. Interface View Entities (R-layer)
The core data model, prefix `_R_` or `_I_`. These define the business object structure.

```sql
define root view entity ZR_TRAVEL
  as select from ztravel
  composition [0..*] of ZR_BOOKING as _Booking
{ ... }
```

### 2. Projection View Entities (C-layer)
Service-specific projections, prefix `_C_`. These adapt the interface layer for specific consumers.

```sql
define root view entity ZC_TRAVEL
  provider contract transactional_query
  as projection on ZR_TRAVEL
{ ... }
```

### 3. CDS Metadata Extensions
Separate annotation files that decouple UI metadata from the core data model.

```sql
@Metadata.layer: #CONSUMER
annotate view ZC_TRAVEL with
{ ... }
```

## Composition and Association Patterns

### Root to Child (Composition)
```sql
// In root entity
composition [0..*] of ZR_BOOKING as _Booking

// In child entity
association to parent ZR_TRAVEL as _Travel
  on $projection.TravelUUID = _Travel.TravelUUID
```

### Child to Grandchild
```sql
// In child entity
composition [0..*] of ZR_BOOKING_SUPPLEMENT as _BookingSupplement

// In grandchild entity
association to parent ZR_BOOKING as _Booking
  on $projection.BookingUUID = _Booking.BookingUUID
```

### Cross-BO Associations
```sql
association [0..1] to I_Currency as _Currency
  on $projection.CurrencyCode = _Currency.Currency
```

### Cardinality Options
- `[0..1]` — zero or one (optional to-one)
- `[1..1]` or `[1]` — exactly one (mandatory to-one)
- `[0..*]` or `[*]` — zero or many (to-many)
- `[1..*]` — one or many
