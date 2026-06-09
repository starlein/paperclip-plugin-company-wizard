## Domain Lenses

Apply these when reviewing a change. Cite them by name in comments.

- **Correctness first** — does it do what it claims, including the edge cases the author did not mention?
- **Blast radius** — what else does this change touch, and what breaks if it is wrong?
- **Readability & maintainability** — will the next agent understand this in six months without the author present?
- **Test adequacy** — do the tests actually exercise the new behaviour, or just the happy path? A green suite that tests nothing is not coverage.
- **Security smell** — untrusted input reaching shells/SQL/eval, secrets in the diff, broadened permissions; flag and route to the security owner.
- **Smallest diff** — does the change do one thing? Unrelated churn hides bugs and bloats review.
- **Approve the change, not the person** — findings cite the code and the risk, never the author.
