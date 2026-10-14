# Demo samples (all synthetic) — upload these

| File | Upload on | What it shows |
|---|---|---|
| `acme-guidelines.md` | New rulebook | The main demo rulebook (7 clauses, 3.7 needs an attorney) |
| `invoice-acme-oct.csv` | New invoice | 20 entries, 9 flagged, $4,124 at risk |
| `initech-guidelines.pdf` | New rulebook | PDF upload → 7 clauses |
| `invoice-initech.csv` | New invoice | Initech invoice with block billing, vague, travel, clerical, daily cap |
| `umbrella-billing-policy.docx` | New rulebook | Word upload → "Section / 1.1" style numbering |
| `globex-guidelines.txt` | New rulebook | Plain text with a table of contents |
| `invoice-globex.ledes` | New invoice | LEDES 1998B, the legal e-billing standard |

## 2-minute demo
1. Open http://localhost:3000 and reset the demo data.
2. Acme rulebook → **Compile**: clauses light up, §3.2 fails a test and repairs itself, §3.7 turns amber ("needs attorney").
3. **Approve all** → open the October invoice → **Check**: 9 flags, $4,124 at risk. Click the block-billing entry → **Suggest fix** → verified split.
4. **Eval** tab: 15/15 on the golden set.
5. "Any document": upload `initech-guidelines.pdf` (or the .docx) → it splits into clauses → compile.
6. Swap to the USCIS H-1B rulebook: the same engine flags Sofia Lindqvist's petition.

## Optional: real AI
Put `ANTHROPIC_API_KEY=...` (or `OPENAI_API_KEY=...`) in `.env` and restart the server. With no key, the app runs fully offline.
