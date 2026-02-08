import { useEffect, useRef, useState } from "react";
import { useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";

interface GridPoint {
  lat: number;
  lng: number;
  windSpeed: number;
  windDir: number;
  temp: number;
  waveHeight: number | null;
  waveDir: number | null;
  wavePeriod: number | null;
}

interface WindLayerProps {
  visible: boolean;
}

function getWindColor(speed: number): string {
  if (speed < 5) return "rgba(100, 200, 255, 0.7)";
  if (speed < 10) return "rgba(80, 220, 180, 0.75)";
  if (speed < 15) return "rgba(120, 230, 100, 0.8)";
  if (speed < 20) return "rgba(200, 220, 60, 0.8)";
  if (speed < 30) return "rgba(255, 180, 40, 0.85)";
  if (speed < 40) return "rgba(255, 120, 40, 0.9)";
  return "rgba(255, 60, 60, 0.95)";
}

function getWaveColor(height: number): string {
  if (height < 0.3) return "rgba(30, 60, 120, 0.25)";
  if (height < 0.5) return "rgba(30, 100, 180, 0.3)";
  if (height < 1.0) return "rgba(40, 140, 200, 0.35)";
  if (height < 1.5) return "rgba(50, 180, 200, 0.4)";
  if (height < 2.0) return "rgba(80, 200, 160, 0.45)";
  if (height < 3.0) return "rgba(160, 220, 80, 0.5)";
  if (height < 4.0) return "rgba(240, 200, 40, 0.55)";
  if (height < 6.0) return "rgba(240, 140, 40, 0.6)";
  return "rgba(240, 60, 60, 0.65)";
}

function drawWindArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dir: number,
  speed: number,
  color: string
) {
  const rad = ((dir + 180) * Math.PI) / 180;
  const len = Math.min(12 + speed * 0.6, 28);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rad);

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(0, len / 2);
  ctx.lineTo(0, -len / 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, -len / 2);
  ctx.lineTo(-4, -len / 2 + 7);
  ctx.moveTo(0, -len / 2);
  ctx.lineTo(4, -len / 2 + 7);
  ctx.stroke();

  ctx.restore();
}

export function WindWaveLayer({ visible }: WindLayerProps) {
  const map = useMap();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [points, setPoints] = useState<GridPoint[]>([]);
  const fetchTimeoutRef = useRef<NodeJS.Timeout>();
  const lastBoundsRef = useRef<string>("");

  const fetchGridData = async () => {
    const bounds = map.getBounds();
    const boundsKey = `${bounds.getSouth().toFixed(1)},${bounds.getNorth().toFixed(1)},${bounds.getWest().toFixed(1)},${bounds.getEast().toFixed(1)}`;

    if (boundsKey === lastBoundsRef.current) return;
    lastBoundsRef.current = boundsKey;

    try {
      const res = await fetch(
        `/api/grid-weather?south=${bounds.getSouth()}&north=${bounds.getNorth()}&west=${bounds.getWest()}&east=${bounds.getEast()}`
      );
      if (res.ok) {
        const data = await res.json();
        setPoints(data.points || []);
      }
    } catch {
      // silently fail
    }
  };

  useMapEvents({
    moveend() {
      if (!visible) return;
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      fetchTimeoutRef.current = setTimeout(fetchGridData, 600);
    },
    zoomend() {
      if (!visible) return;
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      fetchTimeoutRef.current = setTimeout(fetchGridData, 600);
    },
  });

  useEffect(() => {
    if (visible) {
      fetchGridData();
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || points.length === 0) return;

    let canvas = canvasRef.current;
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.style.position = "absolute";
      canvas.style.top = "0";
      canvas.style.left = "0";
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.pointerEvents = "none";
      canvas.style.zIndex = "400";
      canvasRef.current = canvas;
      const pane = map.getPane("overlayPane");
      if (pane) pane.appendChild(canvas);
    }

    const size = map.getSize();
    canvas.width = size.x;
    canvas.height = size.y;
    canvas.style.display = "block";

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const mapOrigin = map.containerPointToLayerPoint([0, 0]);

    for (const pt of points) {
      const pixel = map.latLngToContainerPoint([pt.lat, pt.lng]);
      const x = pixel.x;
      const y = pixel.y;

      if (x < -50 || x > canvas.width + 50 || y < -50 || y > canvas.height + 50) continue;

      if (pt.waveHeight !== null && pt.waveHeight > 0) {
        const waveCol = getWaveColor(pt.waveHeight);
        ctx.beginPath();
        ctx.arc(x, y, 20, 0, Math.PI * 2);
        ctx.fillStyle = waveCol;
        ctx.fill();
      }

      const windCol = getWindColor(pt.windSpeed);
      drawWindArrow(ctx, x, y, pt.windDir, pt.windSpeed, windCol);

      ctx.font = "bold 9px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = windCol;
      ctx.fillText(`${Math.round(pt.windSpeed * 0.54)}kts`, x, y + 22);

      if (pt.waveHeight !== null && pt.waveHeight > 0) {
        ctx.fillStyle = "rgba(200, 230, 255, 0.85)";
        ctx.fillText(`${(pt.waveHeight * 3.28).toFixed(1)}ft`, x, y + 32);
      }
    }

    return () => {
      if (canvas) canvas.style.display = "none";
    };
  }, [points, visible, map]);

  useEffect(() => {
    if (!visible && canvasRef.current) {
      canvasRef.current.style.display = "none";
    }
  }, [visible]);

  useEffect(() => {
    const redraw = () => {
      if (visible && points.length > 0) {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const size = map.getSize();
        canvas.width = size.x;
        canvas.height = size.y;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (const pt of points) {
          const pixel = map.latLngToContainerPoint([pt.lat, pt.lng]);
          const x = pixel.x;
          const y = pixel.y;
          if (x < -50 || x > canvas.width + 50 || y < -50 || y > canvas.height + 50) continue;

          if (pt.waveHeight !== null && pt.waveHeight > 0) {
            const waveCol = getWaveColor(pt.waveHeight);
            ctx.beginPath();
            ctx.arc(x, y, 20, 0, Math.PI * 2);
            ctx.fillStyle = waveCol;
            ctx.fill();
          }

          const windCol = getWindColor(pt.windSpeed);
          drawWindArrow(ctx, x, y, pt.windDir, pt.windSpeed, windCol);

          ctx.font = "bold 9px Inter, sans-serif";
          ctx.textAlign = "center";
          ctx.fillStyle = windCol;
          ctx.fillText(`${Math.round(pt.windSpeed * 0.54)}kts`, x, y + 22);

          if (pt.waveHeight !== null && pt.waveHeight > 0) {
            ctx.fillStyle = "rgba(200, 230, 255, 0.85)";
            ctx.fillText(`${(pt.waveHeight * 3.28).toFixed(1)}ft`, x, y + 32);
          }
        }
      }
    };

    map.on("move", redraw);
    map.on("zoom", redraw);
    return () => {
      map.off("move", redraw);
      map.off("zoom", redraw);
    };
  }, [map, visible, points]);

  return null;
}
