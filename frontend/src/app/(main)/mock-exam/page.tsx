import MockExamsList from "@/components/MockExamsList";

export default function MockExamPage() {
  return (
    <MockExamsList
      eyebrow="Mock"
      title="Mock Exam"
      description="Full SAT mock: Reading & Writing, a 10-minute break, then Math—one linear flow with no pause and a 1600-scale total at the end."
      examKindFilter="MOCK_SAT"
    />
  );
}
