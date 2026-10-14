# API readiness (backend flips MOCK → LIVE after curl-verifying contract-correct JSON)
| Endpoint | Method | Status | Owner | Notes |
|---|---|---|---|---|
| /api/dashboard | GET | LIVE | B10 | B12 smoke PASS (shape ok) |
| /api/rulebooks | GET, POST | LIVE | B8 | B12 smoke PASS GET; POST not smoked (use --create) |
| /api/rulebooks/:id | GET | LIVE | B8 | B12 PASS incl. 404 ApiError + clause slice(start,end)===text |
| /api/rulebooks/:id/compile/stream | GET (SSE) | LIVE | B8 | B12 PASS: order started→clause_found*→…→done, all events typed; acme 6 verified+1 needs_interp ~8s offline; uscis 3 verified |
| /api/rules/:id/approve | POST | LIVE | B8 | B12 PASS |
| /api/rulebooks/:id/approve-all | POST | LIVE | B8 | B12 PASS (approvedBy set); flaky under concurrent compiles (shared dev DB) |
| /api/rules/:id/recompile | POST | LIVE | B8 | B12 PASS (offline LLM) |
| /api/invoices | GET, POST | LIVE | B10 | B12 PASS GET |
| /api/invoices/:id | GET | LIVE | B10 | B12 PASS 20 entries |
| /api/invoices/:id/check | POST | LIVE | B10 | B12 PASS acme 9 flags/9 entries, 3.1-3.6, atRisk $4124; uscis → pet_02 4.1+4.3 |
| /api/invoices/:id/flags | GET | LIVE | B10 | B12 PASS |
| /api/flags/:id/suggest | POST | LIVE | B11 | B12 PASS verified=true; 1 intermittent 500 "Unexpected end of JSON input" seen |
| /api/flags/:id | PATCH | LIVE | B10 | B12 PASS dismiss(+note)→open |
| /api/eval/:invoiceId | GET | LIVE | B11 | B12 PASS 15/15 |
| /api/review | GET | LIVE | B11 | B12 PASS |
| /api/audit | GET | LIVE | B11 | B12 PASS |
| /api/demo/reset | POST | LIVE | B9 | B12 PASS {ok:true} (2.6–27s) |
