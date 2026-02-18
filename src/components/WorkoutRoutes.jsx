import React from 'react';
import { MapPin, Navigation } from 'lucide-react';
import { parseGPXRoute } from '../utils/zipParser';
import './WorkoutRoutes.css';

export default function WorkoutRoutes({ routes, workouts }) {
  if (!routes || routes.length === 0) {
    return (
      <div className="workout-routes empty">
        <Navigation size={32} />
        <p>No workout route data available</p>
      </div>
    );
  }

  const calculateStats = (trackpoints) => {
    if (!trackpoints || trackpoints.length < 2) return null;

    let totalDistance = 0;
    let minElevation = Infinity;
    let maxElevation = -Infinity;

    for (let i = 1; i < trackpoints.length; i++) {
      const prev = trackpoints[i - 1];
      const curr = trackpoints[i];
      
      // Simple distance calculation (in meters, approximate)
      const dLat = (curr.lat - prev.lat) * 111000;
      const dLon = (curr.lon - prev.lon) * 111000 * Math.cos((curr.lat + prev.lat) / 2 * Math.PI / 180);
      totalDistance += Math.sqrt(dLat * dLat + dLon * dLon);

      if (curr.elevation) {
        const elev = parseFloat(curr.elevation);
        minElevation = Math.min(minElevation, elev);
        maxElevation = Math.max(maxElevation, elev);
      }
    }

    return {
      distance: (totalDistance / 1000).toFixed(2),
      elevationGain: minElevation !== Infinity ? (maxElevation - minElevation).toFixed(0) : null,
      points: trackpoints.length
    };
  };

  const renderMap = (trackpoints, idx) => {
    if (!trackpoints || trackpoints.length < 2) return null;

    const lats = trackpoints.map(p => p.lat);
    const lons = trackpoints.map(p => p.lon);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);

    const width = 300;
    const height = 200;
    const padding = 20;

    const latRange = maxLat - minLat || 0.001;
    const lonRange = maxLon - minLon || 0.001;

    const points = trackpoints.map(p => {
      const x = ((p.lon - minLon) / lonRange) * (width - 2 * padding) + padding;
      const y = height - ((p.lat - minLat) / latRange) * (height - 2 * padding) - padding;
      return `${x},${y}`;
    }).join(' ');

    return (
      <svg key={idx} width={width} height={height} className="route-map">
        <rect width={width} height={height} fill="#f3f4f6" />
        <polyline
          points={points}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
        <circle cx={width - padding - 5} cy={padding + 5} r="3" fill="#10b981" />
        <circle cx={points.split(' ')[0].split(',')[0]} cy={points.split(' ')[0].split(',')[1]} r="3" fill="#ef4444" />
      </svg>
    );
  };

  return (
    <div className="workout-routes">
      <div className="routes-header">
        <Navigation size={24} />
        <h3>Workout Routes</h3>
      </div>

      <div className="routes-grid">
        {routes.map((route, idx) => {
          const trackpoints = parseGPXRoute(route.data);
          const stats = calculateStats(trackpoints);

          return (
            <div key={idx} className="route-card">
              <div className="route-filename">
                {route.filename.split('/').pop()}
              </div>

              {stats && (
                <div className="route-stats">
                  <div className="stat">
                    <MapPin size={16} />
                    <span><strong>{stats.distance}</strong> km</span>
                  </div>
                  {stats.elevationGain && (
                    <div className="stat">
                      <span>↗ <strong>{stats.elevationGain}</strong> m</span>
                    </div>
                  )}
                  <div className="stat">
                    <span><strong>{stats.points}</strong> points</span>
                  </div>
                </div>
              )}

              {trackpoints.length > 0 && (
                <div className="map-container">
                  {renderMap(trackpoints, idx)}
                </div>
              )}

              {trackpoints.length === 0 && (
                <div className="route-error">No location data found</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
