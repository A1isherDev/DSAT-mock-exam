import MockExamsList from "@/components/MockExamsList";

export default function MidtermPage() {
  return (
    <MockExamsList
      eyebrow="Midterm"
      title="Midterm"
      description="In this mode, the Desmos calculator and reference sheet are hidden during the exam—closer to a typical midterm environment."
      mockQuerySuffix="?midterm=1"
    />
  );
}
