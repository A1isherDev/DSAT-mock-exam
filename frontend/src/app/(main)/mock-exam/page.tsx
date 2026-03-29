import MockExamsList from "@/components/MockExamsList";

export default function MockExamPage() {
  return (
    <MockExamsList
      eyebrow="Mock"
      title="Mock exam"
      description="Timed full SAT or midterm attempts only (portal entries your admin publishes here). Past papers and form drills are under Pastpaper practice tests."
      examKindFilter="MOCK_SAT"
    />
  );
}
