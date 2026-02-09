import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { MapContainer, TileLayer, Polyline } from "react-leaflet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, X, Waves, Timer, Route, Clock, Zap, ChevronRight, Droplets, Gauge } from "lucide-react";
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

function getTrackBounds(trackData: SessionTrackData): [[number, number], [number, number]] | null {
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
  const padLat = (Math.max(...lats) - Math.min(...lats)) * 0.3 || 0.002;
  const padLng = (Math.max(...lngs) - Math.min(...lngs)) * 0.3 || 0.002;
  return [
    [Math.min(...lats) - padLat, Math.min(...lngs) - padLng],
    [Math.max(...lats) + padLat, Math.max(...lngs) + padLng],
  ];
}

function SessionMap({ session, interactive = false, highlightWave }: { session: SurfSession; interactive?: boolean; highlightWave?: number | null }) {
  const trackData = session.trackData as unknown as SessionTrackData;
  if (!trackData) return null;

  const bounds = getTrackBounds(trackData);
  if (!bounds) return null;

  const paddlePositions: [number, number][] = trackData.paddlePath
    ? trackData.paddlePath.map(p => [p.lat, p.lng] as [number, number])
    : [];

  return (
    <MapContainer
      bounds={bounds}
      className="w-full h-full"
      zoomControl={false}
      attributionControl={false}
      scrollWheelZoom={interactive}
      dragging={interactive}
    >
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        maxZoom={19}
      />

      {paddlePositions.length > 1 && (
        <Polyline
          positions={paddlePositions}
          pathOptions={{ color: "#00e5ff", weight: 2, opacity: 0.3, dashArray: "4 6" }}
        />
      )}

      {trackData.waves?.map((wave, i) => {
        const wavePositions: [number, number][] = wave.points.map(p => [p.lat, p.lng]);
        const isHighlighted = highlightWave === i;
        const isAnyHighlighted = highlightWave !== null && highlightWave !== undefined;
        return (
          <Polyline
            key={`wave-${i}`}
            positions={wavePositions}
            pathOptions={{
              color: isHighlighted ? "#ffeb3b" : "#00e5ff",
              weight: isHighlighted ? 4 : 2.5,
              opacity: isAnyHighlighted ? (isHighlighted ? 1 : 0.15) : 0.8,
              lineCap: "round",
              lineJoin: "round",
            }}
          />
        );
      })}
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

  const avgSpeed = waves.length > 0
    ? waves.reduce((sum, w) => {
        const speeds = w.points.filter(p => p.speed).map(p => p.speed!);
        return sum + (speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0);
      }, 0) / waves.length
    : 0;

  return (
    <div className="flex flex-col bg-background max-h-[90vh]">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
        <Button size="icon" variant="ghost" onClick={onBack} data-testid="button-back-sessions">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-base truncate" data-testid="text-session-detail-name">{session.spotName}</h2>
          <p className="text-xs text-muted-foreground">{formatDate(session.sessionDate as unknown as string)}</p>
        </div>
        <Button size="icon" variant="ghost" onClick={onClose} data-testid="button-close-overlay">
          <X className="w-4 h-4" />
        </Button>
      </header>

      <div className="flex-1 overflow-auto min-h-0">
        <div className="relative h-48 sm:h-56 shrink-0">
          <SessionMap session={session} interactive={true} highlightWave={highlightWave} />
        </div>

        <div className="px-4 pt-4">
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Card className="p-3 flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-cyan-400/10 flex items-center justify-center shrink-0">
                <Waves className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="min-w-0">
                <p className="text-base font-bold leading-tight" data-testid="text-wave-count">{session.waveCount}</p>
                <p className="text-xs text-muted-foreground">Waves</p>
              </div>
            </Card>
            <Card className="p-3 flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-cyan-400/10 flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="min-w-0">
                <p className="text-base font-bold leading-tight">{formatWaterTime(session.waterTimeMinutes)}</p>
                <p className="text-xs text-muted-foreground">Water Time</p>
              </div>
            </Card>
            <Card className="p-3 flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-cyan-400/10 flex items-center justify-center shrink-0">
                <Route className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="min-w-0">
                <p className="text-base font-bold leading-tight" data-testid="text-distance">{session.distanceMiles} mi</p>
                <p className="text-xs text-muted-foreground">Distance</p>
              </div>
            </Card>
            <Card className="p-3 flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-cyan-400/10 flex items-center justify-center shrink-0">
                <Timer className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="min-w-0">
                <p className="text-base font-bold leading-tight" data-testid="text-longest-wave">{formatLongestWave(session.longestWaveSeconds)}</p>
                <p className="text-xs text-muted-foreground">Longest Wave</p>
              </div>
            </Card>
          </div>

          {(session.maxSpeed || avgSpeed > 0) && (
            <Card className="p-3 mb-4 flex items-center gap-4 flex-wrap">
              {session.maxSpeed && (
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-yellow-400 shrink-0" />
                  <span className="text-sm text-muted-foreground">Top Speed</span>
                  <span className="text-sm font-bold">{session.maxSpeed.toFixed(1)} mph</span>
                </div>
              )}
              {avgSpeed > 0 && (
                <div className="flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span className="text-sm text-muted-foreground">Avg Speed</span>
                  <span className="text-sm font-bold">{avgSpeed.toFixed(1)} mph</span>
                </div>
              )}
            </Card>
          )}

          {waves.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2 px-1">
                <Droplets className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold">Wave by Wave</h3>
                <span className="text-xs text-muted-foreground ml-auto">Hover to highlight on map</span>
              </div>
              <Card className="divide-y divide-border overflow-hidden">
                {waves.map((wave, i) => (
                  <WaveRow
                    key={i}
                    wave={wave}
                    index={i}
                    isHighlighted={highlightWave === i}
                    onHover={setHighlightWave}
                  />
                ))}
              </Card>
            </div>
          )}
        </div>
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
      <div className="w-full max-h-[90vh]">
        <SessionDetail session={selectedSession} onBack={() => setSelectedSessionId(null)} onClose={() => navigate("/")} />
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full bg-background max-h-[90vh]">
      <header className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <Button size="icon" variant="ghost" onClick={() => navigate("/account")} data-testid="button-back-account">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Waves className="w-5 h-5 text-primary shrink-0" />
        <h1 className="text-base font-bold flex-1">Your Sessions</h1>
        <Button size="icon" variant="ghost" onClick={() => navigate("/")} data-testid="button-close-overlay">
          <X className="w-4 h-4" />
        </Button>
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
