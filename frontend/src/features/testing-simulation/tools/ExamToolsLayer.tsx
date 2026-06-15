"use client";
import { DesmosCalculator } from "./calculator/DesmosCalculator";
import { ReferenceSheet } from "./ReferenceSheet";
import { NotesPanel } from "./notes/NotesPanel";
import { KeyboardShortcutsHelp } from "./KeyboardShortcutsHelp";
import { HighlightPopover } from "./highlight/HighlightPopover";
import type { ExamTools } from "./useExamTools";

interface ExamToolsLayerProps {
  tools: ExamTools;
  attemptId: number | string;
}

/**
 * Renders every floating/overlay tool. Single mount point so the page only needs
 * one line. Each child is independent and self-persisting. The calculator floats
 * (draggable, Bluebook-style) and never reserves layout space.
 */
export function ExamToolsLayer({ tools, attemptId }: ExamToolsLayerProps) {
  return (
    <>
      {tools.calculatorOpen && <DesmosCalculator onClose={tools.toggleCalculator} />}
      {tools.referenceOpen && <ReferenceSheet onClose={tools.toggleReference} />}
      {tools.notesOpen && <NotesPanel attemptId={attemptId} onClose={tools.toggleNotes} />}
      {tools.helpOpen && <KeyboardShortcutsHelp onClose={tools.closeHelp} />}
      {tools.highlighter.popover && (
        <HighlightPopover
          popover={tools.highlighter.popover}
          onPick={tools.highlighter.setStyle}
          onRemove={tools.highlighter.removeHighlight}
          onClose={tools.highlighter.dismissPopover}
        />
      )}
    </>
  );
}
