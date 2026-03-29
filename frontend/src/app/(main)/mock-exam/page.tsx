import MockExamsList from "@/components/MockExamsList";

export default function MockExamPage() {
  return (
    <MockExamsList
      eyebrow="Mock"
      title="Mock Exam"
      description="Each card is one full mock exam (complete SAT-style run). Individual sections are listed under Practice Tests; start the full timed sequence here."
      examKindFilter="MOCK_SAT"
    />
  );
}
