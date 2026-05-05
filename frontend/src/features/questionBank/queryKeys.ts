import type { ActiveFilter, SubjectFilter } from "./types";

export const questionBankKeys = {
  all: ["questionBank"] as const,
  list: (args: {
    q: string;
    categoryId: number | "all";
    subject: SubjectFilter;
    isActive: ActiveFilter;
  }) => [...questionBankKeys.all, "list", args] as const,
  categories: () => [...questionBankKeys.all, "categories"] as const,
  tests: () => [...questionBankKeys.all, "tests"] as const,
  modules: (testId: number) => [...questionBankKeys.all, "modules", testId] as const,
};

