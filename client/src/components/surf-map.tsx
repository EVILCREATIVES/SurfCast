import { useEffect, useRef, useState, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { WindWaveLayer } from "./wind-layer";
import { WebcamLayer, MIN_ZOOM_FOR_WEBCAMS } from "./webcam-layer";
import { Button } from "@/components/ui/button";
import { Wind, Waves, Layers, Video } from "lucide-react";
import type { SurfSpot } from "@shared/schema";
import { useMobile } from "@/hooks/use-mobile";

// Types
interface SurfMapProps {
  spots: SurfSpot[];
  selectedSpot: SurfSpot | null;
  clickedLocation: { lat: number; lng: number } | null;
  onSpotSelect: (spot: SurfSpot) => void;
  onMapClick: (lat: number, lng: number) => void;
  onFlyTo?: (fn: (lat: number, lng: number) => void) => void;
}

const MAP_LAYERS = [
  { id: "dark", label: "Dark", url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', bg: "#1a1a2e" },
  { id: "satellite", label: "Satellite", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attr: '&copy; Esri', bg: "#2c3e2e" },
  { id: "street", label: "Street", url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', bg: "#e8e0d8" },
  { id: "topo", label: "Topo", url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", attr: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>', bg: "#d4e6c8" },
] as const;

// Custom Icons as DOM Elements
function createCustomIcon(svgString: string) {
  const el = document.createElement("div");
  el.className = "marker-icon";
  el.innerHTML = svgString;
  el.style.width = "32px";
  el.style.height = "42px";
  el.style.marginTop = "-42px"; // Anchor bottom
  el.style.marginLeft = "-16px"; // Anchor center
  el.style.cursor = "pointer";
  return el;
}

const surfPinSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 42" width="32" height="42" style="filter: drop-shadow(0 2px 3px rgba(0,0,0,0.3));">
  <path d="M16 0C7.163 0 0 7.163 0 16c0 12 16 26 16 26s16-14 16-26C32 7.163 24.837 0 16 0z" fill="#0ea5e9"/>
  <circle cx="16" cy="15" r="7" fill="white" opacity="0.9"/>
  <path d="M13 18c0-3 1.5-7 3-7s3 4 3 7" fill="none" stroke="#0ea5e9" stroke-width="1.8" stroke-linecap="round"/>
</svg>`;

const clickPinSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 42" width="32" height="42" style="filter: drop-shadow(0 2px 3px rgba(0,0,0,0.3));">
  <path d="M16 0C7.163 0 0 7.163 0 16c0 12 16 26 16 26s16-14 16-26C32 7.163 24.837 0 16 0z" fill="#f97316"/>
  <circle cx="16" cy="15" r="7" fill="white" opacity="0.9"/>
  <path d="M14 12l5 3.5-5 3.5z" fill="#f97316"/>
</svg>`;

export function SurfMap({ spots, selectedSpot, clickedLocation, onSpotSelect, onMapClick, onFlyTo }: SurfMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const clickMarkerRef = useRef<maplibregl.Marker | null>(null);
  
  const [showWind, setShowWind] = useState(true);
  const [showWaves, setShowWaves] = useState(true);
  const [showWebcams, setShowWebcams] = useState(false);
  const [layerIdx, setLayerIdx] = useState(1);
  const [showLayerPicker, setShowLayerPicker] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(3);
  
  const activeLayer = MAP_LAYERS[layerIdx];

  // Initialize Map
  useEffect(() => {
    if (mapRef.current || !mapContainer.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {},
        layers: [],
      },
      center: [0, 20], // Initial center
      zoom: 2,
      attributionControl: false,
    });

    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.addControl(new maplibregl.NavigationControl({ showCompass: true, showZoom: true }), "top-right");

    map.on("load", () => {
      mapRef.current = map;
      // Trigger layer update now that map is loaded
      updateBaseLayer(map, layerIdx);
    });

    map.on("click", (e) => {
      onMapClick(e.lngLat.lat, e.lngLat.lng);
    });

    map.on("zoom", () => {
      setCurrentZoom(map.getZoom());
    });

    if (onFlyTo) {
      onFlyTo((lat, lng) => {
        map.flyTo({ center: [lng, lat], zoom: 10, speed: 1.5 });
      });
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update Base Layer
  const updateBaseLayer = (map: maplibregl.Map, index: number) => {
    const layer = MAP_LAYERS[index];
    const sourceId = "base-layer-source";
    const layerId = "base-layer";
    
    // Check if source exists
    const tiles = ["a", "b", "c"].map(s => layer.url.replace("{s}", s));

    if (map.getLayer(layerId)) map.removeLayer(layerId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);

    map.addSource(sourceId, {
      type: "raster",
      tiles: tiles,
      tileSize: 256,
      attribution: layer.attr,
    });
    
    map.addLayer({
      id: layerId,
      type: "raster",
      source: sourceId,
      minzoom: 0,
      maxzoom: 22,
    });
    
    // Force layer to background if needed, though adding it first usually works if empty
    // But since we wipe layers, it's fine.
    // If wind layer injects layers, we might need map.moveLayer(layerId, beforeLayerId)

    // Sync background color
    if (mapContainer.current) {
        mapContainer.current.style.backgroundColor = layer.bg;
    }
  };

  useEffect(() => {
    if (!mapRef.current) return;
    updateBaseLayer(mapRef.current, layerIdx);
  }, [layerIdx]);

  // Sync Markers
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    // Remove old markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    // Add new markers
    spots.forEach(spot => {
      const el = createCustomIcon(surfPinSvg);
      el.onclick = (e) => {
        e.stopPropagation(); // prevent map click
        onSpotSelect(spot);
        
        // Show popup
        new maplibregl.Popup({ offset: [0, -42], closeButton: false })
            .setLngLat([spot.longitude, spot.latitude])
            .setHTML(`<div class="font-sans text-sm p-1"><strong>${spot.name}</strong><p class="mt-1 text-xs opacity-75">${spot.description || ''}</p></div>`)
            .addTo(map);
      };

      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([spot.longitude, spot.latitude])
        .addTo(map);
      
      markersRef.current.push(marker);
    });
  }, [spots, onSpotSelect]);

  // Sync Click Marker
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    if (clickMarkerRef.current) {
      clickMarkerRef.current.remove();
      clickMarkerRef.current = null;
    }

    if (clickedLocation) {
        const el = createCustomIcon(clickPinSvg);
        const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([clickedLocation.lng, clickedLocation.lat])
          .addTo(map);
        
        const popup = new maplibregl.Popup({ offset: [0, -42], closeButton: false })
            .setHTML(`<div class="font-sans text-sm p-1"><strong>Selected Location</strong><p class="text-xs mt-1 opacity-75">${clickedLocation.lat.toFixed(4)}, ${clickedLocation.lng.toFixed(4)}</p></div>`);
        
        marker.setPopup(popup);
        clickMarkerRef.current = marker;
        marker.togglePopup();
    }
  }, [clickedLocation]);


  return (
    <div className="w-full h-full relative z-0 isolate">
      <div ref={mapContainer} className="w-full h-full" data-testid="map-container" />

      {mapRef.current && (
         <>
            <WindWaveLayer map={mapRef.current} showWind={showWind} showWaves={showWaves} />
            {showWebcams && <WebcamLayer map={mapRef.current} showWebcams={true} />}
         </>
      )}

      {showWebcams && currentZoom < MIN_ZOOM_FOR_WEBCAMS && (
        <div
          className="absolute top-14 left-1/2 -translate-x-1/2 z-[999] px-4 py-2 rounded-md bg-black/70 text-white text-sm font-medium backdrop-blur-sm pointer-events-none transition-opacity duration-300"
        >
          Zoom in to see webcams
        </div>
      )}

      {/* Controls Overlay */}
      <div className="absolute top-14 right-3 z-[1000] flex flex-col gap-1">
        <div className="relative">
          <Button
            size="icon"
            variant="secondary"
            onClick={() => setShowLayerPicker(!showLayerPicker)}
            title="Change map style"
          >
            <Layers className="w-4 h-4" />
          </Button>
          {showLayerPicker && (
            <div className="absolute right-10 top-0 bg-background/95 backdrop-blur-sm border border-border rounded-md overflow-hidden shadow-lg w-32">
              {MAP_LAYERS.map((layer, i) => (
                <button
                  key={layer.id}
                  onClick={() => { setLayerIdx(i); setShowLayerPicker(false); }}
                  className={`block w-full text-left px-3 py-1.5 text-xs whitespace-nowrap hover:bg-muted ${i === layerIdx ? "bg-primary text-primary-foreground" : "text-foreground"}`}
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
        >
          <Wind className="w-4 h-4" />
        </Button>
        <Button
          size="icon"
          variant={showWaves ? "default" : "secondary"}
          onClick={() => setShowWaves(!showWaves)}
        >
          <Waves className="w-4 h-4" />
        </Button>
        <Button
          size="icon"
          variant={showWebcams ? "default" : "secondary"}
          onClick={() => setShowWebcams(!showWebcams)}
        >
          <Video className="w-4 h-4" />
        </Button>
      </div>

       {/* Legend */}
       {(showWind || showWaves) && (
        <div className="absolute bottom-6 left-3 z-[1000] bg-background/80 backdrop-blur-sm rounded-md px-3 py-2 text-xs border border-border">
          <div className="flex items-start gap-5">
            {showWind && (
              <div>
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
              <div>
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
