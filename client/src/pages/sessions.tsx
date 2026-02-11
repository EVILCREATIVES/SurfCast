import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import maplibregl from "maplibre-gl";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, X, Waves, Timer, Route, Clock, Zap, ChevronRight, Droplets, Gauge } from "lucide-react";
import type { SurfSession, SessionTrackData } from "@shared/schema";
import "maplibre-gl/dist/maplibre-gl.css";

function formatWaterTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}H ${m.toString().padStart(2, "0")}M`;
}

function formatLongestWave(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (isToday) return `TODAY, ${timeStr}`;
  if (isYesterday) return `YESTERDAY, ${timeStr}`;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" }).toUpperCase()}, ${timeStr}`;
}

function getTrackBounds(trackData: SessionTrackData): maplibregl.LngLatBounds | null {
  const allPoints: [number, number][] = [];
  if (trackData.paddlePath) {
    trackData.paddlePath.forEach(p => allPoints.push([p.lng, p.lat]));
  }
  if (trackData.waves) {
    trackData.waves.forEach(w => w.points.forEach(p => allPoints.push([p.lng, p.lat])));
  }
  if (allPoints.length === 0) return null;

  return allPoints.reduce((bounds, coord) => {
    return bounds.extend(coord as [number, number]);
  }, new maplibregl.LngLatBounds(allPoints[0], allPoints[0]));
}

function SessionMap({ session, interactive = false, highlightWave }: { session: SurfSession; interactive?: boolean; highlightWave?: number | null }) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const trackData = session.trackData as unknown as SessionTrackData;

  useEffect(() => {
    if (!mapContainer.current || !trackData || mapRef.current) return;

    const bounds = getTrackBounds(trackData);
    if (!bounds) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          satellite: {
            type: "raster",
            tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
            tileSize: 256,
            attribution: "Esri"
          }
        },
        layers: [
          {
            id: "satellite",
            type: "raster",
            source: "satellite",
            minzoom: 0,
            maxzoom: 22
          }
        ]
      },
      bounds: bounds,
      fitBoundsOptions: { padding: 50 },
      interactive: interactive,
      attributionControl: false
    });

    map.on('load', () => {
        if (!mapRef.current) return; // Unmounted
        addTracks(map, trackData);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []); // Init once

  // Handle Updates (highlighting)
  useEffect(() => {
    if (!mapRef.current || !mapRef.current.isStyleLoaded()) return;
    const map = mapRef.current;
    
    // Update wave styles based on highlight
    if (trackData.waves) {
        trackData.waves.forEach((_, i) => {
             const layerId = `wave-${i}`;
             if (map.getLayer(layerId)) {
                 const isHighlighted = highlightWave === i;
                 const isAnyHighlighted = highlightWave !== null && highlightWave !== undefined;
                 
                 const color = isHighlighted ? "#ffeb3b" : "#00e5ff";
                 const width = isHighlighted ? 4 : 2.5;
                 const opacity = isAnyHighlighted ? (isHighlighted ? 1 : 0.15) : 0.8;
                 
                 map.setPaintProperty(layerId, 'line-color', color);
                 map.setPaintProperty(layerId, 'line-width', width);
                 map.setPaintProperty(layerId, 'line-opacity', opacity);
                 
                 // Z-index hack: move highlighted to top
                 if (isHighlighted) {
                     map.moveLayer(layerId);
                 }
             }
        });
    }
    
  }, [highlightWave, trackData]); // Re-run if highlight changes

  function addTracks(map: maplibregl.Map, data: SessionTrackData) {
      if (data.paddlePath && data.paddlePath.length > 1) {
          const coords = data.paddlePath.map(p => [p.lng, p.lat]);
          map.addSource('paddle', {
              type: 'geojson',
              data: {
                  type: 'Feature',
                  properties: {},
                  geometry: { type: 'LineString', coordinates: coords }
              }
          });
          map.addLayer({
              id: 'paddle',
              type: 'line',
              source: 'paddle',
              layout: { 'line-join': 'round', 'line-cap': 'round' },
              paint: {
                  'line-color': '#00e5ff',
                  'line-width': 2,
                  'line-opacity': 0.3,
                  'line-dasharray': [2, 3] // MapLibre dasharray scales with line width differently
              }
          });
      }

      if (data.waves) {
          data.waves.forEach((wave, i) => {
              const coords = wave.points.map(p => [p.lng, p.lat]);
              const sourceId = `source-wave-${i}`;
              const layerId = `wave-${i}`;
              
              map.addSource(sourceId, {
                type: 'geojson',
                data: {
                    type: 'Feature',
                    properties: {},
                    geometry: { type: 'LineString', coordinates: coords }
                }
              });
              
              map.addLayer({
                id: layerId,
                type: 'line',
                source: sourceId,
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': '#00e5ff',
                    'line-width': 2.5,
                    'line-opacity': 0.8
                }
              });
          });
      }
  }

  if (!trackData) return null;

  return <div ref={mapContainer} className="w-full h-full bg-slate-900/10" />;
}

