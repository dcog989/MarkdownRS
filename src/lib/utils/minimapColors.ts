export interface MinimapColors {
  bg: string;
  text: string;
  heading: string;
  code: string;
  comment: string;
  list: string;
  link: string;
  url: string;
  quote: string;
  strong: string;
  emphasis: string;
  strike: string;
  callout: Record<string, string>;
}

export function getColors(): MinimapColors {
  const style = getComputedStyle(document.documentElement);
  return {
    bg: style.getPropertyValue("--editor-bg").trim(),
    text: style.getPropertyValue("--editor-fg").trim(),
    heading: style.getPropertyValue("--editor-syntax-heading").trim(),
    code: style.getPropertyValue("--editor-code-fg").trim(),
    comment: style.getPropertyValue("--editor-syntax-comment").trim(),
    list: style.getPropertyValue("--editor-fg").trim(),
    link: style.getPropertyValue("--editor-link").trim(),
    url: style.getPropertyValue("--editor-url").trim(),
    quote: style.getPropertyValue("--editor-quote-fg").trim(),
    strong: style.getPropertyValue("--editor-syntax-strong").trim(),
    emphasis: style.getPropertyValue("--editor-syntax-emphasis").trim(),
    strike: style.getPropertyValue("--editor-fg-secondary").trim(),
    callout: {
      note: style.getPropertyValue("--editor-callout-note-accent").trim(),
      tip: style.getPropertyValue("--editor-callout-tip-accent").trim(),
      important: style.getPropertyValue("--editor-callout-important-accent").trim(),
      warning: style.getPropertyValue("--editor-callout-warning-accent").trim(),
      caution: style.getPropertyValue("--editor-callout-caution-accent").trim(),
    },
  };
}
