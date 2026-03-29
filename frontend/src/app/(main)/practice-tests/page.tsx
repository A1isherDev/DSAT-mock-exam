import PracticeTestsList from "@/components/PracticeTestsList";

export default function PracticeTestsPage() {
  return (
    <PracticeTestsList
      eyebrow="Practice"
      title="Practice tests"
      description="Only standalone practice tests appear here (not mock exam sections). Mock exam R&W and Math live under Mock Exam. You can pause timers on practice tests."
    />
  );
}
