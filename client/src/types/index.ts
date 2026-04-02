export interface VendorSystem {
  id: string;
  name: string;
  vendor: string;
  category: 'SIS' | 'LMS' | 'CRM' | 'HCM' | 'SJMS';
  description?: string;
  regions: string[];
  cloudNative: boolean;
  isOwnSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HermFamily {
  id: string;
  code: string;
  name: string;
  category: 'Core' | 'Enabling';
  sortOrder: number;
  capabilities?: HermCapability[];
  _count?: { capabilities: number };
}

export interface HermCapability {
  id: string;
  code: string;
  name: string;
  description?: string;
  familyId: string;
  family?: HermFamily;
  sortOrder: number;
}

export interface Score {
  id: string;
  systemId: string;
  capabilityId: string;
  value: 0 | 50 | 100;
  evidence?: string;
}

export interface FamilyScore {
  familyCode: string;
  familyName: string;
  score: number;
  maxScore: number;
  percentage: number;
}

export interface LeaderboardEntry {
  system: VendorSystem;
  totalScore: number;
  maxScore: number;
  percentage: number;
  rank: number;
  familyScores: FamilyScore[];
}

export interface HeatmapData {
  systems: VendorSystem[];
  capabilities: (HermCapability & { family: HermFamily })[];
  matrix: Record<string, Record<string, number>>;
}

export interface CapabilityBasket {
  id: string;
  name: string;
  description?: string;
  isTemplate: boolean;
  items: BasketItem[];
  createdAt: string;
}

export interface BasketItem {
  id: string;
  capabilityId: string;
  capability: HermCapability & { family?: HermFamily };
  priority: 'must' | 'should' | 'could' | 'wont';
  weight: number;
  notes?: string;
}

export interface BasketEvaluation {
  system: VendorSystem;
  score: number;
  maxScore: number;
  percentage: number;
  rank: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  pagination?: { total: number; page: number; limit: number; pages: number };
  error?: { code: string; message: string };
}

export interface VendorProfile {
  id: string;
  systemId: string;
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
  lastUpdated: string;
}

export interface VendorSystemWithProfile extends VendorSystem {
  profile?: VendorProfile;
}

export interface ResearchItem {
  id: string;
  title: string;
  publisher: string;
  year: number;
  category: string;
  tags: string[];
  summary?: string;
  url?: string;
  relevantSystems: string[];
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface ScoringMethodology {
  id: string;
  category: string;
  content: Record<string, unknown>;
  updatedAt: string;
}

// ── Auth & Institution types ─────────────────────────────────────────────────

export interface AuthUser {
  userId: string;
  email: string;
  name: string;
  role: string;
  institutionId: string;
  institutionName: string;
  tier: 'free' | 'professional' | 'enterprise';
}

export interface Subscription {
  id: string;
  institutionId: string;
  tier: 'FREE' | 'PROFESSIONAL' | 'ENTERPRISE';
  status: string;
  stripeCustomerId?: string;
  currentPeriodEnd?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InstitutionDetail {
  id: string;
  name: string;
  slug: string;
  country: string;
  logoUrl?: string;
  domain?: string;
  tier: string;
  subscription?: Subscription;
  _count?: {
    users: number;
    projects: number;
    baskets: number;
  };
}

export interface InstitutionUser {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
}

export type UserRole =
  | 'SUPER_ADMIN'
  | 'INSTITUTION_ADMIN'
  | 'PROCUREMENT_LEAD'
  | 'EVALUATOR'
  | 'VENDOR_ADMIN'
  | 'VENDOR_CONTRIBUTOR'
  | 'VIEWER';
