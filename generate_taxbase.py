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
