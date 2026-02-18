import React from 'react';
import { Trophy, Flame, TrendingUp, Zap, Target, Award } from 'lucide-react';
import './AchievementBadges.css';

function AchievementBadges({ data }) {
  const { metricsByType, workoutsByDate, allDates } = data;

  // Calculate achievements
  const getAchievements = () => {
    const achievements = [];
    
    // Total workouts
    const totalWorkouts = Object.values(workoutsByDate || {}).reduce((a, b) => a + b, 0);
    
    // Total distance
    let totalDistance = 0;
    if (metricsByType?.HKQuantityTypeIdentifierDistanceWalkingRunning?.sum) {
      totalDistance = metricsByType.HKQuantityTypeIdentifierDistanceWalkingRunning.sum / 1000;
    }

    // Streak calculation
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    const sortedDates = [...(allDates || [])].sort().reverse();
    
    for (let i = 0; i < sortedDates.length; i++) {
      if (workoutsByDate?.[sortedDates[i]]) {
        tempStreak++;
        if (tempStreak > longestStreak) longestStreak = tempStreak;
      } else {
        if (i === 0) currentStreak = tempStreak;
        tempStreak = 0;
      }
    }
    if (tempStreak > 0 && tempStreak > longestStreak) longestStreak = tempStreak;

    // Total energy
    let totalEnergy = 0;
    if (metricsByType?.HKQuantityTypeIdentifierEnergyBurned?.sum) {
      totalEnergy = metricsByType.HKQuantityTypeIdentifierEnergyBurned.sum;
    }

    // Define badges
    const badgeDefinitions = [
      { id: 'workouts-10', name: '10 Workouts', icon: Zap, color: '#f59e0b', unlock: totalWorkouts >= 10, value: totalWorkouts },
      { id: 'workouts-50', name: '50 Workouts', icon: Trophy, color: '#8b5cf6', unlock: totalWorkouts >= 50, value: totalWorkouts },
      { id: 'workouts-100', name: '100 Workouts', icon: Award, color: '#ef4444', unlock: totalWorkouts >= 100, value: totalWorkouts },
      
      { id: 'distance-10', name: '10 KM', icon: TrendingUp, color: '#3b82f6', unlock: totalDistance >= 10, value: Math.floor(totalDistance) },
      { id: 'distance-50', name: '50 KM', icon: Target, color: '#10b981', unlock: totalDistance >= 50, value: Math.floor(totalDistance) },
      { id: 'distance-100', name: '100 KM', icon: Flame, color: '#f59e0b', unlock: totalDistance >= 100, value: Math.floor(totalDistance) },
      { id: 'distance-500', name: '500 KM', icon: Trophy, color: '#8b5cf6', unlock: totalDistance >= 500, value: Math.floor(totalDistance) },
      
      { id: 'streak-7', name: '7 Day Streak', icon: Flame, color: '#ef4444', unlock: longestStreak >= 7, value: longestStreak },
      { id: 'streak-30', name: '30 Day Streak', icon: Trophy, color: '#10b981', unlock: longestStreak >= 30, value: longestStreak },
      
      { id: 'energy-1000', name: '1000 kcal Burned', icon: Zap, color: '#f59e0b', unlock: totalEnergy >= 1000, value: Math.floor(totalEnergy) },
      { id: 'energy-5000', name: '5000 kcal Burned', icon: Flame, color: '#ef4444', unlock: totalEnergy >= 5000, value: Math.floor(totalEnergy) },
    ];

    return badgeDefinitions;
  };

  const achievements = getAchievements();
  const unlockedCount = achievements.filter(a => a.unlock).length;
  const totalCount = achievements.length;

  return (
    <div className="achievement-badges">
      <div className="badges-header">
        <h3>Achievements</h3>
        <div className="badge-progress">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${(unlockedCount / totalCount) * 100}%` }}></div>
          </div>
          <span className="progress-text">{unlockedCount} of {totalCount} unlocked</span>
        </div>
      </div>

      <div className="badges-grid">
        {achievements.map(badge => {
          const IconComponent = badge.icon;
          return (
            <div
              key={badge.id}
              className={`badge-item ${badge.unlock ? 'unlocked' : 'locked'}`}
              title={`${badge.name}: ${badge.value} achieved`}
            >
              <div className="badge-circle" style={badge.unlock ? { borderColor: badge.color, backgroundColor: `${badge.color}15` } : {}}>
                <IconComponent
                  size={28}
                  style={{
                    color: badge.unlock ? badge.color : '#d1d5db',
                    opacity: badge.unlock ? 1 : 0.4,
                  }}
                />
              </div>
              <div className="badge-content">
                <div className="badge-name">{badge.name}</div>
                <div className="badge-value">{badge.value}</div>
              </div>
              {badge.unlock && <div className="badge-shine"></div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default AchievementBadges;
