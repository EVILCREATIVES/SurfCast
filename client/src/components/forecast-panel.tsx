import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Wind, Waves, Thermometer, Navigation, Clock, ArrowUp,
  TrendingUp, Droplets, Sun, Cloud, CloudRain, CloudDrizzle,
  CloudLightning, CloudFog, CloudRainWind, CloudSun, Snowflake, Eye
} from "lucide-react";
import type { ForecastResponse } from "@shared/schema";
import {
  getWindDirection, getWindSpeedLabel, getWaveQuality, getWeatherDescription,
  formatTime, formatDate, metersToFeet, kphToKnots
} from "@/lib/weather-utils";

function WeatherIcon({ code, className }: { code: number; className?: string }) {
  const cls = className || "w-5 h-5";
  if (code === 0) return <Sun className={cls} />;
  if (code <= 2) return <CloudSun className={cls} />;
  if (code === 3) return <Cloud className={cls} />;
  if (code >= 45 && code <= 48) return <CloudFog className={cls} />;
  if (code >= 51 && code <= 55) return <CloudDrizzle className={cls} />;
  if (code >= 61 && code <= 65) return <CloudRain className={cls} />;
  if (code >= 71 && code <= 75) return <Snowflake className={cls} />;
  if (code >= 80 && code <= 82) return <CloudRainWind className={cls} />;
  if (code >= 95) return <CloudLightning className={cls} />;
  return <Cloud className={cls} />;
}

function WindArrow({ degrees, className }: { degrees: number; className?: string }) {
  return (
    <div
      className={`inline-flex items-center justify-center ${className || ""}`}
      style={{ transform: `rotate(${degrees}deg)` }}
    >
      <ArrowUp className="w-4 h-4" />
    </div>
  );
}

interface ForecastPanelProps {
  forecast: ForecastResponse | null;
  isLoading: boolean;
  locationName?: string;
}

