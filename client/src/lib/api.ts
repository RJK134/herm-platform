import axios, { AxiosError } from 'axios';
import toast from 'react-hot-toast';
import type {
  VendorSystem,
  Capability,
  FrameworkDomain,
  LeaderboardEntry,
  HeatmapData,
  CapabilityBasket,
  BasketEvaluation,
  ApiResponse,
  VendorProfile,
  ResearchItem,
  ChatMessage,
  ScoringMethodology,
  AuthUser,
  InstitutionDetail,
  InstitutionUser,
} from '../types';

const TOKEN_KEY = 'herm_auth_token';
const REQUEST_TIMEOUT_MS = 15_000;

// ── Phase 11.4 — SSO IdP admin types ──────────────────────────────────────
export interface SsoIdpReadShape {
  id: string;
  institutionId: string;
  protocol: 'SAML' | 'OIDC';
  displayName: string;
  enabled: boolean;
  jitProvisioning: boolean;
  defaultRole: 'VIEWER' | 'EVALUATOR' | 'PROCUREMENT_LEAD' | 'INSTITUTION_ADMIN';
  samlEntityId: string | null;
  samlSsoUrl: string | null;
  oidcIssuer: string | null;
  oidcClientId: string | null;
  hasSamlCert: boolean;
  hasOidcClientSecret: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SsoIdpListEntry extends SsoIdpReadShape {
  institutionName: string;
  institutionSlug: string;
}

// ── Phase 14.9 — Conflict of Interest declaration shape ──────────────────
// Mirrors the server's `CoiDeclarationView` (server/src/api/evaluations/coi.service.ts).
// `declaredText` may be the empty string ("no conflicts to declare") — the
// row's existence is the audit signal that the declaration step happened.
export interface CoiDeclaration {
  id: string;
  evaluationProjectId: string;
  userId: string;
  declaredText: string;
  declaredHash: string;
  signedAt: string;
}

export interface SsoIdpUpsertPayload {
  protocol?: 'SAML' | 'OIDC';
  displayName?: string;
  enabled?: boolean;
  jitProvisioning?: boolean;
  defaultRole?: 'VIEWER' | 'EVALUATOR' | 'PROCUREMENT_LEAD' | 'INSTITUTION_ADMIN';
  samlEntityId?: string | null;
  samlSsoUrl?: string | null;
  samlCert?: string | null;
  oidcIssuer?: string | null;
  oidcClientId?: string | null;
  oidcClientSecret?: string | null;
}

export class ApiError extends Error {
  code: string;
  status: number;
  requestId?: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, requestId?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.details = details;
  }
}

// Base URL strategy:
// - Dev / single-origin deploys: use the relative `/api` path so requests
//   share the page's origin (Vite dev proxy in dev, single-host server in
//   production-like setups).
// - Split-origin deploys (Vercel SPA + Railway / Fly API): set
//   `VITE_API_URL` at build time to the absolute API origin (no trailing
//   slash, no `/api` suffix) — e.g. `https://herm-api.up.railway.app`.
//   This lib appends `/api` to whatever you give it, so you only need to
//   provide the bare origin.
//
// We also set `axios.defaults.baseURL` to the API origin so the SPA's
// remaining raw-axios callers (AuthContext, Login SSO discovery,
// NotificationBell, VendorPortal, etc.) inherit the right origin without
// needing to be migrated to the shared `client`. They use absolute
// `/api/...` paths that axios resolves against `defaults.baseURL`.
export const VITE_API_URL = (import.meta.env['VITE_API_URL'] as string | undefined)?.replace(/\/+$/, '');
const API_BASE_URL = VITE_API_URL ? `${VITE_API_URL}/api` : '/api';

if (VITE_API_URL) {
  axios.defaults.baseURL = VITE_API_URL;
}

const client = axios.create({ baseURL: API_BASE_URL, timeout: REQUEST_TIMEOUT_MS });

// Attach JWT to every request if present
client.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

interface ApiErrorBody {
  success?: false;
  error?: { code?: string; message?: string; requestId?: string; details?: unknown };
}

