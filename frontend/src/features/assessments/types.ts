export type Subject = "math" | "english";

export type AssessmentSet = {
  id: number;
  subject: Subject;
  category: string;
  title: string;
  description: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  questions?: AssessmentQuestion[];
  // Optional backend fields (some serializers include them)
  status?: "draft" | "published" | string;
};

export type AssessmentQuestionType = "multiple_choice" | "numeric" | "short_text" | "boolean";

export type AssessmentChoice = { id: string; text: string };

export type AssessmentQuestion = {
  id: number;
  assessment_set: number;
  order: number;
  prompt: string;
  question_type: AssessmentQuestionType;
  choices: AssessmentChoice[] | any[];
  correct_answer?: any;
  grading_config?: Record<string, unknown>;
  points: number;
  is_active: boolean;
};

export type HomeworkAssignmentCreateRequest = {
  classroom_id: number;
  set_id: number;
  title?: string;
  instructions?: string;
  due_at?: string | null;
};

export type AttemptStartRequest = { assignment_id: number };
export type AttemptAnswerRequest = {
  attempt_id: number;
  question_id: number;
  answer: any;
  time_spent_seconds?: number;
};
export type AttemptSubmitRequest = { attempt_id: number };

export type Attempt = {
  id: number;
  homework_id: number;
  student_id: number;
  status: string;
  started_at: string;
  submitted_at?: string | null;
  total_time_seconds?: number;
  active_time_seconds?: number;
  answers?: Array<{
    id: number;
    question_id: number;
    answer: any;
    is_correct?: boolean | null;
    points_awarded?: number | null;
    time_spent_seconds?: number;
  }>;
  grading_status?: string;
};

export type Result = {
  id?: number;
  attempt?: number;
  score_points?: number;
  max_points?: number;
  percent?: number;
  correct_count?: number;
  graded_at?: string;
  // backend may return rich breakdown
  [k: string]: any;
};

