import { exportService } from "$lib/services/exportService";
import type { Command } from "./types";

const IMAGE_LABEL_KEYS = {
  png: "command.exportPng",
  webp: "command.exportWebp",
  svg: "command.exportSvg",
} as const;

function imageExport(format: "png" | "webp" | "svg"): Command {
  return {
    id: `export.${format}`,
    label: format.toUpperCase(),
    labelKey: IMAGE_LABEL_KEYS[format],
    category: "commandCategory.export",
    handler: () => exportService.exportToImage(format),
  };
}

export const exportCommands: Command[] = [
  {
    id: "export.html",
    label: "HTML",
    labelKey: "command.exportHtml",
    category: "commandCategory.export",
    handler: () => exportService.exportToHtml(),
  },
  {
    id: "export.pdf",
    label: "PDF",
    labelKey: "command.exportPdf",
    category: "commandCategory.export",
    handler: () => exportService.exportToPdf(),
  },
  {
    id: "export.docx",
    label: "DOCX",
    labelKey: "command.exportDocx",
    category: "commandCategory.export",
    handler: () => exportService.exportToDocx(),
  },
  {
    id: "export.epub",
    label: "EPUB",
    labelKey: "command.exportEpub",
    category: "commandCategory.export",
    handler: () => exportService.exportToEpub(),
  },
  {
    id: "export.latex",
    label: "LaTeX",
    labelKey: "command.exportLatex",
    category: "commandCategory.export",
    handler: () => exportService.exportToLatex(),
  },
  imageExport("png"),
  imageExport("webp"),
  imageExport("svg"),
];
