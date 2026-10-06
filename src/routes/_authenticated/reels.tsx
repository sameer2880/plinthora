import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ExternalLink, RefreshCw, Film } from "lucide-react";
import { AdminOnly } from "@/components/AdminOnly";
import { useSession } from "@/lib/auth/session";
import { PLATFORM_NAME } from "@/lib/brand";


export const Route = createFileRoute("/_authenticated/reels")({
  head: () => ({
    meta: [
      { title: `Reel Management — ${PLATFORM_NAME}` },
      { name: "description", content: "Manage reels." },
      { property: "og:title", content: `Reel Management — ${PLATFORM_NAME}` },
      { property: "og:description", content: "Manage and control your reels from one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Reels,
});

function Reels() {
  const [key, setKey] = useState(0);
  const { business } = useSession();
  const REELS_URL = business?.reels_url ?? "";

  if (!REELS_URL) {
    return (
      <AdminOnly label="Reel Management">
        <div className="space-y-2 py-10 text-center">
          <Film className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="text-lg font-bold">Reel Management isn't set up for this business</h2>
          <p className="text-sm text-muted-foreground">Add a reel manager link in Business Settings to use it here.</p>
        </div>
      </AdminOnly>
    );
  }

  return (
    <AdminOnly label="Reel Management">
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Film className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-lg font-bold leading-tight">Reel Management</h2>
            <p className="text-xs text-muted-foreground">Connected to {new URL(REELS_URL).host}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setKey((k) => k + 1)}>
            <RefreshCw className="h-4 w-4 mr-2" /> Reload
          </Button>
          <Button size="sm" asChild>
            <a href={REELS_URL} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" /> Open full app
            </a>
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <iframe
            key={key}
            src={REELS_URL}
            title="Reel Management"
            className="w-full h-[calc(100dvh-14rem)] min-h-[480px] border-0 bg-background"
            allow="camera; microphone; clipboard-write; fullscreen"
          />
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground">
        If the panel stays blank, the reel app blocks embedding — use “Open full app”.
      </p>
    </div>
    </AdminOnly>
  );
}