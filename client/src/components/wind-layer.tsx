import { useEffect, useRef, useState, useCallback } from "react";
import { useMap, useMapEvents } from "react-leaflet";

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

interface ScreenPoint {
  x: number;
  y: number;
  u: number;
  v: number;
  speed: number;
}

interface Particle {
  x: number;
  y: number;
  age: number;
  maxAge: number;
}

interface WindLayerProps {
  visible: boolean;
}

const PARTICLE_COUNT = 3000;
const PARTICLE_LINE_WIDTH = 1.2;
const MAX_PARTICLE_AGE = 80;
const SPEED_SCALE = 0.15;
const TRAIL_FADE = 0.93;

function getWindColor(speed: number, alpha: number): string {
  if (speed < 5) return `rgba(100, 200, 255, ${alpha})`;
  if (speed < 10) return `rgba(80, 220, 180, ${alpha})`;
  if (speed < 15) return `rgba(120, 230, 100, ${alpha})`;
  if (speed < 20) return `rgba(200, 220, 60, ${alpha})`;
  if (speed < 30) return `rgba(255, 180, 40, ${alpha})`;
  if (speed < 40) return `rgba(255, 120, 40, ${alpha})`;
  return `rgba(255, 60, 60, ${alpha})`;
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

function projectGridToScreen(points: GridPoint[], map: L.Map): ScreenPoint[] {
  return points.map((pt) => {
    const pixel = map.latLngToContainerPoint([pt.lat, pt.lng]);
    const rad = (pt.windDir * Math.PI) / 180;
    const knots = pt.windSpeed * 0.5399;
    return {
      x: pixel.x,
      y: pixel.y,
      u: -Math.sin(rad) * knots,
      v: -Math.cos(rad) * knots,
      speed: knots,
    };
  });
}

function interpolateWind(
  x: number,
  y: number,
  screenPoints: ScreenPoint[]
): { u: number; v: number; speed: number } | null {
  if (screenPoints.length === 0) return null;

  let totalWeight = 0;
  let u = 0;
  let v = 0;
  let speed = 0;

  for (const sp of screenPoints) {
    const dx = x - sp.x;
    const dy = y - sp.y;
    const distSq = dx * dx + dy * dy;
    if (distSq < 1) {
      return { u: sp.u, v: sp.v, speed: sp.speed };
    }
    const w = 1 / distSq;
    totalWeight += w;
    u += sp.u * w;
    v += sp.v * w;
    speed += sp.speed * w;
  }

  if (totalWeight === 0) return null;
  return { u: u / totalWeight, v: v / totalWeight, speed: speed / totalWeight };
}

export function WindWaveLayer({ visible }: WindLayerProps) {
  const map = useMap();
  const particleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [points, setPoints] = useState<GridPoint[]>([]);
  const pointsRef = useRef<GridPoint[]>([]);
  const fetchTimeoutRef = useRef<NodeJS.Timeout>();
  const lastBoundsRef = useRef<string>("");
  const animFrameRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const screenPointsRef = useRef<ScreenPoint[]>([]);

  pointsRef.current = points;

  const fetchGridData = useCallback(async () => {
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
  }, [map]);

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
  }, [visible, fetchGridData]);

  const ensureCanvas = useCallback(
    (
      ref: React.MutableRefObject<HTMLCanvasElement | null>,
      zIndex: string
    ): HTMLCanvasElement | null => {
      let canvas = ref.current;
      if (!canvas) {
        canvas = document.createElement("canvas");
        canvas.style.position = "absolute";
        canvas.style.top = "0";
        canvas.style.left = "0";
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.style.pointerEvents = "none";
        canvas.style.zIndex = zIndex;
        ref.current = canvas;
        const pane = map.getPane("overlayPane");
        if (pane) pane.appendChild(canvas);
      }
      const size = map.getSize();
      if (canvas.width !== size.x || canvas.height !== size.y) {
        canvas.width = size.x;
        canvas.height = size.y;
      }
      return canvas;
    },
    [map]
  );

  useEffect(() => {
    if (!visible || points.length === 0) {
      if (waveCanvasRef.current) waveCanvasRef.current.style.display = "none";
      return;
    }

    const canvas = ensureCanvas(waveCanvasRef, "399");
    if (!canvas) return;
    canvas.style.display = "block";

    const drawWaves = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const pt of points) {
        if (pt.waveHeight === null || pt.waveHeight <= 0) continue;
        const pixel = map.latLngToContainerPoint([pt.lat, pt.lng]);
        const x = pixel.x;
        const y = pixel.y;
        if (x < -50 || x > canvas.width + 50 || y < -50 || y > canvas.height + 50)
          continue;

        const waveCol = getWaveColor(pt.waveHeight);
        ctx.beginPath();
        ctx.arc(x, y, 22, 0, Math.PI * 2);
        ctx.fillStyle = waveCol;
        ctx.fill();

        ctx.font = "bold 9px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(200, 230, 255, 0.85)";
        ctx.fillText(`${(pt.waveHeight * 3.28).toFixed(1)}ft`, x, y + 4);
      }
    };

    drawWaves();

    const onMove = () => drawWaves();
    map.on("move", onMove);
    map.on("zoom", onMove);
    return () => {
      map.off("move", onMove);
      map.off("zoom", onMove);
    };
  }, [points, visible, map, ensureCanvas]);

  useEffect(() => {
    if (!visible || points.length === 0) {
      if (particleCanvasRef.current) particleCanvasRef.current.style.display = "none";
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }

    const canvas = ensureCanvas(particleCanvasRef, "401");
    if (!canvas) return;
    canvas.style.display = "block";

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const w = canvas.width;
    const h = canvas.height;

    const createParticle = (): Particle => ({
      x: Math.random() * w,
      y: Math.random() * h,
      age: Math.floor(Math.random() * MAX_PARTICLE_AGE),
      maxAge: MAX_PARTICLE_AGE + Math.floor(Math.random() * 40),
    });

    if (particlesRef.current.length !== PARTICLE_COUNT) {
      particlesRef.current = Array.from({ length: PARTICLE_COUNT }, createParticle);
    }

    screenPointsRef.current = projectGridToScreen(pointsRef.current, map);

    let isMoving = false;
    let moveTimer: NodeJS.Timeout;
    const onMoveStart = () => {
      isMoving = true;
      clearTimeout(moveTimer);
    };
    const onMoveEnd = () => {
      moveTimer = setTimeout(() => {
        isMoving = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const size = map.getSize();
        if (canvas.width !== size.x || canvas.height !== size.y) {
          canvas.width = size.x;
          canvas.height = size.y;
        }
        screenPointsRef.current = projectGridToScreen(pointsRef.current, map);
        particlesRef.current = Array.from({ length: PARTICLE_COUNT }, createParticle);
      }, 150);
    };

    map.on("movestart", onMoveStart);
    map.on("zoomstart", onMoveStart);
    map.on("moveend", onMoveEnd);
    map.on("zoomend", onMoveEnd);

    const animate = () => {
      if (!visible) return;

      const cw = canvas.width;
      const ch = canvas.height;

      if (isMoving) {
        animFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      ctx.globalCompositeOperation = "destination-in";
      ctx.fillStyle = `rgba(0, 0, 0, ${TRAIL_FADE})`;
      ctx.fillRect(0, 0, cw, ch);
      ctx.globalCompositeOperation = "lighter";

      const spts = screenPointsRef.current;
      const zoom = map.getZoom();
      const speedClamp = Math.min(SPEED_SCALE * Math.max(1, zoom / 3), 0.6);

      for (const p of particlesRef.current) {
        const wind = interpolateWind(p.x, p.y, spts);
        if (!wind) {
          p.age = p.maxAge;
          continue;
        }

        const oldX = p.x;
        const oldY = p.y;

        const vel = Math.min(wind.speed * speedClamp, 4);
        const mag = Math.sqrt(wind.u * wind.u + wind.v * wind.v);
        if (mag > 0.01) {
          p.x += (wind.u / mag) * vel;
          p.y -= (wind.v / mag) * vel;
        }
        p.age++;

        if (p.x < 0 || p.x > cw || p.y < 0 || p.y > ch || p.age >= p.maxAge) {
          p.x = Math.random() * cw;
          p.y = Math.random() * ch;
          p.age = 0;
          p.maxAge = MAX_PARTICLE_AGE + Math.floor(Math.random() * 40);
          continue;
        }

        const ageFactor =
          p.age < 10
            ? p.age / 10
            : p.age > p.maxAge - 10
              ? (p.maxAge - p.age) / 10
              : 1;
        const alpha = Math.min(0.85, 0.2 + wind.speed * 0.02) * ageFactor;
        const color = getWindColor(wind.speed, alpha);

        ctx.beginPath();
        ctx.moveTo(oldX, oldY);
        ctx.lineTo(p.x, p.y);
        ctx.strokeStyle = color;
        ctx.lineWidth = PARTICLE_LINE_WIDTH + Math.min(wind.speed * 0.015, 0.8);
        ctx.stroke();
      }

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      map.off("movestart", onMoveStart);
      map.off("zoomstart", onMoveStart);
      map.off("moveend", onMoveEnd);
      map.off("zoomend", onMoveEnd);
      clearTimeout(moveTimer);
    };
  }, [points, visible, map, ensureCanvas]);

  useEffect(() => {
    if (!visible) {
      if (particleCanvasRef.current) particleCanvasRef.current.style.display = "none";
      if (waveCanvasRef.current) waveCanvasRef.current.style.display = "none";
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    }
  }, [visible]);

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (particleCanvasRef.current) {
        particleCanvasRef.current.remove();
        particleCanvasRef.current = null;
      }
      if (waveCanvasRef.current) {
        waveCanvasRef.current.remove();
        waveCanvasRef.current = null;
      }
    };
  }, []);

  return null;
}
