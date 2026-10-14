# shared/contract.ts changelog (B1 only, additive changes)
[start] v1 created — see shared/contract.ts
[19:14] ADDITIVE: API.uploadRulebook (POST /api/rulebooks/upload, multipart file .md/.txt/.pdf/.docx/.html → Rulebook) and API.uploadInvoice (POST /api/invoices/upload, multipart CSV or LEDES 1998B → Invoice). Errors 415/400/413 as { error }. Samples: data/samples/globex-guidelines.txt, data/samples/invoice-globex.ledes
