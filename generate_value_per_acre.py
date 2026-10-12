"""Generate map-ready value-per-acre GeoJSON for Chatham County parcels."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

QUERY_URL = (
    "https://gisservices.chathamcountync.gov/opendataagol/rest/services/"
    "Cadastral/Chatham_CamaParcels/MapServer/0/query"
)
WHERE = "parcel_year=2027"
OUT_PATH = Path(__file__).resolve().parent / "public" / "data" / "value_per_acre.geojson"
PAGE_SIZE = 1000
FIELDS = ",".join(
    [
        "OBJECTID",
        "parcel_number",
        "physical_street_address",
        "current_owners",
        "jan1_total_ASV",
        "gross_current_acres",
    ]
)


def fetch_page(offset: int) -> dict:
    body = urlencode(
        {
            "where": WHERE,
            "outFields": FIELDS,
            "returnGeometry": "true",
            "outSR": "4326",
            "orderByFields": "OBJECTID",
            "resultOffset": offset,
            "resultRecordCount": PAGE_SIZE,
            "f": "geojson",
        }
    ).encode()
    request = Request(
        QUERY_URL,
        data=body,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "ChathamCountyBudget/1.0",
        },
    )
    with urlopen(request, timeout=120) as response:
        return json.load(response)


def main() -> None:
    output_features: list[dict] = []
    jurisdiction_value = 0.0
    offset = 0

    while True:
        payload = fetch_page(offset)
        if "error" in payload:
            raise RuntimeError(f"ArcGIS error: {payload['error']}")
        features = payload.get("features", [])
        for feature in features:
            properties = feature.get("properties") or {}
            geometry = feature.get("geometry")
            acres = float(properties.get("gross_current_acres") or 0)
            value = float(properties.get("jan1_total_ASV") or 0)
            jurisdiction_value += value
            if not geometry or acres <= 0 or value <= 0:
                continue
            output_features.append(
                {
                    "type": "Feature",
                    "geometry": geometry,
                    "properties": {
                        "parcel_id": str(properties.get("parcel_number") or ""),
                        "owner": str(properties.get("current_owners") or ""),
                        "address": str(properties.get("physical_street_address") or ""),
                        "acres": acres,
                        "tax_value": value,
                        "value_per_acre": value / acres,
                    },
                }
            )
        print(f"Fetched {offset + len(features):,} parcels")
        if len(features) < PAGE_SIZE:
            break
        offset += PAGE_SIZE

    output = {
        "type": "FeatureCollection",
        "features": output_features,
        "metadata": {
            "generated": date.today().isoformat(),
            "source": QUERY_URL,
            "filter": WHERE,
            "total_features": len(output_features),
            "total_tax_value": jurisdiction_value,
        },
    }
    OUT_PATH.write_text(
        json.dumps(output, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"Wrote {OUT_PATH} with {len(output_features):,} mapped parcels")


if __name__ == "__main__":
    main()
