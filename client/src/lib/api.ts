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
} from '../types';

const client = axios.create({ baseURL: '/api' });

export const api = {
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
};
