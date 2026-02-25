import React, { useState, useMemo, useEffect } from 'react';
import {
  MapPin, Calendar, Clock, Zap, Gauge, TrendingUp,
  ChevronDown, ChevronUp, Footprints, ArrowUpDown, Trophy, Mountain
} from 'lucide-react';
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import './RunsView.css';

// ---- map components ---------------------------------------------------------

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
      className="run-map-container"
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
    idx: i, ele: parseFloat(p.elevation)
  }));
  if (elePoints.length < 10) return null;
  const minEle = Math.min(...elePoints.map(p => p.ele));
  const maxEle = Math.max(...elePoints.map(p => p.ele));
  const range = maxEle - minEle || 1;
  const w = 100, h = 40;
  const pathD = elePoints.map((p, i) => {
    const x = (i / (elePoints.length - 1)) * w;
    const y = h - ((p.ele - minEle) / range) * (h - 4) - 2;
    return `${i === 0 ? 'M' : 'L'}${x},${y}`;
  }).join(' ');

  return (
    <div className="run-elevation-profile">
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

// ---- helpers ----------------------------------------------------------------

function parseAppleDate(dateStr) {
  if (!dateStr) return null;
  const m = dateStr.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\s*([+-]\d{4})?/);
  if (!m) return new Date(dateStr);
  const tz = m[7] || '';
  const tzFormatted = tz ? `${tz.slice(0, 3)}:${tz.slice(3)}` : '';
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${tzFormatted}`);
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

function formatDistance(distValue, unit) {
  const d = parseFloat(distValue);
  if (!d || isNaN(d)) return null;
  const u = (unit || '').toLowerCase();
  if (u.includes('mi')) return { value: d.toFixed(2), unit: 'mi' };
  return { value: d.toFixed(2), unit: 'km' };
}

function formatPace(durationSec, distKm) {
  if (!durationSec || !distKm || distKm <= 0) return null;
  const paceMin = (durationSec / 60) / distKm;
  const m = Math.floor(paceMin);
  const s = Math.round((paceMin - m) * 60);
  return `${m}'${s.toString().padStart(2, '0')}" /km`;
}

function getDurationSec(workout) {
  const raw = parseFloat(workout.duration) || 0;
  const unit = (workout.durationUnit || '').toLowerCase();
  if (unit.includes('min')) return raw * 60;
  if (unit.includes('hr') || unit.includes('hour')) return raw * 3600;
  if (unit.includes('sec') || unit === 's') return raw;
  return raw > 300 ? raw : raw * 60;
}

// ---- component --------------------------------------------------------------

