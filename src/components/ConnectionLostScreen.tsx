import { RefreshCw, ServerCrash, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Full-screen "couldn't connect" with a Retry button, instead of silently signing the person out. */
export function ConnectionLostScreen({ onRetry }: { onRetry: () => void }) {
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  const Icon = offline ? WifiOff : ServerCrash;
  return (
    <div
      role="alert"
      className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-background p-6 text-center"
    >
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <Icon className="h-8 w-8" />
      </span>
      <div className="max-w-sm">
        <p className="text-lg font-semibold text-foreground">
          {offline ? "No internet connection" : "Can't reach the server"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {offline
            ? "Check your Wi-Fi or mobile data, then try again. You are still signed in."
            : "Something went wrong while connecting. Please try again in a moment. You are still signed in."}
        </p>
      </div>
      <Button onClick={onRetry} className="rounded-full px-6">
        <RefreshCw className="mr-2 h-4 w-4" />
        Try again
      </Button>
    </div>
  );
}