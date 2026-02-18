import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import './ActivityHeatmap.css';

function ActivityHeatmap({ allDates, workoutsByDate }) {
  const [displayMonth, setDisplayMonth] = useState(new Date());

  const getActivityLevel = (date) => {
    if (!workoutsByDate || !workoutsByDate[date]) return 0;
    const count = workoutsByDate[date];
    if (count >= 3) return 4; // Very high
    if (count >= 2) return 3; // High
    if (count >= 1) return 2; // Medium
    return 1;
  };

  const getDaysInMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const buildCalendar = () => {
    const year = displayMonth.getFullYear();
    const month = displayMonth.getMonth();
    const daysInMonth = getDaysInMonth(displayMonth);
    const firstDay = getFirstDayOfMonth(displayMonth);
    
    const weeks = [];
    let currentWeek = new Array(7).fill(null);
    
    // Fill first week with empty slots
    for (let i = firstDay; i < 7 && i - firstDay < daysInMonth; i++) {
      const day = i - firstDay + 1;
      currentWeek[i] = {
        day,
        date: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        isCurrentMonth: true,
      };
    }
    if (currentWeek.some(d => d)) {
      weeks.push([...currentWeek]);
    }
    
    // Fill remaining weeks
    currentWeek = new Array(7).fill(null);
    let dayIndex = 0;
    for (let day = firstDay > 0 ? 7 - firstDay + 1 : 1; day <= daysInMonth; day++) {
      dayIndex = (day + firstDay - 1) % 7;
      currentWeek[dayIndex] = {
        day,
        date: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        isCurrentMonth: true,
      };
      
      if (dayIndex === 6) {
        weeks.push([...currentWeek]);
        currentWeek = new Array(7).fill(null);
      }
    }
    
    if (currentWeek.some(d => d)) {
      weeks.push([...currentWeek]);
    }
    
    return weeks;
  };

  const weeks = buildCalendar();
  const monthStr = displayMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const previousMonth = () => {
    setDisplayMonth(new Date(displayMonth.getFullYear(), displayMonth.getMonth() - 1));
  };

  const nextMonth = () => {
    setDisplayMonth(new Date(displayMonth.getFullYear(), displayMonth.getMonth() + 1));
  };

  const getLevelLabel = (level) => {
    const labels = ['', 'Low', 'Medium', 'High', 'Very High'];
    return labels[level] || '';
  };

  return (
    <div className="activity-heatmap">
      <div className="heatmap-header">
        <h3>Activity Heatmap</h3>
        <p>Visualize your workout patterns throughout the month</p>
      </div>

      <div className="heatmap-controls">
        <button onClick={previousMonth} className="nav-button">
          <ChevronLeft size={20} />
        </button>
        <h4>{monthStr}</h4>
        <button onClick={nextMonth} className="nav-button">
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="heatmap-calendar">
        <div className="weekdays">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="weekday-label">{day}</div>
          ))}
        </div>

        <div className="weeks">
          {weeks.map((week, weekIdx) => (
            <div key={weekIdx} className="week">
              {week.map((dayObj, dayIdx) => {
                if (!dayObj) {
                  return <div key={`empty-${dayIdx}`} className="day-cell empty"></div>;
                }

                const level = getActivityLevel(dayObj.date);
                const workoutCount = workoutsByDate?.[dayObj.date] || 0;

                return (
                  <div
                    key={dayObj.date}
                    className={`day-cell level-${level}`}
                    title={`${dayObj.date}: ${workoutCount} workout${workoutCount !== 1 ? 's' : ''}`}
                  >
                    <span className="day-number">{dayObj.day}</span>
                    {workoutCount > 0 && (
                      <span className="workout-count">{workoutCount}</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="heatmap-legend">
        <div className="legend-item">
          <div className="legend-box level-0"></div>
          <span>No Activity</span>
        </div>
        <div className="legend-item">
          <div className="legend-box level-1"></div>
          <span>1 Workout</span>
        </div>
        <div className="legend-item">
          <div className="legend-box level-2"></div>
          <span>2 Workouts</span>
        </div>
        <div className="legend-item">
          <div className="legend-box level-3"></div>
          <span>3+ Workouts</span>
        </div>
      </div>
    </div>
  );
}

export default ActivityHeatmap;
