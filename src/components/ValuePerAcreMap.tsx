'use client';

import booleanWithin from '@turf/boolean-within';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface ParcelProperties {
  parcel_id: string;
  owner: string;
  address: string;
  acres: number;
  tax_value: number;
  value_per_acre: number;
}

interface ParcelFeature {
  type: 'Feature';
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  properties: ParcelProperties;
}

interface ParcelCollection {
  type: 'FeatureCollection';
  features: ParcelFeature[];
  metadata: {
    generated: string;
    total_features: number;
    total_tax_value?: number;
  };
}

interface AnalysisResult {
  parcels: number;
  acres: number;
  value: number;
  valuePerAcre: number;
  totalValue: number;
  percent: number;
}

const COLORS = ['#eff3ff', '#c6dbef', '#9ecae1', '#6baed6', '#3182bd', '#08519c', '#08306b'];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatAcres(value: number): string {
  return `${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ac`;
}

function quantileBreaks(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  return Array.from({ length: COLORS.length - 1 }, (_, index) =>
    sorted[Math.floor(((index + 1) / COLORS.length) * sorted.length)]
  );
}

function colorFor(value: number, breaks: number[]): string {
  const index = breaks.findIndex((breakValue) => value <= breakValue);
  return COLORS[index === -1 ? COLORS.length - 1 : index];
}

