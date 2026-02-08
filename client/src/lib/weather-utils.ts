export function getWindDirection(degrees: number): string {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const index = Math.round(degrees / 22.5) % 16;
  return dirs[index];
}

export function getWindSpeedLabel(speed: number): { label: string; color: string } {
  if (speed < 5) return { label: "Calm", color: "text-green-500" };
  if (speed < 15) return { label: "Light", color: "text-emerald-500" };
  if (speed < 25) return { label: "Moderate", color: "text-yellow-500" };
  if (speed < 35) return { label: "Strong", color: "text-orange-500" };
  return { label: "Gale", color: "text-red-500" };
}

export function getWaveQuality(waveHeight: number, wavePeriod: number, windSpeed: number): { label: string; color: string; score: number } {
  let score = 0;

  if (waveHeight >= 0.5 && waveHeight <= 1.5) score += 30;
  else if (waveHeight >= 1.5 && waveHeight <= 2.5) score += 25;
  else if (waveHeight >= 0.3 && waveHeight <= 3) score += 15;
  else score += 5;

  if (wavePeriod >= 10) score += 35;
  else if (wavePeriod >= 7) score += 25;
  else if (wavePeriod >= 5) score += 15;
  else score += 5;

  if (windSpeed < 10) score += 35;
  else if (windSpeed < 20) score += 25;
  else if (windSpeed < 30) score += 15;
  else score += 5;

  if (score >= 80) return { label: "Epic", color: "text-green-400", score };
  if (score >= 60) return { label: "Good", color: "text-emerald-400", score };
  if (score >= 40) return { label: "Fair", color: "text-yellow-400", score };
  if (score >= 20) return { label: "Poor", color: "text-orange-400", score };
  return { label: "Flat", color: "text-muted-foreground", score };
}

export function getWeatherDescription(code: number): string {
  const descriptions: Record<number, string> = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Foggy",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Slight snow",
    73: "Moderate snow",
    75: "Heavy snow",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
  };
  return descriptions[code] || "Unknown";
}

export function getWeatherIcon(code: number): string {
  if (code === 0) return "sun";
  if (code <= 2) return "cloud-sun";
  if (code === 3) return "cloud";
  if (code >= 45 && code <= 48) return "cloud-fog";
  if (code >= 51 && code <= 55) return "cloud-drizzle";
  if (code >= 61 && code <= 65) return "cloud-rain";
  if (code >= 71 && code <= 75) return "snowflake";
  if (code >= 80 && code <= 82) return "cloud-rain-wind";
  if (code >= 95) return "cloud-lightning";
  return "cloud";
}

export function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

export function metersToFeet(meters: number): number {
  return Math.round(meters * 3.281 * 10) / 10;
}

export function kphToKnots(kph: number): number {
  return Math.round(kph * 0.5399568 * 10) / 10;
}

export function celsiusToFahrenheit(c: number): number {
  return Math.round((c * 9 / 5 + 32) * 10) / 10;
}
