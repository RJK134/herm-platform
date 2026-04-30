import type { ReactNode } from 'react';
import './i18n/config';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Menu } from 'lucide-react';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthContext';
import { FrameworkProvider } from './contexts/FrameworkContext';
import { SidebarProvider, useSidebar } from './contexts/SidebarContext';
import { Sidebar } from './components/layout/Sidebar';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { RequireTier } from './components/auth/RequireTier';
import { Login } from './pages/Login';
import { SsoCallback } from './pages/SsoCallback';
import { Register } from './pages/Register';
import { Leaderboard } from './pages/Leaderboard';
import { RadarComparison } from './pages/RadarComparison';
import { CapabilityHeatmap } from './pages/CapabilityHeatmap';
import { SystemDetail } from './pages/SystemDetail';
import { CapabilityView } from './pages/CapabilityView';
import { CapabilityBasket } from './pages/CapabilityBasket';
import { ExportDownload } from './pages/ExportDownload';
import { AdminSystems } from './pages/AdminSystems';
import { VendorShowcase } from './pages/VendorShowcase';
import { VendorProfile } from './pages/VendorProfile';
import { HowItWorks } from './pages/HowItWorks';
import { ResearchHub } from './pages/ResearchHub';
import { AiAssistant } from './pages/AiAssistant';
import { TcoCalculator } from './pages/TcoCalculator';
import { ProcurementWorkflow } from './pages/ProcurementWorkflow';
import { IntegrationAssessment } from './pages/IntegrationAssessment';
import { ArchitectureAssessment } from './pages/ArchitectureAssessment';
import { ValueAnalysis } from './pages/ValueAnalysis';
import { DocumentGenerator } from './pages/DocumentGenerator';
import { ProcurementProjects } from './pages/ProcurementProjects';
import { ProcurementGuide } from './pages/ProcurementGuide';
import { VendorPortal } from './pages/VendorPortal';
import { TeamWorkspaces } from './pages/TeamWorkspaces';
import { AdminVendors } from './pages/AdminVendors';
import { AdminSso } from './pages/AdminSso';
import { Subscriptions } from './pages/Subscriptions';
import { SecuritySettings } from './pages/SecuritySettings';
import { SectorAnalytics } from './pages/SectorAnalytics';
import { ApiIntegration } from './pages/ApiIntegration';
import { FrameworkMapping } from './pages/FrameworkMapping';
import { NotFound } from './pages/NotFound';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LicenceFooter } from './components/LicenceFooter';
import { ImpersonationBanner } from './components/ImpersonationBanner';

const ADMIN_ROLES = ['INSTITUTION_ADMIN', 'SUPER_ADMIN'];

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: 1 } },
});

