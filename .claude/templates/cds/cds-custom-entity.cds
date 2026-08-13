@EndUserText.label: 'Custom Entity {{CASE_NAME}}'
@ObjectModel.query.implementedBy: 'ABAP:{{HELPER_CLASS}}'
@Search.searchable: true
define root custom entity {{DATA_MODEL}}
{
  key Id              : abap.char(20);
      DocumentNumber  : abap.char(20);
      @Search.defaultSearchElement: true
      Description     : abap.char(60);
      Status          : abap.char(1);
      @Semantics.amount.currencyCode: 'Currency'
      NetAmount       : abap.curr(24, 2);
      @Semantics.currencyCode: true
      Currency        : abap.cuky;
      CreatedAt       : timestampl;
      CreatedBy       : abap.char(12);
}
