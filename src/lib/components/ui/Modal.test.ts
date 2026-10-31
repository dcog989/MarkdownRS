import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { describe, expect, it } from "vitest";
import Modal from "./Modal.svelte";

const children = createRawSnippet(() => ({
  render: () => '<button type="button">First</button><button type="button">Last</button>',
}));

function renderModal(isOpen: boolean, onClose: () => void = () => {}) {
  return render(Modal, { props: { isOpen, onClose, children } });
}

async function waitForFirstFocus() {
  await waitFor(() => expect(document.activeElement).toBe(screen.getByText("First")));
}

describe("Modal focus handling", () => {
  it("focuses the first control when it opens", async () => {
    renderModal(true);

    await waitForFirstFocus();
  });

  it("wraps Tab from the last control back to the first", async () => {
    renderModal(true);
    await waitForFirstFocus();

    const last = screen.getByText("Last");
    last.focus();
    await fireEvent.keyDown(last, { key: "Tab" });

    expect(document.activeElement).toBe(screen.getByText("First"));
  });

  it("returns focus to whatever had it before the dialog opened", async () => {
    const opener = document.createElement("button");
    opener.textContent = "Opener";
    document.body.append(opener);
    opener.focus();

    const { rerender } = renderModal(true);
    await waitForFirstFocus();

    await rerender({ isOpen: false, onClose: () => {}, children });

    await waitFor(() => expect(document.activeElement).toBe(opener));
    opener.remove();
  });
});
