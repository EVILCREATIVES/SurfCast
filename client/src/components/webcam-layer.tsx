import { useEffect, useState, useCallback, useRef } from "react";
import maplibregl from "maplibre-gl";

interface Webcam {
  id: number;
  title: string;
  lat: number;
  lng: number;
  city: string;
  country: string;
  thumbnail: string | null;
  player: string | null;
}

interface WebcamLayerProps {
  map: maplibregl.Map;
  showWebcams: boolean; // Assuming this might be controlled, or always on if component is present
}

export const MIN_ZOOM_FOR_WEBCAMS = 6;

const camIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28">
  <circle cx="14" cy="14" r="13" fill="#0ea5e9" stroke="white" stroke-width="2"/>
  <rect x="5.5" y="9.5" width="12" height="9" rx="1.5" fill="white"/>
  <polygon points="18.5,11.5 23,9 23,19 18.5,16.5" fill="white"/>
  <circle cx="11.5" cy="14" r="2.2" fill="#0ea5e9"/>
</svg>`;

export function WebcamLayer({ map, showWebcams }: WebcamLayerProps) {
  const [webcams, setWebcams] = useState<Webcam[]>([]);
  const markersRef = useRef<Map<number, maplibregl.Marker>>(new Map());
  const lastBoundsRef = useRef<string>("");
  const fetchTimeoutRef = useRef<NodeJS.Timeout>();

  const fetchWebcams = useCallback(() => {
    if (map.getZoom() < MIN_ZOOM_FOR_WEBCAMS) {
      setWebcams([]);
      return;
    }

    const bounds = map.getBounds();
    const boundsKey = `${bounds.getSouth().toFixed(1)},${bounds.getNorth().toFixed(1)},${bounds.getWest().toFixed(1)},${bounds.getEast().toFixed(1)}`;

    if (boundsKey === lastBoundsRef.current) return;
    lastBoundsRef.current = boundsKey;

    if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);

    fetchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
            `/api/webcams?south=${bounds.getSouth()}&north=${bounds.getNorth()}&west=${bounds.getWest()}&east=${bounds.getEast()}`
        );
        if (res.ok) {
            const data = await res.json();
            setWebcams(data);
        }
      } catch (err) {
        console.error("Failed to fetch webcams", err);
      }
    }, 500);
  }, [map]);

  // Listen to map events
  useEffect(() => {
      if (!showWebcams) return;

      map.on('moveend', fetchWebcams);
      // Initial fetch
      fetchWebcams(); 

      return () => {
          map.off('moveend', fetchWebcams);
      };
  }, [map, fetchWebcams, showWebcams]);

  // Sync Markers
  useEffect(() => {
      if (!showWebcams || webcams.length === 0) {
          // Clear all
          markersRef.current.forEach(m => m.remove());
          markersRef.current.clear();
          return;
      }

      const activeIds = new Set(webcams.map(w => w.id));

      // Remove stale
      for (const [id, marker] of markersRef.current.entries()) {
          if (!activeIds.has(id)) {
              marker.remove();
              markersRef.current.delete(id);
          }
      }

      // Add new
      webcams.forEach(cam => {
          if (!markersRef.current.has(cam.id)) {
              // Create DOM element for icon
              const el = document.createElement('div');
              el.className = 'webcam-marker';
              el.innerHTML = camIconSvg;
              el.style.width = '28px';
              el.style.height = '28px';
              el.style.cursor = 'pointer';

              // Create Popup content
              const popupContent = document.createElement('div');
              popupContent.className = "p-2 max-w-xs";
              // We'll use innerHTML for simplicity, but strictly should allow React to render if complex.
              // For a simple popup:
              popupContent.innerHTML = `
                <h3 class="font-bold text-sm mb-1">${cam.title}</h3>
                <p class="text-xs text-muted-foreground mb-2">${cam.city}, ${cam.country}</p>
                ${cam.thumbnail ? 
                    `<div class="aspect-video relative bg-slate-100 rounded overflow-hidden">
                        <img src="${cam.thumbnail}" alt="${cam.title}" class="w-full h-full object-cover" loading="lazy" />
                     </div>` 
                    : ''}
                ${cam.player ? 
                     `<div class="mt-2 text-xs">
                        <a href="${cam.player}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline">
                            Open Stream ↗
                        </a>
                      </div>`
                    : ''}
              `;

              const popup = new maplibregl.Popup({ offset: 25 })
                  .setDOMContent(popupContent);

              const marker = new maplibregl.Marker({ element: el })
                  .setLngLat([cam.lng, cam.lat]) // MapLibre is [lng, lat]
                  .setPopup(popup)
                  .addTo(map);

              markersRef.current.set(cam.id, marker);
          }
      });

  }, [webcams, map, showWebcams]);

  // Cleanup on unmount
  useEffect(() => {
      return () => {
          markersRef.current.forEach(m => m.remove());
          markersRef.current.clear();
      };
  }, []);

  return null; // No DOM rendered by React
}
