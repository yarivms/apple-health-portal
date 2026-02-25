import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  MapPin, Calendar, Clock, Zap, Gauge, TrendingUp, Heart,
  ChevronLeft, Filter, ArrowUpDown, Flame, Footprints, Mountain, Timer
} from 'lucide-react';
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import './WorkoutStore.css';

// ---- helpers ----------------------------------------------------------------

const ACTIVITY_META = {
  HKWorkoutActivityTypeRunning: { label: 'Running', icon: '🏃', color: '#FF3B30' },
  HKWorkoutActivityTypeWalking: { label: 'Walking', icon: '🚶', color: '#34C759' },
  HKWorkoutActivityTypeHiking:  { label: 'Hiking',  icon: '🥾', color: '#FF9500' },
  HKWorkoutActivityTypeCycling: { label: 'Cycling', icon: '🚴', color: '#007AFF' },
  HKWorkoutActivityTypeSwimming: { label: 'Swimming', icon: '🏊', color: '#5AC8FA' },
  HKWorkoutActivityTypeYoga:     { label: 'Yoga',     icon: '🧘', color: '#AF52DE' },
  HKWorkoutActivityTypeFunctionalStrengthTraining: { label: 'Strength', icon: '💪', color: '#FF2D55' },
  HKWorkoutActivityTypeTraditionalStrengthTraining: { label: 'Strength', icon: '🏋️', color: '#FF2D55' },
  HKWorkoutActivityTypeElliptical: { label: 'Elliptical', icon: '🔵', color: '#5856D6' },
  HKWorkoutActivityTypeCoreTraining: { label: 'Core', icon: '🔥', color: '#FF9500' },
  HKWorkoutActivityTypeHighIntensityIntervalTraining: { label: 'HIIT', icon: '⚡', color: '#FF3B30' },
  HKWorkoutActivityTypeCooldown: { label: 'Cooldown', icon: '❄️', color: '#5AC8FA' },
};

function activityInfo(type) {
  return ACTIVITY_META[type] || { label: type?.replace('HKWorkoutActivityType', '') || 'Workout', icon: '🏋️', color: '#8E8E93' };
}

