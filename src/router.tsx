import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // Keep fetched data for a short while so moving between pages shows the
  // cached screen instantly instead of a blank/skeleton state. Live updates
  // still arrive through the realtime invalidation in __root.tsx.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 15_000, gcTime: 10 * 60_000 } },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 30_000,
  });

  return router;
};