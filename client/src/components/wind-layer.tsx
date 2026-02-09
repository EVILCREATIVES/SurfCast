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

interface WindWaveLayerProps {
  showWind: boolean;
  showWaves: boolean;
}

interface FlowParticle {
  x: number;
  y: number;
  age: number;
  maxAge: number;
  trail: { x: number; y: number }[];
  speed: number;
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

interface WindField {
  width: number;
  height: number;
  uField: Float32Array;
  vField: Float32Array;
  speedField: Float32Array;
}

function buildWindField(
  points: GridPoint[],
  bounds: { south: number; north: number; west: number; east: number },
  resolution: number = 100
): WindField {
  const width = resolution;
  const height = Math.round(resolution * 0.6);
  const uField = new Float32Array(width * height);
  const vField = new Float32Array(width * height);
  const speedField = new Float32Array(width * height);

  const uArr: number[] = [];
  const vArr: number[] = [];
  for (const pt of points) {
    const rad = (pt.windDir * Math.PI) / 180;
    uArr.push(-Math.sin(rad) * pt.windSpeed);
    vArr.push(-Math.cos(rad) * pt.windSpeed);
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const lon = bounds.west + (x / (width - 1)) * (bounds.east - bounds.west);
      const lat = bounds.north - (y / (height - 1)) * (bounds.north - bounds.south);

      let totalW = 0, uInterp = 0, vInterp = 0;
      for (let i = 0; i < points.length; i++) {
        const dlat = lat - points[i].lat;
        const dlng = lon - points[i].lng;
        const d2 = dlat * dlat + dlng * dlng;
        if (d2 < 0.01) {
          uInterp = uArr[i];
          vInterp = vArr[i];
          totalW = 1;
          break;
        }
        const w = 1 / (d2 * d2);
        totalW += w;
        uInterp += uArr[i] * w;
        vInterp += vArr[i] * w;
      }
      if (totalW > 0) {
        uInterp /= totalW;
        vInterp /= totalW;
      }

      const idx = y * width + x;
      uField[idx] = uInterp;
      vField[idx] = vInterp;
      speedField[idx] = Math.sqrt(uInterp * uInterp + vInterp * vInterp);
    }
  }

  return { width, height, uField, vField, speedField };
}

function sampleWindField(
  field: WindField,
  normX: number,
  normY: number
): { u: number; v: number; speed: number } {
  const fx = normX * (field.width - 1);
  const fy = normY * (field.height - 1);
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const dx = fx - ix;
  const dy = fy - iy;

  const x0 = Math.max(0, Math.min(ix, field.width - 1));
  const x1 = Math.max(0, Math.min(ix + 1, field.width - 1));
  const y0 = Math.max(0, Math.min(iy, field.height - 1));
  const y1 = Math.max(0, Math.min(iy + 1, field.height - 1));

  const i00 = y0 * field.width + x0;
  const i10 = y0 * field.width + x1;
  const i01 = y1 * field.width + x0;
  const i11 = y1 * field.width + x1;

  const u = (1 - dx) * (1 - dy) * field.uField[i00] + dx * (1 - dy) * field.uField[i10] +
            (1 - dx) * dy * field.uField[i01] + dx * dy * field.uField[i11];
  const v = (1 - dx) * (1 - dy) * field.vField[i00] + dx * (1 - dy) * field.vField[i10] +
            (1 - dx) * dy * field.vField[i01] + dx * dy * field.vField[i11];
  const speed = (1 - dx) * (1 - dy) * field.speedField[i00] + dx * (1 - dy) * field.speedField[i10] +
                (1 - dx) * dy * field.speedField[i01] + dx * dy * field.speedField[i11];

  return { u, v, speed };
}

function getWindColor(speed: number): [number, number, number] {
  if (speed < 5) return [100, 200, 255];
  if (speed < 10) return [80, 220, 190];
  if (speed < 15) return [100, 230, 80];
  if (speed < 20) return [200, 230, 50];
  if (speed < 30) return [255, 200, 50];
  if (speed < 40) return [255, 130, 40];
  return [255, 70, 70];
}

