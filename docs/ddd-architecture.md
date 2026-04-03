# DDD Refactor Map

## Current bounded contexts

### Identity
- Authentication
- Invitations
- User creation
- Role checks

### Catalog
- Product listing
- Product details/editing
- Product status actions

### Product Creation
- File preparation
- Normalization
- Validation
- Create/update OTTO payloads

### Integration
- OTTO auth
- OTTO client
- Delivery/profile-style upstream operations

## Target structure

```text
app/
  contexts/
    identity/
      domain/
      application/
      infrastructure/
      interfaces/
    catalog/
      domain/
      application/
      infrastructure/
      interfaces/
    product_creation/
      domain/
      application/
      infrastructure/
      interfaces/
```

## Completed in this refactor

Identity is now introduced as a real DDD slice:

- `app/contexts/identity/domain`
- `app/contexts/identity/application`
- `app/contexts/identity/infrastructure`
- `app/contexts/identity/interfaces`

FastAPI auth wiring now uses the new identity application service through dependencies.

## Still on legacy structure

- Product/catalog flows
- Product creation pipeline
- OTTO integration services

These still work, but they have not yet been moved to dedicated DDD contexts.

## Recommended next migration order

1. Catalog context
   - Extract product query/use-case layer
   - Move local DB product repository behind ports
   - Keep OTTO-facing reads in infrastructure adapters

2. Product Creation context
   - Move normalization/prepare/create orchestration into application services
   - Wrap mapper and OTTO write flows behind ports

3. Integration context
   - Isolate OTTO auth/client concerns
   - Keep external API details out of application services

## Migration rule

Each context should be moved vertically:

1. domain model
2. application service + ports
3. infrastructure adapters
4. HTTP/controller wiring

Avoid moving files by layer only without switching runtime wiring. The runtime should start using the new context as soon as the vertical slice is complete.
