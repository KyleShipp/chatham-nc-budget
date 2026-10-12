"""Generate Chatham County's parcel real-property tax-base summary."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ARCGIS_URL = (
    "https://gisservices.chathamcountync.gov/opendataagol/rest/services/"
    "Cadastral/Chatham_CamaParcels/MapServer/0/query"
)
WHERE = "parcel_year=2027"
OUT_PATH = Path(__file__).resolve().parent / "public" / "data" / "taxbase.json"
PAGE_SIZE = 2000
COUNTY_RATE = 0.60
GROUPS = [
    "Residential",
    "Commercial",
    "Industrial",
    "Exempt / Partial Exempt",
    "Other",
]
USE_CODE_MAP = {
    "R": "Residential",
    "C": "Commercial",
    "I": "Industrial",
}
OUT_FIELDS = ",".join(
    [
        "OBJECTID",
        "parcel_number",
        "parcel_year",
        "py_use_code",
        "tax_status",
        "exempt_property_class",
        "jan1_total_ASV",
    ]
)


def fetch_parcels() -> list[dict]:
    rows: list[dict] = []
    offset = 0

    while True:
        body = urlencode(
            {
                "where": WHERE,
                "outFields": OUT_FIELDS,
                "returnGeometry": "false",
                "orderByFields": "OBJECTID",
                "resultOffset": offset,
                "resultRecordCount": PAGE_SIZE,
                "f": "json",
            }
        ).encode()
        request = Request(
            ARCGIS_URL,
            data=body,
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "ChathamCountyBudget/1.0",
            },
        )
        with urlopen(request, timeout=60) as response:
            payload = json.load(response)

        if "error" in payload:
            raise RuntimeError(f"ArcGIS error: {payload['error']}")

        features = payload.get("features", [])
        rows.extend(feature["attributes"] for feature in features)
        if len(features) < PAGE_SIZE:
            break
        offset += PAGE_SIZE

    return rows


def classify(parcel: dict) -> str:
    tax_status = str(parcel.get("tax_status") or "").strip().upper()
    exempt_class = str(parcel.get("exempt_property_class") or "").strip()
    if tax_status == "E" or exempt_class:
        return "Exempt / Partial Exempt"

    use_code = str(parcel.get("py_use_code") or "").strip().upper()
    return USE_CODE_MAP.get(use_code, "Other")


def build_summary(parcels: list[dict]) -> dict:
    if not parcels:
        raise RuntimeError("The GIS query returned no Chatham County parcels")

    years = {str(parcel.get("parcel_year") or "").strip() for parcel in parcels}
    if years != {"2027"}:
        raise RuntimeError(f"Unexpected parcel years returned: {sorted(years)}")

    grouped = {
        group: {"group": group, "parcels": 0, "assessedValue": 0}
        for group in GROUPS
    }
    for parcel in parcels:
        group = grouped[classify(parcel)]
        group["parcels"] += 1
        group["assessedValue"] += round(float(parcel.get("jan1_total_ASV") or 0))

    total_value = sum(group["assessedValue"] for group in grouped.values())
    if total_value <= 0:
        raise RuntimeError("The GIS query returned no assessed value")

    groups = []
    for group in grouped.values():
        assessed_value = group["assessedValue"]
        groups.append(
            {
                **group,
                "pctOfBase": round(assessed_value / total_value * 100, 1),
                "countyTax": round(assessed_value / 100 * COUNTY_RATE),
            }
        )

    return {
        "fiscalYear": "FY26-27",
        "assessmentYear": 2027,
        "generated": date.today().isoformat(),
        "countyRate": COUNTY_RATE,
        "source": "Chatham County CAMA Parcels, 2027 assessment roll",
        "historySource": (
            "NC Department of Revenue LG01 county taxable valuation reports "
            "(FY17-18 through FY25-26); Chatham County FY26-27 approved budget. "
            "NCDOR penny values are total taxable property divided by 10,000."
        ),
        "history": [
            {"fiscalYear": "FY17-18", "taxablePropertyValue": 10609850868,
             "pennyValue": 1060985, "taxRate": 0.6281, "revaluation": True},
            {"fiscalYear": "FY18-19", "taxablePropertyValue": 11096603076,
             "pennyValue": 1109660, "taxRate": 0.6281, "revaluation": False},
            {"fiscalYear": "FY19-20", "taxablePropertyValue": 11599221682,
             "pennyValue": 1159922, "taxRate": 0.67, "revaluation": False},
            {"fiscalYear": "FY20-21", "taxablePropertyValue": 12007903707,
             "pennyValue": 1200790, "taxRate": 0.67, "revaluation": False},
            {"fiscalYear": "FY21-22", "taxablePropertyValue": 13836716022,
             "pennyValue": 1383672, "taxRate": 0.665, "revaluation": True},
            {"fiscalYear": "FY22-23", "taxablePropertyValue": 14368626317,
             "pennyValue": 1436863, "taxRate": 0.665, "revaluation": False},
            {"fiscalYear": "FY23-24", "taxablePropertyValue": 15071155717,
             "pennyValue": 1507116, "taxRate": 0.685, "revaluation": False},
            {"fiscalYear": "FY24-25", "taxablePropertyValue": 15900684399,
             "pennyValue": 1590068, "taxRate": 0.725, "revaluation": False},
            {"fiscalYear": "FY25-26", "taxablePropertyValue": 22716432644,
             "pennyValue": 2271643, "taxRate": 0.6, "revaluation": True},
            {"fiscalYear": "FY26-27", "taxablePropertyValue": 23440000000,
             "pennyValue": 2325634, "taxRate": 0.6, "revaluation": False},
        ],
        "groups": groups,
        "total": {
            "group": "TOTAL",
            "parcels": len(parcels),
            "assessedValue": total_value,
            "pctOfBase": 100.0,
            "countyTax": round(total_value / 100 * COUNTY_RATE),
        },
    }


def main() -> None:
    parcels = fetch_parcels()
    summary = build_summary(parcels)
    OUT_PATH.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(
        f"Wrote {OUT_PATH} with {summary['total']['parcels']:,} parcels and "
        f"${summary['total']['assessedValue']:,.0f} assessed value"
    )


if __name__ == "__main__":
    main()
