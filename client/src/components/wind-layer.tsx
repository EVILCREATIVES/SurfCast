import { useEffect, useRef, useState, useCallback } from "react";
import { useMap, useMapEvents } from "react-leaflet";
import { createPortal } from "react-dom";

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
  prevX: number;
  prevY: number;
  age: number;
  maxAge: number;
}

interface WindWaveLayerProps {
  showWind: boolean;
  showWaves: boolean;
}

const BASE_ZOOM = 4;

function getZoomParams(zoom: number) {
  const z = Math.max(2, Math.min(zoom, 18));
  const delta = Math.max(0, z - BASE_ZOOM);
  const t = Math.min(1, delta / 6);
  const ease = t * t;
  const particleCount = Math.max(150, Math.round(1500 * (1 - ease * 0.9)));
  const speedScale = 0.12 * Math.max(0.15, 1 - ease * 0.85);
  const trailFade = Math.min(0.96, 0.92 + ease * 0.04);
  const maxAge = Math.round(120 * (1 + ease * 0.8));
  const lineWidth = Math.max(0.5, 1.0 - ease * 0.5);
  const interpRadius = 2000 + Math.round(delta * delta * 500);
  return { particleCount, speedScale, trailFade, maxAge, lineWidth, interpRadius };
}

function getWindColor(speed: number, alpha: number): string {
  const a = Math.min(1, alpha);
  if (speed < 5) return `rgba(80, 180, 255, ${a})`;
  if (speed < 10) return `rgba(60, 210, 170, ${a})`;
  if (speed < 15) return `rgba(100, 230, 80, ${a})`;
  if (speed < 20) return `rgba(200, 230, 50, ${a})`;
  if (speed < 30) return `rgba(255, 190, 30, ${a})`;
  if (speed < 40) return `rgba(255, 110, 30, ${a})`;
  return `rgba(255, 50, 50, ${a})`;
}

function getWaveRingColor(height: number): { r: number; g: number; b: number } {
  if (height < 0.3) return { r: 100, g: 140, b: 200 };
  if (height < 0.5) return { r: 80, g: 160, b: 220 };
  if (height < 1.0) return { r: 60, g: 190, b: 210 };
  if (height < 1.5) return { r: 50, g: 210, b: 180 };
  if (height < 2.0) return { r: 140, g: 120, b: 220 };
  if (height < 3.0) return { r: 170, g: 90, b: 210 };
  if (height < 4.0) return { r: 200, g: 70, b: 180 };
  if (height < 6.0) return { r: 220, g: 60, b: 140 };
  return { r: 240, g: 50, b: 100 };
}

function seedHash(lat: number, lng: number): number {
  let h = 0;
  const s = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h;
}

function seededRandom(seed: number, index: number): number {
  let x = Math.sin(seed * 9301 + index * 49297 + 233280) * 49297;
  return x - Math.floor(x);
}

