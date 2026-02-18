import React, { useState } from 'react';
import { MapPin, Calendar, Clock, Zap, Gauge, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';
import './RunsView.css';

function RunsView({ data }) {
  const { workoutsByDate, metricsByType, allDates } = data;
  const [expandedRun, setExpandedRun] = useState(null);
  const [sortBy, setSortBy] = useState('date');

  // Extract workout details from metricsByType
  const getWorkoutMetrics = () => {
    if (!metricsByType) return [];

    const workoutMetrics = {};
    
    // Look for distance, speed, energy metrics
    Object.entries(metricsByType).forEach(([type, data]) => {
      if (type.includes('Distance')) {
        workoutMetrics.distance = data;
      }
      if (type.includes('Speed') || type.includes('Pace')) {
        workoutMetrics.speed = data;
      }
      if (type.includes('Energy') || type.includes('Calories')) {
        workoutMetrics.energy = data;
      }
      if (type.includes('Heart') || type.includes('HeartRate')) {
        workoutMetrics.heartRate = data;
      }
      if (type.includes('Elevation')) {
        workoutMetrics.elevation = data;
      }
    });

    return workoutMetrics;
  };

  const workoutMetrics = getWorkoutMetrics();

  // Build runs list from allDates and workout data
  const buildRunsList = () => {
    if (!allDates || !workoutsByDate) return [];

    const runs = allDates
      .filter(date => workoutsByDate[date] > 0)
      .map(date => {
        const dateObj = new Date(date);
        const count = workoutsByDate[date];

        // Aggregate metrics for this date if available
        let distance = 0;
        let speed = 0;
        let energy = 0;
        let heartRateAvg = 0;

        if (workoutMetrics.distance?.values) {
          const dayValues = workoutMetrics.distance.values.filter(v => v.date === date);
          if (dayValues.length > 0) {
            distance = dayValues.reduce((sum, v) => sum + parseFloat(v.value || 0), 0) / dayValues.length;
          }
        }

        if (workoutMetrics.speed?.values) {
          const dayValues = workoutMetrics.speed.values.filter(v => v.date === date);
          if (dayValues.length > 0) {
            speed = dayValues.reduce((sum, v) => sum + parseFloat(v.value || 0), 0) / dayValues.length;
          }
        }

        if (workoutMetrics.energy?.values) {
          const dayValues = workoutMetrics.energy.values.filter(v => v.date === date);
          if (dayValues.length > 0) {
            energy = dayValues.reduce((sum, v) => sum + parseFloat(v.value || 0), 0);
          }
        }

        if (workoutMetrics.heartRate?.values) {
          const dayValues = workoutMetrics.heartRate.values.filter(v => v.date === date);
          if (dayValues.length > 0) {
            heartRateAvg = dayValues.reduce((sum, v) => sum + parseFloat(v.value || 0), 0) / dayValues.length;
          }
        }

        return {
          date,
          dateObj,
          count,
          distance: distance / 1000, // Convert to KM if in meters
          speed,
          energy,
          heartRateAvg,
        };
      });

    // Sort runs
    if (sortBy === 'distance') {
      runs.sort((a, b) => b.distance - a.distance);
    } else if (sortBy === 'speed') {
      runs.sort((a, b) => b.speed - a.speed);
    } else if (sortBy === 'energy') {
      runs.sort((a, b) => b.energy - a.energy);
    } else {
      runs.sort((a, b) => b.dateObj - a.dateObj);
    }

    return runs;
  };

  const runs = buildRunsList();

  // Calculate stats
  const stats = {
    totalRuns: runs.length,
    totalDistance: runs.reduce((sum, r) => sum + r.distance, 0),
    totalEnergy: runs.reduce((sum, r) => sum + r.energy, 0),
    avgDistance: runs.length > 0 ? runs.reduce((sum, r) => sum + r.distance, 0) / runs.length : 0,
    avgSpeed: runs.length > 0 ? runs.reduce((sum, r) => sum + r.speed, 0) / runs.length : 0,
    maxDistance: runs.length > 0 ? Math.max(...runs.map(r => r.distance)) : 0,
    maxSpeed: runs.length > 0 ? Math.max(...runs.map(r => r.speed)) : 0,
  };

  if (runs.length === 0) {
    return (
      <div className="runs-view">
        <div className="no-workouts">
          <p>No workout data found in your health export.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="runs-view">
      <div className="runs-header">
        <h2>My Runs & Workouts</h2>
        <p className="runs-subtitle">{stats.totalRuns} workouts tracked</p>
      </div>

      {/* Stats Summary */}
      <div className="runs-stats">
        <div className="stat-card">
          <TrendingUp size={20} />
          <div className="stat-content">
            <div className="stat-label">Total Distance</div>
            <div className="stat-value">{stats.totalDistance.toFixed(1)} KM</div>
          </div>
        </div>

        <div className="stat-card">
          <Gauge size={20} />
          <div className="stat-content">
            <div className="stat-label">Avg Distance</div>
            <div className="stat-value">{stats.avgDistance.toFixed(2)} KM</div>
          </div>
        </div>

        <div className="stat-card">
          <Zap size={20} />
          <div className="stat-content">
            <div className="stat-label">Total Energy</div>
            <div className="stat-value">{stats.totalEnergy.toFixed(0)} kcal</div>
          </div>
        </div>

        <div className="stat-card">
          <Clock size={20} />
          <div className="stat-content">
            <div className="stat-label">Avg Speed</div>
            <div className="stat-value">{stats.avgSpeed.toFixed(1)}</div>
          </div>
        </div>
      </div>

      {/* Sort Controls */}
      <div className="runs-controls">
        <label>Sort By:</label>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="date">Most Recent</option>
          <option value="distance">Longest Distance</option>
          <option value="speed">Fastest Speed</option>
          <option value="energy">Most Energy Burned</option>
        </select>
      </div>

      {/* Runs List */}
      <div className="runs-list">
        {runs.map((run, idx) => (
          <div
            key={idx}
            className="run-item"
            onClick={() => setExpandedRun(expandedRun === idx ? null : idx)}
          >
            <div className="run-header">
              <div className="run-title">
                <Calendar size={18} />
                <div className="run-date">
                  <div className="date-main">{run.dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                  <div className="date-time">{run.dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              </div>

              <div className="run-summary">
                {run.distance > 0 && (
                  <div className="summary-item">
                    <MapPin size={16} />
                    <span>{run.distance.toFixed(1)} KM</span>
                  </div>
                )}
                {run.speed > 0 && (
                  <div className="summary-item">
                    <Gauge size={16} />
                    <span>{run.speed.toFixed(1)}</span>
                  </div>
                )}
                {run.energy > 0 && (
                  <div className="summary-item">
                    <Zap size={16} />
                    <span>{run.energy.toFixed(0)} kcal</span>
                  </div>
                )}
              </div>

              <div className="run-expand">
                {expandedRun === idx ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </div>
            </div>

            {expandedRun === idx && (
              <div className="run-details">
                <div className="details-grid">
                  {run.distance > 0 && (
                    <div className="detail-item">
                      <MapPin size={24} />
                      <div className="detail-content">
                        <div className="detail-label">Distance</div>
                        <div className="detail-value">{run.distance.toFixed(2)} KM</div>
                      </div>
                    </div>
                  )}

                  {run.speed > 0 && (
                    <div className="detail-item">
                      <Gauge size={24} />
                      <div className="detail-content">
                        <div className="detail-label">Speed</div>
                        <div className="detail-value">{run.speed.toFixed(1)}</div>
                      </div>
                    </div>
                  )}

                  {run.energy > 0 && (
                    <div className="detail-item">
                      <Zap size={24} />
                      <div className="detail-content">
                        <div className="detail-label">Energy Burned</div>
                        <div className="detail-value">{run.energy.toFixed(0)} kcal</div>
                      </div>
                    </div>
                  )}

                  {run.heartRateAvg > 0 && (
                    <div className="detail-item">
                      <TrendingUp size={24} />
                      <div className="detail-content">
                        <div className="detail-label">Avg Heart Rate</div>
                        <div className="detail-value">{run.heartRateAvg.toFixed(0)} BPM</div>
                      </div>
                    </div>
                  )}

                  {run.count > 1 && (
                    <div className="detail-item">
                      <Clock size={24} />
                      <div className="detail-content">
                        <div className="detail-label">Workouts</div>
                        <div className="detail-value">{run.count}</div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="run-map-placeholder">
                  <MapPin size={32} />
                  <p>Map view coming soon</p>
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