export function WindWaveLayer({ showWind, showWaves }: WindWaveLayerProps) {
  const map = useMap();
  const windCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const windAnimRef = useRef<number>(0);
  const waveAnimFrameRef = useRef<number>(0);
  const [points, setPoints] = useState<GridPoint[]>([]);
  const pointsRef = useRef<GridPoint[]>([]);
  const fetchTimeoutRef = useRef<NodeJS.Timeout>();
  const lastBoundsRef = useRef<string>("");
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
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = `${Math.round(rect.width)}px`;
      canvas.style.height = `${Math.round(rect.height)}px`;
      return true;
    }
    return false;
  }, [map]);

  useEffect(() => {
    if (!showWind || points.length === 0 || !portalTarget) {
      if (windAnimRef.current) cancelAnimationFrame(windAnimRef.current);
      return;
    }

    const canvas = windCanvasRef.current;
    if (!canvas) return;

    syncCanvasSize(canvas);
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const bounds = map.getBounds();
    const dataBounds = {
      south: bounds.getSouth(),
      north: bounds.getNorth(),
      west: bounds.getWest(),
      east: bounds.getEast(),
    };

    const windField = buildWindField(points, dataBounds, 120);

    let maxSpeed = 0;
    for (let i = 0; i < windField.speedField.length; i++) {
      if (windField.speedField[i] > maxSpeed) maxSpeed = windField.speedField[i];
    }
    if (maxSpeed < 1) maxSpeed = 1;

    const zoom = map.getZoom();
    const PARTICLE_COUNT = zoom > 8 ? 3000 : zoom > 5 ? 5000 : 8000;
    const TRAIL_LENGTH = zoom > 8 ? 20 : zoom > 5 ? 30 : 40;
    const SPEED_SCALE = zoom > 8 ? 0.4 : zoom > 5 ? 0.8 : 1.2;

    const particles: FlowParticle[] = [];

    const resetParticle = (p: FlowParticle) => {
      const container = map.getContainer();
      const rect = container.getBoundingClientRect();
      p.x = Math.random() * rect.width;
      p.y = Math.random() * rect.height;
      p.age = 0;
      p.maxAge = TRAIL_LENGTH + Math.floor(Math.random() * TRAIL_LENGTH);
      p.trail = [{ x: p.x, y: p.y }];
      p.speed = 0;
    };

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p: FlowParticle = { x: 0, y: 0, age: 0, maxAge: 0, trail: [], speed: 0 };
      resetParticle(p);
      p.age = Math.floor(Math.random() * p.maxAge);
    particles.push(p);
    }

    let running = true;

    const animate = () => {
      if (!running) return;

      syncCanvasSize(canvas);
      const container = map.getContainer();
      const rect = container.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const paneOffset = getMapPaneOffset(map);
      const currentBounds = map.getBounds();
      const cSouth = currentBounds.getSouth();
      const cNorth = currentBounds.getNorth();
      const cWest = currentBounds.getWest();
      const cEast = currentBounds.getEast();

      for (const p of particles) {
        const screenX = p.x + paneOffset.x;
        const screenY = p.y + paneOffset.y;

        const latlng = map.containerPointToLatLng([screenX, screenY]);
        const lat = latlng.lat;
        const lng = latlng.lng;

        const normX = (lng - dataBounds.west) / (dataBounds.east - dataBounds.west);
        const normY = (dataBounds.north - lat) / (dataBounds.north - dataBounds.south);

        if (normX < 0 || normX > 1 || normY < 0 || normY > 1) {
          resetParticle(p);
          continue;
        }

        const wind = sampleWindField(windField, normX, normY);
        p.speed = wind.speed;

        const speedNorm = wind.speed / maxSpeed;
        const moveScale = SPEED_SCALE * (0.5 + speedNorm * 1.5);

        p.x += wind.u * moveScale * 0.06;
        p.y -= wind.v * moveScale * 0.06;
        p.age++;

        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > TRAIL_LENGTH) {
          p.trail.shift();
        }

        if (
          p.age > p.maxAge ||
          p.x < -20 || p.x > w + 20 ||
          p.y < -20 || p.y > h + 20
        ) {
          resetParticle(p);
          continue;
        }

        if (p.trail.length < 2) continue;

        const [r, g, b] = getWindColor(wind.speed);
        const trailLen = p.trail.length;

        ctx.beginPath();
        ctx.moveTo(p.trail[0].x, p.trail[0].y);
        for (let t = 1; t < trailLen; t++) {
          ctx.lineTo(p.trail[t].x, p.trail[t].y);
        }

        const ageRatio = p.age / p.maxAge;
        const headAlpha = ageRatio < 0.1 ? ageRatio / 0.1 : ageRatio > 0.8 ? (1 - ageRatio) / 0.2 : 1;
        const baseAlpha = 0.6 * headAlpha * (0.4 + speedNorm * 0.6);

        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${baseAlpha})`;
        ctx.lineWidth = 1.0 + speedNorm * 1.0;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
      }

      windAnimRef.current = requestAnimationFrame(animate);
    };

    windAnimRef.current = requestAnimationFrame(animate);

    const onMove = () => {};
    map.on("moveend", onMove);

    return () => {
      running = false;
      if (windAnimRef.current) cancelAnimationFrame(windAnimRef.current);
      map.off("moveend", onMove);
    };
  }, [points, showWind, map, syncCanvasSize, portalTarget]);

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
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const drawWaves = (timestamp: number) => {
      if (!showWaves) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      syncCanvasSize(canvas);
      const container = map.getContainer();
      const rect = container.getBoundingClientRect();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);

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
        if (x < -80 || x > rect.width + 80 || y < -80 || y > rect.height + 80)
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
      if (windAnimRef.current) cancelAnimationFrame(windAnimRef.current);
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
          ref={windCanvasRef}
          style={canvasStyle}
          data-testid="canvas-particles"
        />
      )}
    </>,
    portalTarget
  );
}
