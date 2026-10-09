import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, HashRouter, Route } from 'react-router-dom';
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AnimatedRoutes } from "@/components/AnimatedRoutes";
import { PageTransition } from "@/components/PageTransition";
import MaoLifeStoryPage from "./pages/MaoLifeStoryPage";
import NotFound from "./pages/NotFound";

/**
 * Configure TanStack Query client with optimized defaults
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data considered fresh for 1 minute
      staleTime: 60 * 1000,
      // Cache data for 5 minutes
      gcTime: 5 * 60 * 1000,
      // Retry failed requests once
      retry: 1,
      // Don't refetch on window focus by default
      refetchOnWindowFocus: false,
      // Don't refetch on reconnect by default
      refetchOnReconnect: false,
    },
    mutations: {
      // Retry failed mutations once
      retry: 1,
    },
  },
});

function App() {
  // 路由策略自适应：
  //  - 正常服务器 / 静态托管（http/https）→ BrowserRouter（模板约定）
  //  - 单文件离线打开（file:// 协议）→ HashRouter（BrowserRouter 在 file:// 下无法工作）
  const useHash = typeof window !== 'undefined' && window.location.protocol === 'file:';
  const Router = useHash ? HashRouter : BrowserRouter;

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router>
          <AnimatedRoutes>
            <Route path="/" data-genie-title="毛泽东生平时空叙事" data-genie-key="MaoLife" element={<PageTransition transition="fade"><MaoLifeStoryPage /></PageTransition>} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" data-genie-key="NotFound" data-genie-title="Not Found" element={<PageTransition transition="fade"><NotFound /></PageTransition>} />
          </AnimatedRoutes>
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App
