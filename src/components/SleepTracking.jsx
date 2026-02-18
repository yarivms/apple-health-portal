import React from 'react';
import { Moon, Bed, TrendingUp, Clock } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import './SleepTracking.css';

function SleepTracking({ metricsByType }) {
  // Extract sleep data
  const getSleepData = () => {
    const sleepMetrics = metricsByType?.HKCategoryTypeIdentifierSleepAnalysis;
    
    if (!sleepMetrics || !sleepMetrics.values || sleepMetrics.values.length === 0) {
      return { hasData: false, avgSleep: 0, totalNights: 0, bestNight: 0, worstNight: 0 };
    }

    const sleepByDate = {};
    sleepMetrics.values.forEach(val => {
      if (!sleepByDate[val.date]) {
        sleepByDate[val.date] = 0;
      }
      sleepByDate[val.date]++;
    });

    const sleepValues = Object.values(sleepByDate);
    const avgSleep = sleepValues.length > 0 ? (sleepValues.reduce((a, b) => a + b) / sleepValues.length).toFixed(1) : 0;
    const bestNight = sleepValues.length > 0 ? Math.max(...sleepValues) : 0;
    const worstNight = sleepValues.length > 0 ? Math.min(...sleepValues) : 0;

    const chartData = Object.entries(sleepByDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-30)
      .map(([date, hours]) => ({
        date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        sleep: hours,
      }));

    return {
      hasData: sleepValues.length > 0,
      avgSleep,
      totalNights: sleepValues.length,
      bestNight,
      worstNight,
      chartData,
    };
  };

  const sleepData = getSleepData();

  if (!sleepData.hasData) {
    return (
      <div className="sleep-tracking no-data">
        <Moon size={32} />
        <h3>Sleep Tracking</h3>
        <p>No sleep data available in your health export.</p>
      </div>
    );
  }

  return (
    <div className="sleep-tracking">
      <div className="sleep-header">
        <Moon size={24} />
        <h3>Sleep Tracking</h3>
      </div>

      <div className="sleep-stats">
        <div className="sleep-stat-card">
          <Bed size={20} />
          <div className="stat-info">
            <div className="stat-label">Average Sleep</div>
            <div className="stat-value">{sleepData.avgSleep}</div>
            <div className="stat-unit">hours/night</div>
          </div>
        </div>

        <div className="sleep-stat-card">
          <Clock size={20} />
          <div className="stat-info">
            <div className="stat-label">Nights Tracked</div>
            <div className="stat-value">{sleepData.totalNights}</div>
            <div className="stat-unit">nights</div>
          </div>
        </div>

        <div className="sleep-stat-card">
          <TrendingUp size={20} />
          <div className="stat-info">
            <div className="stat-label">Best Night</div>
            <div className="stat-value">{sleepData.bestNight}</div>
            <div className="stat-unit">hours</div>
          </div>
        </div>

        <div className="sleep-stat-card">
          <Moon size={20} />
          <div className="stat-info">
            <div className="stat-label">Worst Night</div>
            <div className="stat-value">{sleepData.worstNight}</div>
            <div className="stat-unit">hours</div>
          </div>
        </div>
      </div>

      {sleepData.chartData && sleepData.chartData.length > 0 && (
        <div className="sleep-chart">
          <h4>Sleep Over Time</h4>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={sleepData.chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" stroke="#6b7280" />
              <YAxis stroke="#6b7280" />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1f2937',
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#fff',
                }}
              />
              <Bar dataKey="sleep" fill="#667eea" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export default SleepTracking;
