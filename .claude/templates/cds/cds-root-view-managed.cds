@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Data Model: {{CASE_NAME}} Header'
@Metadata.ignorePropagatedAnnotations: true
@ObjectModel.usageType:{
  serviceQuality: #X,
  sizeCategory:   #S,
  dataClass:      #MIXED
}
define root view entity {{DATA_MODEL}}
  as select from {{TABLE}}
  composition [0..*] of {{DATA_MODEL_ITEM}} as _Item
{
  key sales_order                       as SalesOrder,
      document_number                   as DocumentNumber,

      // ... business fields ...

      @Semantics.user.createdBy: true
      created_by                        as CreatedBy,
      @Semantics.systemDateTime.createdAt: true
      created_at                        as CreatedAt,
      @Semantics.user.lastChangedBy: true
      last_changed_by                   as LastChangedBy,
      @Semantics.systemDateTime.lastChangedAt: true
      last_updated_at                   as LastUpdatedAt,
      @Semantics.systemDateTime.localInstanceLastChangedAt: true
      local_last_updated_at             as LocalLastUpdatedAt,

      /* Associations */
      _Item
}
