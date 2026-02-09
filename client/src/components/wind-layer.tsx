import { useEffect, useRef, useState, useCallback } from "react";
import { useMap, useMapEvents } from "react-leaflet";
import { createPortal } from "react-dom";
import { WindGL, encodeWindToTexture } from "./webgl-wind";

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

interface WindWaveLayerProps {
  showWind: boolean;
  showWaves: boolean;
}

interface Particle {
  x: number;
  y: number;
  age: number;
  maxAge: number;
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

function getWindColor(speed: number): string {
  if (speed < 5) return `rgba(80, 180, 255, 0.7)`;
  if (speed < 10) return `rgba(60, 210, 170, 0.7)`;
  if (speed < 15) return `rgba(100, 230, 80, 0.7)`;
  if (speed < 20) return `rgba(200, 230, 50, 0.7)`;
  if (speed < 30) return `rgba(255, 190, 30, 0.7)`;
  if (speed < 40) return `rgba(255, 110, 30, 0.7)`;
  return `rgba(255, 50, 50, 0.7)`;
}

function interpolateWind(
  x: number,
  y: number,
  points: GridPoint[],
  map: L.Map,
  paneOffset: { x: number; y: number }
): { u: number; v: number; speed: number } | null {
  let totalW = 0, uSum = 0, vSum = 0, speedSum = 0;
  for (const pt of points) {
    const px = map.latLngToContainerPoint([pt.lat, pt.lng]);
    const sx = px.x - paneOffset.x;
    const sy = px.y - paneOffset.y;
    const dx = x - sx;
    const dy = y - sy;
    const d2 = dx * dx + dy * dy;
    if (d2 < 1) {
      const rad = (pt.windDir * Math.PI) / 180;
      return {
        u: -Math.sin(rad) * pt.windSpeed,
        v: -Math.cos(rad) * pt.windSpeed,
        speed: pt.windSpeed,
      };
    }
    const w = 1 / (d2 * d2);
    totalW += w;
    const rad = (pt.windDir * Math.PI) / 180;
    uSum += -Math.sin(rad) * pt.windSpeed * w;
    vSum += -Math.cos(rad) * pt.windSpeed * w;
    speedSum += pt.windSpeed * w;
  }
  if (totalW === 0) return null;
  return { u: uSum / totalW, v: vSum / totalW, speed: speedSum / totalW };
}

export function WindWaveLayer({ showWind, showWaves }: WindWaveLayerProps) {
  const map = useMap();
  const windCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const windGlRef = useRef<WindGL | null>(null);
  const animFrameRef = useRef<number>(0);
  const waveAnimFrameRef = useRef<number>(0);
  const fallbackAnimRef = useRef<number>(0);
  const [points, setPoints] = useState<GridPoint[]>([]);
  const pointsRef = useRef<GridPoint[]>([]);
  const fetchTimeoutRef = useRef<NodeJS.Timeout>();
  const lastBoundsRef = useRef<string>("");
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const windDataBoundsRef = useRef<{ south: number; north: number; west: number; east: number }>({ south: -90, north: 90, west: -180, east: 180 });
  const webglSupported = useRef<boolean | null>(null);

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

  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<NodeJS.Timeout>();

  const fetchGridData = useCallback(async (isRetry = false) => {
    const bounds = map.getBounds();
    const boundsKey = `${bounds.getSouth().toFixed(1)},${bounds.getNorth().toFixed(1)},${bounds.getWest().toFixed(1)},${bounds.getEast().toFixed(1)}`;

    if (!isRetry && boundsKey === lastBoundsRef.current) return;
    lastBoundsRef.current = boundsKey;

    try {
      const res = await fetch(
        `/api/grid-weather?south=${bounds.getSouth()}&north=${bounds.getNorth()}&west=${bounds.getWest()}&east=${bounds.getEast()}`
      );
      if (res.ok) {
        const data = await res.json();
        const pts = data.points || [];
        if (pts.length > 0) {
          retryCountRef.current = 0;
          setPoints(pts);
        } else if (retryCountRef.current < 3) {
          retryCountRef.current++;
          const delay = Math.min(5000 * Math.pow(2, retryCountRef.current - 1), 30000);
          lastBoundsRef.current = "";
          retryTimerRef.current = setTimeout(() => fetchGridData(true), delay);
        }
      } else if (res.status === 429 && retryCountRef.current < 3) {
        retryCountRef.current++;
        const delay = Math.min(5000 * Math.pow(2, retryCountRef.current - 1), 30000);
        lastBoundsRef.current = "";
        retryTimerRef.current = setTimeout(() => fetchGridData(true), delay);
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
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [visible, fetchGridData]);

  const syncCanvasSize = useCallback((canvas: HTMLCanvasElement) => {
    const container = map.getContainer();
    const rect = container.getBoundingClientRect();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      return true;
    }
    return false;
  }, [map]);

  useEffect(() => {
    if (!showWind || points.length === 0 || !portalTarget) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (windGlRef.current) {
        windGlRef.current.destroy();
        windGlRef.current = null;
      }
      if (fallbackAnimRef.current) cancelAnimationFrame(fallbackAnimRef.current);
      return;
    }

    const canvas = windCanvasRef.current;
    if (!canvas) return;

    syncCanvasSize(canvas);

    if (webglSupported.current === null) {
      const testGl = canvas.getContext("webgl", { premultipliedAlpha: false, alpha: true });
      webglSupported.current = !!testGl;
    }

    if (webglSupported.current) {
      const gl = canvas.getContext("webgl", { premultipliedAlpha: false, alpha: true });
      if (!gl) {
        webglSupported.current = false;
      } else {
        return initWebGL(gl, canvas);
      }
    }

    return initCanvas2DFallback(canvas);
  }, [points, showWind, map, syncCanvasSize, portalTarget]);

  function initWebGL(gl: WebGLRenderingContext, canvas: HTMLCanvasElement) {
    const wind = new WindGL(gl);
    windGlRef.current = wind;

    const bounds = map.getBounds();
    const south = bounds.getSouth();
    const north = bounds.getNorth();
    const west = bounds.getWest();
    const east = bounds.getEast();

    windDataBoundsRef.current = { south, north, west, east };

    const windData = encodeWindToTexture(points, south, north, west, east, 64, 32);
    wind.setWind(windData);
    wind.setBBox(south, north, west, east);

    const zoom = map.getZoom();
    if (zoom > 8) {
      wind.setNumParticles(16384);
      wind.speedFactor = 0.15;
    } else if (zoom > 5) {
      wind.setNumParticles(32768);
      wind.speedFactor = 0.20;
    } else {
      wind.setNumParticles(65536);
      wind.speedFactor = 0.25;
    }

    const updateViewport = () => {
      const container = map.getContainer();
      const rect = container.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      const db = windDataBoundsRef.current;

      const tlScreen = map.latLngToContainerPoint([db.north, db.west]);
      const brScreen = map.latLngToContainerPoint([db.south, db.east]);

      const tlX = tlScreen.x / w;
      const tlY = tlScreen.y / h;
      const brX = brScreen.x / w;
      const brY = brScreen.y / h;

      const scaleX = brX - tlX;
      const scaleY = brY - tlY;

      wind.setViewport([tlX, 1.0 - brY], [scaleX, scaleY]);
    };

    updateViewport();

    const onMove = () => {
      updateViewport();
    };

    const onResize = () => {
      if (syncCanvasSize(canvas)) {
        wind.resizeScreen();
      }
    };

    map.on("move", onMove);
    map.on("zoom", onMove);
    map.on("moveend", onMove);
    map.on("zoomend", onMove);
    map.on("resize", onResize);

    const animate = () => {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      wind.draw();
      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      map.off("move", onMove);
      map.off("zoom", onMove);
      map.off("moveend", onMove);
      map.off("zoomend", onMove);
      map.off("resize", onResize);
      wind.destroy();
      windGlRef.current = null;
    };
  }

  function initCanvas2DFallback(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const PARTICLE_COUNT = 2000;
    const particles: Particle[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        age: Math.floor(Math.random() * 120),
        maxAge: 80 + Math.floor(Math.random() * 80),
      });
    }

    const resetParticle = (p: Particle) => {
      p.x = Math.random() * canvas.width;
      p.y = Math.random() * canvas.height;
      p.age = 0;
      p.maxAge = 80 + Math.floor(Math.random() * 80);
    };

    const ptsRef = pointsRef;

    const animate = () => {
      syncCanvasSize(canvas);
      ctx.globalCompositeOperation = "destination-in";
      ctx.fillStyle = "rgba(0, 0, 0, 0.92)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "source-over";

      const paneOffset = getMapPaneOffset(map);

      for (const p of particles) {
        const wind = interpolateWind(p.x, p.y, ptsRef.current, map, paneOffset);
        if (!wind) {
          resetParticle(p);
          continue;
        }

        const prevX = p.x;
        const prevY = p.y;
        const speedScale = 0.12;
        p.x += wind.u * speedScale;
        p.y -= wind.v * speedScale;
        p.age++;

        if (p.age > p.maxAge || p.x < 0 || p.x > canvas.width || p.y < 0 || p.y > canvas.height) {
          resetParticle(p);
          continue;
        }

        const fade = 1 - (p.age / p.maxAge);
        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(p.x, p.y);
        ctx.strokeStyle = getWindColor(wind.speed);
        ctx.globalAlpha = fade * 0.6;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      fallbackAnimRef.current = requestAnimationFrame(animate);
    };

    fallbackAnimRef.current = requestAnimationFrame(animate);

    const onMoveEnd = () => {};
    map.on("moveend", onMoveEnd);

    return () => {
      if (fallbackAnimRef.current) cancelAnimationFrame(fallbackAnimRef.current);
      map.off("moveend", onMoveEnd);
    };
  }

  useEffect(() => {
    if (!showWaves || points.length === 0 || !portalTarget) {
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
  }, [points, showWaves, map, syncCanvasSize, portalTarget]);

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (waveAnimFrameRef.current) cancelAnimationFrame(waveAnimFrameRef.current);
      if (fallbackAnimRef.current) cancelAnimationFrame(fallbackAnimRef.current);
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
          ref={windCanvasRef}
          style={canvasStyle}
          data-testid="canvas-particles"
        />
      )}
    </>,
    portalTarget
  );
}
