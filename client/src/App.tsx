import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
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

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: 1 } },
});

/** Full-screen layout: sidebar + content */
function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-900 font-sans">
      <Sidebar />
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
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
                    <Route path="/basket" element={<CapabilityBasket />} />
                    <Route path="/export" element={<ExportDownload />} />
                    <Route path="/admin" element={<AdminSystems />} />
                    <Route path="/vendor" element={<VendorShowcase />} />
                    <Route path="/vendor/:id" element={<VendorProfile />} />
                    <Route path="/how-it-works" element={<HowItWorks />} />
                    <Route path="/research" element={<ResearchHub />} />
                    <Route path="/assistant" element={<AiAssistant />} />
                    <Route path="/tco" element={<TcoCalculator />} />
                    <Route path="/procurement" element={<ProcurementWorkflow />} />
                    <Route path="/integration" element={<IntegrationAssessment />} />
                    <Route path="/architecture" element={<ArchitectureAssessment />} />
                    <Route path="/value" element={<ValueAnalysis />} />
                    <Route path="/documents" element={<DocumentGenerator />} />
                  </Routes>
                </AppShell>
              }
            />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
