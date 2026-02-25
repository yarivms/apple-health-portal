import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import './ChartsSection.css';

// Color palette for metrics
const METRIC_COLORS = [
  '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6',
  '#06b6d4', '#ec4899', '#f97316', '#14b8a6', '#a855f7',
  '#6366f1', '#84cc16', '#e11d48', '#0ea5e9', '#d946ef',
];

const COLOR_HINTS = {
  heartrate: '#ef4444', heart: '#ef4444', step: '#3b82f6',
  calorie: '#f59e0b', energy: '#f59e0b', distance: '#10b981',
  walk: '#10b981', run: '#06b6d4', speed: '#06b6d4',
  vo2: '#8b5cf6', respiratory: '#14b8a6', sleep: '#6366f1',
  body: '#ec4899', mass: '#ec4899', height: '#a855f7',
  flight: '#f97316', swim: '#0ea5e9',
};

function getColor(metric, idx) {
  const lower = metric.toLowerCase();
  for (const [hint, color] of Object.entries(COLOR_HINTS)) {
    if (lower.includes(hint)) return color;
  }
  return METRIC_COLORS[idx % METRIC_COLORS.length];
}

function shortName(metric) {
  return metric
    .replace(/HKQuantityTypeIdentifier/g, '')
    .replace(/HKCategoryTypeIdentifier/g, '')
    .replace(/HKDataType/g, '');
}

function applyTimeRange(values, timeRange) {
  if (!values || values.length === 0) return [];
  if (timeRange === 'all') return values;

  const now = new Date();
  let cutoff;
  if (timeRange === 'week') {
    cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
  } else if (timeRange === 'month') {
    cutoff = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
  } else if (timeRange === '6months') {
    cutoff = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
  } else if (timeRange === 'year') {
    cutoff = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  }

  if (!cutoff) return values;
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return values.filter(v => v.date >= cutoffStr);
}

