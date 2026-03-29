import MockExamsList from "@/components/MockExamsList";

export default function MockExamPage() {
  return (
    <MockExamsList
      eyebrow="Mock"
      title="Mock exam"
      description="Simulated exam conditions to assess readiness: staff create these mocks and their questions—they are not built from the pastpaper practice library. After practicing on real past forms, take a mock here to see how you perform under time and rules."
      examKindFilter="MOCK_SAT"
    />
  );
}
