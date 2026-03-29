import MockExamsList from "@/components/MockExamsList";

export default function MidtermPage() {
  return (
    <MockExamsList
      eyebrow="Midterm"
      title="Midterm"
      description="These exams are created as “Midterm” in the admin panel: you choose subject, number of modules (1 or 2), and time per module. Calculator and reference sheet stay hidden."
      mockQuerySuffix="?midterm=1"
      examKindFilter="MIDTERM"
    />
  );
}
