"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { docBreadcrumb } from "@/lib/docs/navigation";

export function DocsBreadcrumb() {
  const pathname = usePathname();
  const slug = pathname.replace(/^\/docs\/?/, "");
  const { group, page } = docBreadcrumb(slug);

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem className="hidden sm:flex">
          <BreadcrumbLink render={<Link href="/docs">Docs</Link>} />
        </BreadcrumbItem>

        {group ? (
          <>
            <BreadcrumbSeparator className="hidden sm:flex" />
            <BreadcrumbItem className="hidden sm:flex">{group}</BreadcrumbItem>
          </>
        ) : null}

        {page ? (
          <>
            <BreadcrumbSeparator className="hidden sm:flex" />
            <BreadcrumbItem>
              <BreadcrumbPage>{page.title}</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        ) : null}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