function formatDuration(seconds) {
  const s = parseFloat(seconds);
  if (!s || isNaN(s)) return '--';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function formatDistance(meters, unit) {
  const d = parseFloat(meters);
  if (!d || isNaN(d)) return null;
  if (unit?.toLowerCase().includes('mi')) return { value: d.toFixed(2), unit: 'mi' };
  if (d > 1000 || unit?.toLowerCase().includes('km')) return { value: (d > 100 ? d : d * 1000 / 1000).toFixed(2), unit: 'km' };
  return { value: d.toFixed(2), unit: unit || 'km' };
}

function formatPace(durationSec, distKm) {
  if (!durationSec || !distKm || distKm <= 0) return null;
  const paceMin = (durationSec / 60) / distKm;
  const m = Math.floor(paceMin);
  const s = Math.round((paceMin - m) * 60);
  return `${m}'${s.toString().padStart(2, '0')}"`;
}

function formatCalories(val, unit) {
  const v = parseFloat(val);
  if (!v || isNaN(v)) return null;
  return `${Math.round(v)}`;
}

function parseAppleDate(dateStr) {
  if (!dateStr) return null;
  // "2024-09-08 07:12:58 +0200"
  const m = dateStr.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return new Date(dateStr);
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`);
}

function matchRouteToWorkout(workout, routes) {
  if (!routes || routes.length === 0 || !workout.startDate) return null;
  const wStart = parseAppleDate(workout.startDate);
  const wEnd = parseAppleDate(workout.endDate);
  if (!wStart) return null;

  // Try to find a route whose timestamps overlap the workout window
  for (const route of routes) {
    if (!route.points || route.points.length < 2) continue;
    const firstPoint = route.points[0];
    const lastPoint = route.points[route.points.length - 1];
    if (firstPoint.time) {
      const routeStart = new Date(firstPoint.time);
      const routeEnd = lastPoint.time ? new Date(lastPoint.time) : routeStart;
      // Overlap check with 5-minute grace
      const grace = 5 * 60 * 1000;
      if (routeEnd.getTime() + grace >= wStart.getTime() && routeStart.getTime() - grace <= (wEnd || wStart).getTime()) {
        return route;
      }
    }
    // Fallback: match by date in filename
    const dateInFilename = route.filename?.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (dateInFilename) {
      const routeDate = `${dateInFilename[1]}-${dateInFilename[2]}-${dateInFilename[3]}`;
      const workoutDate = workout.startDate?.substring(0, 10);
      if (routeDate === workoutDate) return route;
    }
  }
  return null;
}

// ---- small components -------------------------------------------------------

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) {
      const lats = points.map(p => p.lat).filter(Boolean);
      const lons = points.map(p => p.lon).filter(Boolean);
      if (lats.length > 1) {
        map.fitBounds([
          [Math.min(...lats), Math.min(...lons)],
          [Math.max(...lats), Math.max(...lons)]
        ], { padding: [30, 30] });
      }
    }
  }, [points, map]);
  return null;
}

function RouteMap({ points, color }) {
  if (!points || points.length < 2) return null;
  const positions = points.filter(p => p.lat && p.lon).map(p => [p.lat, p.lon]);
  if (positions.length < 2) return null;
  const startPos = positions[0];
  const endPos = positions[positions.length - 1];

  return (
    <MapContainer
      center={startPos}
      zoom={14}
      scrollWheelZoom={false}
      className="workout-map-container"
      attributionControl={false}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Polyline positions={positions} pathOptions={{ color: color || '#FF3B30', weight: 4, opacity: 0.9 }} />
      <CircleMarker center={startPos} radius={6} pathOptions={{ color: '#fff', fillColor: '#34C759', fillOpacity: 1, weight: 2 }} />
      <CircleMarker center={endPos}   radius={6} pathOptions={{ color: '#fff', fillColor: '#FF3B30', fillOpacity: 1, weight: 2 }} />
      <FitBounds points={points} />
    </MapContainer>
  );
}

function ElevationProfile({ points }) {
  if (!points || points.length < 10) return null;
  const elePoints = points.filter(p => p.elevation != null).map((p, i) => ({
    idx: i,
    ele: parseFloat(p.elevation)
  }));
  if (elePoints.length < 10) return null;

  const minEle = Math.min(...elePoints.map(p => p.ele));
  const maxEle = Math.max(...elePoints.map(p => p.ele));
  const range = maxEle - minEle || 1;
  const w = 100;
  const h = 40;

  const pathD = elePoints.map((p, i) => {
    const x = (i / (elePoints.length - 1)) * w;
    const y = h - ((p.ele - minEle) / range) * (h - 4) - 2;
    return `${i === 0 ? 'M' : 'L'}${x},${y}`;
  }).join(' ');

  return (
    <div className="elevation-profile">
      <div className="elevation-label">
        <Mountain size={14} />
        <span>{Math.round(minEle)}–{Math.round(maxEle)} m</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="elevation-svg">
        <path d={`${pathD} L${w},${h} L0,${h} Z`} fill="rgba(52,199,89,0.2)" stroke="none" />
        <path d={pathD} fill="none" stroke="#34C759" strokeWidth="0.8" />
      </svg>
    </div>
  );
}

function SpeedChart({ points }) {
  if (!points || points.length < 10) return null;
  const speedPoints = [];
  for (let i = 1; i < points.length; i++) {
    const p = points[i], prev = points[i - 1];
    if (!p.time || !prev.time || !p.lat || !prev.lat) continue;
    const dt = (new Date(p.time) - new Date(prev.time)) / 1000;
    if (dt <= 0) continue;
    const dLat = (p.lat - prev.lat) * 111000;
    const dLon = (p.lon - prev.lon) * 111000 * Math.cos(((p.lat + prev.lat) / 2) * Math.PI / 180);
    const dist = Math.sqrt(dLat * dLat + dLon * dLon);
    const speedKmh = (dist / dt) * 3.6;
    if (speedKmh < 60) speedPoints.push(speedKmh); // filter crazy values
  }
  if (speedPoints.length < 10) return null;

  // Smooth with moving average
  const smooth = [];
  const win = Math.max(3, Math.floor(speedPoints.length / 60));
  for (let i = 0; i < speedPoints.length; i++) {
    let sum = 0, cnt = 0;
    for (let j = Math.max(0, i - win); j <= Math.min(speedPoints.length - 1, i + win); j++) {
      sum += speedPoints[j]; cnt++;
    }
    smooth.push(sum / cnt);
  }

  const maxSpeed = Math.max(...smooth);
  const avgSpeed = smooth.reduce((a, b) => a + b, 0) / smooth.length;
  const w = 100, h = 30;

  const pathD = smooth.map((s, i) => {
    const x = (i / (smooth.length - 1)) * w;
    const y = h - (s / (maxSpeed || 1)) * (h - 4) - 2;
    return `${i === 0 ? 'M' : 'L'}${x},${y}`;
  }).join(' ');

  return (
    <div className="speed-chart">
      <div className="speed-label">
        <Gauge size={14} />
        <span>Avg {avgSpeed.toFixed(1)} km/h · Max {maxSpeed.toFixed(1)} km/h</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="speed-svg">
        <path d={`${pathD} L${w},${h} L0,${h} Z`} fill="rgba(0,122,255,0.15)" stroke="none" />
        <path d={pathD} fill="none" stroke="#007AFF" strokeWidth="0.8" />
      </svg>
    </div>
  );
}

function SplitsTable({ points }) {
  if (!points || points.length < 20) return null;
  // Calculate 1-km splits
  const splits = [];
  let accDist = 0;
  let splitStart = 0;
  let splitStartTime = points[0]?.time ? new Date(points[0].time) : null;

  for (let i = 1; i < points.length; i++) {
    const p = points[i], prev = points[i - 1];
    if (!p.lat || !prev.lat) continue;
    const dLat = (p.lat - prev.lat) * 111000;
    const dLon = (p.lon - prev.lon) * 111000 * Math.cos(((p.lat + prev.lat) / 2) * Math.PI / 180);
    accDist += Math.sqrt(dLat * dLat + dLon * dLon);

    if (accDist >= 1000) {
      const splitEndTime = p.time ? new Date(p.time) : null;
      let paceStr = '--';
      if (splitStartTime && splitEndTime) {
        const dtSec = (splitEndTime - splitStartTime) / 1000;
        const m = Math.floor(dtSec / 60);
        const s = Math.round(dtSec % 60);
        paceStr = `${m}'${s.toString().padStart(2, '0')}"`;
      }
      splits.push({ km: splits.length + 1, pace: paceStr });
      accDist -= 1000;
      splitStartTime = splitEndTime;
    }
  }
  if (splits.length === 0) return null;

  const fastest = splits.reduce((a, b) => a.pace < b.pace ? a : b);

  return (
    <div className="splits-section">
      <h4><Timer size={16} /> Splits</h4>
      <div className="splits-grid">
        {splits.map(s => (
          <div key={s.km} className={`split-row ${s.km === fastest.km ? 'fastest' : ''}`}>
            <span className="split-km">KM {s.km}</span>
            <span className="split-pace">{s.pace} /km</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- main component ---------------------------------------------------------

export default function WorkoutStore({ workouts, workoutRoutes, metricsByType }) {
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [filterType, setFilterType] = useState('all');
  const [sortBy, setSortBy] = useState('date');
  const listRef = useRef(null);

  // Build enriched workout list
  const enrichedWorkouts = useMemo(() => {
    if (!workouts || workouts.length === 0) return [];
    return workouts.map((w, idx) => {
      const info = activityInfo(w.workoutActivityType);
      const startDate = parseAppleDate(w.startDate);
      const endDate = parseAppleDate(w.endDate);
      const durationSec = parseFloat(w.duration) || (startDate && endDate ? (endDate - startDate) / 1000 : 0);
      const dist = formatDistance(w.totalDistance, w.totalDistanceUnit);
      const distKm = dist ? parseFloat(dist.value) * (dist.unit === 'mi' ? 1.609 : 1) : 0;
      const pace = formatPace(durationSec, distKm);
      const calories = formatCalories(w.totalEnergyBurned, w.totalEnergyBurnedUnit);
      const route = matchRouteToWorkout(w, workoutRoutes);

      return {
        ...w,
        idx,
        info,
        startDate,
        endDate,
        durationSec,
        durationStr: formatDuration(durationSec),
        dist,
        distKm,
        pace,
        calories,
        route,
        hasMap: !!route && route.points?.length >= 2,
      };
    });
  }, [workouts, workoutRoutes]);

  // Unique activity types
  const activityTypes = useMemo(() => {
    const types = new Set(enrichedWorkouts.map(w => w.workoutActivityType));
    return Array.from(types).sort();
  }, [enrichedWorkouts]);

  // Filter and sort
  const displayWorkouts = useMemo(() => {
    let list = enrichedWorkouts;
    if (filterType !== 'all') {
      list = list.filter(w => w.workoutActivityType === filterType);
    }
    if (sortBy === 'date') list = [...list].sort((a, b) => (b.startDate || 0) - (a.startDate || 0));
    if (sortBy === 'distance') list = [...list].sort((a, b) => b.distKm - a.distKm);
    if (sortBy === 'duration') list = [...list].sort((a, b) => b.durationSec - a.durationSec);
    if (sortBy === 'calories') list = [...list].sort((a, b) => (parseFloat(b.calories) || 0) - (parseFloat(a.calories) || 0));
    return list;
  }, [enrichedWorkouts, filterType, sortBy]);

  // Stats summary
  const stats = useMemo(() => {
    const list = displayWorkouts;
    const totalDist = list.reduce((s, w) => s + w.distKm, 0);
    const totalDur = list.reduce((s, w) => s + w.durationSec, 0);
    const totalCal = list.reduce((s, w) => s + (parseFloat(w.calories) || 0), 0);
    const withMap = list.filter(w => w.hasMap).length;
    return { count: list.length, totalDist, totalDur, totalCal, withMap };
  }, [displayWorkouts]);

  // --- Workout detail overlay ---
  if (selectedWorkout) {
    const w = selectedWorkout;
    return (
      <div className="workout-store">
        <div className="detail-view">
          <button className="back-btn" onClick={() => setSelectedWorkout(null)}>
            <ChevronLeft size={20} /> All Workouts
          </button>

          <div className="detail-header" style={{ borderLeftColor: w.info.color }}>
            <span className="detail-icon">{w.info.icon}</span>
            <div className="detail-title-group">
              <h2>{w.info.label}</h2>
              {w.startDate && (
                <p className="detail-date">
                  {w.startDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  {' · '}
                  {w.startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  {w.endDate && ` – ${w.endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`}
                </p>
              )}
            </div>
          </div>

          {/* Map */}
          {w.hasMap && (
            <div className="detail-map">
              <RouteMap points={w.route.points} color={w.info.color} />
            </div>
          )}

          {/* Key Stats Ring */}
          <div className="detail-stats-ring">
            {w.durationStr && w.durationStr !== '--' && (
              <div className="ring-stat">
                <Clock size={22} className="ring-icon" />
                <span className="ring-value">{w.durationStr}</span>
                <span className="ring-label">Duration</span>
              </div>
            )}
            {w.dist && (
              <div className="ring-stat">
                <MapPin size={22} className="ring-icon" />
                <span className="ring-value">{w.dist.value}</span>
                <span className="ring-label">{w.dist.unit}</span>
              </div>
            )}
            {w.pace && (
              <div className="ring-stat">
                <Gauge size={22} className="ring-icon" />
                <span className="ring-value">{w.pace}</span>
                <span className="ring-label">/km</span>
              </div>
            )}
            {w.calories && (
              <div className="ring-stat">
                <Flame size={22} className="ring-icon" />
                <span className="ring-value">{w.calories}</span>
                <span className="ring-label">kcal</span>
              </div>
            )}
          </div>

          {/* Elevation + Speed charts */}
          {w.route?.points && (
            <div className="detail-charts">
              <ElevationProfile points={w.route.points} />
              <SpeedChart points={w.route.points} />
            </div>
          )}

          {/* Splits */}
          {w.route?.points && <SplitsTable points={w.route.points} />}

          {/* Route meta */}
          {w.route && (
            <div className="route-meta">
              <span>{w.route.pointCount || w.route.points?.length} GPS points</span>
              {w.route.truncated && <span className="truncated-badge">Truncated</span>}
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- List view ---
  return (
    <div className="workout-store" ref={listRef}>
      <div className="store-header">
        <div>
          <h2>Workouts</h2>
          <p className="store-subtitle">{stats.count} workouts · {stats.totalDist.toFixed(1)} km · {formatDuration(stats.totalDur)}</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="store-summary">
        <div className="summary-card">
          <Footprints size={20} />
          <div><span className="sc-value">{stats.count}</span><span className="sc-label">Workouts</span></div>
        </div>
        <div className="summary-card">
          <MapPin size={20} />
          <div><span className="sc-value">{stats.totalDist.toFixed(1)} km</span><span className="sc-label">Distance</span></div>
        </div>
        <div className="summary-card">
          <Flame size={20} />
          <div><span className="sc-value">{Math.round(stats.totalCal)}</span><span className="sc-label">Calories</span></div>
        </div>
        <div className="summary-card">
          <MapPin size={20} />
          <div><span className="sc-value">{stats.withMap}</span><span className="sc-label">With Maps</span></div>
        </div>
      </div>

      {/* Filters */}
      <div className="store-controls">
        <div className="filter-group">
          <Filter size={16} />
          <select value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="all">All Types</option>
            {activityTypes.map(t => (
              <option key={t} value={t}>{activityInfo(t).icon} {activityInfo(t).label}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <ArrowUpDown size={16} />
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="date">Most Recent</option>
            <option value="distance">Longest</option>
            <option value="duration">Longest Duration</option>
            <option value="calories">Most Calories</option>
          </select>
        </div>
      </div>

      {/* Workout list */}
      <div className="workout-list">
        {displayWorkouts.length === 0 && (
          <div className="empty-state">
            <Footprints size={48} />
            <p>No workouts found</p>
          </div>
        )}
        {displayWorkouts.map(w => (
          <div
            key={w.idx}
            className={`workout-card ${w.hasMap ? 'has-map' : ''}`}
            onClick={() => { setSelectedWorkout(w); listRef.current?.scrollTo({ top: 0 }); }}
          >
            {/* Mini-map preview */}
            {w.hasMap && (
              <MiniMap points={w.route.points} color={w.info.color} />
            )}

            <div className="card-body">
              <div className="card-top-row">
                <span className="card-icon" style={{ background: w.info.color }}>{w.info.icon}</span>
                <div className="card-title">
                  <strong>{w.info.label}</strong>
                  {w.startDate && (
                    <span className="card-date">
                      {w.startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {' · '}
                      {w.startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              </div>

              <div className="card-metrics">
                {w.durationStr && w.durationStr !== '--' && (
                  <div className="card-metric">
                    <Clock size={14} />
                    <span>{w.durationStr}</span>
                  </div>
                )}
                {w.dist && (
                  <div className="card-metric">
                    <MapPin size={14} />
                    <span>{w.dist.value} {w.dist.unit}</span>
                  </div>
                )}
                {w.pace && (
                  <div className="card-metric">
                    <Gauge size={14} />
                    <span>{w.pace} /km</span>
                  </div>
                )}
                {w.calories && (
                  <div className="card-metric">
                    <Flame size={14} />
                    <span>{w.calories} kcal</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// SVG mini-map for list cards
function MiniMap({ points, color }) {
  const filtered = points.filter(p => p.lat && p.lon);
  if (filtered.length < 2) return null;
  const lats = filtered.map(p => p.lat);
  const lons = filtered.map(p => p.lon);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const latR = maxLat - minLat || 0.001;
  const lonR = maxLon - minLon || 0.001;
  const w = 120, h = 80, pad = 8;

  const pts = filtered.map(p => {
    const x = ((p.lon - minLon) / lonR) * (w - 2 * pad) + pad;
    const y = h - ((p.lat - minLat) / latR) * (h - 2 * pad) - pad;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="mini-map-wrap">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <rect width={w} height={h} rx="8" fill="#f0f0f0" />
        <polyline points={pts} fill="none" stroke={color || '#FF3B30'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
