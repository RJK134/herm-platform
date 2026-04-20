import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export const useLeaderboard = (frameworkId?: string) =>
  useQuery({
    queryKey: ['leaderboard', frameworkId ?? 'default'],
    queryFn: () => api.getLeaderboard(frameworkId).then(r => r.data.data),
  });

export const useSystems = (category?: string) =>
  useQuery({ queryKey: ['systems', category], queryFn: () => api.getSystems({ category }).then(r => r.data.data) });

export const useSystem = (id: string) =>
  useQuery({ queryKey: ['system', id], queryFn: () => api.getSystem(id).then(r => r.data.data), enabled: !!id });

export const useSystemScores = (id: string) =>
  useQuery({ queryKey: ['system-scores', id], queryFn: () => api.getSystemScores(id).then(r => r.data.data), enabled: !!id });

export const useDomains = () =>
  useQuery({ queryKey: ['domains'], queryFn: () => api.getDomains().then(r => r.data.data) });

export const useCapabilities = () =>
  useQuery({ queryKey: ['capabilities'], queryFn: () => api.getCapabilities().then(r => r.data.data) });

export const useCapability = (code: string) =>
  useQuery({ queryKey: ['capability', code], queryFn: () => api.getCapability(code).then(r => r.data.data), enabled: !!code });

export const useHeatmap = (frameworkId?: string) =>
  useQuery({
    queryKey: ['heatmap', frameworkId ?? 'default'],
    queryFn: () => api.getHeatmap(frameworkId).then(r => r.data.data),
  });

export const useCompare = (ids: string[]) =>
  useQuery({ queryKey: ['compare', ids], queryFn: () => api.compareSystems(ids).then(r => r.data.data), enabled: ids.length >= 2 });

export const useBaskets = () =>
  useQuery({ queryKey: ['baskets'], queryFn: () => api.listBaskets().then(r => r.data.data) });

export const useBasket = (id: string) =>
  useQuery({ queryKey: ['basket', id], queryFn: () => api.getBasket(id).then(r => r.data.data), enabled: !!id });

export const useBasketEvaluate = (id: string) =>
  useQuery({ queryKey: ['basket-eval', id], queryFn: () => api.evaluateBasket(id).then(r => r.data.data), enabled: !!id });

export const useCreateBasket = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description?: string }) => api.createBasket(data).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['baskets'] }),
  });
};

export const useAddBasketItem = (basketId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { capabilityCode: string; priority: string; weight: number; notes?: string }) =>
      api.addBasketItem(basketId, data).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['basket', basketId] });
      qc.invalidateQueries({ queryKey: ['basket-eval', basketId] });
    },
  });
};

export const useRemoveBasketItem = (basketId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => api.removeBasketItem(basketId, itemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['basket', basketId] });
      qc.invalidateQueries({ queryKey: ['basket-eval', basketId] });
    },
  });
};

export const useVendorProfile = (systemId: string) => useQuery({ queryKey: ['vendor-profile', systemId], queryFn: () => api.getVendorProfile(systemId).then(r => r.data.data), enabled: !!systemId });
export const useResearch = (params?: { publisher?: string; category?: string }) => useQuery({ queryKey: ['research', params], queryFn: () => api.getResearch(params).then(r => r.data.data) });
export const useResearchItem = (id: string) => useQuery({ queryKey: ['research-item', id], queryFn: () => api.getResearchItem(id).then(r => r.data.data), enabled: !!id });
export const useMethodology = () => useQuery({ queryKey: ['methodology'], queryFn: () => api.getMethodology().then(r => r.data.data) });
export const useFaq = () => useQuery({ queryKey: ['faq'], queryFn: () => api.getFaq().then(r => r.data.data) });
export const useEvidenceTypes = () => useQuery({ queryKey: ['evidence-types'], queryFn: () => api.getEvidenceTypes().then(r => r.data.data) });
