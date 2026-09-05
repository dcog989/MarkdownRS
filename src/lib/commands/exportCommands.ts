import { exportService } from "$lib/services/exportService";
import type { Command } from "./types";

function imageExport(format: "png" | "webp" | "svg"): Command {
  return {
    id: `export.${format}`,
    label: `Export: ${format.toUpperCase()}`,
    category: "Export",
    handler: () => exportService.exportToImage(format),
  };
}

export const exportCommands: Command[] = [
  {
    id: "export.html",
    label: "Export: HTML",
    category: "Export",
    handler: () => exportService.exportToHtml(),
  },
  {
    id: "export.pdf",
    label: "Export: PDF",
    category: "Export",
    handler: () => exportService.exportToPdf(),
  },
  imageExport("png"),
  imageExport("webp"),
  imageExport("svg"),
];
