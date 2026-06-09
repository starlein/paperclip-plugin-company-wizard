## Output / review bar

A good API design:

- A `docs/API-DESIGN.md` with a resource model, full endpoint inventory (method, path, auth requirement), authentication strategy, error-handling conventions (consistent error shape), and pagination approach.
- Every endpoint has: description, parameter types and constraints, request/response schema, example request/response, and possible error codes — generated from source annotations (OpenAPI/Swagger), not maintained by hand.

Not done:

- Endpoints with no auth or error contract — a list of URLs with no mention of who can call them or what error codes they return is not done.
- A design that skips input validation at the boundary or uses a different error shape per endpoint.