function RunsView({ workouts, workoutRoutes }) {
  const [expandedRun, setExpandedRun] = useState(null);
  const [sortBy, setSortBy] = useState('date');
  const [distFilter, setDistFilter] = useState('all'); // all | short | mid | long

  // Build enriched running list from actual workout objects
  const runs = useMemo(() => {
    if (!workouts || workouts.length === 0) return [];

    return workouts
      .filter(w => w.workoutActivityType === 'HKWorkoutActivityTypeRunning')
      .map((w, idx) => {
        const startDate = parseAppleDate(w.startDate);
        const endDate = parseAppleDate(w.endDate);
        const durationSec = getDurationSec(w);

        const dist = formatDistance(w.totalDistance, w.totalDistanceUnit);
        const distKm = dist ? parseFloat(dist.value) * (dist.unit === 'mi' ? 1.609 : 1) : 0;
        const pace = formatPace(durationSec, distKm);
        const calories = parseFloat(w.totalEnergyBurned) || 0;

        // Match route to this run
        let route = null;
        if (workoutRoutes && workoutRoutes.length > 0 && startDate) {
          const wEnd = endDate || startDate;
          for (const r of workoutRoutes) {
            if (!r.points || r.points.length < 2) continue;
            const fp = r.points[0];
            const lp = r.points[r.points.length - 1];
            if (fp.time) {
              const rStart = new Date(fp.time);
              const rEnd = lp.time ? new Date(lp.time) : rStart;
              const grace = 5 * 60 * 1000;
              if (rEnd.getTime() + grace >= startDate.getTime() && rStart.getTime() - grace <= wEnd.getTime()) {
                route = r;
                break;
              }
            }
          }
        }

        return {
          idx,
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
          raw: w,
        };
      });
  }, [workouts, workoutRoutes]);

  // Distance filter
  const filteredRuns = useMemo(() => {
    let list = runs;
    if (distFilter === 'short') list = list.filter(r => r.distKm > 0 && r.distKm < 5);
    if (distFilter === 'mid') list = list.filter(r => r.distKm >= 5 && r.distKm < 10);
    if (distFilter === 'long') list = list.filter(r => r.distKm >= 10);
    // Sort
    if (sortBy === 'date') list = [...list].sort((a, b) => (b.startDate || 0) - (a.startDate || 0));
    if (sortBy === 'distance') list = [...list].sort((a, b) => b.distKm - a.distKm);
    if (sortBy === 'duration') list = [...list].sort((a, b) => b.durationSec - a.durationSec);
    if (sortBy === 'pace') {
      list = [...list].sort((a, b) => {
        const aPace = a.distKm > 0 ? a.durationSec / a.distKm : Infinity;
        const bPace = b.distKm > 0 ? b.durationSec / b.distKm : Infinity;
        return aPace - bPace; // fastest first
      });
    }
    return list;
  }, [runs, sortBy, distFilter]);

  // Summary stats
  const stats = useMemo(() => {
    const totalDist = runs.reduce((s, r) => s + r.distKm, 0);
    const totalDur = runs.reduce((s, r) => s + r.durationSec, 0);
    const totalCal = runs.reduce((s, r) => s + r.calories, 0);
    const longest = runs.length > 0 ? Math.max(...runs.map(r => r.distKm)) : 0;
    const fastestPace = runs.filter(r => r.distKm > 0).reduce((best, r) => {
      const p = r.durationSec / r.distKm;
      return p < best ? p : best;
    }, Infinity);
    const avgDist = runs.length > 0 ? totalDist / runs.length : 0;
    return { totalRuns: runs.length, totalDist, totalDur, totalCal, longest, fastestPace, avgDist };
  }, [runs]);

  // Distance bucket counts for filter pills
  const buckets = useMemo(() => ({
    all: runs.length,
    short: runs.filter(r => r.distKm > 0 && r.distKm < 5).length,
    mid: runs.filter(r => r.distKm >= 5 && r.distKm < 10).length,
    long: runs.filter(r => r.distKm >= 10).length,
  }), [runs]);

  if (runs.length === 0) {
    return (
      <div className="runs-view">
        <div className="no-workouts">
          <Footprints size={48} />
          <p>No running workouts found in your health export.</p>
          <p className="no-workouts-hint">Running workouts appear here when your Apple Health export contains <code>HKWorkoutActivityTypeRunning</code> entries.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="runs-view">
      <div className="runs-header">
        <h2>🏃 My Runs</h2>
        <p className="runs-subtitle">
          {stats.totalRuns} run{stats.totalRuns !== 1 ? 's' : ''} · {stats.totalDist.toFixed(1)} km total · {formatDuration(stats.totalDur)}
        </p>
      </div>

      {/* Stats Summary */}
      <div className="runs-stats">
        <div className="stat-card">
          <Footprints size={20} />
          <div className="stat-content">
            <div className="stat-label">Total Runs</div>
            <div className="stat-value">{stats.totalRuns}</div>
          </div>
        </div>

        <div className="stat-card">
          <TrendingUp size={20} />
          <div className="stat-content">
            <div className="stat-label">Total Distance</div>
            <div className="stat-value">{stats.totalDist.toFixed(1)} km</div>
          </div>
        </div>

        <div className="stat-card">
          <Trophy size={20} />
          <div className="stat-content">
            <div className="stat-label">Longest Run</div>
            <div className="stat-value">{stats.longest.toFixed(2)} km</div>
          </div>
        </div>

        <div className="stat-card">
          <Gauge size={20} />
          <div className="stat-content">
            <div className="stat-label">Best Pace</div>
            <div className="stat-value">
              {stats.fastestPace < Infinity
                ? `${Math.floor(stats.fastestPace / 60)}'${Math.round(stats.fastestPace % 60).toString().padStart(2, '0')}" /km`
                : '--'}
            </div>
          </div>
        </div>

        <div className="stat-card">
          <Clock size={20} />
          <div className="stat-content">
            <div className="stat-label">Total Time</div>
            <div className="stat-value">{formatDuration(stats.totalDur)}</div>
          </div>
        </div>

        <div className="stat-card">
          <Zap size={20} />
          <div className="stat-content">
            <div className="stat-label">Total Calories</div>
            <div className="stat-value">{Math.round(stats.totalCal)} kcal</div>
          </div>
        </div>
      </div>

      {/* Filter & Sort Controls */}
      <div className="runs-controls">
        <div className="distance-filters">
          {[
            { key: 'all', label: 'All' },
            { key: 'short', label: '< 5 km' },
            { key: 'mid', label: '5–10 km' },
            { key: 'long', label: '10+ km' },
          ].map(f => (
            <button
              key={f.key}
              className={`dist-pill ${distFilter === f.key ? 'active' : ''}`}
              onClick={() => setDistFilter(f.key)}
            >
              {f.label} <span className="pill-count">({buckets[f.key]})</span>
            </button>
          ))}
        </div>

        <div className="sort-control">
          <ArrowUpDown size={16} />
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="date">Most Recent</option>
            <option value="distance">Longest Distance</option>
            <option value="duration">Longest Duration</option>
            <option value="pace">Fastest Pace</option>
          </select>
        </div>
      </div>

      {/* Showing X of Y */}
      {distFilter !== 'all' && (
        <p className="filter-notice">
          Showing {filteredRuns.length} of {runs.length} runs
        </p>
      )}

      {/* Runs List */}
      <div className="runs-list">
        {filteredRuns.map((run, idx) => (
          <div
            key={run.idx}
            className="run-item"
            onClick={() => setExpandedRun(expandedRun === idx ? null : idx)}
          >
            <div className="run-header">
              <div className="run-title">
                <Calendar size={18} />
                <div className="run-date">
                  {run.startDate ? (
                    <>
                      <div className="date-main">
                        {run.startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                      <div className="date-time">
                        {run.startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        {run.endDate && ` – ${run.endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`}
                      </div>
                    </>
                  ) : (
                    <div className="date-main">Unknown date</div>
                  )}
                </div>
              </div>

              <div className="run-summary">
                {run.dist && (
                  <div className="summary-item distance">
                    <MapPin size={16} />
                    <span>{run.dist.value} {run.dist.unit}</span>
                  </div>
                )}
                {run.durationStr && run.durationStr !== '--' && (
                  <div className="summary-item">
                    <Clock size={16} />
                    <span>{run.durationStr}</span>
                  </div>
                )}
                {run.pace && (
                  <div className="summary-item pace">
                    <Gauge size={16} />
                    <span>{run.pace}</span>
                  </div>
                )}
                {run.calories > 0 && (
                  <div className="summary-item">
                    <Zap size={16} />
                    <span>{Math.round(run.calories)} kcal</span>
                  </div>
                )}
                {run.hasMap && (
                  <div className="summary-item map-badge">
                    <MapPin size={14} />
                    <span>GPS</span>
                  </div>
                )}
              </div>

              <div className="run-expand">
                {expandedRun === idx ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </div>
            </div>

            {expandedRun === idx && (
              <div className="run-details" onClick={(e) => e.stopPropagation()}>
                {/* Route Map */}
                {run.hasMap && (
                  <div className="run-detail-map">
                    <RouteMap points={run.route.points} color="#FF3B30" />
                  </div>
                )}

                {/* Elevation Profile */}
                {run.hasMap && <ElevationProfile points={run.route.points} />}

                <div className="details-grid">
                  {run.dist && (
                    <div className="detail-item">
                      <MapPin size={24} />
                      <div className="detail-content">
                        <div className="detail-label">Distance</div>
                        <div className="detail-value">{run.dist.value} {run.dist.unit}</div>
                      </div>
                    </div>
                  )}

                  {run.durationStr && run.durationStr !== '--' && (
                    <div className="detail-item">
                      <Clock size={24} />
                      <div className="detail-content">
                        <div className="detail-label">Duration</div>
                        <div className="detail-value">{run.durationStr}</div>
                      </div>
                    </div>
                  )}

                  {run.pace && (
                    <div className="detail-item">
                      <Gauge size={24} />
                      <div className="detail-content">
                        <div className="detail-label">Pace</div>
                        <div className="detail-value">{run.pace}</div>
                      </div>
                    </div>
                  )}

                  {run.calories > 0 && (
                    <div className="detail-item">
                      <Zap size={24} />
                      <div className="detail-content">
                        <div className="detail-label">Calories</div>
                        <div className="detail-value">{Math.round(run.calories)} kcal</div>
                      </div>
                    </div>
                  )}

                  {run.distKm > 0 && run.durationSec > 0 && (
                    <div className="detail-item">
                      <TrendingUp size={24} />
                      <div className="detail-content">
                        <div className="detail-label">Avg Speed</div>
                        <div className="detail-value">
                          {((run.distKm / run.durationSec) * 3600).toFixed(1)} km/h
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default RunsView;
