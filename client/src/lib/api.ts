import axios from 'axios';
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

const client = axios.create({ baseURL: '/api' });

// Attach JWT to every request if present
client.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

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
  getSystemScores: (id: string) =>
    client.get<ApiResponse<{ byCode: Record<string, number>; byDomain: Array<{ domainCode: string; domainName: string; score: number; maxScore: number; capabilities: Array<{ code: string; name: string; value: number }> }> }>>(`/systems/${id}/scores`),
  compareSystems: (ids: string[]) =>
    client.get<ApiResponse<LeaderboardEntry[]>>('/systems/compare', { params: { ids: ids.join(',') } }),

  // Capabilities
  getDomains: () =>
    client.get<ApiResponse<FrameworkDomain[]>>('/capabilities/domains'),
  getCapabilities: () =>
    client.get<ApiResponse<Capability[]>>('/capabilities'),
  getCapability: (code: string) =>
    client.get<ApiResponse<Capability & { scores: Array<{ value: number; system: VendorSystem }> }>>(`/capabilities/${code}`),

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
