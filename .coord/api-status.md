# API readiness (backend flips MOCK → LIVE after curl-verifying contract-correct JSON)
| Endpoint | Method | Status | Owner | Notes |
|---|---|---|---|---|
| /api/dashboard | GET | LIVE | B10 | |
| /api/rulebooks | GET, POST | LIVE | B8 | |
| /api/rulebooks/:id | GET | LIVE | B8 | |
| /api/rulebooks/:id/compile/stream | GET (SSE) | LIVE | B8 | |
| /api/rules/:id/approve | POST | MOCK | B8 | |
| /api/rulebooks/:id/approve-all | POST | MOCK | B8 | |
| /api/rules/:id/recompile | POST | MOCK | B8 | |
| /api/invoices | GET, POST | LIVE | B10 | |
| /api/invoices/:id | GET | LIVE | B10 | |
| /api/invoices/:id/check | POST | MOCK | B10 | |
| /api/invoices/:id/flags | GET | LIVE | B10 | |
| /api/flags/:id/suggest | POST | MOCK | B11 | |
| /api/flags/:id | PATCH | MOCK | B10 | |
| /api/eval/:invoiceId | GET | LIVE | B11 | |
| /api/review | GET | LIVE | B11 | |
| /api/audit | GET | LIVE | B11 | |
| /api/demo/reset | POST | MOCK | B9 | |
