import { useEffect, useState, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { WindWaveLayer } from "./wind-layer";
import { WebcamLayer } from "./webcam-layer";
import { Button } from "@/components/ui/button";
import { Wind, Waves, Layers, Video } from "lucide-react";
import type { SurfSpot } from "@shared/schema";

const MAP_LAYERS = [
  { id: "dark", label: "Dark", url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', bg: "#1a1a2e" },
  { id: "satellite", label: "Satellite", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attr: '&copy; Esri', bg: "#2c3e2e" },
  { id: "street", label: "Street", url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', bg: "#e8e0d8" },
  { id: "topo", label: "Topo", url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", attr: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>', bg: "#d4e6c8" },
] as const;

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

function MapBackgroundSync({ bg }: { bg: string }) {
  const map = useMap();
  useEffect(() => {
    map.getContainer().style.background = bg;
  }, [map, bg]);
  return null;
}

export function SurfMap({ spots, selectedSpot, clickedLocation, onSpotSelect, onMapClick, onFlyTo }: SurfMapProps) {
  const [showWind, setShowWind] = useState(true);
  const [showWaves, setShowWaves] = useState(true);
  const [showWebcams, setShowWebcams] = useState(false);
  const [layerIdx, setLayerIdx] = useState(1);
  const [showLayerPicker, setShowLayerPicker] = useState(false);
  const activeLayer = MAP_LAYERS[layerIdx];

  return (
    <div className="w-full h-full relative z-0 isolate" data-testid="map-container">
      <MapContainer
        center={[20, 0]}
        zoom={3}
        className="w-full h-full"
        style={{ background: activeLayer.bg }}
        zoomControl={false}
      >
        <TileLayer
          key={activeLayer.id}
          attribution={activeLayer.attr}
          url={activeLayer.url}
          keepBuffer={10}
          updateWhenZooming={false}
          updateWhenIdle={false}
          tileSize={256}
          maxNativeZoom={18}
        />
        <MapBackgroundSync bg={activeLayer.bg} />
        <MapClickHandler onMapClick={onMapClick} />
        <FlyToHandler onFlyTo={onFlyTo} />
        <WindWaveLayer showWind={showWind} showWaves={showWaves} />
        {showWebcams && <WebcamLayer />}

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

      <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-1">
        <div className="relative">
          <Button
            size="icon"
            variant="secondary"
            onClick={() => setShowLayerPicker(!showLayerPicker)}
            data-testid="button-toggle-layers"
            title="Change map style"
          >
            <Layers className="w-4 h-4" />
          </Button>
          {showLayerPicker && (
            <div className="absolute right-10 top-0 bg-background/95 backdrop-blur-sm border border-border rounded-md overflow-hidden shadow-lg" data-testid="layer-picker">
              {MAP_LAYERS.map((layer, i) => (
                <button
                  key={layer.id}
                  onClick={() => { setLayerIdx(i); setShowLayerPicker(false); }}
                  className={`block w-full text-left px-3 py-1.5 text-xs whitespace-nowrap hover-elevate ${i === layerIdx ? "bg-primary text-primary-foreground" : "text-foreground"}`}
                  data-testid={`button-layer-${layer.id}`}
                >
                  {layer.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <Button
          size="icon"
          variant={showWind ? "default" : "secondary"}
          onClick={() => setShowWind(!showWind)}
          className="toggle-elevate"
          data-testid="button-toggle-wind"
          title="Toggle wind particles"
        >
          <Wind className="w-4 h-4" />
        </Button>
        <Button
          size="icon"
          variant={showWaves ? "default" : "secondary"}
          onClick={() => setShowWaves(!showWaves)}
          className="toggle-elevate"
          data-testid="button-toggle-waves"
          title="Toggle wave overlay"
        >
          <Waves className="w-4 h-4" />
        </Button>
        <Button
          size="icon"
          variant={showWebcams ? "default" : "secondary"}
          onClick={() => setShowWebcams(!showWebcams)}
          className="toggle-elevate"
          data-testid="button-toggle-webcams"
          title="Toggle beach webcams"
        >
          <Video className="w-4 h-4" />
        </Button>
      </div>

      {(showWind || showWaves) && (
        <div className="absolute bottom-3 left-3 z-[1000] bg-background/80 backdrop-blur-sm rounded-md px-2 py-1.5 sm:px-3 sm:py-2 text-[10px] sm:text-xs border border-border" data-testid="legend-panel">
          <div className="flex items-start gap-3 sm:gap-5">
            {showWind && (
              <div data-testid="legend-wind">
                <p className="font-medium mb-1.5 text-foreground/80 flex items-center gap-1">
                  <Wind className="w-3 h-3" /> Wind
                </p>
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-0.5" style={{ background: "rgba(80, 180, 255, 0.9)" }} />
                    <span className="text-muted-foreground">&lt;5 kts</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-0.5" style={{ background: "rgba(100, 230, 80, 0.9)" }} />
                    <span className="text-muted-foreground">10-15 kts</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-0.5" style={{ background: "rgba(255, 190, 30, 0.9)" }} />
                    <span className="text-muted-foreground">20-30 kts</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-0.5" style={{ background: "rgba(255, 50, 50, 0.9)" }} />
                    <span className="text-muted-foreground">40+ kts</span>
                  </div>
                </div>
              </div>
            )}
            {showWaves && (
              <div data-testid="legend-waves">
                <p className="font-medium mb-1.5 text-foreground/80 flex items-center gap-1">
                  <Waves className="w-3 h-3" /> Waves
                </p>
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full border" style={{ borderColor: "rgba(60, 190, 210, 0.8)", background: "transparent" }} />
                    <span className="text-muted-foreground">&lt;3 ft</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full border" style={{ borderColor: "rgba(140, 120, 220, 0.8)", background: "transparent" }} />
                    <span className="text-muted-foreground">3-6 ft</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full border" style={{ borderColor: "rgba(200, 70, 180, 0.8)", background: "transparent" }} />
                    <span className="text-muted-foreground">6-12 ft</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full border" style={{ borderColor: "rgba(240, 50, 100, 0.8)", background: "transparent" }} />
                    <span className="text-muted-foreground">12+ ft</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
