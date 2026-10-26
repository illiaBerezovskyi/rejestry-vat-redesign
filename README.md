# Rejestry i VAT — redesign

Demo prototype of the "Rejestry i VAT" screen. React + TypeScript + Vite, no UI kit.

```bash
npm install
npm run dev
```

## What changed vs. the original

| Original | Now |
|---|---|
| Two badges + yellow warning banner | One status pill; the full text and "Confirm VAT context" open on click |
| Separate tabs for sales / purchases registers | Segmented switch Sprzedaż / Zakupy |
| Year and month dropdowns | One period control: ‹ month › plus a month grid |
| Operation type, JPK V7 code and document series filters always visible | "Filtry" sheet (plus KSeF status and labels), active filters shown as removable chips |
| Tag, print, download and settings icons | "⋯" menu: CSV export, print, labels, columns; bulk bar for selected rows |
| Netto / VAT / Brutto + rate bars | One summary card: gross amount first, net/VAT/count beside it, a rate bar that expands into a table |
| Drag-to-reorder columns | "Kolumny tabeli": show/hide + order, saved in localStorage |
| Row expand chevron | Details panel (drawer on desktop, bottom sheet on mobile) with prev/next |
| 10-per-page pagination | Same + 10/25/50, sortable columns |
| — | Mobile: the table becomes cards |

## States
The "Stan" switch at the bottom (or `?state=empty` / `?state=error`) toggles: data, empty, error.
Natural empty states too: future months / 2024 have no documents; filters that match nothing show "Wyczyść filtry".
Loading uses a skeleton.

## Round 2 — interactive overview
- **Month strip**: the period picker became a 12-month bar chart of gross turnover (VAT is the darker part of each bar). Click a bar or use ←/→ to switch the month. It shows the change vs. the previous month and the year total.
- **KSeF progress**: a ring shows how many documents of the period have a KSeF number. "Pokaż oczekujące" filters the pending ones; "Wyślij do KSeF" simulates sending — rows switch to *W trakcie* → *Potwierdzony* live.
- **Day grouping**: sorted by date, the list is grouped by day with a header showing the weekday, document count and day total.
