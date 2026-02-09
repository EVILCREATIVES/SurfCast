import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { MapContainer, TileLayer, Polyline, CircleMarker } from "react-leaflet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Waves, Timer, Route, Clock, Zap, ChevronRight } from "lucide-react";
import type { SurfSession, SessionTrackData } from "@shared/schema";
import "leaflet/dist/leaflet.css";

function formatWaterTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}H ${m.toString().padStart(2, "0")}M`;
}

function formatLongestWave(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}M ${s.toString().padStart(2, "0")}S`;
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

function SessionMap({ session }: { session: SurfSession }) {
  const trackData = session.trackData as unknown as SessionTrackData;
  if (!trackData) return null;

  const allPoints: [number, number][] = [];

  if (trackData.paddlePath) {
    trackData.paddlePath.forEach(p => allPoints.push([p.lat, p.lng]));
  }
  if (trackData.waves) {
    trackData.waves.forEach(w => w.points.forEach(p => allPoints.push([p.lat, p.lng])));
  }

  if (allPoints.length === 0) return null;

  const lats = allPoints.map(p => p[0]);
  const lngs = allPoints.map(p => p[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const padLat = (maxLat - minLat) * 0.3 || 0.002;
  const padLng = (maxLng - minLng) * 0.3 || 0.002;

  const bounds: [[number, number], [number, number]] = [
    [minLat - padLat, minLng - padLng],
    [maxLat + padLat, maxLng + padLng],
  ];

  const paddlePositions: [number, number][] = trackData.paddlePath
    ? trackData.paddlePath.map(p => [p.lat, p.lng] as [number, number])
    : [];

  return (
    <MapContainer
      bounds={bounds}
      className="w-full h-full"
      zoomControl={false}
      attributionControl={false}
      scrollWheelZoom={true}
      dragging={true}
    >
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        maxZoom={19}
      />

      {paddlePositions.length > 1 && (
        <Polyline
          positions={paddlePositions}
          pathOptions={{ color: "#00e5ff", weight: 2, opacity: 0.4, dashArray: "4 6" }}
        />
      )}

      {trackData.waves?.map((wave, i) => {
        const wavePositions: [number, number][] = wave.points.map(p => [p.lat, p.lng]);
        return (
          <Polyline
            key={`wave-${i}`}
            positions={wavePositions}
            pathOptions={{ color: "#00e5ff", weight: 3, opacity: 0.85 }}
          />
        );
      })}

      {trackData.waves?.map((wave, i) =>
        wave.points.map((p, j) => (
          <CircleMarker
            key={`dot-${i}-${j}`}
            center={[p.lat, p.lng]}
            radius={2.5}
            pathOptions={{ color: "#00e5ff", fillColor: "#00e5ff", fillOpacity: 1, weight: 0 }}
          />
        ))
      )}
    </MapContainer>
  );
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

function SessionDetail({ session, onBack }: { session: SurfSession; onBack: () => void }) {
  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex-1 relative min-h-0">
        <SessionMap session={session} />

        <div className="absolute top-3 left-3 z-[1000]">
          <Button size="icon" variant="secondary" onClick={onBack} data-testid="button-back-sessions">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="bg-sidebar border-t border-border p-4 shrink-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <h2 className="text-lg font-bold" data-testid="text-session-detail-name">{session.spotName}</h2>
        </div>
        <div className="flex items-center justify-between gap-2 mb-4">
          <span className="text-sm text-muted-foreground">{formatDate(session.sessionDate as unknown as string)}</span>
          <div className="flex items-center gap-1">
            <span className="text-sm text-muted-foreground">WATER TIME:</span>
            <span className="text-sm font-bold text-cyan-400">{formatWaterTime(session.waterTimeMinutes)}</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col items-center gap-1.5 py-3 rounded-md bg-background/50">
            <div className="w-10 h-10 rounded-full border-2 border-cyan-400/50 flex items-center justify-center">
              <Waves className="w-5 h-5 text-cyan-400" />
            </div>
            <span className="text-lg font-bold" data-testid="text-wave-count">{session.waveCount} WAVES</span>
          </div>
          <div className="flex flex-col items-center gap-1.5 py-3 rounded-md bg-background/50">
            <div className="w-10 h-10 rounded-full border-2 border-cyan-400/50 flex items-center justify-center">
              <Route className="w-5 h-5 text-cyan-400" />
            </div>
            <span className="text-lg font-bold" data-testid="text-distance">{session.distanceMiles} MILE</span>
          </div>
          <div className="flex flex-col items-center gap-1.5 py-3 rounded-md bg-background/50">
            <div className="w-10 h-10 rounded-full border-2 border-cyan-400/50 flex items-center justify-center">
              <Timer className="w-5 h-5 text-cyan-400" />
            </div>
            <span className="text-lg font-bold" data-testid="text-longest-wave">{formatLongestWave(session.longestWaveSeconds)}</span>
          </div>
        </div>

        {session.maxSpeed && (
          <div className="mt-3 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Zap className="w-4 h-4 text-cyan-400" />
            <span>Max Speed: <span className="font-bold text-foreground">{session.maxSpeed.toFixed(1)} mph</span></span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Sessions() {
  const [, navigate] = useLocation();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const { data: sessions = [], isLoading } = useQuery<SurfSession[]>({
    queryKey: ["/api/sessions"],
  });

  const selectedSession = sessions.find(s => s.id === selectedSessionId);

  if (selectedSession) {
    return (
      <div className="h-screen w-full">
        <SessionDetail session={selectedSession} onBack={() => setSelectedSessionId(null)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full bg-background">
      <header className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <Button size="icon" variant="ghost" onClick={() => navigate("/")} data-testid="button-back-home">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Waves className="w-5 h-5 text-primary shrink-0" />
        <h1 className="text-base font-bold">Your Sessions</h1>
      </header>

      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2].map(i => (
              <Skeleton key={i} className="h-64 w-full rounded-md" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Waves className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-bold mb-2">No Sessions Yet</h2>
            <p className="text-sm text-muted-foreground max-w-xs">
              Connect your Garmin or Apple Watch to start recording your surf sessions.
            </p>
          </div>
        ) : (
          <div className="space-y-4 max-w-lg mx-auto">
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
    </div>
  );
}