export function ForecastPanel({ forecast, isLoading, locationName }: ForecastPanelProps) {
  const [selectedDay, setSelectedDay] = useState(0);

  if (isLoading) {
    return <ForecastSkeleton />;
  }

  if (!forecast) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 py-12 text-center">
        <Waves className="w-16 h-16 text-muted-foreground/30 mb-4" />
        <p className="text-lg font-medium text-muted-foreground/60">Click on the map or select a spot</p>
        <p className="text-sm text-muted-foreground/40 mt-1">to view real-time surf conditions</p>
      </div>
    );
  }

  const { weather, marine } = forecast;
  const now = new Date();
  const currentHourIndex = weather.time.findIndex((t) => {
    const d = new Date(t);
    return d >= now;
  });
  const idx = Math.max(0, currentHourIndex > 0 ? currentHourIndex - 1 : 0);

  const currentWind = weather.wind_speed_10m[idx];
  const currentWindDir = weather.wind_direction_10m[idx];
  const currentGusts = weather.wind_gusts_10m[idx];
  const currentTemp = weather.temperature_2m[idx];
  const currentWeatherCode = weather.weather_code[idx];
  const currentWaveHeight = marine.wave_height[idx];
  const currentWaveDir = marine.wave_direction[idx];
  const currentWavePeriod = marine.wave_period[idx];
  const currentSwellHeight = marine.swell_wave_height[idx];
  const currentSwellDir = marine.swell_wave_direction[idx];
  const currentSwellPeriod = marine.swell_wave_period[idx];

  const quality = getWaveQuality(currentWaveHeight, currentWavePeriod, currentWind);
  const windLabel = getWindSpeedLabel(currentWind);

  const days: { label: string; startIdx: number; endIdx: number }[] = [];
  const seenDays = new Set<string>();
  weather.time.forEach((t, i) => {
    const dayKey = t.split("T")[0];
    if (!seenDays.has(dayKey)) {
      seenDays.add(dayKey);
      const endIdx = weather.time.findIndex((t2, j) => j > i && !t2.startsWith(dayKey));
      days.push({
        label: formatDate(t),
        startIdx: i,
        endIdx: endIdx === -1 ? weather.time.length : endIdx,
      });
    }
  });

  const dayData = days[selectedDay] || days[0];
  const hourlySlice = {
    start: dayData.startIdx,
    end: Math.min(dayData.endIdx, dayData.startIdx + 24),
  };

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <WeatherIcon code={currentWeatherCode} className="w-6 h-6 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <h2 className="text-base font-semibold truncate" data-testid="text-location-name">
                {locationName || `${forecast.latitude.toFixed(2)}, ${forecast.longitude.toFixed(2)}`}
              </h2>
              <p className="text-xs text-muted-foreground">{getWeatherDescription(currentWeatherCode)}</p>
            </div>
          </div>
          <Badge variant="secondary" className={quality.color} data-testid="badge-surf-quality">
            {quality.label} {quality.score}/100
          </Badge>
        </div>
      </div>

      <div className="px-4 pb-3">
        <div className="grid grid-cols-2 gap-2">
          <Card className="p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Waves className="w-3.5 h-3.5" />
              <span>Waves</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-bold" data-testid="text-wave-height">{metersToFeet(currentWaveHeight)}</span>
              <span className="text-xs text-muted-foreground">ft</span>
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <WindArrow degrees={currentWaveDir} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{getWindDirection(currentWaveDir)} {currentWavePeriod}s</span>
            </div>
          </Card>

          <Card className="p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Wind className="w-3.5 h-3.5" />
              <span>Wind</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className={`text-xl font-bold ${windLabel.color}`} data-testid="text-wind-speed">{kphToKnots(currentWind)}</span>
              <span className="text-xs text-muted-foreground">kts</span>
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <WindArrow degrees={currentWindDir} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{getWindDirection(currentWindDir)} G{kphToKnots(currentGusts)}</span>
            </div>
          </Card>

          <Card className="p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Swell</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-bold" data-testid="text-swell-height">{metersToFeet(currentSwellHeight)}</span>
              <span className="text-xs text-muted-foreground">ft</span>
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <WindArrow degrees={currentSwellDir} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{getWindDirection(currentSwellDir)} {currentSwellPeriod}s</span>
            </div>
          </Card>

          <Card className="p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Thermometer className="w-3.5 h-3.5" />
              <span>Temp</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-bold" data-testid="text-temperature">{Math.round(currentTemp)}</span>
              <span className="text-xs text-muted-foreground">°C</span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {Math.round(currentTemp * 9 / 5 + 32)}°F
            </div>
          </Card>
        </div>
      </div>

      <div>
        <Tabs defaultValue="hourly">
          <div className="px-4">
            <TabsList className="w-full">
              <TabsTrigger value="hourly" className="flex-1" data-testid="tab-hourly">
                <Clock className="w-3.5 h-3.5 mr-1" /> Hourly
              </TabsTrigger>
              <TabsTrigger value="daily" className="flex-1" data-testid="tab-daily">
                <Eye className="w-3.5 h-3.5 mr-1" /> Daily
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="hourly" className="mt-0 px-4 pb-4">
            <div className="flex gap-1 mb-3 mt-2 overflow-x-auto pb-1">
              {days.slice(0, 7).map((d, i) => (
                <button
                  key={d.label}
                  onClick={() => setSelectedDay(i)}
                  className={`px-2.5 py-1 rounded-md text-xs whitespace-nowrap transition-colors ${
                    selectedDay === i
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-muted-foreground hover-elevate"
                  }`}
                  data-testid={`button-day-${i}`}
                >
                  {d.label}
                </button>
              ))}
            </div>

            <div className="space-y-1">
              {weather.time.slice(hourlySlice.start, hourlySlice.end).map((time, i) => {
                const hi = hourlySlice.start + i;
                const wh = marine.wave_height[hi];
                const ws = weather.wind_speed_10m[hi];
                const wd = weather.wind_direction_10m[hi];
                const waveD = marine.wave_direction[hi];
                const wp = marine.wave_period[hi];
                const wc = weather.weather_code[hi];
                const q = getWaveQuality(wh, wp, ws);
                const isNow = hi === idx;

                return (
                  <div
                    key={time}
                    className={`flex items-center gap-2 px-2.5 py-2 rounded-md text-sm ${
                      isNow ? "bg-primary/10 border border-primary/20" : ""
                    }`}
                    data-testid={`row-hourly-${i}`}
                  >
                    <span className="w-12 text-xs text-muted-foreground shrink-0">
                      {isNow ? "Now" : formatTime(time)}
                    </span>
                    <WeatherIcon code={wc} className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex items-center gap-1 w-16 shrink-0">
                      <Waves className="w-3 h-3 text-blue-400" />
                      <span className="text-xs font-medium">{metersToFeet(wh)}ft</span>
                    </div>
                    <div className="flex items-center gap-1 w-14 shrink-0">
                      <span className="text-xs">{wp}s</span>
                    </div>
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <WindArrow degrees={wd} className="text-muted-foreground shrink-0" />
                      <span className="text-xs truncate">{kphToKnots(ws)}kts</span>
                    </div>
                    <span className={`text-xs font-medium ${q.color} shrink-0`}>{q.label}</span>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="daily" className="mt-0 px-4 pb-4">
            <div className="space-y-2 mt-2">
              {days.slice(0, 7).map((day, dayIdx) => {
                const dayHours = [];
                for (let h = day.startIdx; h < day.endIdx && h < weather.time.length; h++) {
                  dayHours.push(h);
                }
                const avgWave = dayHours.reduce((s, h) => s + marine.wave_height[h], 0) / dayHours.length;
                const maxWave = Math.max(...dayHours.map((h) => marine.wave_height[h]));
                const avgWind = dayHours.reduce((s, h) => s + weather.wind_speed_10m[h], 0) / dayHours.length;
                const avgPeriod = dayHours.reduce((s, h) => s + marine.wave_period[h], 0) / dayHours.length;
                const midCode = weather.weather_code[dayHours[Math.floor(dayHours.length / 2)]];
                const q = getWaveQuality(avgWave, avgPeriod, avgWind);

                return (
                  <Card key={day.label} className="p-3" data-testid={`card-daily-${dayIdx}`}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <WeatherIcon code={midCode} className="w-5 h-5 text-muted-foreground" />
                        <span className="font-medium text-sm">{day.label}</span>
                      </div>
                      <Badge variant="secondary" className={q.color}>{q.label}</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mt-2">
                      <div>
                        <p className="text-xs text-muted-foreground">Waves</p>
                        <p className="text-sm font-medium">{metersToFeet(avgWave)}-{metersToFeet(maxWave)} ft</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Period</p>
                        <p className="text-sm font-medium">{avgPeriod.toFixed(1)}s</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Wind</p>
                        <p className="text-sm font-medium">{kphToKnots(avgWind)} kts</p>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function ForecastSkeleton() {
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Skeleton className="w-6 h-6 rounded-full" />
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-md" />
        ))}
      </div>
      <Skeleton className="h-8 w-full rounded-md" />
      <div className="space-y-2">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-9 rounded-md" />
        ))}
      </div>
    </div>
  );
}
