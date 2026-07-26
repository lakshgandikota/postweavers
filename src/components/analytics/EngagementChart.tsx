import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type { ChartDataPoint } from '../../types/analytics';

interface EngagementChartProps {
  data: ChartDataPoint[];
  type?: 'line' | 'bar';
  height?: number;
  metrics?: ('views' | 'likes' | 'retweets')[];
}

/**
 * Responsive engagement chart component
 * Supports line and bar chart types with dark mode theming
 */
export const EngagementChart = React.memo(function EngagementChart({
  data,
  type = 'line',
  height = 250,
  metrics = ['views', 'likes', 'retweets'],
}: EngagementChartProps) {
  const Chart = type === 'line' ? LineChart : BarChart;
  const DataComponent = type === 'line' ? Line : Bar;

  // Metric color mapping matching X.com theme
  const metricColors = {
    views: '#1d9bf0',    // X blue
    likes: '#f91880',    // X pink
    retweets: '#00ba7c', // X green
  };

  // Detect dark mode from document class
  const isDarkMode = typeof document !== 'undefined' &&
    document.documentElement.classList.contains('dark');

  // Theme-aware colors
  const axisColor = isDarkMode ? '#71767b' : '#536471';
  const gridColor = isDarkMode ? '#2f3336' : '#eff3f4';
  const tooltipBg = isDarkMode ? '#16181c' : '#ffffff';
  const tooltipBorder = isDarkMode ? '#2f3336' : '#eff3f4';
  const tooltipText = isDarkMode ? '#e7e9ea' : '#0f1419';

  return (
    <ResponsiveContainer width="100%" height={height}>
      <Chart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke={gridColor}
        />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 12, fill: axisColor }}
          stroke={gridColor}
        />
        <YAxis
          tick={{ fontSize: 12, fill: axisColor }}
          stroke={gridColor}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: tooltipBg,
            borderRadius: '0.5rem',
            border: `1px solid ${tooltipBorder}`,
            color: tooltipText,
          }}
          labelStyle={{ color: tooltipText }}
          itemStyle={{ color: tooltipText }}
        />
        <Legend
          wrapperStyle={{ fontSize: '12px', color: axisColor }}
        />
        {metrics.map((metric) => (
          <DataComponent
            key={metric}
            type={type === 'line' ? 'monotone' : undefined}
            dataKey={metric}
            stroke={metricColors[metric]}
            fill={metricColors[metric]}
            name={metric.charAt(0).toUpperCase() + metric.slice(1)}
            strokeWidth={type === 'line' ? 2 : undefined}
          />
        ))}
      </Chart>
    </ResponsiveContainer>
  );
});
