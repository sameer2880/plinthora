import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/Sidebar";
import { GlobalContextMenu } from "@/components/GlobalContextMenu";
import { Gate } from "@/lib/auth/gate";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: () => (
    <Gate>
      <AppLayout>
        <Outlet />
      </AppLayout>
      <GlobalContextMenu />
    </Gate>
  ),
});
