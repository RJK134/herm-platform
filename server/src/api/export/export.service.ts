import { ScoresService } from '../scores/scores.service';

const scoresService = new ScoresService();

export class ExportService {
  async leaderboardCsv(): Promise<string> {
    const entries = await scoresService.getLeaderboard();
    const lines: string[] = [
      'Rank,System,Vendor,Category,Cloud Native,HERM Score,Max Score,Coverage %',
    ];
    for (const e of entries) {
      lines.push(
        [
          e.rank,
          `"${e.system.name}"`,
          `"${e.system.vendor}"`,
          e.system.category,
          e.system.cloudNative ? 'Yes' : 'No',
          e.totalScore,
          e.maxScore,
          Math.round(e.percentage),
        ].join(',')
      );
    }
    return lines.join('\n');
  }

  async heatmapCsv(): Promise<string> {
    const { systems, capabilities, matrix } = await scoresService.getHeatmap();
    // Header row: System | Cap codes...
    const header = ['System', ...capabilities.map(c => c.code)].join(',');
    const rows: string[] = [header];
    for (const system of systems) {
      const row = [
        `"${system.name}"`,
        ...capabilities.map(c => String(matrix[system.id]?.[c.code] ?? 0)),
      ];
      rows.push(row.join(','));
    }
    return rows.join('\n');
  }

  async fullReportJson(): Promise<object> {
    const [leaderboard, heatmap] = await Promise.all([
      scoresService.getLeaderboard(),
      scoresService.getHeatmap(),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      version: '1.0.0',
      platform: 'HERM Procurement & Capability Intelligence Platform',
      leaderboard,
      heatmap,
    };
  }
}
