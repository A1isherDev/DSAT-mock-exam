"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminApi, classesApi, examsApi } from "@/lib/api";
import { ClassroomButton } from "@/components/classroom/Button";
import { ClassroomModal } from "@/components/classroom/Modal";
import { isTimedMockSectionRow, singleDisplayTitle, subjectLabel } from "@/lib/practiceTestCards";
import { Users } from "lucide-react";

export default function TeacherStudentsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [people, setPeople] = useState<any[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);

  const [grantOpen, setGrantOpen] = useState(false);
  const [grantLoading, setGrantLoading] = useState(false);
  const [grantMsg, setGrantMsg] = useState<string | null>(null);
  const [testsLoading, setTestsLoading] = useState(false);
  const [tests, setTests] = useState<any[]>([]);
  const [selectedTestIds, setSelectedTestIds] = useState<number[]>([]);
  const [testQuery, setTestQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const all = await classesApi.list();
        const teacherGroups = (Array.isArray(all) ? all : []).filter((g) => g.my_role === "ADMIN");
        if (cancelled) return;
        setGroups(teacherGroups);
        const gid = teacherGroups[0]?.id;
        if (gid) setSelectedGroupId(gid);
      } catch (e: any) {
        if (!cancelled) setError(e?.response?.data?.detail || "Could not load groups.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedGroupId) return;
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        const pe = await classesApi.people(selectedGroupId);
        if (!cancelled) {
          setPeople(Array.isArray(pe) ? pe : []);
          setSelectedStudentIds([]);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.response?.data?.detail || "Could not load students.");
      }
    })();
    return () => { cancelled = true; };
  }, [selectedGroupId]);

  useEffect(() => {
    if (!grantOpen) return;
    let cancelled = false;
    (async () => {
      setTestsLoading(true);
      setGrantMsg(null);
      try {
        const list = await examsApi.getPracticeTests();
        const raw = Array.isArray(list) ? list : [];
        // Teacher access UI: standalone practice library only (exclude timed mock section rows).
        const standalone = raw.filter((t) => !isTimedMockSectionRow(t));
        if (!cancelled) setTests(standalone);
      } catch (e: any) {
        if (!cancelled) setGrantMsg(e?.response?.data?.detail || "Could not load practice tests.");
      } finally {
        if (!cancelled) setTestsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [grantOpen]);

  const students = people.filter((m) => m.role === "STUDENT");
  const allStudentsSelected = students.length > 0 && selectedStudentIds.length === students.length;

  const filteredTests = (() => {
    const q = testQuery.trim().toLowerCase();
    if (!q) return tests;
    return tests.filter((t) => {
      const blob = `${singleDisplayTitle(t)} ${subjectLabel(t.subject)} ${t.form_type || ""} ${t.label || ""} ${t.practice_date || ""}`.toLowerCase();
      return blob.includes(q);
    });
  })();

  const toggleStudent = (id: number) => {
    setSelectedStudentIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleTest = (id: number) => {
    setSelectedTestIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const grantAccess = async () => {
    setGrantMsg(null);
    if (!selectedStudentIds.length) {
      setGrantMsg("Select at least one student.");
      return;
    }
    if (!selectedTestIds.length) {
      setGrantMsg("Select at least one practice test.");
      return;
    }
    setGrantLoading(true);
    try {
      await adminApi.bulkAssignStudents([], selectedStudentIds, "FULL", undefined, selectedTestIds);
      setGrantMsg("Access granted.");
      setSelectedTestIds([]);
      setGrantOpen(false);
    } catch (e: any) {
      setGrantMsg(e?.response?.data?.detail || "Could not grant access.");
    } finally {
      setGrantLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-8 py-12">
      <div className="mb-8">
        <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-2">Students</p>
        <h1 className="text-3xl font-extrabold text-foreground tracking-tight">Students</h1>
        <p className="text-muted-foreground mt-2">View students in your groups.</p>
      </div>

      {error && <div className="mb-6 p-4 rounded-2xl border border-red-200 bg-red-50 text-red-700 font-semibold text-sm">{error}</div>}

      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-10 flex justify-center">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center justify-between gap-4 border-b border-border p-5">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <p className="font-bold text-foreground">Group</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <select
                value={selectedGroupId ?? ""}
                onChange={(e) => setSelectedGroupId(Number(e.target.value))}
                className="ui-input rounded-xl px-3 py-2 text-sm font-semibold"
              >
                <option value="">Select group</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} {g.subject ? `(${g.subject})` : ""}
                  </option>
                ))}
              </select>
              {selectedGroupId ? (
                <Link href={`/classes/${selectedGroupId}`} className="text-sm font-bold text-primary hover:underline">
                  Open group
                </Link>
              ) : null}
              <ClassroomButton
                variant="secondary"
                size="sm"
                disabled={!selectedStudentIds.length}
                onClick={() => {
                  setGrantMsg(null);
                  setGrantOpen(true);
                }}
                title={selectedStudentIds.length ? "" : "Select at least one student below"}
              >
                Grant practice test access
              </ClassroomButton>
            </div>
          </div>

          {people.length === 0 ? (
            <div className="p-6 text-muted-foreground">No students yet.</div>
          ) : (
            <div className="divide-y divide-border">
              {students.length ? (
                <div className="p-4 flex flex-wrap items-center justify-between gap-3 bg-surface-2/40">
                  <label className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                    <input
                      type="checkbox"
                      checked={allStudentsSelected}
                      onChange={() => {
                        if (allStudentsSelected) setSelectedStudentIds([]);
                        else setSelectedStudentIds(students.map((s) => s.user?.id).filter(Boolean));
                      }}
                    />
                    Select all students
                  </label>
                  <p className="text-xs font-semibold text-muted-foreground">
                    Selected: {selectedStudentIds.length}/{students.length}
                  </p>
                </div>
              ) : null}

              {students.map((m) => {
                const uid = m.user?.id;
                const checked = uid ? selectedStudentIds.includes(uid) : false;
                return (
                  <div key={m.id} className="p-5 flex items-center justify-between gap-4">
                    <div className="min-w-0 flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={checked}
                        onChange={() => (uid ? toggleStudent(uid) : null)}
                        aria-label={`Select ${m.user?.email || "student"}`}
                        disabled={!uid}
                      />
                      <div className="min-w-0">
                        <p className="truncate font-bold text-foreground">
                          {m.user?.first_name || m.user?.email} {m.user?.last_name || ""}
                        </p>
                        <p className="truncate text-sm text-muted-foreground">{m.user?.email}</p>
                      </div>
                    </div>
                    <span className="rounded-full bg-surface-2 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      STUDENT
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <ClassroomModal
        open={grantOpen}
        onClose={() => {
          if (grantLoading) return;
          setGrantOpen(false);
        }}
        titleId="grant-practice-access-title"
        eyebrow="Teacher tools"
        title="Grant practice test access"
        description="Select one or more practice tests, then grant access to the selected students."
        size="lg"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-semibold text-muted-foreground">
              Students: {selectedStudentIds.length} · Tests: {selectedTestIds.length}
            </p>
            <div className="flex items-center gap-2">
              <ClassroomButton variant="ghost" size="sm" disabled={grantLoading} onClick={() => setGrantOpen(false)}>
                Cancel
              </ClassroomButton>
              <ClassroomButton variant="primary" size="sm" loading={grantLoading} onClick={grantAccess}>
                Grant access
              </ClassroomButton>
            </div>
          </div>
        }
      >
        {grantMsg ? (
          <div className="mb-4 rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm font-semibold text-foreground">
            {grantMsg}
          </div>
        ) : null}

        <div className="mb-4">
          <input
            value={testQuery}
            onChange={(e) => setTestQuery(e.target.value)}
            placeholder="Search practice tests..."
            className="ui-input w-full rounded-xl px-3 py-2 text-sm font-semibold"
          />
        </div>

        {testsLoading ? (
          <div className="rounded-2xl border border-border bg-card p-8 flex justify-center">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredTests.length === 0 ? (
          <div className="text-sm font-semibold text-muted-foreground">No practice tests found.</div>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {filteredTests.map((t) => {
              const checked = selectedTestIds.includes(t.id);
              return (
                <label key={t.id} className="flex cursor-pointer items-start gap-3 p-4 hover:bg-surface-2/50">
                  <input type="checkbox" className="mt-1" checked={checked} onChange={() => toggleTest(t.id)} />
                  <div className="min-w-0">
                    <p className="truncate font-bold text-foreground">{singleDisplayTitle(t)}</p>
                    <p className="text-xs font-semibold text-muted-foreground">
                      {subjectLabel(t.subject)} · {t.form_type === "US" ? "US" : "International"}
                      {t.label ? ` · ${t.label}` : ""} · {(t.modules?.length ?? 0)} modules
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </ClassroomModal>
    </div>
  );
}

