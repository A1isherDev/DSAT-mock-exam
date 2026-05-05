"use client";

import { useMemo, useState } from "react";
import { useQuestionBankModules, useQuestionBankTests } from "./hooks";

export default function AssignToModuleDialog(props: {
  open: boolean;
  onClose: () => void;
  questionId: number;
  onAssign: (args: { testId: number; moduleId: number }) => Promise<{ status?: string } | void>;
}) {
  const [testId, setTestId] = useState<number>(0);
  const [moduleId, setModuleId] = useState<number>(0);
  const testsQ = useQuestionBankTests();
  const modulesQ = useQuestionBankModules(testId);

  const tests = testsQ.data || [];
  const modules = modulesQ.data || [];

  const canSubmit = testId > 0 && moduleId > 0;

  const selectedTestTitle = useMemo(() => {
    const t = tests.find((x) => x.id === testId);
    return (t && typeof (t as any).title === "string" ? (t as any).title : `Test #${testId}`) as string;
  }, [tests, testId]);

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-lg rounded border bg-white p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-sm font-semibold">Assign to module</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Select a practice test, then the target module.
            </div>
          </div>
          <button className="text-sm underline" onClick={props.onClose}>
            Close
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-semibold">Practice test</label>
            <select
              className="mt-1 w-full rounded border px-3 py-2 text-sm"
              value={String(testId || 0)}
              onChange={(e) => {
                const v = Number(e.target.value);
                setTestId(Number.isFinite(v) ? v : 0);
                setModuleId(0);
              }}
            >
              <option value="0">Select…</option>
              {tests.map((t) => (
                <option key={t.id} value={String(t.id)}>
                  {(t as any).title ? String((t as any).title) : `Test #${t.id}`}
                </option>
              ))}
            </select>
            {testsQ.isLoading ? <div className="mt-1 text-xs">Loading tests…</div> : null}
            {testsQ.isError ? <div className="mt-1 text-xs text-red-600">Failed to load tests.</div> : null}
          </div>

          <div>
            <label className="text-xs font-semibold">Module</label>
            <select
              className="mt-1 w-full rounded border px-3 py-2 text-sm"
              value={String(moduleId || 0)}
              onChange={(e) => setModuleId(Number(e.target.value) || 0)}
              disabled={testId <= 0}
            >
              <option value="0">{testId > 0 ? "Select…" : "Select test first"}</option>
              {modules.map((m) => (
                <option key={m.id} value={String(m.id)}>
                  Module {m.module_order} (id {m.id})
                </option>
              ))}
            </select>
            {modulesQ.isFetching ? <div className="mt-1 text-xs">Loading modules for {selectedTestTitle}…</div> : null}
            {modulesQ.isError ? <div className="mt-1 text-xs text-red-600">Failed to load modules.</div> : null}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button className="rounded border px-3 py-2 text-sm" onClick={props.onClose}>
              Cancel
            </button>
            <button
              className="rounded border bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
              disabled={!canSubmit}
              onClick={async () => {
                const res = await props.onAssign({ testId, moduleId });
                // Let caller handle toast/message; close by default on success.
                if (res && (res as any).status === "exists") {
                  props.onClose();
                  return;
                }
                props.onClose();
              }}
            >
              Assign
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

