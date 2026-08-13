# rap-behavior — Draft, Authorization, Side Effects, Business Events (full code)

> Chi tiết các section `## Draft Handling`, `## Authorization`, `## Side Effects`, `## Business Events` của SKILL.md.

## Draft Handling

For Fiori apps, draft enables save-as-you-go editing.

### BDEF Additions

In the header:
```
managed implementation in class ZBP_R_TRAVEL unique;
strict ( 2 );
with draft;
```

On the root entity:
```
draft table ztravel_d
...
lock master total etag LastChangedAt
...
draft action Resume;
draft action Edit;
draft action Activate optimized;
draft action Discard;
draft determine action Prepare
{
  validation validateDates;
  validation validateStatus;
}
```

On child entities, add `with draft` to the association:
```
association _Booking { create; with draft; }
```

The draft determine action `Prepare` lists which validations/determinations to run when the user clicks "Save" (activating the draft). Only `on save` validations and determinations can be assigned.

## Authorization

### Global Authorization

**BDEF:**
```
authorization master ( global )
```

**Implementation:**
```abap
METHOD get_global_authorizations.
  " Check authorization object
  AUTHORITY-CHECK OBJECT 'ZTRAVEL'
    ID 'ACTVT' FIELD '01'. " Create

  DATA(is_authorized) = COND #(
    WHEN sy-subrc = 0
    THEN if_abap_behv=>auth-allowed
    ELSE if_abap_behv=>auth-unauthorized ).

  result = VALUE #(
    %create = is_authorized
    %update = is_authorized
    %delete = is_authorized ).
ENDMETHOD.
```

### Instance Authorization

**BDEF:**
```
authorization master ( global, instance )
```

**Implementation:**
```abap
METHOD get_instance_authorizations.
  READ ENTITIES OF ZR_Travel IN LOCAL MODE
    ENTITY Travel
    FIELDS ( OverallStatus )
    WITH CORRESPONDING #( keys )
    RESULT DATA(travels).

  LOOP AT travels INTO DATA(travel).
    " Example: only allow changes to open travels
    DATA(is_open) = COND #(
      WHEN travel-OverallStatus = 'O'
      THEN if_abap_behv=>auth-allowed
      ELSE if_abap_behv=>auth-unauthorized ).

    APPEND VALUE #(
      %tky    = travel-%tky
      %update = is_open
      %delete = is_open
    ) TO result.
  ENDLOOP.
ENDMETHOD.
```

## Side Effects

Side effects trigger UI refreshes when fields change. Declared in the BDEF, no implementation needed.

```
side effects {
  field BeginDate affects field TotalPrice;
  field EndDate affects field TotalPrice;
  field FlightPrice affects field TotalPrice;
  determine action Prepare executed on field OverallStatus affects messages;
  action acceptTravel affects field OverallStatus, field *, messages;
}
```

## Business Events

For async communication between BOs:

**BDEF:**
```
event TravelAccepted parameter ZA_TRAVEL_EVENT;
```

**Raising in saver class:**
```abap
METHOD save_modified.
  IF create-travel IS NOT INITIAL.
    RAISE ENTITY EVENT ZR_Travel~TravelAccepted
      FROM VALUE #( FOR travel IN create-travel
        ( %key = travel-%key
          %param = VALUE #( travel_id = travel-TravelID ) ) ).
  ENDIF.
ENDMETHOD.
```
