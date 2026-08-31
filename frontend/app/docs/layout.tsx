import { DocsBreadcrumb } from "@/components/docs/docs-breadcrumb";
import { DocsSearch } from "@/components/docs/docs-search";
import { DocsSidebar } from "@/components/docs/docs-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { Separator } from "@/components/ui/separator";
import {
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

export default function DocsLayout({ children }: LayoutProps<"/docs">) {
  return (
    // select-text hebt das globale select-none auf -- in einer
    // Dokumentation will man Code und Pfade markieren koennen.
    <SidebarProvider className="select-text">
      <DocsSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-md">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-4" />
          <DocsBreadcrumb />

          <div className="ml-auto flex items-center gap-2">
            <DocsSearch />
            <ThemeToggle />
          </div>
        </header>

        {children}
      </div>
    </SidebarProvider>
  );
}
