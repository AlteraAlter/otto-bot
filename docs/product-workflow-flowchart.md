# OTTO Bot Workflow Flowchart

This flowchart is derived from the current codebase workflow for authentication and product creation.

```mermaid
flowchart TD
    A[User opens frontend] --> B{Authenticated?}
    B -- No --> C[Login or Register]
    C --> D[/v1/auth/login or /v1/auth/register/]
    D --> E[JWT returned]
    E --> F[Session cookie stored in Next.js]
    F --> G[Authorized product routes available]
    B -- Yes --> G

    G --> H[Open Creator page]
    H --> I{Creation mode}

    I -- JSON file mode --> J[Select or drag .json file]
    J --> K[Frontend POST /api/products/prepare-from-file]
    K --> L[Backend /v1/products/prepare-from-file]
    L --> M{Valid .json and readable file?}
    M -- No --> M1[400 or 415 error returned]
    M -- Yes --> N[ProductCreationService.prepare_upload]
    N --> O[Decode bytes and parse JSON]
    O --> P{Root is object or array of objects?}
    P -- No --> P1[400 parse error]
    P -- Yes --> Q[Normalize each source item]
    Q --> Q1[Generate SEO description]
    Q1 --> Q2[Build normalized OTTO payload]
    Q2 --> Q3[Infer and map category]
    Q3 --> Q4[Sanitize attributes and optional fields]
    Q4 --> R{ProductCreate schema valid?}
    R -- No --> R1[Collect validate issues]
    R -- Yes --> S[Prepared request body added]
    R1 --> T[Return prepared payloads and issues]
    S --> T
    T --> U[Frontend shows editable JSON tree]
    U --> V[User edits prepared payload]
    V --> W[Frontend POST /api/products/create-from-prepared]
    W --> X[Backend validates prepared bodies again]
    X --> Y{Any valid payloads left?}
    Y -- No --> Y1[422 no valid request bodies]
    Y -- Yes --> Z[create_products]
    Z --> Z1[Sanitize attributes again]
    Z1 --> Z2[Trim productLine]
    Z2 --> Z3[Normalize category against OTTO or fallback list]
    Z3 --> Z4[ProductService.create_or_update_products]
    Z4 --> Z5[OttoClient sends batch to OTTO API]
    Z5 --> Z6{Create succeeded?}
    Z6 -- No --> Z7[502 create issues returned]
    Z6 -- Yes --> Z8[Success response with counts]

    I -- Single item mode --> AA[User fills table rows]
    AA --> AB[Frontend converts each row to prepared payload]
    AB --> AC{Local row validation passes?}
    AC -- No --> AC1[Frontend blocks submit and shows row issues]
    AC -- Yes --> AD[POST /api/products/create-from-prepared]
    AD --> X

    G --> AE[Other product routes]
    AE --> AF[List local DB products]
    AE --> AG[Get OTTO active products]
    AE --> AH[Sync OTTO products into local DB]
    AE --> AI[Update marketplace status]
```

## Source references

- Frontend creator flows: `frontend/app/creator/page.tsx`
- Auth token + session cookie handling: `frontend/lib/auth.ts`
- Auth endpoints: `app/api/routes/auth.py`
- Product creation endpoints: `app/api/routes/products.py`
- Upload normalization pipeline: `app/services/product_creation_service.py`
- OTTO client service boundary: `app/services/product_service.py`

## Notes

- The main creation workflow has two entry points in the UI:
  - file-based prepare -> review/edit -> create
  - manual single-row entry -> create
- Both paths converge on `/v1/products/create-from-prepared`.
- Product routes are protected by `get_current_user` and employee-role checks.
- Error handling is stage-aware and reports `normalize`, `validate`, and `create` issues.
