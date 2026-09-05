import type { LintDiagnostic } from "$lib/types/api";

class MarkdownLintState {
  issueCount = $state(0);
  highestSeverity = $state<"error" | "warning" | "info" | "clean">("clean");
  diagnostics = $state<LintDiagnostic[]>([]);
}
export const markdownLintState = new MarkdownLintState();
