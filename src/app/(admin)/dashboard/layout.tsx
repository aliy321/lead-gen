import { redirect } from "next/navigation"
import { AppSidebar } from "~/components/app-sidebar"
import { ChartAreaInteractive } from "~/components/chart-area-interactive"
import { DataTable } from "~/components/data-table"
import { SectionCards } from "~/components/section-cards"
import { SiteHeader } from "~/components/site-header"
import { SidebarInset, SidebarProvider } from "~/components/ui/sidebar"
import { getSession } from "~/server/better-auth/server"

export default async function Page({ children }: { children: React.ReactNode }) {
    const session = await getSession();
    
    if (!session) {
        redirect("/sign-in");
    }

    const sidebarUser = {
        name: session.user.name ?? "User",
        email: session.user.email ?? "No email",
        avatar: session.user.image ?? "",
    };

    return (
        <SidebarProvider
            style={
                {
                    "--sidebar-width": "calc(var(--spacing) * 60)",
                    "--header-height": "calc(var(--spacing) * 12)",
                } as React.CSSProperties
            }
        >
            <AppSidebar user={sidebarUser} variant="sidebar" />
            <SidebarInset>
                <SiteHeader />

                <div className="flex flex-1 flex-col">
                    <div className="@container/main flex flex-1 flex-col gap-2">
                        <div className="flex flex-col gap-4 md:gap-6 min-h-[calc(100svh-48px)]">
                            {children}
                        </div>
                    </div>
                </div>
            </SidebarInset>
        </SidebarProvider>
    )
}
