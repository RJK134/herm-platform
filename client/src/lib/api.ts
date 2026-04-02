import axios from 'axios';
import type {
  VendorSystem,
  HermCapability,
  HermFamily,
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
    client.get<ApiResponse<{ byCode: Record<string, number>; byFamily: Array<{ familyCode: string; familyName: string; capabilities: Array<{ code: string; name: string; value: number }> }> }>>(`/systems/${id}/scores`),
  compareSystems: (ids: string[]) =>
    client.get<ApiResponse<LeaderboardEntry[]>>('/systems/compare', { params: { ids: ids.join(',') } }),

  // Capabilities
  getFamilies: () =>
    client.get<ApiResponse<HermFamily[]>>('/capabilities/families'),
  getCapabilities: () =>
    client.get<ApiResponse<HermCapability[]>>('/capabilities'),
  getCapability: (code: string) =>
    client.get<ApiResponse<HermCapability & { scores: Array<{ value: number; system: VendorSystem }> }>>(`/capabilities/${code}`),

  // Scores
  getLeaderboard: () =>
    client.get<ApiResponse<LeaderboardEntry[]>>('/scores/leaderboard'),
  getHeatmap: () =>
    client.get<ApiResponse<HeatmapData>>('/scores/heatmap'),

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
