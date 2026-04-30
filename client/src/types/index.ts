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

export interface FrameworkDomain {
  id: string;
  code: string;
  name: string;
  category: 'Core' | 'Enabling';
  sortOrder: number;
  capabilities?: Capability[];
  _count?: { capabilities: number };
}

export interface Capability {
  id: string;
  code: string;
  name: string;
  description?: string;
  domainId: string;
  domain?: FrameworkDomain;
  sortOrder: number;
}

export interface CapabilityScore {
  id: string;
  systemId: string;
  capabilityId: string;
  value: 0 | 50 | 100;
  evidence?: string;
}

export interface DomainScore {
  domainCode: string;
  domainName: string;
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
  domainScores: DomainScore[];
}

export interface HeatmapData {
  systems: VendorSystem[];
  capabilities: (Capability & { domain: FrameworkDomain })[];
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
  capability: Capability & { domain?: FrameworkDomain };
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

// `AuthUser` lives in the auth context (its semantic owner) and is
// re-exported here so callers that import API/domain types from
// `../types` get a single, consistent shape. Adding fields (e.g. the
// `impersonator` claim from Phase 10.3) only requires touching the
// context definition.
export type { AuthUser } from '../contexts/AuthContext';

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
