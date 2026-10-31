<script lang="ts">
import Bookmark from "lucide-svelte/icons/bookmark";
import CircleAlert from "lucide-svelte/icons/circle-alert";
import FileText from "lucide-svelte/icons/file-text";
import Pencil from "lucide-svelte/icons/pencil";
import PencilLine from "lucide-svelte/icons/pencil-line";
import SquarePen from "lucide-svelte/icons/square-pen";
import { isBookmarked } from "$lib/stores/bookmarkStore.svelte";
import type { EditorTab } from "$lib/stores/editorTypes";

interface Props {
  tab: EditorTab;
  /** "tab" colours by active state; "row" leaves colour to the list row's --icon-color. */
  variant?: "tab" | "row";
  isActive?: boolean;
}

let { tab, variant = "tab", isActive = false }: Props = $props();

type TabIconState = "missing" | "untitledEdited" | "untitled" | "dirty" | "bookmarked" | "plain";
type Tone = "danger" | "dirty" | "accent" | "muted" | "inverse";

const TONE_CLASS: Record<Tone, string> = {
  danger: "text-danger",
  dirty: "text-dirty-active",
  accent: "text-accent-secondary",
  muted: "text-fg-muted",
  inverse: "text-fg-inverse",
};

const TONE_VAR: Partial<Record<Tone, string>> = {
  danger: "--danger",
  dirty: "--dirty-indicator",
};

let state = $derived.by<TabIconState>(() => {
  if (tab.fileCheckFailed) return "missing";
  if (!tab.path) return tab.content.length > 0 ? "untitledEdited" : "untitled";
  if (tab.isDirty) return "dirty";
  if (isBookmarked(tab.path)) return "bookmarked";
  return "plain";
});

let tone = $derived.by<Tone>(() => {
  if (state === "missing") return "danger";
  if (variant === "row") return state === "dirty" ? "dirty" : "muted";
  if (!isActive) return state === "dirty" ? "accent" : "muted";
  if (state === "dirty" || (state === "untitledEdited" && tab.isDirty)) return "dirty";
  return "inverse";
});

let cls = $derived(variant === "row" ? "row-icon shrink-0" : `shrink-0 ${TONE_CLASS[tone]}`);
let style = $derived(variant === "row" && TONE_VAR[tone] ? `--icon-color: var(${TONE_VAR[tone]})` : undefined);
</script>

{#if state === "missing"}
  <CircleAlert size={14} class={cls} {style} />
{:else if state === "untitledEdited"}
  <PencilLine size={14} class={cls} {style} />
{:else if state === "untitled"}
  <Pencil size={14} class={cls} {style} />
{:else if state === "dirty"}
  <SquarePen size={14} class={cls} {style} />
{:else if state === "bookmarked"}
  <Bookmark size={14} class={cls} {style} />
{:else}
  <FileText size={14} class={cls} {style} />
{/if}
