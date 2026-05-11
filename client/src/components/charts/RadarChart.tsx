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
  /**
   * WCAG 1.1.1 (Non-text Content). Screen-reader summary for the chart.
   * If omitted, a generic summary listing the dataset labels is built
   * so the chart never appears to AT users as a nameless `<canvas>`.
   */
  ariaLabel?: string;
}

function autoRadarSummary(datasets: RadarDataset[]): string {
  if (datasets.length === 0) return 'Empty radar chart';
  const names = datasets.map(d => d.label).join(', ');
  return `Radar chart comparing ${datasets.length} system${datasets.length === 1 ? '' : 's'}: ${names}.`;
}

export function RadarChart({ labels, datasets, ariaLabel }: RadarChartProps) {
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

  return (
    <div role="img" aria-label={ariaLabel ?? autoRadarSummary(datasets)}>
      <Radar data={data} options={options} />
    </div>
  );
}