function MobileMenuButton() {
  const { openMobile } = useSidebar();
  return (
    <button
      onClick={openMobile}
      className="fixed top-4 left-4 z-30 rounded-lg bg-sidebar p-2 text-white shadow-lg transition-colors hover:bg-sidebar/90 md:hidden"
      aria-label="Open navigation menu"
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}

function AppShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-gray-50 font-sans dark:bg-gray-900">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <Sidebar />
        <MobileMenuButton />
        <div className="flex min-h-screen flex-1 flex-col">
          <ImpersonationBanner />
          <main id="main-content" className="flex-1 overflow-auto p-4 md:p-8">
            {children}
          </main>
          <LicenceFooter />
        </div>
      </div>
    </SidebarProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <FrameworkProvider>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/login/sso" element={<SsoCallback />} />
                <Route path="/register" element={<Register />} />

                <Route
                  path="/*"
                  element={
                    <AppShell>
                      <Routes>
                        <Route path="/" element={<Leaderboard />} />
                        <Route path="/radar" element={<RadarComparison />} />
                        <Route path="/heatmap" element={<CapabilityHeatmap />} />
                        <Route path="/system" element={<SystemDetail />} />
                        <Route path="/capability" element={<CapabilityView />} />
                        <Route
                          path="/basket"
                          element={
                            <ProtectedRoute>
                              <CapabilityBasket />
                            </ProtectedRoute>
                          }
                        />
                        <Route path="/export" element={<ExportDownload />} />
                        <Route
                          path="/admin"
                          element={
                            <ProtectedRoute roles={ADMIN_ROLES}>
                              <AdminSystems />
                            </ProtectedRoute>
                          }
                        />
                        <Route path="/vendor" element={<VendorShowcase />} />
                        <Route path="/vendor/:id" element={<VendorProfile />} />
                        <Route path="/how-it-works" element={<HowItWorks />} />
                        <Route path="/research" element={<ResearchHub />} />
                        <Route
                          path="/assistant"
                          element={
                            <ProtectedRoute>
                              <AiAssistant />
                            </ProtectedRoute>
                          }
                        />
                        <Route path="/tco" element={<TcoCalculator />} />
                        <Route
                          path="/procurement"
                          element={
                            <ProtectedRoute>
                              <ProcurementWorkflow />
                            </ProtectedRoute>
                          }
                        />
                        <Route path="/integration" element={<IntegrationAssessment />} />
                        <Route path="/architecture" element={<ArchitectureAssessment />} />
                        <Route path="/value" element={<ValueAnalysis />} />
                        <Route
                          path="/documents"
                          element={
                            <ProtectedRoute>
                              <DocumentGenerator />
                            </ProtectedRoute>
                          }
                        />
                        <Route
                          path="/projects"
                          element={
                            <ProtectedRoute>
                              <ProcurementProjects />
                            </ProtectedRoute>
                          }
                        />
                        <Route path="/guide" element={<ProcurementGuide />} />
                        <Route path="/vendor-portal" element={<VendorPortal />} />
                        <Route
                          path="/workspaces"
                          element={
                            <ProtectedRoute>
                              <TeamWorkspaces />
                            </ProtectedRoute>
                          }
                        />
                        <Route
                          path="/admin/vendors"
                          element={
                            <ProtectedRoute roles={ADMIN_ROLES}>
                              <AdminVendors />
                            </ProtectedRoute>
                          }
                        />
                        <Route
                          path="/admin/sso"
                          element={
                            <ProtectedRoute roles={ADMIN_ROLES}>
                              <AdminSso />
                            </ProtectedRoute>
                          }
                        />
                        <Route
                          path="/subscription"
                          element={
                            <ProtectedRoute>
                              <Subscriptions />
                            </ProtectedRoute>
                          }
                        />
                        <Route
                          path="/security"
                          element={
                            <ProtectedRoute>
                              <SecuritySettings />
                            </ProtectedRoute>
                          }
                        />
                        <Route
                          path="/sector"
                          element={
                            <RequireTier
                              tiers={['professional', 'enterprise']}
                              featureName="Sector Intelligence"
                              description="Cross-institution sector analytics: adoption trends, capability coverage aggregates, and peer benchmarking. HERM capability data remains free — this view adds Future Horizons Education's comparative intelligence layer."
                            >
                              <SectorAnalytics />
                            </RequireTier>
                          }
                        />
                        <Route
                          path="/api-keys"
                          element={
                            <RequireTier
                              tiers={['enterprise']}
                              featureName="API Integration"
                              description="Issue and manage API keys for programmatic access to the platform. Included on the Enterprise plan; read-only HERM data remains available through the public API without a key."
                            >
                              <ApiIntegration />
                            </RequireTier>
                          }
                        />
                        <Route
                          path="/framework-mapping"
                          element={
                            <RequireTier
                              tiers={['enterprise']}
                              featureName="Framework Mapping"
                              description="Cross-framework migration tooling — map HERM capabilities to the FHE Capability Framework (or any future enterprise framework). Included on the Enterprise plan."
                            >
                              <FrameworkMapping />
                            </RequireTier>
                          }
                        />
                        <Route path="*" element={<NotFound />} />
                      </Routes>
                    </AppShell>
                  }
                />
              </Routes>
              <Toaster position="top-right" toastOptions={{ duration: 5000 }} />
            </FrameworkProvider>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
