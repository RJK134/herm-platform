import './i18n/config';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Menu } from 'lucide-react';
import { AuthProvider } from './contexts/AuthContext';
import { FrameworkProvider } from './contexts/FrameworkContext';
import { SidebarProvider, useSidebar } from './contexts/SidebarContext';
import { Sidebar } from './components/layout/Sidebar';
import { Login } from './pages/Login';
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
import { Subscriptions } from './pages/Subscriptions';
import { SectorAnalytics } from './pages/SectorAnalytics';
import { ApiIntegration } from './pages/ApiIntegration';
import { FrameworkMapping } from './pages/FrameworkMapping';
import { NotFound } from './pages/NotFound';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ProtectedRoute } from './components/auth/ProtectedRoute';

const ADMIN_ROLES = ['INSTITUTION_ADMIN', 'SUPER_ADMIN'];

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: 1 } },
});

/** Mobile hamburger button — visible only below md breakpoint */
function MobileMenuButton() {
  const { openMobile } = useSidebar();
  return (
    <button
      onClick={openMobile}
      className="fixed top-4 left-4 z-30 md:hidden p-2 bg-sidebar text-white rounded-lg shadow-lg hover:bg-sidebar/90 transition-colors"
      aria-label="Open navigation menu"
    >
      <Menu className="w-5 h-5" />
    </button>
  );
}

/** Full-screen layout: sidebar + content */
function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-gray-50 dark:bg-gray-900 font-sans">
        <a href="#main-content" className="skip-link">Skip to main content</a>
        <Sidebar />
        <MobileMenuButton />
        <main id="main-content" className="flex-1 overflow-auto p-4 md:p-8">{children}</main>
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
              {/* Auth pages — full screen, no sidebar */}
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />

              {/* App pages — sidebar layout */}
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
                      <Route path="/basket" element={<ProtectedRoute><CapabilityBasket /></ProtectedRoute>} />
                      <Route path="/export" element={<ExportDownload />} />
                      <Route path="/admin" element={<ProtectedRoute roles={ADMIN_ROLES}><AdminSystems /></ProtectedRoute>} />
                      <Route path="/vendor" element={<VendorShowcase />} />
                      <Route path="/vendor/:id" element={<VendorProfile />} />
                      <Route path="/how-it-works" element={<HowItWorks />} />
                      <Route path="/research" element={<ResearchHub />} />
                      <Route path="/assistant" element={<ProtectedRoute><AiAssistant /></ProtectedRoute>} />
                      <Route path="/tco" element={<TcoCalculator />} />
                      <Route path="/procurement" element={<ProtectedRoute><ProcurementWorkflow /></ProtectedRoute>} />
                      <Route path="/integration" element={<IntegrationAssessment />} />
                      <Route path="/architecture" element={<ArchitectureAssessment />} />
                      <Route path="/value" element={<ValueAnalysis />} />
                      <Route path="/documents" element={<ProtectedRoute><DocumentGenerator /></ProtectedRoute>} />
                      <Route path="/projects" element={<ProtectedRoute><ProcurementProjects /></ProtectedRoute>} />
                      <Route path="/guide" element={<ProcurementGuide />} />
                      <Route path="/vendor-portal" element={<VendorPortal />} />
                      <Route path="/workspaces" element={<ProtectedRoute><TeamWorkspaces /></ProtectedRoute>} />
                      <Route path="/admin/vendors" element={<ProtectedRoute roles={ADMIN_ROLES}><AdminVendors /></ProtectedRoute>} />
                      <Route path="/subscription" element={<ProtectedRoute><Subscriptions /></ProtectedRoute>} />
                      <Route path="/sector" element={<SectorAnalytics />} />
                      <Route path="/api-keys" element={<ProtectedRoute><ApiIntegration /></ProtectedRoute>} />
                      <Route path="/framework-mapping" element={<FrameworkMapping />} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </AppShell>
                }
              />
            </Routes>
          </FrameworkProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
    </ErrorBoundary>
  );
}