function ChartsSection({ data }) {
  const { metricsByType } = data;
  const [timeRange, setTimeRange] = useState('year');
  const [selectedMetrics, setSelectedMetrics] = useState([]);
  const [metricFilter, setMetricFilter] = useState('');

  // Only show metrics that have chartable values (values.length > 0)
  const availableMetrics = useMemo(() => {
    if (!metricsByType) return [];
    return Object.keys(metricsByType)
      .filter(type => {
        const m = metricsByType[type];
        return m.values && m.values.length > 0;
      })
      .sort((a, b) => shortName(a).localeCompare(shortName(b)));
  }, [metricsByType]);

  // Map short names to full metric keys for initial defaults
  const resolveMetricName = (shortName) => {
    return availableMetrics.find(k => k.toLowerCase().includes(shortName.toLowerCase())) || shortName;
  };

  // Initialize selected metrics when data loads
  useEffect(() => {
    if (availableMetrics.length > 0 && selectedMetrics.length === 0) {
      const defaults = ['HeartRate', 'StepCount', 'DistanceWalkingRunning']
        .map(resolveMetricName)
        .filter(m => availableMetrics.includes(m));
      setSelectedMetrics(defaults.length > 0 ? defaults : availableMetrics.slice(0, 3));
    }
  }, [availableMetrics.length]);

  // Build chart data for a SINGLE metric (used for individual charts)
  const buildSingleMetricData = (metricName) => {
    if (!metricsByType) return [];
    const metricData = metricsByType[metricName];
    if (!metricData?.values?.length) return [];

    const filtered = applyTimeRange(metricData.values, timeRange);
    return filtered.map(v => ({
      date: v.date,
      value: parseFloat(v.value),
      min: v.min != null ? parseFloat(v.min) : undefined,
      max: v.max != null ? parseFloat(v.max) : undefined,
    }));
  };

  // Build combined chart data for the comparison overlay
  const buildComparisonData = () => {
    if (!metricsByType || selectedMetrics.length === 0) return [];

    // For comparison, use the union of all dates from selected metrics
    const dateMap = {};
    selectedMetrics.forEach(metricName => {
      const metricData = metricsByType[metricName];
      if (!metricData?.values) return;
      const filtered = applyTimeRange(metricData.values, timeRange);
      filtered.forEach(v => {
        if (!dateMap[v.date]) dateMap[v.date] = { date: v.date };
        dateMap[v.date][metricName] = parseFloat(v.value);
      });
    });

    return Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));
  };

  const comparisonData = useMemo(buildComparisonData, [metricsByType, selectedMetrics, timeRange]);

  // Check which selected metrics actually have data in the current time range
  const metricsWithData = useMemo(() => {
    return selectedMetrics.filter(m => {
      const d = metricsByType?.[m];
      if (!d?.values?.length) return false;
      return applyTimeRange(d.values, timeRange).length > 0;
    });
  }, [selectedMetrics, metricsByType, timeRange]);

  const filteredCheckboxMetrics = useMemo(() => {
    if (!metricFilter) return availableMetrics;
    return availableMetrics.filter(m =>
      shortName(m).toLowerCase().includes(metricFilter.toLowerCase())
    );
  }, [availableMetrics, metricFilter]);

  return (
    <div className="charts-section">
      <div className="charts-header">
        <h2>Health Metrics Trends</h2>
        <div className="charts-controls">
          <div className="time-range-buttons">
            {[
              ['week', '1W'],
              ['month', '1M'],
              ['6months', '6M'],
              ['year', '1Y'],
              ['all', 'All'],
            ].map(([key, label]) => (
              <button
                key={key}
                className={`time-button ${timeRange === key ? 'active' : ''}`}
                onClick={() => setTimeRange(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {availableMetrics.length > 0 && (
            <div className="metric-selector">
              <label>Select Metrics ({selectedMetrics.length} selected):</label>
              <input
                type="text"
                placeholder="Search metrics..."
                value={metricFilter}
                onChange={(e) => setMetricFilter(e.target.value)}
                className="metric-search"
              />
              <div className="metric-checkboxes">
                {filteredCheckboxMetrics.map((metric) => {
                  const m = metricsByType[metric];
                  const valCount = m.values?.length || 0;
                  return (
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
                      <span className="metric-label">
                        {shortName(metric)}
                        <span className="metric-count"> ({valCount}d)</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="charts-grid">
        {metricsWithData.length > 0 ? (
          <>
            {/* Comparison chart when 2-4 metrics selected */}
            {metricsWithData.length >= 2 && metricsWithData.length <= 4 && comparisonData.length > 0 && (
              <div className="chart-container full-width">
                <h3>Multi-Metric Comparison</h3>
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={comparisonData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="date"
                      stroke="#6b7280"
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      tick={{ fontSize: 11 }}
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
                    {metricsWithData.map((metric, idx) => (
                      <Line
                        key={metric}
                        type="monotone"
                        dataKey={metric}
                        name={shortName(metric)}
                        stroke={getColor(metric, idx)}
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

            {/* Individual chart per selected metric */}
            {metricsWithData.map((metric, idx) => {
              const singleData = buildSingleMetricData(metric);
              if (singleData.length === 0) return null;
              const color = getColor(metric, idx);
              const m = metricsByType[metric];
              const unit = m?.unit || '';
              const gradientId = `grad-${metric.replace(/[^a-zA-Z0-9]/g, '')}`;
              return (
                <div key={metric} className="chart-container">
                  <div className="chart-title-row">
                    <h3>{shortName(metric)}</h3>
                    <span className="chart-unit">{unit}</span>
                  </div>
                  <div className="chart-stats-row">
                    <span>Avg: <strong>{m?.avg ?? '–'}</strong></span>
                    <span>Min: <strong>{m?.min ?? '–'}</strong></span>
                    <span>Max: <strong>{m?.max ?? '–'}</strong></span>
                    <span className="chart-point-count">{singleData.length} days</span>
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={singleData}>
                      <defs>
                        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={color} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis
                        dataKey="date"
                        stroke="#6b7280"
                        angle={-45}
                        textAnchor="end"
                        height={55}
                        tick={{ fontSize: 10 }}
                      />
                      <YAxis stroke="#6b7280" tick={{ fontSize: 11 }} width={55} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1f2937',
                          border: '1px solid #374151',
                          borderRadius: '8px',
                          color: '#fff',
                        }}
                        formatter={(value) => [`${value} ${unit}`, shortName(metric)]}
                        labelFormatter={(label) => `Date: ${label}`}
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke={color}
                        strokeWidth={2}
                        fill={`url(#${gradientId})`}
                        dot={singleData.length < 60}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              );
            })}
          </>
        ) : selectedMetrics.length > 0 ? (
          <div className="no-data">
            <p>No data for the selected metrics in this time range. Try a longer range or select different metrics.</p>
          </div>
        ) : (
          <div className="no-data">
            <p>Select one or more metrics from the list above to see charts.</p>
          </div>
        )}
      </div>

      {availableMetrics.length > 0 && (
        <div className="data-info">
          <p>✓ {availableMetrics.length} chartable metrics available{selectedMetrics.length > 0 ? ` · ${metricsWithData.length} with data in this range` : ''}</p>
        </div>
      )}
    </div>
  );
}

export default ChartsSection;
