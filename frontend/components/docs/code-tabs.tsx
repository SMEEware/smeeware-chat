"use client";

import * as React from "react";

import { CodeBlock } from "@/components/code-block";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type CodeTabsProps = {
  tabs: { label: string; language: string; code: string }[];
};

export function CodeTabs({ tabs }: CodeTabsProps) {
  const [value, setValue] = React.useState(tabs[0]?.label ?? "");

  return (
    <Tabs value={value} onValueChange={(next) => setValue(next as string)}>
      <TabsList variant="line">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.label} value={tab.label}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {tabs.map((tab) => (
        <TabsContent key={tab.label} value={tab.label}>
          <CodeBlock code={tab.code} language={tab.language} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
