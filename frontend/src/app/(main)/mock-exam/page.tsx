import MockExamsList from "@/components/MockExamsList";

export default function MockExamPage() {
  return (
    <MockExamsList
      eyebrow="Mock"
      title="Mock Exam"
      description="Nothing appears here until an admin assigns you a mock on the Mock Exam record (admin panel or Assign users). Until then, use Practice Tests for every section. Full flow: R&amp;W → break → Math, no pause."
      examKindFilter="MOCK_SAT"
    />
  );
}
