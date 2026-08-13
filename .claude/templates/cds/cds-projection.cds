@EndUserText.label: 'Projection View for {{DATA_MODEL}}'
@AccessControl.authorizationCheck: #NOT_REQUIRED
@Metadata.allowExtensions: true
@Search.searchable: true
define root view entity {{PROJECTION}}
  provider contract transactional_query
  as projection on {{DATA_MODEL}}
{
  key SalesOrder,
      DocumentNumber,

      // ... business fields exposed to UI ...

      @Search.defaultSearchElement: true
      DocumentNumber as DocumentNumberSearch,

      CreatedBy,
      CreatedAt,
      LastChangedBy,
      LastUpdatedAt,
      LocalLastUpdatedAt,

      /* Associations */
      _Item : redirected to composition child {{PROJECTION_ITEM}}
}
