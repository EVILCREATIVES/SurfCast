import { useEffect, useRef, useState, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { SurfSpot } from "@shared/schema";

const surfPinSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 42" width="32" height="42">
  <defs>
    <filter id="shadow" x="-20%" y="-10%" width="140%" height="140%">
      <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="#000" flood-opacity="0.3"/>
    </filter>
  </defs>
  <path d="M16 0C7.163 0 0 7.163 0 16c0 12 16 26 16 26s16-14 16-26C32 7.163 24.837 0 16 0z" fill="#0ea5e9" filter="url(#shadow)"/>
  <circle cx="16" cy="15" r="7" fill="white" opacity="0.9"/>
  <path d="M13 18c0-3 1.5-7 3-7s3 4 3 7" fill="none" stroke="#0ea5e9" stroke-width="1.8" stroke-linecap="round"/>
</svg>`;

const clickPinSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 42" width="32" height="42">
  <defs>
    <filter id="shadow2" x="-20%" y="-10%" width="140%" height="140%">
      <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="#000" flood-opacity="0.3"/>
    </filter>
  </defs>
  <path d="M16 0C7.163 0 0 7.163 0 16c0 12 16 26 16 26s16-14 16-26C32 7.163 24.837 0 16 0z" fill="#f97316" filter="url(#shadow2)"/>
  <circle cx="16" cy="15" r="7" fill="white" opacity="0.9"/>
  <path d="M14 12l5 3.5-5 3.5z" fill="#f97316"/>
</svg>`;

const surfIcon = L.divIcon({
  html: surfPinSvg,
  className: "",
  iconSize: [32, 42],
  iconAnchor: [16, 42],
  popupAnchor: [0, -42],
});

const clickIcon = L.divIcon({
  html: clickPinSvg,
  className: "",
  iconSize: [32, 42],
  iconAnchor: [16, 42],
  popupAnchor: [0, -42],
});

interface SurfMapProps {
  spots: SurfSpot[];
  selectedSpot: SurfSpot | null;
  clickedLocation: { lat: number; lng: number } | null;
  onSpotSelect: (spot: SurfSpot) => void;
  onMapClick: (lat: number, lng: number) => void;
  onFlyTo?: (fn: (lat: number, lng: number) => void) => void;
}

function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function FlyToHandler({ onFlyTo }: { onFlyTo?: (fn: (lat: number, lng: number) => void) => void }) {
  const map = useMap();
  useEffect(() => {
    if (onFlyTo) {
      onFlyTo((lat: number, lng: number) => {
        map.flyTo([lat, lng], 10, { duration: 1.5 });
      });
    }
  }, [map, onFlyTo]);
  return null;
}

export function SurfMap({ spots, selectedSpot, clickedLocation, onSpotSelect, onMapClick, onFlyTo }: SurfMapProps) {
  return (
    <div className="w-full h-full relative" data-testid="map-container">
      <MapContainer
        center={[20, 0]}
        zoom={3}
        className="w-full h-full"
        style={{ background: "#1a1a2e" }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <MapClickHandler onMapClick={onMapClick} />
        <FlyToHandler onFlyTo={onFlyTo} />

        {spots.map((spot) => (
          <Marker
            key={spot.id}
            position={[spot.latitude, spot.longitude]}
            icon={surfIcon}
            eventHandlers={{
              click: () => onSpotSelect(spot),
            }}
          >
            <Popup>
              <div className="font-sans text-sm">
                <strong>{spot.name}</strong>
                {spot.description && <p className="mt-1 text-xs opacity-75">{spot.description}</p>}
              </div>
            </Popup>
          </Marker>
        ))}

        {clickedLocation && (
          <Marker position={[clickedLocation.lat, clickedLocation.lng]} icon={clickIcon}>
            <Popup>
              <div className="font-sans text-sm">
                <strong>Selected Location</strong>
                <p className="text-xs mt-1 opacity-75">
                  {clickedLocation.lat.toFixed(4)}, {clickedLocation.lng.toFixed(4)}
                </p>
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}