function SessionCard({ session, onClick }: { session: SurfSession; onClick: () => void }) {
  return (
    <Card
      className="hover-elevate cursor-pointer overflow-hidden"
      onClick={onClick}
      data-testid={`card-session-${session.id}`}
    >
      <div className="h-48 relative">
        <SessionMap session={session} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" />
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-bold text-base truncate" data-testid={`text-session-name-${session.id}`}>{session.spotName}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{formatDate(session.sessionDate as unknown as string)}</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </div>
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Waves className="w-3.5 h-3.5 text-cyan-400" />
            <span>{session.waveCount} waves</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span>{formatWaterTime(session.waterTimeMinutes)}</span>
          </div>
          <div className="flex items-center gap-1">
            <Route className="w-3.5 h-3.5 text-cyan-400" />
            <span>{session.distanceMiles} mi</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

function WaveRow({ wave, index, isHighlighted, onHover }: {
  wave: { points: { lat: number; lng: number; time: number; speed?: number }[] };
  index: number;
  isHighlighted: boolean;
  onHover: (idx: number | null) => void;
}) {
  const maxSpeed = Math.max(...wave.points.filter(p => p.speed).map(p => p.speed!), 0);
  const duration = wave.points.length >= 2
    ? wave.points[wave.points.length - 1].time - wave.points[0].time
    : 0;

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors cursor-default ${
        isHighlighted ? "bg-cyan-400/10 ring-1 ring-cyan-400/30" : "hover-elevate"
      }`}
      onMouseEnter={() => onHover(index)}
      onMouseLeave={() => onHover(null)}
      data-testid={`wave-row-${index}`}
    >
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
        isHighlighted ? "bg-cyan-400 text-black" : "bg-muted text-muted-foreground"
      }`}>
        {index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 text-sm">
          {maxSpeed > 0 && (
            <span className="text-muted-foreground">
              <span className="font-semibold text-foreground">{maxSpeed.toFixed(1)}</span> mph
            </span>
          )}
          {duration > 0 && (
            <span className="text-muted-foreground">
              <span className="font-semibold text-foreground">{duration}</span>s ride
            </span>
          )}
        </div>
      </div>
      {maxSpeed >= 15 && (
        <Zap className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
      )}
    </div>
  );
}

function SessionDetail({ session, onBack, onClose }: { session: SurfSession; onBack: () => void; onClose: () => void }) {
  const [highlightWave, setHighlightWave] = useState<number | null>(null);
  const trackData = session.trackData as unknown as SessionTrackData;
  const waves = trackData?.waves || [];

  return (
    <div className="flex flex-col h-full bg-background" data-testid="session-detail-view">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b shrink-0 bg-background z-10">
        <div className="flex items-center gap-2">
          {onBack && (
            <Button variant="ghost" size="icon" onClick={onBack} className="mr-1">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}
          <div>
            <h2 className="font-bold text-lg">{session.spotName}</h2>
            <p className="text-xs text-muted-foreground">{formatDate(session.sessionDate as unknown as string)}</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} data-testid="btn-close-session">
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="flex-1 min-h-0 md:flex">
        {/* Map Panel */}
        <div className="h-[40vh] md:h-full md:w-2/3 relative bg-slate-900 border-b md:border-b-0 md:border-r">
          <SessionMap session={session} interactive={true} highlightWave={highlightWave} />
           {/* Stat Overlay on Map */}
           <div className="absolute top-4 left-4 flex flex-col gap-2 z-10 pointer-events-none">
              <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full text-white text-xs font-medium border border-white/10 flex items-center gap-2">
                 <Waves className="w-3 h-3 text-cyan-400" />
                 {session.waveCount} waves
              </div>
           </div>
        </div>

        {/* Stats & List Panel */}
        <div className="flex-1 md:w-1/3 flex flex-col min-h-0 bg-background/50">
           {/* Summary Stats Grid */}
           <div className="grid grid-cols-2 gap-3 p-4 shrink-0">
             <div className="bg-card border rounded-lg p-3 flex flex-col items-center justify-center text-center">
                <Timer className="w-5 h-5 text-primary mb-1 opacity-80" />
                <div className="text-xl font-bold">{formatWaterTime(session.waterTimeMinutes)}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Total Time</div>
             </div>
             <div className="bg-card border rounded-lg p-3 flex flex-col items-center justify-center text-center">
                <Gauge className="w-5 h-5 text-primary mb-1 opacity-80" />
                <div className="text-xl font-bold">{formatLongestWave(session.longestWaveSeconds)}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Longest Ride</div>
             </div>
             <div className="bg-card border rounded-lg p-3 flex flex-col items-center justify-center text-center">
                <Zap className="w-5 h-5 text-yellow-500 mb-1 opacity-80" />
                <div className="text-xl font-bold">{Math.round(session.maxSpeedMph)} <span className="text-sm font-normal text-muted-foreground">mph</span></div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Top Speed</div>
             </div>
             <div className="bg-card border rounded-lg p-3 flex flex-col items-center justify-center text-center">
                <Route className="w-5 h-5 text-primary mb-1 opacity-80" />
                <div className="text-xl font-bold">{session.distanceMiles} <span className="text-sm font-normal text-muted-foreground">mi</span></div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Distance</div>
             </div>
           </div>
           
           <div className="px-4 pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
             Wave Breakdown
           </div>

           <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1">
              {waves.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground italic">
                     No waves recorded.
                  </div>
              ) : (
                  waves.map((wave, i) => (
                    <WaveRow 
                        key={i} 
                        wave={wave} 
                        index={i} 
                        isHighlighted={highlightWave === i}
                        onHover={setHighlightWave}
                    />
                  ))
              )}
           </div>
        </div>
      </div>
    </div>
  );
}

