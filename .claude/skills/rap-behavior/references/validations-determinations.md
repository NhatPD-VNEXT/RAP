# rap-behavior — Validations & Determinations (full code)

> Chi tiết các section `## Adding Validations` và `## Adding Determinations` của SKILL.md.

## Adding Validations

Validations check data consistency before saving. They reject invalid instances with error messages.

### Step 1: Declare in BDEF

Add inside the entity behavior body `{ ... }`:

```
validation validateDates on save { create; field BeginDate, EndDate; }
validation validateStatus on save { create; update; }
```

The trigger conditions specify WHEN the validation runs:
- `create` — on new instance creation
- `update` — only valid together with `create` for `on save`
- `delete` — on deletion
- `field FieldA, FieldB` — when these fields change

### Step 2: Implement in Handler Class

In the ABP's Local Types (CCIMP include):

```abap
CLASS lhc_Travel DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
    METHODS validateDates FOR VALIDATE ON SAVE
      IMPORTING keys FOR Travel~validateDates.
    METHODS validateStatus FOR VALIDATE ON SAVE
      IMPORTING keys FOR Travel~validateStatus.
ENDCLASS.

CLASS lhc_Travel IMPLEMENTATION.
  METHOD validateDates.
    " Read the relevant instances
    READ ENTITIES OF ZR_Travel IN LOCAL MODE
      ENTITY Travel
      FIELDS ( BeginDate EndDate )
      WITH CORRESPONDING #( keys )
      RESULT DATA(travels)
      FAILED DATA(read_failed).

    LOOP AT travels INTO DATA(travel).
      " Check: begin date must be before end date
      IF travel-BeginDate >= travel-EndDate.
        APPEND VALUE #( %tky = travel-%tky ) TO failed-travel.
        APPEND VALUE #( %tky = travel-%tky
                        %msg = new_message_with_text(
                          severity = if_abap_behv_message=>severity-error
                          text     = 'Begin date must be before end date' )
                        %element-BeginDate = if_abap_behv=>mk-on
                        %element-EndDate   = if_abap_behv=>mk-on
        ) TO reported-travel.
      ENDIF.

      " Check: begin date must be in the future
      IF travel-BeginDate < cl_abap_context_info=>get_system_date( ).
        APPEND VALUE #( %tky = travel-%tky ) TO failed-travel.
        APPEND VALUE #( %tky = travel-%tky
                        %msg = new_message_with_text(
                          severity = if_abap_behv_message=>severity-error
                          text     = 'Begin date must be in the future' )
                        %element-BeginDate = if_abap_behv=>mk-on
        ) TO reported-travel.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD validateStatus.
    READ ENTITIES OF ZR_Travel IN LOCAL MODE
      ENTITY Travel
      FIELDS ( OverallStatus )
      WITH CORRESPONDING #( keys )
      RESULT DATA(travels).

    LOOP AT travels INTO DATA(travel).
      IF travel-OverallStatus IS NOT INITIAL
        AND NOT travel-OverallStatus CA 'OAXR'. " Open, Accepted, Rejected
        APPEND VALUE #( %tky = travel-%tky ) TO failed-travel.
        APPEND VALUE #( %tky = travel-%tky
                        %msg = new_message_with_text(
                          severity = if_abap_behv_message=>severity-error
                          text     = 'Invalid status value' )
                        %element-OverallStatus = if_abap_behv=>mk-on
        ) TO reported-travel.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.
ENDCLASS.
```

### Validation Best Practices
- Use `IN LOCAL MODE` for EML reads within the handler — bypasses authorization checks
- Always populate both `failed` and `reported` for rejected instances
- Use `%element-FieldName = if_abap_behv=>mk-on` to highlight the problematic field on the UI
- Keep validations focused on one concern each

## Adding Determinations

Determinations automatically compute/modify field values based on triggers.

### Step 1: Declare in BDEF

```
determination setTravelID on modify { create; }
determination calculateTotalPrice on modify { field BookingFee, FlightPrice; }
determination setStatusOpen on save { create; }
```

Two timing options:
- `on modify` — runs immediately when buffer changes (result available during transaction)
- `on save` — runs during save sequence

### Step 2: Implement

```abap
METHOD setTravelID.
  " Read max travel ID and increment
  READ ENTITIES OF ZR_Travel IN LOCAL MODE
    ENTITY Travel
    FIELDS ( TravelID )
    WITH CORRESPONDING #( keys )
    RESULT DATA(travels).

  " Find instances that need an ID
  DELETE travels WHERE TravelID IS NOT INITIAL.
  CHECK travels IS NOT INITIAL.

  " Get max existing ID
  SELECT MAX( travel_id ) FROM ztravel INTO @DATA(max_id).

  " Set IDs for new instances
  MODIFY ENTITIES OF ZR_Travel IN LOCAL MODE
    ENTITY Travel
    UPDATE FIELDS ( TravelID )
    WITH VALUE #( FOR travel IN travels INDEX INTO idx
      ( %tky     = travel-%tky
        TravelID = max_id + idx ) )
    REPORTED DATA(update_reported).

  reported = CORRESPONDING #( DEEP update_reported ).
ENDMETHOD.
```
