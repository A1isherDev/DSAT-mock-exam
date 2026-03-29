import MockExamsList from "@/components/MockExamsList";

export default function MockExamPage() {
  return (
    <MockExamsList
      eyebrow="Mock"
      title="Mock Exam"
      description="Official full mocks only (Reading &amp; Writing → break → Math, no pause). Sectional drills stay under Practice Tests."
      examKindFilter="MOCK_SAT"
    />
  );
}