export default function Sessions() {
  const [, navigate] = useLocation();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // In a real app, we'd use useQuery for list, and maybe another for detail.
  // Assuming list returns full data for now or we just use list
  const { data: sessions = [], isLoading } = useQuery<SurfSession[]>({
    queryKey: ["/api/sessions"],
  });

  const selectedSession = sessions.find(s => s.id === selectedSessionId);

  // Modal View for Session Detail
  if (selectedSession) {
      return (
          <div className="fixed inset-0 z-50 bg-background">
             <SessionDetail 
                session={selectedSession} 
                onBack={() => setSelectedSessionId(null)}
                onClose={() => navigate("/")} 
             />
          </div>
      );
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6 pb-20">
       <div className="flex items-center gap-4 mb-2">
         <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="w-5 h-5" />
         </Button>
         <div>
            <h1 className="text-3xl font-bold tracking-tight">Your Sessions</h1>
            <p className="text-muted-foreground">Track your progress and relive your best waves.</p>
         </div>
       </div>

       {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
             {[1,2,3].map(i => <Skeleton key={i} className="h-64 rounded-xl" />)}
          </div>
       ) : sessions.length === 0 ? (
          <div className="text-center py-12 bg-muted/30 rounded-xl border border-dashed">
             <Droplets className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
             <h3 className="font-semibold text-lg">No sessions recorded yet</h3>
             <p className="text-muted-foreground max-w-sm mx-auto mt-1">
                Start tracking your surf sessions using the mobile app to see your stats here.
             </p>
          </div>
       ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {sessions.map(session => (
                  <SessionCard 
                    key={session.id} 
                    session={session} 
                    onClick={() => setSelectedSessionId(session.id)} 
                  />
              ))}
          </div>
       )}
    </div>
  );
}
