import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Sidebar } from './components/layout/Sidebar';
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

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: 1 } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="flex min-h-screen bg-gray-50 dark:bg-gray-900 font-sans">
          <Sidebar />
          <main className="flex-1 overflow-auto p-8">
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
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
