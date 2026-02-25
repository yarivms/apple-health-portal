import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import './ChartsSection.css';

function ChartsSection({ data }) {
  const { metricsByType } = data;
  const [timeRange, setTimeRange] = useState('month');

  // Get available metrics that have data
  const availableMetrics = metricsByType 
    ? Object.keys(metricsByType).filter(type => metricsByType[type].count > 0)
    : [];

  // Map short names to full metric keys for initial defaults
  const resolveMetricName = (shortName) => {
    return availableMetrics.find(k => k.toLowerCase().includes(shortName.toLowerCase())) || shortName;
  };

  const [selectedMetrics, setSelectedMetrics] = useState([]);
  const [metricFilter, setMetricFilter] = useState('');

  // Initialize selected metrics when data loads
  useEffect(() => {
    if (availableMetrics.length > 0 && selectedMetrics.length === 0) {
      const defaults = ['HeartRate', 'StepCount'].map(resolveMetricName).filter(m => availableMetrics.includes(m));
      setSelectedMetrics(defaults.length > 0 ? defaults : availableMetrics.slice(0, 2));
    }
  }, [availableMetrics.length]);

  // Build chart data from metric values directly (daily aggregates)
  const buildChartData = () => {
    if (!metricsByType) return [];

    const chartData = {};

    // Collect data from selected metrics
    selectedMetrics.forEach(metricName => {
      const metricData = metricsByType[metricName];
      
      if (metricData) {
        metricData.values?.forEach(val => {
          if (!chartData[val.date]) {
            chartData[val.date] = { date: val.date };
          }
          chartData[val.date][metricName] = parseFloat(val.value);
        });
      }
    });

    // Sort by date and apply time range filter
    let sorted = Object.values(chartData).sort((a, b) => a.date.localeCompare(b.date));
    
    if (timeRange === 'week') {
      sorted = sorted.slice(-7);
    } else if (timeRange === 'month') {
      sorted = sorted.slice(-30);
    }
    // 'all' returns everything

    return sorted;
  };

  const chartData = buildChartData();

  // Common chart colors
  const colors = {
    HeartRate: '#ef4444',
    StepCount: '#3b82f6',
    Calories: '#f59e0b',
    Distance: '#10b981',
    Temperature: '#06b6d4',
    default: '#8b5cf6',
  };

  const getColor = (metric) => {
    const key = Object.keys(colors).find(k => metric.toLowerCase().includes(k.toLowerCase()));
    return colors[key] || colors.default;
  };

  const shortName = (metric) => metric.replace(/HKQuantityTypeIdentifier/g, '').replace(/HKCategoryTypeIdentifier/g, '');

  return (
    <div className="charts-section">
      <div className="charts-header">
        <h2>Health Metrics Trends</h2>
        <div className="charts-controls">
          <div className="time-range-buttons">
            <button
              className={`time-button ${timeRange === 'week' ? 'active' : ''}`}
              onClick={() => setTimeRange('week')}
            >
              Week
            </button>
            <button
              className={`time-button ${timeRange === 'month' ? 'active' : ''}`}
              onClick={() => setTimeRange('month')}
            >
              Month
            </button>
            <button
              className={`time-button ${timeRange === 'all' ? 'active' : ''}`}
              onClick={() => setTimeRange('all')}
            >
              All Time
            </button>
          </div>

          {availableMetrics.length > 0 && (
            <div className="metric-selector">
              <label>Select Metrics:</label>
              <input
                type="text"
                placeholder="Search metrics..."
                value={metricFilter}
                onChange={(e) => setMetricFilter(e.target.value)}
                className="metric-search"
              />
              <div className="metric-checkboxes">
                {availableMetrics
                  .filter(m => !metricFilter || shortName(m).toLowerCase().includes(metricFilter.toLowerCase()))
                  .map((metric) => (
                  <label key={metric} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={selectedMetrics.includes(metric)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedMetrics([...selectedMetrics, metric]);
                        } else {
                          setSelectedMetrics(selectedMetrics.filter(m => m !== metric));
                        }
                      }}
                    />
                    <span className="metric-label">{shortName(metric)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="charts-grid">
        {chartData.length > 0 && selectedMetrics.length > 0 ? (
          <>
            {/* Line Chart for all selected metrics */}
            {selectedMetrics.length <= 3 && (
              <div className="chart-container">
                <h3>Multi-Metric Comparison</h3>
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis 
                      dataKey="date" 
                      stroke="#6b7280"
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis stroke="#6b7280" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1f2937',
                        border: '1px solid #374151',
                        borderRadius: '8px',
                        color: '#fff',
                      }}
                    />
                    <Legend />
                    {selectedMetrics.map((metric, idx) => (
                      <Line
                        key={metric}
                        type="monotone"
                        dataKey={metric}
                        name={shortName(metric)}
                        stroke={getColor(metric)}
                        connectNulls
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={idx === 0}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Individual charts for first few metrics */}
            {selectedMetrics.slice(0, 3).map((metric) => (
              <div key={metric} className="chart-container">
                <h3>{shortName(metric)}</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id={`color${metric}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={getColor(metric)} stopOpacity={0.8} />
                        <stop offset="95%" stopColor={getColor(metric)} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis 
                      dataKey="date" 
                      stroke="#6b7280"
                      angle={-45}
                      textAnchor="end"
                      height={60}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis stroke="#6b7280" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1f2937',
                        border: '1px solid #374151',
                        borderRadius: '8px',
                        color: '#fff',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey={metric}
                      stroke={getColor(metric)}
                      fill={`url(#color${metric})`}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ))}
          </>
        ) : (
          <div className="no-data">
            <p>No chart data available. Please select metrics or upload data.</p>
          </div>
        )}
      </div>

      {availableMetrics.length > 8 && !metricFilter && (
        <div className="data-info">
          <p>✓ {availableMetrics.length} metrics available — use the search box to find specific ones</p>
        </div>
      )}
    </div>
  );
}

export default ChartsSection;
