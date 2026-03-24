import StudentShell from "@/components/StudentShell";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return <StudentShell>{children}</StudentShell>;
}
