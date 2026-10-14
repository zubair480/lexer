# API readiness (backend flips MOCK → LIVE after curl-verifying contract-correct JSON)
| Endpoint | Method | Status | Owner | Notes |
|---|---|---|---|---|
| /api/dashboard | GET | MOCK | B10 | |
| /api/rulebooks | GET, POST | MOCK | B8 | |
| /api/rulebooks/:id | GET | MOCK | B8 | |
| /api/rulebooks/:id/compile/stream | GET (SSE) | MOCK | B8 | |
| /api/rules/:id/approve | POST | MOCK | B8 | |
| /api/rulebooks/:id/approve-all | POST | MOCK | B8 | |
| /api/rules/:id/recompile | POST | MOCK | B8 | |
| /api/invoices | GET, POST | MOCK | B10 | |
| /api/invoices/:id | GET | MOCK | B10 | |
| /api/invoices/:id/check | POST | MOCK | B10 | |
| /api/invoices/:id/flags | GET | MOCK | B10 | |
| /api/flags/:id/suggest | POST | MOCK | B11 | |
| /api/flags/:id | PATCH | MOCK | B10 | |
| /api/eval/:invoiceId | GET | MOCK | B11 | |
| /api/review | GET | MOCK | B11 | |
| /api/audit | GET | MOCK | B11 | |
| /api/demo/reset | POST | MOCK | B9 | |
