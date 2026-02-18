import React from 'react';
import { Heart, Footprints, Flame, Calendar, TrendingUp, Activity, Database, BarChart3 } from 'lucide-react';
import './MetricsCards.css';

function MetricsCards({ data }) {
  const { summary } = data;

  const cards = [
    {
      id: 'records',
      icon: Database,
      title: 'Total Records',
      stat: summary.totalRecords,
      unit: 'records',
      color: '#ef4444',
    },
    {
      id: 'metrics',
      icon: BarChart3,
      title: 'Metric Types',
      stat: summary.metricsAvailable?.length || 0,
      unit: 'types',
      color: '#3b82f6',
    },
    {
      id: 'dates',
      icon: Calendar,
      title: 'Days Tracked',
      stat: summary.uniqueDates,
      unit: 'days',
      color: '#10b981',
    },
    {
      id: 'workouts',
      icon: Activity,
      title: 'Workouts',
      stat: summary.totalWorkouts,
      unit: 'sessions',
      color: '#f59e0b',
    },
    {
      id: 'timespan',
      icon: TrendingUp,
      title: 'Date Range',
      stat: summary.dateRange.start && summary.dateRange.end ? 
        Math.round((summary.dateRange.end - summary.dateRange.start) / (1000 * 60 * 60 * 24)) : 0,
      unit: 'days',
      subtext: summary.dateRange.start ? 
        `${new Date(summary.dateRange.start).toLocaleDateString()} to ${new Date(summary.dateRange.end).toLocaleDateString()}` 
        : 'N/A',
      color: '#8b5cf6',
    },
  ];

  return (
    <div className="metrics-cards">
      {cards.map((card) => {
        const IconComponent = card.icon;
        return (
          <div key={card.id} className="metric-card" style={{ borderTopColor: card.color }}>
            <div className="metric-header">
              <IconComponent
                size={24}
                style={{ color: card.color }}
                className="metric-icon"
              />
              <h3 className="metric-title">{card.title}</h3>
            </div>
            <div className="metric-value">
              {typeof card.stat === 'number' ? card.stat.toLocaleString() : card.stat}
              <span className="metric-unit">{card.unit}</span>
            </div>
            {card.subtext && <p className="metric-subtext">{card.subtext}</p>}
          </div>
        );
      })}

      {summary.topMetrics && summary.topMetrics.length > 0 && (
        <div className="top-metrics-section">
          <h3>Top Health Metrics</h3>
          <div className="top-metrics-list">
            {summary.topMetrics.slice(0, 5).map((metric, idx) => (
              <div key={idx} className="top-metric-item">
                <div className="metric-name">{metric.type.replace(/HKQuantityTypeIdentifier/g, '')}</div>
                <div className="metric-stats">
                  <span title="Average">{metric.avg} {metric.unit}</span>
                  <span title="Count">{metric.count} readings</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default MetricsCards;
