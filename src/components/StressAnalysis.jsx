import React, { useState } from 'react';
import { Heart, Zap, Smile, TrendingDown, Calendar } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import './StressAnalysis.css';

function StressAnalysis({ metricsByType, allDates }) {
  const [selectedMetric, setSelectedMetric] = useState('stress');

  // Estimate stress/wellness from available metrics
  const getStressData = () => {
    const heartRateMetrics = metricsByType?.HKQuantityTypeIdentifierHeartRate;
    const mindfulMetrics = metricsByType?.HKCategoryTypeIdentifierMindfulSession;

    if (!heartRateMetrics || !heartRateMetrics.values || heartRateMetrics.values.length === 0) {
      return {
        hasData: false,
        avgHeartRate: 0,
        maxHeartRate: 0,
        minHeartRate: 0,
        meditationSessions: 0,
        stressLevel: 'Unknown',
      };
    }

    const hrValues = heartRateMetrics.values.map(v => parseFloat(v.value));
    const avgHeartRate = (hrValues.reduce((a, b) => a + b) / hrValues.length).toFixed(1);
    const maxHeartRate = Math.max(...hrValues);
    const minHeartRate = Math.min(...hrValues);

    const meditationSessions = mindfulMetrics?.count || 0;

    // Simple stress estimation: high heart rate + high variability = stress
    // Variance calculation
    const variance = hrValues.reduce((sum, val) => sum + Math.pow(val - avgHeartRate, 2), 0) / hrValues.length;
    const stdDev = Math.sqrt(variance);

    let stressLevel = 'Low';
    let stressScore = 0;
    if (avgHeartRate > 80 && stdDev > 15) {
      stressLevel = 'High';
      stressScore = 80;
    } else if (avgHeartRate > 75 || stdDev > 12) {
      stressLevel = 'Moderate';
      stressScore = 50;
    } else {
      stressScore = 20;
    }

    // Generate chart data by date
    const stressByDate = {};
    allDates?.forEach(date => {
      const dateStr = new Date(date).toISOString().split('T')[0];
      const dayHRs = heartRateMetrics.values
        .filter(v => v.date === dateStr)
        .map(v => parseFloat(v.value));
      
      if (dayHRs.length > 0) {
        const dayAvg = dayHRs.reduce((a, b) => a + b) / dayHRs.length;
        const dayVariance = dayHRs.reduce((sum, val) => sum + Math.pow(val - dayAvg, 2), 0) / dayHRs.length;
        const dayStdDev = Math.sqrt(dayVariance);
        
        // Estimate daily stress (0-100)
        let dailyStress = 30;
        if (dayAvg > 80 && dayStdDev > 15) dailyStress = 80;
        else if (dayAvg > 75 || dayStdDev > 12) dailyStress = 55;
        else dailyStress = 30;

        stressByDate[dateStr] = { stress: dailyStress, hr: dayAvg, variability: dayStdDev };
      }
    });

    const chartData = Object.entries(stressByDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-30)
      .map(([date, data]) => ({
        date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        stress: data.stress,
        heartRate: Math.round(data.hr),
        variability: data.variability.toFixed(1),
      }));

    return {
      hasData: true,
      avgHeartRate,
      maxHeartRate,
      minHeartRate,
      meditationSessions,
      stressLevel,
      stressScore,
      chartData,
    };
  };

  const stressData = getStressData();

  if (!stressData.hasData) {
    return (
      <div className="stress-analysis no-data">
        <Heart size={32} />
        <h3>Stress Analysis</h3>
        <p>Heart rate data needed to analyze stress patterns.</p>
      </div>
    );
  }

  // Determine color based on stress level
  const getStressColor = () => {
    if (stressData.stressLevel === 'High') return '#ef4444';
    if (stressData.stressLevel === 'Moderate') return '#f59e0b';
    return '#10b981';
  };

  return (
    <div className="stress-analysis">
      <div className="stress-header">
        <Heart size={24} style={{ color: getStressColor() }} />
        <h3>Stress & Wellness Analysis</h3>
      </div>

      {/* Stress Level Badge */}
      <div className="stress-badge" style={{ borderColor: getStressColor() }}>
        <div className="stress-indicator" style={{ backgroundColor: getStressColor() }}></div>
        <div className="stress-info">
          <div className="stress-label">Current Stress Level</div>
          <div className="stress-value" style={{ color: getStressColor() }}>
            {stressData.stressLevel}
          </div>
        </div>
        <div className="stress-bar">
          <div className="stress-bar-fill" style={{ width: `${stressData.stressScore}%`, backgroundColor: getStressColor() }}></div>
        </div>
      </div>

      {/* Vital Stats Grid */}
      <div className="vital-stats">
        <div className="vital-card">
          <Zap size={20} />
          <div className="vital-info">
            <div className="vital-label">Average HR</div>
            <div className="vital-value">{stressData.avgHeartRate}</div>
            <div className="vital-unit">BPM</div>
          </div>
        </div>

        <div className="vital-card">
          <TrendingDown size={20} />
          <div className="vital-info">
            <div className="vital-label">Resting HR</div>
            <div className="vital-value">{stressData.minHeartRate}</div>
            <div className="vital-unit">BPM</div>
          </div>
        </div>

        <div className="vital-card">
          <Smile size={20} />
          <div className="vital-info">
            <div className="vital-label">Meditation Sessions</div>
            <div className="vital-value">{stressData.meditationSessions}</div>
            <div className="vital-unit">sessions</div>
          </div>
        </div>
      </div>

      {/* Metric Toggle */}
      <div className="metric-toggle">
        <button
          className={`toggle-btn ${selectedMetric === 'stress' ? 'active' : ''}`}
          onClick={() => setSelectedMetric('stress')}
        >
          Stress Trend
        </button>
        <button
          className={`toggle-btn ${selectedMetric === 'heart' ? 'active' : ''}`}
          onClick={() => setSelectedMetric('heart')}
        >
          Heart Rate
        </button>
      </div>

      {/* Chart */}
      {stressData.chartData && stressData.chartData.length > 0 && (
        <div className="stress-chart">
          {selectedMetric === 'stress' ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={stressData.chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" stroke="#9ca3af" />
                <YAxis stroke="#9ca3af" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1f2937',
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#fff',
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="stress"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                  name="Stress Level"
                />
                <Line
                  type="monotone"
                  dataKey="variability"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                  name="HR Variability"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stressData.chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" stroke="#9ca3af" />
                <YAxis stroke="#9ca3af" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1f2937',
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#fff',
                  }}
                />
                <Legend />
                <Bar dataKey="heartRate" fill="#60a5fa" radius={[8, 8, 0, 0]} name="Heart Rate (BPM)" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* Wellness Recommendations */}
      <div className="wellness-tips">
        <h4>💡 Wellness Tips</h4>
        {stressData.meditationSessions < 5 && (
          <div className="tip">
            <span>🧘</span>
            <p>Consider adding meditation sessions to reduce stress. Even 5-10 minutes daily can help.</p>
          </div>
        )}
        {stressData.stressLevel === 'High' && (
          <div className="tip">
            <span>⚠️</span>
            <p>High heart rate variability detected. Try relaxation techniques like deep breathing or yoga.</p>
          </div>
        )}
        {stressData.avgHeartRate > 75 && (
          <div className="tip">
            <span>❤️</span>
            <p>Your average heart rate is elevated. Regular cardio exercise can help improve cardiovascular health.</p>
          </div>
        )}
        {stressData.stressLevel === 'Low' && (
          <div className="tip">
            <span>✅</span>
            <p>Great job maintaining low stress levels! Keep up your current routine.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default StressAnalysis;
