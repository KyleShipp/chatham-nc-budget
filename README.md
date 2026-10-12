# Chatham County, NC Budget Explorer

Interactive budget transparency tool for Chatham County, North Carolina. Turns published budget documents into searchable tables, interactive charts, department drilldowns, year-over-year comparisons, and a property tax receipt view.

**Live:** https://kyleshipp.github.io/chatham-nc-budget/

## Features

| Page | What it does |
|------|-------------|
| **Overview** | Dashboard with total budget, per-capita spending, revenue/department breakdown, and budget highlights |
| **Compare Years** | Side-by-side spending and revenue comparison across fiscal years with $ and % changes |
| **Tax Base** | Current parcel assessed-value mix by property type and gross County rate-equivalent amounts |
| **Value per Acre** | Map parcel value density and draw a polygon to total fully encompassed properties |
| **Your Receipt** | Look up your property via Chatham County GIS and see how your tax bill breaks down across county services |
| **Capital Plan** | 5-year CIP with filterable project and vehicle tables |
| **Fee Schedule** | Searchable categorized fee list |
| **About** | Methodology, data sources, and limitations |

## Data Coverage

| Fiscal Year | Status |
|-------------|--------|
| FY 2025-2026 | Adopted |
| FY 2026-2027 | Adopted |

The explorer focuses on the General Fund. FY 2026-2027 figures are from the
[approved budget](https://county-chatham-nc-cleardoc.cleargov.com/26276),
adopted by the Board of Commissioners on June 15, 2026. The adopted General
Fund totals $222.4 million; the County's all-funds budget totals $303.2 million.

## Tech Stack

- **Next.js 14** (App Router, static export)
- **React 18** + **TypeScript**
- **Recharts** for charts
- **Tailwind CSS** for styling
- **Chatham County GIS** for parcel lookups

## Running Locally

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # Static export to /out
```

## Updating Data

1. Update the extracted values in `build_data.py`
2. Run `python build_data.py` to regenerate the JSON files in `public/data/`:
   - `meta.json` — municipality info, tax rates, fiscal year definitions
   - `summary.json` — high-level FY summaries
   - `budget.json` — revenue line items and department expenditures
   - `cip.json` — capital improvement plan projects
   - `fees.json` — fee schedule
   - `debt.json` — debt service schedule
3. Run `python generate_taxbase.py` to refresh `taxbase.json` from Chatham County GIS
4. Run `python generate_value_per_acre.py` to refresh the parcel map GeoJSON
5. Run `npm run build`
6. Push to `main` — GitHub Actions deploys automatically

## Deployment

Deploys to GitHub Pages via `.github/workflows/deploy.yml` on push to `main`.
Production basePath: `/chatham-nc-budget`.

## Disclaimer

This is an independent civic data tool, not an official Chatham County publication. Data is sourced from publicly available budget documents. For official information, visit [chathamcountync.gov](https://www.chathamcountync.gov).
