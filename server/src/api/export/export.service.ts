import { ScoresService } from '../scores/scores.service';

const scoresService = new ScoresService();

export class ExportService {
  async leaderboardCsv(frameworkId?: string): Promise<string> {
    const { entries, framework } = await scoresService.getLeaderboard(frameworkId);
    const scoreHeader = framework ? `${framework.name} Score` : 'Capability Score';
    const lines: string[] = [
      `Rank,System,Vendor,Category,Cloud Native,${scoreHeader},Max Score,Coverage %`,
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

  async heatmapCsv(frameworkId?: string): Promise<string> {
    const { systems, capabilities, matrix } = await scoresService.getHeatmap(frameworkId);
    // Header row: System | Cap codes...
    const header = ['System', ...capabilities.map((c) => c.code)].join(',');
    const rows: string[] = [header];
    for (const system of systems) {
      const row = [
        `"${system.name}"`,
        ...capabilities.map((c) => String(matrix[system.id]?.[c.code] ?? 0)),
      ];
      rows.push(row.join(','));
    }
    return rows.join('\n');
  }

  async fullReportJson(frameworkId?: string): Promise<object> {
    const [leaderboard, heatmap] = await Promise.all([
      scoresService.getLeaderboard(frameworkId),
      scoresService.getHeatmap(frameworkId),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      version: '1.0.0',
      platform: 'Capability Intelligence Platform',
      framework: leaderboard.framework,
      leaderboard,
      heatmap,
    };
  }
}
