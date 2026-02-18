import React, { useState } from 'react';
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
import { format } from 'date-fns';
import './ChartsSection.css';

function ChartsSection({ data }) {
  const { metricsByType, allDates } = data;
  const [selectedMetrics, setSelectedMetrics] = useState(['HeartRate', 'StepCount']);
  const [timeRange, setTimeRange] = useState('month');

  // Get available metrics that have data
  const availableMetrics = metricsByType 
    ? Object.keys(metricsByType).filter(type => metricsByType[type].count > 0)
    : [];

  // Build chart data from allDates and metricsByType
  const buildChartData = () => {
    if (!allDates || !metricsByType) return [];

    const chartData = {};
    
    // Initialize all dates
    allDates.forEach(dateStr => {
      chartData[dateStr] = { date: dateStr };
    });

    // Fill in data for selected metrics
    selectedMetrics.forEach(metricName => {
      const metrics = Object.entries(metricsByType).find(([key]) => 
        key.toLowerCase().includes(metricName.toLowerCase())
      );
      
      if (metrics) {
        const [metricType, metricData] = metrics;
        metricData.values?.forEach(val => {
          if (chartData[val.date]) {
            chartData[val.date][metricName] = parseFloat(val.value);
          }
        });
      }
    });

    return Object.values(chartData).slice(-Math.min(30, allDates.length));
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
              <div className="metric-checkboxes">
                {availableMetrics.slice(0, 8).map((metric) => (
                  <label key={metric} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={selectedMetrics.some(m => 
                        m.toLowerCase() === metric.toLowerCase()
                      )}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedMetrics([...selectedMetrics, metric]);
                        } else {
                          setSelectedMetrics(selectedMetrics.filter(m => m !== metric));
                        }
                      }}
                    />
                    <span className="metric-label">{metric.replace(/HKQuantityTypeIdentifier/g, '')}</span>
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
                <h3>{metric.replace(/HKQuantityTypeIdentifier/g, '')}</h3>
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

      {availableMetrics.length > 8 && (
        <div className="data-info">
          <p>✓ Showing top 8 of {availableMetrics.length} available metrics</p>
        </div>
      )}
    </div>
  );
}

export default ChartsSection;
