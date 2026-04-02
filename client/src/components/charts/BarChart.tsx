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
}

export function BarChart({ labels, data, colors, horizontal = false }: BarChartProps) {
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

  return <Bar data={chartData} options={options} />;
}