client.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorBody>) => {
    const status = error.response?.status ?? 0;
    const body = error.response?.data;
    const code = body?.error?.code ?? 'NETWORK_ERROR';
    const message = body?.error?.message ?? error.message ?? 'Request failed';
    const requestId = body?.error?.requestId;
    const details = body?.error?.details;

    if (status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem(TOKEN_KEY);
      delete client.defaults.headers.common['Authorization'];
      const here = window.location.pathname + window.location.search;
      if (!['/login', '/register'].some((p) => window.location.pathname.startsWith(p))) {
        const returnTo = encodeURIComponent(here);
        window.location.href = `/login?returnTo=${returnTo}`;
      }
    } else if (status >= 500) {
      toast.error(message);
    }

    return Promise.reject(new ApiError(status, code, message, requestId, details));
  },
);

export const api = {
  // Auth
  login: (email: string, password: string) =>
    client.post<ApiResponse<{ token: string; user: AuthUser }>>('/auth/login', { email, password }),
  register: (data: {
    email: string;
    name: string;
    password: string;
    institutionName: string;
    institutionCountry?: string;
  }) =>
    client.post<ApiResponse<{ token: string; user: AuthUser }>>('/auth/register', data),
  getMe: () =>
    client.get<ApiResponse<AuthUser>>('/auth/me'),
  updateProfile: (name: string) =>
    client.patch<ApiResponse<AuthUser>>('/auth/me', { name }),
  logout: () =>
    client.post<ApiResponse<{ message: string }>>('/auth/logout'),

  // Phase 11.4 — SSO IdP admin (institution-scoped)
  getSsoIdp: () =>
    client.get<ApiResponse<SsoIdpReadShape | null>>('/admin/sso/me'),
  upsertSsoIdp: (data: SsoIdpUpsertPayload) =>
    client.put<ApiResponse<SsoIdpReadShape>>('/admin/sso/me', data),
  deleteSsoIdp: () =>
    client.delete('/admin/sso/me'),

  // Phase 11.8 — SUPER_ADMIN cross-institution panel.
  listAllSsoIdps: () =>
    client.get<ApiResponse<SsoIdpListEntry[]>>('/admin/sso/all'),
  getSsoIdpForInstitution: (institutionId: string) =>
    client.get<ApiResponse<SsoIdpListEntry | null>>(
      `/admin/sso/institutions/${encodeURIComponent(institutionId)}`,
    ),
  upsertSsoIdpForInstitution: (institutionId: string, data: SsoIdpUpsertPayload) =>
    client.put<ApiResponse<SsoIdpListEntry>>(
      `/admin/sso/institutions/${encodeURIComponent(institutionId)}`,
      data,
    ),
  deleteSsoIdpForInstitution: (institutionId: string) =>
    client.delete(`/admin/sso/institutions/${encodeURIComponent(institutionId)}`),

  // Phase 10.8 — MFA (TOTP)
  getMfaStatus: () =>
    client.get<
      ApiResponse<{ enrolled: boolean; enabled: boolean; enabledAt: string | null }>
    >('/auth/mfa/status'),
  enrollMfa: () =>
    client.post<ApiResponse<{ secret: string; otpauthUri: string }>>('/auth/mfa/enroll'),
  verifyMfa: (code: string) =>
    client.post<ApiResponse<{ enabledAt: string }>>('/auth/mfa/verify', { code }),
  disableMfa: (code: string) =>
    client.post<ApiResponse<{ disabled: true }>>('/auth/mfa/disable', { code }),

  // Institution
  getMyInstitution: () =>
    client.get<ApiResponse<InstitutionDetail>>('/institutions/me'),
  updateMyInstitution: (data: { name?: string; logoUrl?: string; domain?: string }) =>
    client.patch<ApiResponse<InstitutionDetail>>('/institutions/me', data),
  listInstitutionUsers: () =>
    client.get<ApiResponse<InstitutionUser[]>>('/institutions/me/users'),
  updateUserRole: (userId: string, role: string) =>
    client.patch<ApiResponse<InstitutionUser>>(`/institutions/me/users/${userId}/role`, { role }),
  // Systems
  getSystems: (params?: { category?: string }) =>
    client.get<ApiResponse<VendorSystem[]>>('/systems', { params }),
  getSystem: (id: string) =>
    client.get<ApiResponse<VendorSystem>>(`/systems/${id}`),
  getSystemScores: (id: string, frameworkId?: string) =>
    client.get<
      ApiResponse<{
        byCode: Record<string, number>;
        byDomain: Array<{
          domainCode: string;
          domainName: string;
          score: number;
          maxScore: number;
          capabilities: Array<{ code: string; name: string; value: number }>;
        }>;
      }>
    >(`/systems/${id}/scores`, {
      params: frameworkId ? { frameworkId } : {},
    }),
  compareSystems: (ids: string[]) =>
    client.get<ApiResponse<LeaderboardEntry[]>>('/systems/compare', { params: { ids: ids.join(',') } }),

  // Capabilities — each call accepts an optional frameworkId so callers can
  // pin to a specific framework (default: server picks first public active).
  getDomains: (frameworkId?: string) =>
    client.get<ApiResponse<FrameworkDomain[]>>('/capabilities/domains', {
      params: frameworkId ? { frameworkId } : {},
    }),
  getCapabilities: (frameworkId?: string) =>
    client.get<ApiResponse<Capability[]>>('/capabilities', {
      params: frameworkId ? { frameworkId } : {},
    }),
  getCapability: (code: string, frameworkId?: string) =>
    client.get<ApiResponse<Capability & { scores: Array<{ value: number; system: VendorSystem }> }>>(
      `/capabilities/${code}`,
      { params: frameworkId ? { frameworkId } : {} },
    ),

  // Scores
  getLeaderboard: (frameworkId?: string) =>
    client.get<ApiResponse<LeaderboardEntry[]>>('/scores/leaderboard', {
      params: frameworkId ? { frameworkId } : {},
    }),
  getHeatmap: (frameworkId?: string) =>
    client.get<ApiResponse<HeatmapData>>('/scores/heatmap', {
      params: frameworkId ? { frameworkId } : {},
    }),

  // Frameworks
  listFrameworks: () =>
    client.get<ApiResponse<Array<{ id: string; slug: string; name: string; version: string; publisher: string; description?: string; licenceType: string; licenceNotice?: string; licenceUrl?: string; isPublic: boolean; isDefault: boolean; domainCount: number; capabilityCount: number }>>>('/frameworks'),
  getFramework: (id: string) =>
    client.get<ApiResponse<{ id: string; slug: string; name: string; domains: Array<{ id: string; code: string; name: string; capabilityCount: number }> }>>(`/frameworks/${id}`),

  // Framework Mappings (Enterprise tier)
  listFrameworkMappings: () =>
    client.get<ApiResponse<Array<{
      id: string;
      name: string;
      description?: string;
      mappingType: string;
      sourceFramework: { id: string; slug: string; name: string; version: string };
      targetFramework: { id: string; slug: string; name: string; version: string };
      _count: { items: number };
    }>>>('/framework-mappings'),
  getFrameworkMapping: (id: string) =>
    client.get<ApiResponse<{
      id: string;
      name: string;
      description?: string;
      sourceFramework: { id: string; slug: string; name: string };
      targetFramework: { id: string; slug: string; name: string };
      items: Array<{
        id: string;
        strength: string;
        confidence: number;
        notes?: string;
        sourceCapability: { id: string; code: string; name: string; description?: string; domain: { code: string; name: string } };
        targetCapability: { id: string; code: string; name: string; description?: string; domain: { code: string; name: string } };
      }>;
    }>>(`/framework-mappings/${id}`),

  // Baskets
  createBasket: (data: { name: string; description?: string }) =>
    client.post<ApiResponse<CapabilityBasket>>('/baskets', data),
  listBaskets: () =>
    client.get<ApiResponse<CapabilityBasket[]>>('/baskets'),
  getBasket: (id: string) =>
    client.get<ApiResponse<CapabilityBasket>>(`/baskets/${id}`),
  addBasketItem: (id: string, data: { capabilityCode: string; priority: string; weight: number; notes?: string }) =>
    client.post<ApiResponse<CapabilityBasket>>(`/baskets/${id}/items`, data),
  removeBasketItem: (basketId: string, itemId: string) =>
    client.delete(`/baskets/${basketId}/items/${itemId}`),
  evaluateBasket: (id: string) =>
    client.get<ApiResponse<BasketEvaluation[]>>(`/baskets/${id}/evaluate`),

  // Vendor profiles
  getVendorProfile: (systemId: string) =>
    client.get<ApiResponse<VendorProfile>>(`/vendors/${systemId}/profile`),
  getVendorVersions: (systemId: string) =>
    client.get<ApiResponse<unknown[]>>(`/vendors/${systemId}/versions`),

  // Research
  getResearch: (params?: { publisher?: string; category?: string; year?: number }) =>
    client.get<ApiResponse<ResearchItem[]>>('/research', { params }),
  getResearchItem: (id: string) =>
    client.get<ApiResponse<ResearchItem>>(`/research/${id}`),

  // Scoring methodology
  getMethodology: () =>
    client.get<ApiResponse<ScoringMethodology>>('/scoring/methodology'),
  getFaq: () =>
    client.get<ApiResponse<ScoringMethodology>>('/scoring/faq'),
  getEvidenceTypes: () =>
    client.get<ApiResponse<ScoringMethodology>>('/scoring/evidence-types'),

  // AI Chat
  sendChatMessage: (sessionId: string, message: string) =>
    client.post<ApiResponse<{ reply: string }>>('/chat', { sessionId, message }),
  getChatHistory: (sessionId: string) =>
    client.get<ApiResponse<ChatMessage[]>>(`/chat/sessions/${sessionId}`),
  clearChatHistory: (sessionId: string) =>
    client.delete(`/chat/sessions/${sessionId}`),

  // TCO
  calculateTco: (data: {
    systemSlug: string;
    studentCount: number;
    horizonYears: number;
    overrides?: Record<string, number>;
  }) => client.post<ApiResponse<unknown>>('/tco/calculate', data),
  compareTco: (data: {
    systemSlugs: string[];
    studentCount: number;
    horizonYears: number;
  }) => client.post<ApiResponse<unknown[]>>('/tco/compare', data),
  getTcoBenchmarks: () =>
    client.get<ApiResponse<Record<string, unknown>>>('/tco/benchmarks'),
  getTcoBenchmark: (slug: string) =>
    client.get<ApiResponse<unknown>>(`/tco/benchmarks/${slug}`),
  saveTcoEstimate: (data: Record<string, unknown>) =>
    client.post<ApiResponse<unknown>>('/tco/estimates', data),
  listTcoEstimates: () =>
    client.get<ApiResponse<unknown[]>>('/tco/estimates'),
  getTcoEstimate: (id: string) =>
    client.get<ApiResponse<unknown>>(`/tco/estimates/${id}`),

  // Procurement
  createProject: (data: { name: string; jurisdiction?: string }) =>
    client.post<ApiResponse<{ id: string; name: string; status: string }>>(
      '/procurement/projects',
      data
    ),
  listProjects: () =>
    client.get<ApiResponse<{ id: string; name: string; status: string }[]>>(
      '/procurement/projects'
    ),
  getProject: (id: string) =>
    client.get<ApiResponse<unknown>>(`/procurement/projects/${id}`),
  updateProject: (id: string, data: { name?: string; status?: string }) =>
    client.patch<ApiResponse<unknown>>(`/procurement/projects/${id}`, data),
  deleteProject: (id: string) =>
    client.delete(`/procurement/projects/${id}`),
  getWorkflow: (projectId: string) =>
    client.get<ApiResponse<unknown>>(`/procurement/projects/${projectId}/workflow`),
  updateWorkflowStage: (
    projectId: string,
    stageNum: number,
    data: { notes?: string; status?: string }
  ) =>
    client.patch<ApiResponse<unknown>>(
      `/procurement/projects/${projectId}/workflow/stages/${stageNum}`,
      data
    ),
  advanceWorkflow: (projectId: string) =>
    client.post<ApiResponse<unknown>>(
      `/procurement/projects/${projectId}/workflow/advance`
    ),
  addShortlistEntry: (
    projectId: string,
    data: { systemId: string; status?: string; notes?: string }
  ) =>
    client.post<ApiResponse<unknown>>(
      `/procurement/projects/${projectId}/shortlist`,
      data
    ),
  getShortlist: (projectId: string) =>
    client.get<ApiResponse<unknown[]>>(
      `/procurement/projects/${projectId}/shortlist`
    ),
  updateShortlistEntry: (
    projectId: string,
    entryId: string,
    data: { status?: string; notes?: string; score?: number }
  ) =>
    client.patch<ApiResponse<unknown>>(
      `/procurement/projects/${projectId}/shortlist/${entryId}`,
      data
    ),
  removeShortlistEntry: (projectId: string, entryId: string) =>
    client.delete(
      `/procurement/projects/${projectId}/shortlist/${entryId}`
    ),

  // Integration Assessment
  createIntegrationAssessment: (data: {
    name: string;
    currentSystems: unknown[];
    targetSystemId?: string;
  }) => client.post<ApiResponse<unknown>>('/integration/assess', data),
  listIntegrationAssessments: () =>
    client.get<ApiResponse<unknown[]>>('/integration/assess'),
  getIntegrationAssessment: (id: string) =>
    client.get<ApiResponse<unknown>>(`/integration/assess/${id}`),

  // Phase 4: Jurisdictions
  listJurisdictions: () =>
    client.get<ApiResponse<unknown[]>>('/procurement/jurisdictions'),
  getJurisdiction: (code: string) =>
    client.get<ApiResponse<unknown>>(`/procurement/jurisdictions/${code}`),

  // Phase 4: Procurement Projects (v2 - with stage engine)
  createProjectV2: (data: Record<string, unknown>) =>
    client.post<ApiResponse<unknown>>('/procurement/v2/projects', data),
  listProjectsV2: () =>
    client.get<ApiResponse<unknown[]>>('/procurement/v2/projects'),
  getProjectV2: (id: string) =>
    client.get<ApiResponse<unknown>>(`/procurement/v2/projects/${id}`),
  advanceProjectStage: (id: string) =>
    client.post<ApiResponse<unknown>>(`/procurement/v2/projects/${id}/advance`),
  updateStageTask: (projectId: string, stageId: string, taskId: string, data: { isCompleted: boolean; completedBy?: string }) =>
    client.patch<ApiResponse<unknown>>(`/procurement/v2/projects/${projectId}/stages/${stageId}/tasks/${taskId}`, data),
  updateStageApproval: (projectId: string, stageId: string, approvalId: string, data: { status: string; comments?: string; approverName?: string }) =>
    client.patch<ApiResponse<unknown>>(`/procurement/v2/projects/${projectId}/stages/${stageId}/approvals/${approvalId}`, data),
  getProjectCompliance: (id: string) =>
    client.get<ApiResponse<unknown>>(`/procurement/v2/projects/${id}/compliance`),
  getProjectTimeline: (id: string) =>
    client.get<ApiResponse<unknown[]>>(`/procurement/v2/projects/${id}/timeline`),
  addEvaluation: (projectId: string, data: { systemId: string; evaluatorName?: string }) =>
    client.post<ApiResponse<unknown>>(`/procurement/v2/projects/${projectId}/evaluations`, data),
  getEvaluations: (projectId: string) =>
    client.get<ApiResponse<unknown[]>>(`/procurement/v2/projects/${projectId}/evaluations`),
  updateEvaluation: (projectId: string, evalId: string, data: Record<string, unknown>) =>
    client.patch<ApiResponse<unknown>>(`/procurement/v2/projects/${projectId}/evaluations/${evalId}`, data),
  getProjectShortlistV2: (projectId: string) =>
    client.get<ApiResponse<unknown[]>>(`/procurement/v2/projects/${projectId}/shortlist`),
  importBasketShortlistV2: (projectId: string, data?: { limit?: number }) =>
    client.post<ApiResponse<{ importedCount: number; entries: unknown[] }>>(
      `/procurement/v2/projects/${projectId}/shortlist/import-basket`,
      data ?? {},
    ),
  getProjectSpecification: (id: string) =>
    client.get<ApiResponse<unknown>>(`/procurement/v2/projects/${id}/specification`),

  // Phase 5: Vendor Portal (vendor-scoped auth — uses separate vendor_auth_token)
  vendorRegister: (data: { email: string; password: string; companyName: string; contactName: string; websiteUrl?: string }) =>
    client.post<ApiResponse<{ token: string; user: Record<string, unknown> }>>('/vendor-portal/register', data),
  vendorLogin: (email: string, password: string) =>
    client.post<ApiResponse<{ token: string; user: Record<string, unknown> }>>('/vendor-portal/login', { email, password }),
  getVendorPortalProfile: () =>
    client.get<ApiResponse<unknown>>('/vendor-portal/profile'),
  updateVendorPortalProfile: (data: Record<string, unknown>) =>
    client.put<ApiResponse<unknown>>('/vendor-portal/profile', data),
  getVendorPortalScores: () =>
    client.get<ApiResponse<unknown>>('/vendor-portal/scores'),
  getVendorPortalAnalytics: () =>
    client.get<ApiResponse<unknown>>('/vendor-portal/analytics'),
  createVendorSubmission: (data: { type: string; data: Record<string, unknown> }) =>
    client.post<ApiResponse<unknown>>('/vendor-portal/submissions', data),
  listVendorSubmissions: () =>
    client.get<ApiResponse<unknown[]>>('/vendor-portal/submissions'),

  // Phase 5: Evaluation Projects (Team Workspaces)
  createEvaluationProject: (data: Record<string, unknown>) =>
    client.post<ApiResponse<unknown>>('/evaluations', data),
  listEvaluationProjects: (institutionId?: string) =>
    client.get<ApiResponse<unknown[]>>('/evaluations', { params: institutionId ? { institutionId } : {} }),
  getEvaluationProject: (id: string) =>
    client.get<ApiResponse<unknown>>(`/evaluations/${id}`),
  updateEvaluationProject: (id: string, data: Record<string, unknown>) =>
    client.patch<ApiResponse<unknown>>(`/evaluations/${id}`, data),
  addEvaluationMember: (id: string, data: { userId?: string; email?: string; role?: string }) =>
    client.post<ApiResponse<unknown>>(`/evaluations/${id}/members`, data),
  removeEvaluationMember: (id: string, memberId: string) =>
    client.delete(`/evaluations/${id}/members/${memberId}`),
  addEvaluationSystemEntry: (id: string, systemId: string) =>
    client.post<ApiResponse<unknown>>(`/evaluations/${id}/systems`, { systemId }),
  removeEvaluationSystemEntry: (id: string, systemId: string) =>
    client.delete(`/evaluations/${id}/systems/${systemId}`),
  assignEvaluationDomains: (id: string, assignments: Array<{ domainId: string; userId: string }>) =>
    client.post<ApiResponse<unknown>>(`/evaluations/${id}/domains/assign`, { assignments }),
  getEvaluationDomainProgress: (id: string) =>
    client.get<ApiResponse<unknown[]>>(`/evaluations/${id}/domains`),
  submitEvaluationDomainScores: (id: string, domainId: string, scores: Array<{ systemId: string; capabilityId: string; value: number; notes?: string }>) =>
    client.post<ApiResponse<unknown>>(`/evaluations/${id}/domains/${domainId}/scores`, { scores }),
  getEvaluationAggregatedScores: (id: string) =>
    client.get<ApiResponse<unknown[]>>(`/evaluations/${id}/aggregate`),
  getEvaluationTeamProgress: (id: string) =>
    client.get<ApiResponse<unknown[]>>(`/evaluations/${id}/progress`),

  // Phase 14.9 — Conflict of Interest declarations. PA 2023 ss.81-83 require
  // contracting authorities to capture an evaluator CoI declaration before
  // scoring begins. `getMyCoi` is the gate signal — null means "no
  // declaration yet, scoring blocked"; non-null means the evaluator has
  // signed and may proceed. `submitCoi` upserts; subsequent calls revise.
  getMyCoi: (projectId: string) =>
    client.get<ApiResponse<CoiDeclaration | null>>(`/evaluations/${projectId}/coi/me`),
  submitCoi: (projectId: string, declaredText: string) =>
    client.post<ApiResponse<CoiDeclaration>>(`/evaluations/${projectId}/coi`, { declaredText }),
  listProjectCoi: (projectId: string) =>
    client.get<ApiResponse<CoiDeclaration[]>>(`/evaluations/${projectId}/coi`),

  // Phase 5: Subscriptions
  getSubscription: () =>
    client.get<ApiResponse<unknown>>('/subscriptions/me'),
  createSubscriptionCheckout: (tier: string) =>
    client.post<ApiResponse<{ url?: string; configured: boolean; message?: string }>>('/subscriptions/checkout', { tier }),
  cancelSubscription: () =>
    client.post<ApiResponse<unknown>>('/subscriptions/cancel'),
  getInvoices: () =>
    client.get<ApiResponse<unknown[]>>('/subscriptions/invoices'),

  // Phase 5: Admin — Vendor Management
  adminListVendorAccounts: (params?: { status?: string; search?: string }) =>
    client.get<ApiResponse<unknown[]>>('/admin/vendors', { params }),
  adminGetVendorAccount: (id: string) =>
    client.get<ApiResponse<unknown>>(`/admin/vendors/${id}`),
  adminUpdateVendorAccount: (id: string, data: { status?: string; tier?: string; systemId?: string | null }) =>
    client.patch<ApiResponse<unknown>>(`/admin/vendors/${id}`, data),
  adminListVendorSubmissions: (params?: { status?: string }) =>
    client.get<ApiResponse<unknown[]>>('/admin/vendors/submissions', { params }),
  adminReviewSubmission: (id: string, data: { status: string; reviewNotes?: string }) =>
    client.patch<ApiResponse<unknown>>(`/admin/vendors/submissions/${id}`, data),

  // Phase 6: Notifications
  getNotifications: (page?: number) =>
    client.get<ApiResponse<unknown[]>>('/notifications', { params: { page } }),
  getNotificationCount: () =>
    client.get<ApiResponse<{ count: number }>>('/notifications/count'),
  markNotificationRead: (id: string) =>
    client.patch<ApiResponse<unknown>>(`/notifications/${id}/read`, {}),
  markAllNotificationsRead: () =>
    client.post<ApiResponse<unknown>>('/notifications/read-all', {}),

  // Phase 6: API Keys
  createApiKey: (data: { name: string; permissions: string[]; expiresAt?: string }) =>
    client.post<ApiResponse<unknown>>('/keys', data),
  listApiKeys: () =>
    client.get<ApiResponse<unknown[]>>('/keys'),
  revokeApiKey: (id: string) =>
    client.delete(`/keys/${id}`),

  // Phase 6: Sector Analytics
  getSectorOverview: () =>
    client.get<ApiResponse<unknown>>('/sector/analytics/overview'),
  getSectorSystems: () =>
    client.get<ApiResponse<unknown[]>>('/sector/analytics/systems'),
  getSectorCapabilities: () =>
    client.get<ApiResponse<unknown[]>>('/sector/analytics/capabilities'),
  getSectorJurisdictions: () =>
    client.get<ApiResponse<unknown[]>>('/sector/analytics/jurisdictions'),
  getSectorTrends: () =>
    client.get<ApiResponse<unknown>>('/sector/analytics/trends'),

  // Architecture Assessment
  analyseArchitecture: (data: Record<string, unknown>) =>
    client.post<ApiResponse<unknown>>('/architecture/analyse', data),
  createArchitectureAssessment: (data: Record<string, unknown>) =>
    client.post<ApiResponse<unknown>>('/architecture', data),
  listArchitectureAssessments: () =>
    client.get<ApiResponse<unknown[]>>('/architecture'),
  getArchitectureAssessment: (id: string) =>
    client.get<ApiResponse<unknown>>(`/architecture/${id}`),
  deleteArchitectureAssessment: (id: string) =>
    client.delete(`/architecture/${id}`),

  // Value Analysis
  calculateValue: (data: Record<string, unknown>) =>
    client.post<ApiResponse<unknown>>('/value/calculate', data),
  saveValueAnalysis: (data: Record<string, unknown>) =>
    client.post<ApiResponse<unknown>>('/value', data),
  listValueAnalyses: () =>
    client.get<ApiResponse<unknown[]>>('/value'),
  getValueAnalysis: (id: string) =>
    client.get<ApiResponse<unknown>>(`/value/${id}`),
  getValueBenchmarks: () =>
    client.get<ApiResponse<Record<string, unknown>>>('/value/benchmarks'),

  // Document Generator
  generateDocumentPreview: (data: Record<string, unknown>) =>
    client.post<ApiResponse<unknown>>('/documents/generate', data),
  saveDocument: (data: Record<string, unknown>) =>
    client.post<ApiResponse<unknown>>('/documents', data),
  listDocuments: () =>
    client.get<ApiResponse<unknown[]>>('/documents'),
  getDocument: (id: string) =>
    client.get<ApiResponse<unknown>>(`/documents/${id}`),
  updateDocument: (id: string, data: Record<string, unknown>) =>
    client.patch<ApiResponse<unknown>>(`/documents/${id}`, data),
  deleteDocument: (id: string) =>
    client.delete(`/documents/${id}`),
};
