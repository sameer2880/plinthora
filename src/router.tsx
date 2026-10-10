import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { isNetworkError, reportNetworkError, reportSuccess } from "./lib/connection";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { LoadingScreen } from "./components/LoadingScreen";

export const getRouter = () => {
  // Keep fetched data for a short while so moving between pages shows the
  // cached screen instantly instead of a blank/skeleton state. Live updates
  // still arrive through the realtime invalidation in __root.tsx.
  const queryClient = new QueryClient({
    // Any request that fails because the internet/server is unreachable shows the
    // connection banner (see ConnectionBanner); the next success clears it.
    queryCache: new QueryCache({
      onError: (error) => {
        if (isNetworkError(error)) reportNetworkError();
      },
      onSuccess: () => reportSuccess(),
    }),
    mutationCache: new MutationCache({
      onError: (error) => {
        if (isNetworkError(error)) reportNetworkError();
      },
      onSuccess: () => reportSuccess(),
    }),
    defaultOptions: { queries: { staleTime: 15_000, gcTime: 10 * 60_000 } },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 30_000,
    // Pages that take a moment to open show the same loading animation as everywhere else.
    defaultPendingComponent: () => <LoadingScreen title="Loading…" subtitle="Please wait a moment" />,
    defaultPendingMs: 400,
  });

  return router;
};