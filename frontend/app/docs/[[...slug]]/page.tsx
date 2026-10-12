import { notFound } from "next/navigation";

import { DocsBlocks } from "@/components/docs/docs-blocks";
import { DocsPager } from "@/components/docs/docs-pager";
import { DocsToc } from "@/components/docs/docs-toc";
import { getDocsBlocks, tocForSlug } from "@/lib/docs/content";
import { findDocPage, flatDocPages } from "@/lib/docs/navigation";
import { getLocale } from "@/lib/i18n/server";
import { td } from "@/lib/docs/de";

export function generateStaticParams() {
  return flatDocPages.map((page) => ({
    slug: page.slug ? page.slug.split("/") : [],
  }));
}

export async function generateMetadata({
  params,
}: PageProps<"/docs/[[...slug]]">) {
  const { slug } = await params;
  const page = findDocPage((slug ?? []).join("/"));
  if (!page) return {};

  const locale = await getLocale();
  return {
    title: `${td(locale, page.title)} — SMEEware Chat Docs`,
    description: td(locale, page.description),
  };
}

export default async function DocsPage({
  params,
}: PageProps<"/docs/[[...slug]]">) {
  const { slug } = await params;
  const path = (slug ?? []).join("/");

  const locale = await getLocale();
  const page = findDocPage(path);
  const blocks = getDocsBlocks(path, locale);
  if (!page || !blocks) notFound();

  const headings = tocForSlug(path, locale);

  return (
    <div className="mx-auto flex w-full max-w-6xl gap-12 px-6 py-10 lg:px-10">
      <article className="min-w-0 flex-1 pb-10">
        <header className="mb-8 flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            {td(locale, page.title)}
          </h1>
          <p className="text-muted-foreground">
            {td(locale, page.description)}
          </p>
        </header>

        <DocsBlocks blocks={blocks} />
        <DocsPager slug={path} />
      </article>

      <aside className="hidden w-56 shrink-0 xl:block">
        <div className="sticky top-20">
          <DocsToc headings={headings} />
        </div>
      </aside>
    </div>
  );
}