export default function ValuePerAcreMap({ dataUrl }: { dataUrl: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const parcelLayerRef = useRef<L.GeoJSON | null>(null);
  const drawingLayerRef = useRef<L.LayerGroup | null>(null);
  const guideLayerRef = useRef<L.Polyline | null>(null);
  const [data, setData] = useState<ParcelCollection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [points, setPoints] = useState<Array<[number, number]>>([]);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const totalValue = useMemo(
    () => {
      if (!data) return 0;
      const metadataTotal = data.metadata.total_tax_value;
      return typeof metadataTotal === 'number' &&
        Number.isFinite(metadataTotal) &&
        metadataTotal > 0
        ? metadataTotal
        : data.features.reduce(
            (sum, feature) => sum + feature.properties.tax_value,
            0
          );
    },
    [data]
  );

  useEffect(() => {
    fetch(dataUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<ParcelCollection>;
      })
      .then(setData)
      .catch((reason) => setError(String(reason)));
  }, [dataUrl]);

  useEffect(() => {
    if (!data || !containerRef.current || mapRef.current) return;
    let disposed = false;

    import('leaflet').then((L) => {
      if (disposed || !containerRef.current) return;
      const map = L.map(containerRef.current, {
        center: [35.75, -79.25],
        zoom: 10,
        preferCanvas: true,
      });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      const breaks = quantileBreaks(data.features.map((feature) => feature.properties.value_per_acre));
      const layer = L.geoJSON(data as GeoJSON.FeatureCollection, {
        style: (feature) => ({
          fillColor: colorFor(Number(feature?.properties?.value_per_acre ?? 0), breaks),
          fillOpacity: 0.7,
          color: '#475569',
          weight: 0.35,
        }),
        onEachFeature: (feature, parcelLayer) => {
          const properties = feature.properties as ParcelProperties;
          parcelLayer.bindPopup(
            `<strong>${properties.parcel_id}</strong><br>` +
              `${properties.address || 'No address'}<br>` +
              `Assessed value: ${formatCurrency(properties.tax_value)}<br>` +
              `Value per acre: ${formatCurrency(properties.value_per_acre)}`
          );
        },
      }).addTo(map);
      if (layer.getBounds().isValid()) map.fitBounds(layer.getBounds(), { padding: [16, 16] });
      mapRef.current = map;
      parcelLayerRef.current = layer;
      setMapReady(true);
    });

    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      parcelLayerRef.current = null;
      setMapReady(false);
    };
  }, [data]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !drawing) return;
    const addPoint = (event: L.LeafletMouseEvent) => {
      map.closePopup();
      setPoints((current) => [...current, [event.latlng.lat, event.latlng.lng]]);
    };
    map.getContainer().style.cursor = 'crosshair';
    map.on('click', addPoint);
    return () => {
      map.off('click', addPoint);
      map.getContainer().style.cursor = '';
    };
  }, [drawing, mapReady]);

  useEffect(() => {
    const layer = parcelLayerRef.current;
    if (!layer) return;

    if (drawing) mapRef.current?.closePopup();
    layer.eachLayer((parcelLayer) => {
      const path = parcelLayer as L.Path;
      path.options.interactive = !drawing;
      const element = path.getElement?.();
      if (element) element.setAttribute('pointer-events', drawing ? 'none' : 'auto');
    });
  }, [drawing, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    drawingLayerRef.current?.remove();
    drawingLayerRef.current = null;
    if (points.length === 0) return;

    import('leaflet').then((L) => {
      if (!mapRef.current) return;
      const group = L.layerGroup().addTo(mapRef.current);
      if (points.length >= 3) {
        L.polygon(points, {
          color: '#7c3aed',
          fillColor: '#8b5cf6',
          fillOpacity: 0.14,
          weight: 3,
        }).addTo(group);
      } else if (points.length === 2) {
        L.polyline(points, {
          color: '#7c3aed',
          weight: 3,
        }).addTo(group);
      }
      points.forEach((point) => {
        L.circleMarker(point, {
          radius: 6,
          color: '#ffffff',
          weight: 2,
          fillColor: '#7c3aed',
          fillOpacity: 1,
          interactive: false,
        }).addTo(group);
      });
      drawingLayerRef.current = group;
    });
  }, [points]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !drawing || points.length === 0) {
      guideLayerRef.current?.remove();
      guideLayerRef.current = null;
      return;
    }

    let disposed = false;
    let updateGuide: ((event: L.LeafletMouseEvent) => void) | null = null;
    let resetGuide: (() => void) | null = null;
    const lastPoint = points[points.length - 1];
    import('leaflet').then((L) => {
      if (disposed || !mapRef.current) return;
      const guide = L.polyline([lastPoint, lastPoint], {
              color: '#7c3aed',
              weight: 2,
              dashArray: '6 5',
              interactive: false,
            }).addTo(mapRef.current);
      guideLayerRef.current = guide;

      updateGuide = (event: L.LeafletMouseEvent) => {
        guide.setLatLngs([lastPoint, event.latlng]);
      };
      resetGuide = () => guide.setLatLngs([lastPoint, lastPoint]);
      map.on('mousemove', updateGuide);
      map.on('mouseout', resetGuide);

      if (disposed) {
        map.off('mousemove', updateGuide);
        map.off('mouseout', resetGuide);
        guide.remove();
      }
    });

    return () => {
      disposed = true;
      if (updateGuide) map.off('mousemove', updateGuide);
      if (resetGuide) map.off('mouseout', resetGuide);
      guideLayerRef.current?.remove();
      guideLayerRef.current = null;
    };
  }, [drawing, points]);

  const clear = useCallback(() => {
    setDrawing(false);
    setPoints([]);
    setResult(null);
    drawingLayerRef.current?.remove();
    drawingLayerRef.current = null;
    guideLayerRef.current?.remove();
    guideLayerRef.current = null;
  }, []);

  const analyze = useCallback(() => {
    if (!data || points.length < 3) return;
    const ring = points.map(([lat, lng]) => [lng, lat]);
    ring.push(ring[0]);
    const area: GeoJSON.Feature<GeoJSON.Polygon> = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [ring] },
    };
    const encompassed = data.features.filter((feature) =>
      booleanWithin(feature as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>, area)
    );
    const value = encompassed.reduce((sum, feature) => sum + feature.properties.tax_value, 0);
    const acres = encompassed.reduce((sum, feature) => sum + feature.properties.acres, 0);
    setResult({
      parcels: encompassed.length,
      acres,
      value,
      valuePerAcre: acres > 0 ? value / acres : 0,
      totalValue,
      percent: totalValue > 0 ? (value / totalValue) * 100 : 0,
    });
    setDrawing(false);
  }, [data, points, totalValue]);

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center text-red-700">
        Failed to load parcel map data: {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="h-96 rounded-xl border bg-gray-100 flex items-center justify-center text-gray-500">
        Loading parcel data…
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 rounded-xl border bg-white p-5">
        <div className="flex flex-wrap items-center gap-2">
          {!drawing && points.length === 0 && (
            <button
              type="button"
              onClick={() => setDrawing(true)}
              className="rounded-lg bg-violet-700 px-3 py-2 text-sm font-medium text-white hover:bg-violet-800"
            >
              Draw value analysis area
            </button>
          )}
          {drawing && (
            <>
              <button
                type="button"
                onClick={analyze}
                disabled={points.length < 3}
                className="rounded-lg bg-violet-700 px-3 py-2 text-sm font-medium text-white enabled:hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Analyze polygon
              </button>
              <button
                type="button"
                onClick={() => setPoints((current) => current.slice(0, -1))}
                disabled={points.length === 0}
                className="rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-40"
              >
                Undo point
              </button>
              <button type="button" onClick={clear} className="rounded-lg border px-3 py-2 text-sm font-medium">
                Cancel
              </button>
              <span className="text-sm text-gray-500">
                Click at least three map points ({points.length} placed).
              </span>
            </>
          )}
          {!drawing && points.length > 0 && (
            <button type="button" onClick={clear} className="rounded-lg border px-3 py-2 text-sm font-medium">
              Clear analysis
            </button>
          )}
        </div>

        {result && (
          <div className="mt-4 grid gap-3 rounded-lg border border-violet-200 bg-violet-50 p-4 sm:grid-cols-5">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-violet-700">Fully encompassed parcels</p>
              <p className="text-xl font-bold">{result.parcels.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-violet-700">Total acres</p>
              <p className="text-xl font-bold">{formatAcres(result.acres)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-violet-700">Total assessed value</p>
              <p className="text-xl font-bold">{formatCurrency(result.value)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-violet-700">Value per acre</p>
              <p className="text-xl font-bold">{formatCurrency(result.valuePerAcre)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-violet-700">Share of County parcel value</p>
              <p className="text-xl font-bold">{result.percent.toFixed(2)}%</p>
            </div>
            <p className="text-xs text-gray-600 sm:col-span-5">
              Only parcels completely inside the polygon count. The percentage compares their value with{' '}
              {formatCurrency(result.totalValue)} across the full County parcel dataset.
            </p>
          </div>
        )}
      </div>
      <div ref={containerRef} className="h-[600px] overflow-hidden rounded-xl border" />
      <p className="mt-2 text-xs text-gray-500">
        {data.metadata.total_features.toLocaleString()} mapped parcels · Data generated {data.metadata.generated}
      </p>
    </div>
  );
}
