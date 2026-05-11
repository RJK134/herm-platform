import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

interface BarChartProps {
  labels: string[];
  data: number[];
  colors?: string[];
  horizontal?: boolean;
  /**
   * WCAG 1.1.1 (Non-text Content). Screen-reader summary for the chart.
   * If omitted a generic auto-summary derives from labels + data so the
   * chart never appears to AT users as a nameless `<canvas>`. Pass an
   * explicit string when the chart is contextual (e.g. "scoring chart
   * for SITS:Vision on Learning & Teaching") for a richer reading.
   */
  ariaLabel?: string;
}

function autoBarSummary(labels: string[], data: number[]): string {
  if (labels.length === 0) return 'Empty bar chart';
  const top = data.reduce(
    (acc, v, i) => (v > acc.v ? { v, i } : acc),
    { v: -Infinity, i: 0 },
  );
  return `Bar chart of ${labels.length} values. Highest: ${labels[top.i]} at ${data[top.i]}.`;
}

export function BarChart({ labels, data, colors, horizontal = false, ariaLabel }: BarChartProps) {
  const chartData = {
    labels,
    datasets: [
      {
        data,
        backgroundColor: colors || data.map(v => (v >= 80 ? '#16a34a' : v >= 50 ? '#d97706' : '#dc2626')),
      },
    ],
  };

  const options = {
    responsive: true,
    indexAxis: (horizontal ? 'y' : 'x') as 'x' | 'y',
    plugins: { legend: { display: false } },
    scales: {
      x: { max: horizontal ? 100 : undefined },
      y: { max: horizontal ? undefined : 100 },
    },
  };

  return (
    <div role="img" aria-label={ariaLabel ?? autoBarSummary(labels, data)}>
      <Bar data={chartData} options={options} />
    </div>
  );
}