function getMapPaneOffset(map: L.Map): { x: number; y: number } {
  const container = map.getContainer();
  const mapPane = container.querySelector(".leaflet-map-pane") as HTMLElement | null;
  if (!mapPane) return { x: 0, y: 0 };
  const transform = mapPane.style.transform;
  if (!transform) return { x: 0, y: 0 };
  const match = transform.match(/translate3d\(([^,]+),\s*([^,]+)/);
  if (!match) return { x: 0, y: 0 };
  return { x: parseFloat(match[1]), y: parseFloat(match[2]) };
}

function projectGridToScreen(points: GridPoint[], map: L.Map): ScreenPoint[] {
  const offset = getMapPaneOffset(map);
  return points.map((pt) => {
    const pixel = map.latLngToContainerPoint([pt.lat, pt.lng]);
    const rad = (pt.windDir * Math.PI) / 180;
    const knots = pt.windSpeed * 0.5399;
    return {
      x: pixel.x - offset.x,
      y: pixel.y - offset.y,
      u: -Math.sin(rad) * knots,
      v: -Math.cos(rad) * knots,
      speed: knots,
    };
  });
}

function interpolateWind(
  x: number,
  y: number,
  screenPoints: ScreenPoint[],
  maxDist: number = 2000
): { u: number; v: number; speed: number } | null {
  if (screenPoints.length === 0) return null;

  let totalWeight = 0;
  let u = 0;
  let v = 0;
  let speed = 0;
  const maxDistSq = maxDist * maxDist;

  for (const sp of screenPoints) {
    const dx = x - sp.x;
    const dy = y - sp.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > maxDistSq) continue;
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

export function WindWaveLayer({ showWind, showWaves }: WindWaveLayerProps) {
  const map = useMap();
  const particleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [points, setPoints] = useState<GridPoint[]>([]);
  const pointsRef = useRef<GridPoint[]>([]);
  const fetchTimeoutRef = useRef<NodeJS.Timeout>();
  const lastBoundsRef = useRef<string>("");
  const animFrameRef = useRef<number>(0);
  const waveAnimFrameRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const screenPointsRef = useRef<ScreenPoint[]>([]);
  const zoomRef = useRef<number>(map.getZoom());
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  pointsRef.current = points;

  const visible = showWind || showWaves;

  useEffect(() => {
    const container = map.getContainer();
    const mapPane = container.querySelector(".leaflet-map-pane") as HTMLElement;
    if (!mapPane) return;

    let overlay = mapPane.querySelector(".wind-wave-overlay") as HTMLElement | null;
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "wind-wave-overlay";

      const rect = container.getBoundingClientRect();
      overlay.style.cssText = `position:absolute;top:0;left:0;width:${Math.round(rect.width)}px;height:${Math.round(rect.height)}px;pointer-events:none;z-index:450;overflow:hidden;`;

      const markerPane = mapPane.querySelector(".leaflet-marker-pane");
      if (markerPane) {
        mapPane.insertBefore(overlay, markerPane);
      } else {
        mapPane.appendChild(overlay);
      }
    }
    setPortalTarget(overlay);

    const syncOverlaySize = () => {
      if (!overlay) return;
      const rect = container.getBoundingClientRect();
      overlay.style.width = `${Math.round(rect.width)}px`;
      overlay.style.height = `${Math.round(rect.height)}px`;
      const offset = getMapPaneOffset(map);
      overlay.style.left = `${-offset.x}px`;
      overlay.style.top = `${-offset.y}px`;
    };

    map.on("move", syncOverlaySize);
    map.on("resize", syncOverlaySize);
    syncOverlaySize();

    return () => {
      map.off("move", syncOverlaySize);
      map.off("resize", syncOverlaySize);
      overlay?.remove();
    };
  }, [map]);

  const fetchGridData = useCallback(async () => {
    const bounds = map.getBounds();
    const zoom = Math.round(map.getZoom());
    const boundsKey = `${bounds.getSouth().toFixed(2)},${bounds.getNorth().toFixed(2)},${bounds.getWest().toFixed(2)},${bounds.getEast().toFixed(2)},z${zoom}`;

    if (boundsKey === lastBoundsRef.current) return;
    lastBoundsRef.current = boundsKey;

    try {
      const res = await fetch(
        `/api/grid-weather?south=${bounds.getSouth()}&north=${bounds.getNorth()}&west=${bounds.getWest()}&east=${bounds.getEast()}`
      );
      if (res.ok) {
        const data = await res.json();
        setPoints(data.points || []);
      } else {
        lastBoundsRef.current = "";
      }
    } catch {
      lastBoundsRef.current = "";
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

  const syncCanvasSize = useCallback((canvas: HTMLCanvasElement) => {
    const container = map.getContainer();
    const rect = container.getBoundingClientRect();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return { w, h };
  }, [map]);

  useEffect(() => {
    if (!showWaves || points.length === 0) {
      if (waveAnimFrameRef.current) cancelAnimationFrame(waveAnimFrameRef.current);
      const canvas = waveCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    const canvas = waveCanvasRef.current;
    if (!canvas) return;

    syncCanvasSize(canvas);
    let startTime = performance.now();

    const drawWaves = (timestamp: number) => {
      if (!showWaves) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      syncCanvasSize(canvas);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const elapsed = (timestamp - startTime) / 1000;
      const zoom = map.getZoom();
      const paneOffset = getMapPaneOffset(map);

      for (const pt of points) {
        if (pt.waveHeight === null || pt.waveHeight <= 0) continue;

        const hash = seedHash(pt.lat, pt.lng);
        const offsetX = (seededRandom(hash, 0) - 0.5) * 40;
        const offsetY = (seededRandom(hash, 1) - 0.5) * 40;
        const sizeVar = 0.7 + seededRandom(hash, 2) * 0.6;
        const phaseOffset = seededRandom(hash, 3);
        const ringCount = 2 + Math.floor(seededRandom(hash, 4) * 2);

        const pixel = map.latLngToContainerPoint([pt.lat, pt.lng]);
        const x = pixel.x - paneOffset.x + offsetX;
        const y = pixel.y - paneOffset.y + offsetY;
        if (x < -80 || x > canvas.width + 80 || y < -80 || y > canvas.height + 80)
          continue;

        const col = getWaveRingColor(pt.waveHeight);
        const period = pt.wavePeriod || 8;
        const speed = period * 0.35;
        const phase = ((elapsed / speed + phaseOffset) % 1 + 1) % 1;
        const maxR = (14 + Math.min(pt.waveHeight * 5, 20)) * sizeVar;

        const waveDir = pt.waveDir != null ? (pt.waveDir * Math.PI) / 180 : null;

        for (let ring = 0; ring < ringCount; ring++) {
          const ringPhase = ((phase + ring / ringCount) % 1 + 1) % 1;
          const r = Math.max(0, ringPhase * maxR);
          const ringAlpha = (1 - ringPhase) * 0.45;

          if (ringAlpha < 0.02 || r < 1) continue;

          ctx.beginPath();
          if (waveDir !== null) {
            const arcSpan = Math.PI * (0.6 + seededRandom(hash, 5 + ring) * 0.3);
            const startAngle = waveDir - arcSpan / 2;
            const endAngle = waveDir + arcSpan / 2;
            ctx.arc(x, y, r, startAngle, endAngle);
          } else {
            ctx.arc(x, y, r, 0, Math.PI * 2);
          }
          ctx.strokeStyle = `rgba(${col.r}, ${col.g}, ${col.b}, ${ringAlpha})`;
          ctx.lineWidth = 1.2 + (1 - ringPhase) * 1.8;
          ctx.stroke();
        }

        const ft = (pt.waveHeight * 3.28).toFixed(1);
        ctx.font = "bold 9px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = `rgba(${col.r}, ${col.g}, ${col.b}, 0.85)`;
        ctx.fillText(`${ft}ft`, x, y + maxR + 10);
      }

      waveAnimFrameRef.current = requestAnimationFrame(drawWaves);
    };

    waveAnimFrameRef.current = requestAnimationFrame(drawWaves);

    const onMove = () => {
      startTime = performance.now();
    };
    map.on("moveend", onMove);
    map.on("zoomend", onMove);

    return () => {
      if (waveAnimFrameRef.current) cancelAnimationFrame(waveAnimFrameRef.current);
      map.off("moveend", onMove);
      map.off("zoomend", onMove);
    };
  }, [points, showWaves, map, syncCanvasSize]);

  useEffect(() => {
    if (!showWind || points.length === 0) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      const canvas = particleCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    const canvas = particleCanvasRef.current;
    if (!canvas) return;

    const { w: cw, h: ch } = syncCanvasSize(canvas);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, cw, ch);

    zoomRef.current = map.getZoom();
    let zp = getZoomParams(zoomRef.current);

    const createParticle = (w: number, h: number, maxAge: number): Particle => {
      const x = Math.random() * w;
      const y = Math.random() * h;
      return { x, y, prevX: x, prevY: y, age: Math.floor(Math.random() * maxAge), maxAge: maxAge + Math.floor(Math.random() * 40) };
    };

    particlesRef.current = Array.from({ length: zp.particleCount }, () => createParticle(cw, ch, zp.maxAge));
    screenPointsRef.current = projectGridToScreen(pointsRef.current, map);

    let dirty = false;
    let zoomDirty = false;
    let prevOrigin = map.getPixelOrigin();

    const onMove = () => { dirty = true; };
    const onZoom = () => { dirty = true; zoomDirty = true; };

    map.on("move", onMove);
    map.on("zoom", onZoom);
    map.on("moveend", onMove);
    map.on("zoomend", onZoom);

    const animate = () => {
      if (!showWind) return;

      const w = canvas.width;
      const h = canvas.height;

      if (dirty) {
        syncCanvasSize(canvas);
        const newOrigin = map.getPixelOrigin();
        const dx = prevOrigin.x - newOrigin.x;
        const dy = prevOrigin.y - newOrigin.y;

        if (!zoomDirty && (dx !== 0 || dy !== 0)) {
          for (const p of particlesRef.current) {
            p.x += dx;
            p.y += dy;
            p.prevX += dx;
            p.prevY += dy;
          }

          if (ctx.globalCompositeOperation !== "copy") {
            const imageData = ctx.getImageData(0, 0, w, h);
            ctx.clearRect(0, 0, w, h);
            ctx.putImageData(imageData, dx, dy);
          }
        }

        prevOrigin = newOrigin;
        screenPointsRef.current = projectGridToScreen(pointsRef.current, map);
        dirty = false;
      }

      if (zoomDirty) {
        const newZoom = map.getZoom();
        if (newZoom !== zoomRef.current) {
          zoomRef.current = newZoom;
          const newZp = getZoomParams(newZoom);
          const targetCount = newZp.particleCount;
          const currentParticles = particlesRef.current;
          if (currentParticles.length > targetCount) {
            particlesRef.current = currentParticles.slice(0, targetCount);
          } else if (currentParticles.length < targetCount) {
            const extra = Array.from(
              { length: targetCount - currentParticles.length },
              () => createParticle(canvas.width, canvas.height, newZp.maxAge)
            );
            particlesRef.current = [...currentParticles, ...extra];
          }
          zp = newZp;
        }
        ctx.clearRect(0, 0, w, h);
        zoomDirty = false;
      }

      ctx.globalCompositeOperation = "destination-in";
      ctx.fillStyle = `rgba(0, 0, 0, ${zp.trailFade})`;
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = "source-over";

      const spts = screenPointsRef.current;
      const speedFactor = zp.speedScale;
      const maxVel = 3;

      for (const p of particlesRef.current) {
        const wind = interpolateWind(p.x, p.y, spts, zp.interpRadius);
        if (!wind || wind.speed < 0.1) {
          p.age = p.maxAge;
          continue;
        }

        p.prevX = p.x;
        p.prevY = p.y;

        const vel = Math.min(wind.speed * speedFactor, maxVel);
        const mag = Math.sqrt(wind.u * wind.u + wind.v * wind.v);
        if (mag > 0.01) {
          p.x += (wind.u / mag) * vel;
          p.y -= (wind.v / mag) * vel;
        }
        p.age++;

        if (p.x < 0 || p.x > w || p.y < 0 || p.y > h || p.age >= p.maxAge) {
          p.x = Math.random() * w;
          p.y = Math.random() * h;
          p.prevX = p.x;
          p.prevY = p.y;
          p.age = 0;
          p.maxAge = zp.maxAge + Math.floor(Math.random() * 40);
          continue;
        }

        const ageFraction = p.age < 8
          ? p.age / 8
          : p.age > p.maxAge - 8
            ? (p.maxAge - p.age) / 8
            : 1;
        const alpha = (0.4 + Math.min(wind.speed * 0.025, 0.55)) * ageFraction;
        const color = getWindColor(wind.speed, alpha);

        ctx.beginPath();
        ctx.moveTo(p.prevX, p.prevY);
        ctx.lineTo(p.x, p.y);
        ctx.strokeStyle = color;
        ctx.lineWidth = zp.lineWidth + Math.min(wind.speed * 0.03, 1.2);
        ctx.stroke();
      }

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      map.off("move", onMove);
      map.off("zoom", onZoom);
      map.off("moveend", onMove);
      map.off("zoomend", onZoom);
    };
  }, [points, showWind, map, syncCanvasSize]);

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (waveAnimFrameRef.current) cancelAnimationFrame(waveAnimFrameRef.current);
    };
  }, []);

  if (!portalTarget || !visible) return null;

  const canvasStyle: React.CSSProperties = {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    pointerEvents: "none",
  };

  return createPortal(
    <>
      {showWaves && (
        <canvas
          ref={waveCanvasRef}
          style={canvasStyle}
          data-testid="canvas-waves"
        />
      )}
      {showWind && (
        <canvas
          ref={particleCanvasRef}
          style={canvasStyle}
          data-testid="canvas-particles"
        />
      )}
    </>,
    portalTarget
  );
}
