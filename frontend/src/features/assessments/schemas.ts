import type { components } from "@/lib/openapi-types";

/** Mirrors OpenAPI `/assessments/attempts/answer/` success body. */
export type SaveAnswerResponse = components["schemas"]["SaveAnswerStored"];

/** Mirrors OpenAPI `/assessments/attempts/submit/` 200 | 202 response union. */
export type SubmitResponse =
  | components["schemas"]["AssessmentSubmitCompleteResponse"]
  | components["schemas"]["AssessmentSubmitQueuedResponse"];
