# rap-behavior — Actions & Feature Control (full code)

> Chi tiết section `## Adding Actions` (incl. instance/static/factory actions và dynamic feature control) của SKILL.md.

## Adding Actions

Actions are custom operations beyond standard CRUD.

### Instance Actions (bound to a specific instance)

**BDEF:**
```
action ( features : instance ) acceptTravel result [1] $self;
action ( features : instance ) rejectTravel result [1] $self;
action deductDiscount parameter ZA_DISCOUNT result [1] $self;
```

**Implementation:**
```abap
METHOD acceptTravel.
  MODIFY ENTITIES OF ZR_Travel IN LOCAL MODE
    ENTITY Travel
    UPDATE FIELDS ( OverallStatus )
    WITH VALUE #( FOR key IN keys
      ( %tky          = key-%tky
        OverallStatus = 'A' ) ) " Accepted
    FAILED failed
    REPORTED reported.

  " Return the updated instance
  READ ENTITIES OF ZR_Travel IN LOCAL MODE
    ENTITY Travel
    ALL FIELDS
    WITH CORRESPONDING #( keys )
    RESULT DATA(travels).

  result = VALUE #( FOR travel IN travels
    ( %tky   = travel-%tky
      %param = travel ) ).
ENDMETHOD.
```

### Static Actions (not bound to an instance)

**BDEF:**
```
static action createFromTemplate parameter ZA_TEMPLATE result [1] $self;
```

### Factory Actions (create new instances)

**BDEF:**
```
factory action copyTravel [1];
```

**Implementation:**
```abap
METHOD copyTravel.
  READ ENTITIES OF ZR_Travel IN LOCAL MODE
    ENTITY Travel
    ALL FIELDS
    WITH CORRESPONDING #( keys )
    RESULT DATA(travels).

  LOOP AT travels INTO DATA(travel).
    " Create a copy with modified fields
    MODIFY ENTITIES OF ZR_Travel IN LOCAL MODE
      ENTITY Travel
      CREATE FIELDS ( AgencyID CustomerID BeginDate EndDate
                      Description OverallStatus )
      WITH VALUE #( (
        %cid          = keys[ KEY entity %tky = travel-%tky ]-%cid_ref
        AgencyID      = travel-AgencyID
        CustomerID    = travel-CustomerID
        BeginDate     = cl_abap_context_info=>get_system_date( )
        EndDate       = cl_abap_context_info=>get_system_date( ) + 14
        Description   = |Copy of { travel-Description }|
        OverallStatus = 'O' ) )
      MAPPED mapped
      FAILED failed
      REPORTED reported.
  ENDLOOP.
ENDMETHOD.
```

### Dynamic Feature Control

Control which actions/operations are available based on instance state:

**BDEF:**
```
action ( features : instance ) acceptTravel result [1] $self;
action ( features : instance ) rejectTravel result [1] $self;
```

**Implementation:**
```abap
METHOD get_instance_features.
  READ ENTITIES OF ZR_Travel IN LOCAL MODE
    ENTITY Travel
    FIELDS ( OverallStatus )
    WITH CORRESPONDING #( keys )
    RESULT DATA(travels)
    FAILED failed.

  result = VALUE #( FOR travel IN travels
    ( %tky = travel-%tky
      " Disable accept/reject for already accepted/rejected travels
      %action-acceptTravel = COND #(
        WHEN travel-OverallStatus = 'A'
        THEN if_abap_behv=>fc-o-disabled
        ELSE if_abap_behv=>fc-o-enabled )
      %action-rejectTravel = COND #(
        WHEN travel-OverallStatus = 'X'
        THEN if_abap_behv=>fc-o-disabled
        ELSE if_abap_behv=>fc-o-enabled )
    ) ).
ENDMETHOD.
```
