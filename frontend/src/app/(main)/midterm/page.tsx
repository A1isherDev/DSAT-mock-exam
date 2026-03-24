import MockExamsList from "@/components/MockExamsList";

export default function MidtermPage() {
  return (
    <MockExamsList
      eyebrow="Midterm"
      title="Midterm"
      description="Bu rejimda imtihon davomida Desmos kalkulyatori va reference sheet ko‘rinmaydi — real midterm muhitiga yaqin."
      mockQuerySuffix="?midterm=1"
    />
  );
}
