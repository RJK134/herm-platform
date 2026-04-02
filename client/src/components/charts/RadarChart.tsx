import { Radar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

interface RadarDataset {
  label: string;
  data: number[];
  color: string;
}

interface RadarChartProps {
  labels: string[];
  datasets: RadarDataset[];
}

export function RadarChart({ labels, datasets }: RadarChartProps) {
  const data = {
    labels,
    datasets: datasets.map(d => ({
      label: d.label,
      data: d.data,
      borderColor: d.color,
      backgroundColor: d.color + '20',
      pointBackgroundColor: d.color,
      borderWidth: 2,
    })),
  };

  const options = {
    responsive: true,
    scales: {
      r: {
        min: 0,
        max: 100,
        ticks: { stepSize: 25, font: { size: 10 } },
        pointLabels: { font: { size: 11 } },
      },
    },
    plugins: {
      legend: { position: 'bottom' as const, labels: { boxWidth: 12, font: { size: 12 } } },
    },
  };

  return <Radar data={data} options={options} />;
}
