@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Data Model: {{CASE_NAME}} Item'
@Metadata.ignorePropagatedAnnotations: true
define view entity {{DATA_MODEL_ITEM}}
  as select from {{TABLE_ITEM}}
  association to parent {{DATA_MODEL}} as _Header
    on $projection.SalesOrder = _Header.SalesOrder
{
  key sales_order                       as SalesOrder,
  key item_number                       as ItemNumber,

      material                          as Material,
      @Semantics.quantity.unitOfMeasure: 'QuantityUnit'
      quantity                          as Quantity,
      @Semantics.unitOfMeasure: true
      quantity_unit                     as QuantityUnit,
      @Semantics.amount.currencyCode: 'Currency'
      net_amount                        as NetAmount,
      @Semantics.currencyCode: true
      currency                          as Currency,

      @Semantics.systemDateTime.lastChangedAt: true
      last_updated_at                   as LastUpdatedAt,
      @Semantics.systemDateTime.localInstanceLastChangedAt: true
      local_last_updated_at             as LocalLastUpdatedAt,

      /* Associations */
      _Header
}
