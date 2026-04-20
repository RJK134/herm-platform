export interface VendorProfileData {
  systemNameContains: string;
  foundedYear?: number;
  headquarters?: string;
  employees?: string;
  marketShare?: string;
  gartnerPosition?: string | null;
  deploymentModel: string[];
  techStack?: string;
  apiStandards: string[];
  integrationProtocols: string[];
  certifications: string[];
  pricingModel?: string;
  typicalCostRange?: string;
  implementationTime?: string;
  keyStrengths: string[];
  knownLimitations: string[];
  recentNews?: string;
}

export interface ResearchItemData {
  title: string;
  publisher: string;
  year: number;
  category: string;
  tags: string[];
  summary?: string;
  url?: string;
  relevantSystems: string[];
}

export interface ScoringMethodologyRecord {
  category: string;
  content: unknown;
}
