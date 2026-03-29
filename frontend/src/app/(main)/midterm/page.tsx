import MockExamsList from "@/components/MockExamsList";

export default function MidtermPage() {
  return (
    <MockExamsList
      eyebrow="Midterm"
      title="Midterm"
      description="Timed midterm-style attempts your instructors publish (separate from pastpaper practice). Same rules as other mocks: staff build the exam; it is not assembled from the practice test library."
      mockQuerySuffix="?midterm=1"
      examKindFilter="MIDTERM"
    />
  );
}
