import { useEffect, useState, useCallback, useRef } from "react";
import { useMap, Marker, Popup } from "react-leaflet";
import L from "leaflet";

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

export const MIN_ZOOM_FOR_WEBCAMS = 6;

const camIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28">
  <circle cx="14" cy="14" r="13" fill="#0ea5e9" stroke="white" stroke-width="2"/>
  <rect x="5.5" y="9.5" width="12" height="9" rx="1.5" fill="white"/>
  <polygon points="18.5,11.5 23,9 23,19 18.5,16.5" fill="white"/>
  <circle cx="11.5" cy="14" r="2.2" fill="#0ea5e9"/>
</svg>`;

const camIcon = L.divIcon({
  html: camIconSvg,
  className: "webcam-marker",
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -14],
});

export function WebcamLayer() {
  const map = useMap();
  const [webcams, setWebcams] = useState<Webcam[]>([]);
  const [zoomLevel, setZoomLevel] = useState(map.getZoom());
  const fetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBoundsRef = useRef<string>("");

  const tooZoomedOut = zoomLevel < MIN_ZOOM_FOR_WEBCAMS;

  useEffect(() => {
    const pane = map.getPane("markerPane");
    if (pane) {
      pane.style.zIndex = "700";
    }
    return () => {
      if (pane) {
        pane.style.zIndex = "";
      }
    };
  }, [map]);

  const fetchWebcams = useCallback(() => {
    if (map.getZoom() < MIN_ZOOM_FOR_WEBCAMS) {
      setWebcams([]);
      return;
    }

    const bounds = map.getBounds();
    const boundsKey = `${bounds.getSouth().toFixed(1)},${bounds.getNorth().toFixed(1)},${bounds.getWest().toFixed(1)},${bounds.getEast().toFixed(1)}`;

    if (boundsKey === lastBoundsRef.current) return;
    lastBoundsRef.current = boundsKey;

    const params = new URLSearchParams({
      south: bounds.getSouth().toString(),
      north: bounds.getNorth().toString(),
      west: bounds.getWest().toString(),
      east: bounds.getEast().toString(),
    });

    fetch(`/api/webcams?${params}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.webcams) {
          setWebcams(data.webcams);
        }
      })
      .catch(console.error);
  }, [map]);

  const debouncedFetch = useCallback(() => {
    if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
    fetchTimeoutRef.current = setTimeout(fetchWebcams, 500);
  }, [fetchWebcams]);

  const handleMapChange = useCallback(() => {
    setZoomLevel(map.getZoom());
    debouncedFetch();
  }, [map, debouncedFetch]);

  useEffect(() => {
    fetchWebcams();
    setZoomLevel(map.getZoom());

    map.on("moveend", handleMapChange);
    map.on("zoomend", handleMapChange);

    return () => {
      map.off("moveend", handleMapChange);
      map.off("zoomend", handleMapChange);
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
    };
  }, [map, fetchWebcams, handleMapChange]);

  if (tooZoomedOut) return null;

  return (
    <>
      {webcams.map((cam) => (
        <Marker
          key={cam.id}
          position={[cam.lat, cam.lng]}
          icon={camIcon}
          zIndexOffset={1000}
          eventHandlers={{
            click: (e) => {
              e.originalEvent.stopPropagation();
            },
          }}
        >
          <Popup maxWidth={320} minWidth={240}>
            <div className="font-sans" data-testid={`webcam-popup-${cam.id}`}>
              <p className="font-medium text-sm mb-1">{cam.title}</p>
              <p className="text-xs text-gray-500 mb-2">
                {[cam.city, cam.country].filter(Boolean).join(", ")}
              </p>
              {cam.thumbnail && (
                <img
                  src={cam.thumbnail}
                  alt={cam.title}
                  className="w-full rounded-md mb-2"
                  style={{ maxHeight: 180, objectFit: "cover" }}
                  data-testid={`webcam-thumbnail-${cam.id}`}
                />
              )}
              {cam.player && (
                <a
                  href={cam.player}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-500 hover:underline"
                  data-testid={`webcam-link-${cam.id}`}
                >
                  Watch live stream
                </a>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  );
}
