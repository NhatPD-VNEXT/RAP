# rap-cds — Projection View & Metadata Extension

> Reference cho SKILL.md § "Projection View Pattern" và § "Metadata Extension Pattern". Code verbatim.

## Projection View Pattern

```sql
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Travel - Projection'
@Search.searchable: true
@Metadata.allowExtensions: true

define root view entity ZC_TRAVEL
  provider contract transactional_query
  as projection on ZR_TRAVEL
{
  key TravelUUID,
      @Search.defaultSearchElement: true
      TravelID,

      @Search.defaultSearchElement: true
      @ObjectModel.text.element: ['AgencyName']
      @Consumption.valueHelpDefinition: [{ entity: { name: '/DMO/I_Agency', element: 'AgencyID' } }]
      AgencyID,
      _Agency.Name as AgencyName,

      @Consumption.valueHelpDefinition: [{ entity: { name: '/DMO/I_Customer', element: 'CustomerID' } }]
      CustomerID,

      BeginDate,
      EndDate,

      @Semantics.amount.currencyCode: 'CurrencyCode'
      TotalPrice,

      @Consumption.valueHelpDefinition: [{ entity: { name: 'I_Currency', element: 'Currency' } }]
      CurrencyCode,

      Description,
      OverallStatus,

      CreatedBy,
      CreatedAt,
      LocalLastChangedBy,
      LocalLastChangedAt,
      LastChangedAt,

      /* Associations */
      _Booking : redirected to composition child ZC_BOOKING,
      _Agency,
      _Currency
}
```

Key points for projections:
- Use `provider contract transactional_query` for RAP projections
- Use `redirected to composition child` for composition associations
- Use `redirected to parent` for parent associations in child projections
- Add `@Metadata.allowExtensions: true` to enable metadata extensions

## Metadata Extension Pattern

```sql
@Metadata.layer: #CONSUMER
@UI.headerInfo: {
  typeName: 'Travel',
  typeNamePlural: 'Travels',
  title: { type: #STANDARD, value: 'TravelID' },
  description: { type: #STANDARD, value: 'Description' }
}

annotate view ZC_TRAVEL with
{
  @UI.facet: [
    { id: 'GeneralInfo', type: #COLLECTION, label: 'General Information', position: 10 },
    { id: 'TravelDetails', parentId: 'GeneralInfo', type: #FIELDGROUP_REFERENCE,
      targetQualifier: 'TravelDetails', position: 10 },
    { id: 'Dates', parentId: 'GeneralInfo', type: #FIELDGROUP_REFERENCE,
      targetQualifier: 'Dates', position: 20 },
    { id: 'Bookings', type: #LINEITEM_REFERENCE, label: 'Bookings',
      position: 20, targetElement: '_Booking' }
  ]

  @UI.lineItem: [{ position: 10 }]
  @UI.selectionField: [{ position: 10 }]
  @UI.identification: [{ position: 10 }]
  TravelID;

  @UI.lineItem: [{ position: 20, importance: #HIGH }]
  @UI.fieldGroup: [{ qualifier: 'TravelDetails', position: 10 }]
  AgencyID;

  @UI.lineItem: [{ position: 30, importance: #HIGH }]
  @UI.fieldGroup: [{ qualifier: 'TravelDetails', position: 20 }]
  CustomerID;

  @UI.fieldGroup: [{ qualifier: 'Dates', position: 10 }]
  BeginDate;

  @UI.fieldGroup: [{ qualifier: 'Dates', position: 20 }]
  EndDate;

  @UI.lineItem: [{ position: 40 }]
  TotalPrice;

  @UI.lineItem: [{ position: 50, criticality: 'StatusCriticality' }]
  @UI.selectionField: [{ position: 20 }]
  OverallStatus;

  @UI.hidden: true
  TravelUUID;

  @UI.hidden: true
  CreatedBy;

  @UI.hidden: true
  CreatedAt;

  @UI.hidden: true
  LocalLastChangedBy;

  @UI.hidden: true
  LocalLastChangedAt;

  @UI.hidden: true
  LastChangedAt;
}
```
