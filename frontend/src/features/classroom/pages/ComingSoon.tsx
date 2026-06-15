"use client";

import { Hammer } from "lucide-react";
import { Card, EmptyState } from "../ui";

/** Placeholder for surfaces being delivered in the page-by-page rebuild. */
export function ComingSoon({ title, description }: { title: string; description?: string }) {
  return (
    <Card>
      <EmptyState
        icon={Hammer}
        title={title}
        description={description ?? "This part of the rebuilt classroom is on its way."}
      />
    </Card>
  );
}
