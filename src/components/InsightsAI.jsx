import React from 'react';
import { Brain, AlertCircle, TrendingUp, Zap, Heart, MessageSquare } from 'lucide-react';
import './InsightsAI.css';

function InsightsAI({ data }) {
  const { metricsByType, workoutsByDate, allDates, summary } = data;

  // Generate AI insights
  const generateInsights = () => {
    const insights = [];

    // Analyze patterns
    if (allDates && allDates.length > 0) {
      const sortedDates = [...allDates].sort();
      const dayOfWeekCounts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

      sortedDates.forEach(date => {
        const dayOfWeek = new Date(date).getDay();
        dayOfWeekCounts[dayOfWeek]++;
      });

      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const mostActiveDay = Object.entries(dayOfWeekCounts)
        .sort(([, a], [, b]) => b - a)[0];

      if (mostActiveDay[1] > 0) {
        insights.push({
          type: 'pattern',
          icon: TrendingUp,
          title: 'Your Peak Activity Day',
          description: `You're most active on ${dayNames[mostActiveDay[0]]}s! Consider scheduling long runs on this day.`,
          color: '#10b981',
        });
      }
    }

    // Workout consistency
    const totalWorkouts = Object.values(workoutsByDate || {}).reduce((a, b) => a + b, 0);
    const avgPerDay = totalWorkouts / (allDates?.length || 1);

    if (avgPerDay > 1.5) {
      insights.push({
        type: 'alert',
        icon: AlertCircle,
        title: '⚠️ Overtraining Alert',
        description: `You average ${avgPerDay.toFixed(1)} workouts per day. Consider rest days to prevent injury and burnout.`,
        color: '#f59e0b',
      });
    } else if (avgPerDay > 1) {
      insights.push({
        type: 'positive',
        icon: Zap,
        title: 'Great Consistency!',
        description: `${avgPerDay.toFixed(1)} workouts per day shows excellent dedication to your fitness goals.`,
        color: '#10b981',
      });
    }

    // Heart rate recovery
    const heartRateData = metricsByType?.HKQuantityTypeIdentifierHeartRate;
    if (heartRateData && heartRateData.min && heartRateData.max) {
      const recovery = Math.round(heartRateData.max - heartRateData.min);
      if (recovery > 40) {
        insights.push({
          type: 'positive',
          icon: Heart,
          title: 'Excellent Heart Rate Recovery',
          description: `Your HR range of ${recovery} bpm indicates good cardiovascular fitness. Keep up the great work!`,
          color: '#ef4444',
        });
      }
    }

    // Distance progression
    const distanceData = metricsByType?.HKQuantityTypeIdentifierDistanceWalkingRunning;
    if (distanceData && distanceData.values && distanceData.values.length > 10) {
      const recentAvg = distanceData.values
        .slice(-5)
        .reduce((sum, v) => sum + parseFloat(v.value), 0) / 5;
      const olderAvg = distanceData.values
        .slice(0, 5)
        .reduce((sum, v) => sum + parseFloat(v.value), 0) / 5;

      if (recentAvg > olderAvg * 1.1) {
        insights.push({
          type: 'positive',
          icon: TrendingUp,
          title: 'Improving Distance',
          description: `Your recent workouts are ${((recentAvg / olderAvg - 1) * 100).toFixed(0)}% longer. You're getting stronger!`,
          color: '#3b82f6',
        });
      }
    }

    // Recovery recommendation
    const lastWorkoutDate = allDates ? [...allDates].sort().reverse()[0] : null;
    if (lastWorkoutDate) {
      const daysSinceLastWorkout = Math.floor(
        (Date.now() - new Date(lastWorkoutDate).getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceLastWorkout > 2) {
        insights.push({
          type: 'suggestion',
          icon: MessageSquare,
          title: 'Time for a Workout',
          description: `It's been ${daysSinceLastWorkout} days since your last activity. Time to get moving! 🏃`,
          color: '#667eea',
        });
      }
    }

    // Goal projection
    const totalDistance = distanceData?.sum / 1000 || 0;
    if (totalDistance > 0 && allDates && allDates.length > 7) {
      const daysTracked = allDates.length;
      const distancePerDay = totalDistance / daysTracked;
      const projectedMonthly = distancePerDay * 30;

      insights.push({
        type: 'projection',
        icon: Zap,
        title: 'Monthly Projection',
        description: `At your current pace, you'll run ${projectedMonthly.toFixed(0)} KM this month. 🎯`,
        color: '#8b5cf6',
      });
    }

    return insights.length > 0 ? insights : [
      {
        type: 'info',
        icon: Brain,
        title: 'Welcome to AI Coach',
        description: 'Keep tracking your workouts to unlock personalized insights and recommendations!',
        color: '#667eea',
      },
    ];
  };

  const insights = generateInsights();

  return (
    <div className="insights-ai">
      <div className="insights-header">
        <Brain size={24} />
        <h3>AI Coach Insights</h3>
      </div>

      <div className="insights-grid">
        {insights.map((insight, idx) => {
          const IconComponent = insight.icon;
          return (
            <div key={idx} className={`insight-card insight-${insight.type}`}>
              <div className="insight-icon" style={{ backgroundColor: `${insight.color}20` }}>
                <IconComponent size={24} style={{ color: insight.color }} />
              </div>
              <div className="insight-content">
                <h4>{insight.title}</h4>
                <p>{insight.description}</p>
              </div>
              <div className="insight-accent" style={{ backgroundColor: insight.color }}></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default InsightsAI;
