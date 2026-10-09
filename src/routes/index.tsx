import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

/** Send visitors straight into the app. The authenticated route's Gate
 * displays the sign-in screen for signed-out users and preserves normal
 * role-based navigation for users who are already signed in.
 */
function IndexPage() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate({ to: "/dashboard", replace: true });
  }, [navigate]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export const Route = createFileRoute("/")({
  component: IndexPage,
});
