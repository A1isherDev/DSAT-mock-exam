export type AdminCategory = {
  id: number;
  name: string;
  subject: string | null;
};

export type AdminStandaloneQuestion = {
  id: number;
  question_type: string;
  question_text: string;
  question_prompt: string;
  explanation: string;
  is_active: boolean;
  order: number | null;
  usage_count?: number;
  module_id?: number | null;
  practice_test_id?: number | null;
};

export type SubjectFilter = "all" | "MATH" | "READING_WRITING";
export type ActiveFilter = "all" | "1" | "0";

