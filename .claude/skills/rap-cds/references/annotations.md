# rap-cds — Essential Annotations

> Reference cho SKILL.md § "Essential Annotations". Code verbatim.

## Essential Annotations

### Semantic Annotations (Interface Layer)

These annotations enable the RAP framework to handle admin fields automatically in managed BOs:

```sql
@Semantics.user.createdBy: true
created_by as CreatedBy,

@Semantics.systemDateTime.createdAt: true
created_at as CreatedAt,

@Semantics.user.localInstanceLastChangedBy: true
local_last_changed_by as LocalLastChangedBy,

@Semantics.systemDateTime.localInstanceLastChangedAt: true
local_last_changed_at as LocalLastChangedAt,

@Semantics.systemDateTime.lastChangedAt: true
last_changed_at as LastChangedAt,
```

### Amount and Quantity
```sql
@Semantics.amount.currencyCode: 'CurrencyCode'
total_price as TotalPrice,

@Semantics.quantity.unitOfMeasure: 'QuantityUnit'
quantity as Quantity,
```

### UI Annotations (Projection/Metadata Extension Layer)

**Header info:**
```sql
@UI.headerInfo: {
  typeName: 'Travel',
  typeNamePlural: 'Travels',
  title: { type: #STANDARD, value: 'TravelID' },
  description: { type: #STANDARD, value: 'Description' }
}
```

**List report and object page field positioning:**
```sql
@UI.lineItem: [{ position: 10 }]
@UI.identification: [{ position: 10 }]
@UI.selectionField: [{ position: 10 }]
TravelID,

@UI.lineItem: [{ position: 20, importance: #HIGH }]
@UI.identification: [{ position: 20 }]
AgencyID,

@UI.lineItem: [{ position: 30, criticality: 'OverallStatusCriticality' }]
OverallStatus,
```

**Facets for object page layout:**
```sql
@UI.facet: [
  { id: 'GeneralInfo',
    type: #COLLECTION,
    label: 'General Information',
    position: 10 },
  { id: 'TravelData',
    parentId: 'GeneralInfo',
    type: #FIELDGROUP_REFERENCE,
    targetQualifier: 'TravelData',
    position: 10 },
  { id: 'BookingTable',
    type: #LINEITEM_REFERENCE,
    label: 'Bookings',
    position: 20,
    targetElement: '_Booking' }
]
```

**Field groups:**
```sql
@UI.fieldGroup: [{ qualifier: 'TravelData', position: 10 }]
AgencyID,

@UI.fieldGroup: [{ qualifier: 'TravelData', position: 20 }]
CustomerID,
```

### Search Annotations
```sql
@Search.searchable: true

// On specific fields:
@Search.defaultSearchElement: true
@Search.fuzzinessThreshold: 0.7
Description,
```

### Value Help Annotations
```sql
@Consumption.valueHelpDefinition: [{
  entity: { name: 'I_Currency', element: 'Currency' }
}]
CurrencyCode,

@Consumption.valueHelpDefinition: [{
  entity: { name: '/DMO/I_Agency', element: 'AgencyID' },
  additionalBinding: [{ localElement: 'AgencyName', element: 'Name' }]
}]
AgencyID,
```
