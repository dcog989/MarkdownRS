export function asHTMLElement(
    element: EventTarget | Element | null | undefined,
): HTMLElement | null {
    if (!element) return null;
    return element instanceof HTMLElement ? element : null;
}

export function assertHTMLElement(
    element: EventTarget | Element | null | undefined,
    context?: string,
): HTMLElement {
    const htmlElement = asHTMLElement(element);
    if (!htmlElement) {
        const elementType = element?.constructor.name ?? 'null';
        const message = context
            ? `Expected HTMLElement in ${context}, got ${elementType}`
            : `Expected HTMLElement, got ${elementType}`;
        throw new Error(message);
    }
    return htmlElement;
}

export function queryHTMLElements(parent: Element | Document, selector: string): HTMLElement[] {
    return Array.from(parent.querySelectorAll(selector)).filter(
        (el): el is HTMLElement => el instanceof HTMLElement,
    );
}

export function getActiveHTMLElement(): HTMLElement | null {
    return asHTMLElement(document.activeElement);
}
