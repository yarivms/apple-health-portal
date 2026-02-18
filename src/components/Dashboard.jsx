import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Activity, TrendingUp } from 'lucide-react';
import './Dashboard.css';

function Dashboard({ data }) {
  const { metricsByType, workoutsByDate } = data;
  const [expandedSections, setExpandedSections] = useState({
    workouts: true,
    detailedMetrics: true,
  });

  const toggleSection = (section) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // Get metric types sorted by count
  const sortedMetrics = metricsByType
    ? Object.entries(metricsByType)
        .filter(([_, data]) => data.count > 0)
        .sort(([_, a], [__, b]) => b.count - a.count)
    : [];

  return (
    <div className="dashboard">
      {/* Workouts Summary */}
      {workoutsByDate && Object.keys(workoutsByDate).length > 0 && (
        <div className="dashboard-section">
          <div
            className="section-header"
            onClick={() => toggleSection('workouts')}
          >
            <Activity size={20} />
            <h3>Workouts & Activities</h3>
            {expandedSections.workouts ? (
              <ChevronUp size={20} />
            ) : (
              <ChevronDown size={20} />
            )}
          </div>

          {expandedSections.workouts && (
            <div className="section-content">
              <div className="workouts-summary">
                <div className="summary-stat">
                  <div className="stat-label">Total Workout Days</div>
                  <div className="stat-value">{Object.keys(workoutsByDate).length}</div>
                </div>
                <div className="summary-stat">
                  <div className="stat-label">Total Workouts</div>
                  <div className="stat-value">{Object.values(workoutsByDate).reduce((a, b) => a + b, 0)}</div>
                </div>
              </div>
              
              <div className="workouts-table">
                <div className="table-header">
                  <div className="table-cell">Date</div>
                  <div className="table-cell">Workouts</div>
                </div>
                {Object.entries(workoutsByDate)
                  .reverse()
                  .slice(0, 20)
                  .map(([date, count]) => (
                    <div key={date} className="table-row">
                      <div className="table-cell">{new Date(date).toLocaleDateString()}</div>
                      <div className="table-cell">{count}</div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Detailed Metrics Section */}
      {sortedMetrics.length > 0 && (
        <div className="dashboard-section">
          <div
            className="section-header"
            onClick={() => toggleSection('detailedMetrics')}
          >
            <TrendingUp size={20} />
            <h3>Detailed Metric Statistics</h3>
            {expandedSections.detailedMetrics ? (
              <ChevronUp size={20} />
            ) : (
              <ChevronDown size={20} />
            )}
          </div>

          {expandedSections.detailedMetrics && (
            <div className="section-content">
              <div className="metrics-table">
                <div className="table-header">
                  <div className="table-cell header-metric">Metric Type</div>
                  <div className="table-cell header-count">Count</div>
                  <div className="table-cell header-unit">Unit</div>
                  <div className="table-cell header-avg">Average</div>
                  <div className="table-cell header-range">Min - Max</div>
                </div>

                {sortedMetrics.slice(0, 30).map(([type, metricData]) => {
                  const avg = (metricData.sum / metricData.count).toFixed(2);
                  const minVal = metricData.min === Infinity ? 0 : metricData.min.toFixed(2);
                  const maxVal = metricData.max === -Infinity ? 0 : metricData.max.toFixed(2);
                  
                  return (
                    <div key={type} className="table-row">
                      <div className="table-cell metric-name">
                        <div className="metric-type">{type.replace(/HKQuantityTypeIdentifier/g, '')}</div>
                      </div>
                      <div className="table-cell">{metricData.count.toLocaleString()}</div>
                      <div className="table-cell">{metricData.unit || '-'}</div>
                      <div className="table-cell avg-value">{avg}</div>
                      <div className="table-cell range-value">{minVal} - {maxVal}</div>
                    </div>
                  );
                })}
              </div>

              {sortedMetrics.length > 30 && (
                <div className="metrics-info">
                  <p>✓ Showing top 30 of {sortedMetrics.length} metrics</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Dashboard;
