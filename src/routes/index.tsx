import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * There is no landing page: the app's address always goes straight to the dashboard
 * (the sign-in page shows there first if the person isn't signed in).
 */
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard", replace: true });
  },
});