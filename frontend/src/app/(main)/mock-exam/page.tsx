import MockExamsList from "@/components/MockExamsList";

export default function MockExamPage() {
  return (
    <MockExamsList
      eyebrow="Mock"
      title="Mock Exam"
      description="Entries come only from the Portal mock exam table in Django admin (one row per mock, with assigned users). No practice-test rows are listed here. Full flow: R&amp;W → break → Math, no pause."
      examKindFilter="MOCK_SAT"
    />
  );
}
