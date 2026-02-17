<script lang="ts">
    import { onMount, type Snippet } from 'svelte';
    import { asHTMLElement, queryHTMLElements, getActiveHTMLElement } from '$lib/utils/dom';

    let { x, y, onClose, children } = $props<{
        x: number;
        y: number;
        onClose: () => void;
        children: Snippet<[{ submenuSide: 'left' | 'right' }]>;
    }>();

    let menuEl = $state<HTMLDivElement>();
    let adjustedX = $state(0);
    let adjustedY = $state(0);
    let submenuSide = $state<'left' | 'right'>('right');
    let isVisible = $state(false);
    let resizeObserver: ResizeObserver | null = null;

    // Keyboard navigation state
    let focusedIndex = $state(-1);
    let menuItems = $state<HTMLElement[]>([]);
    let isKeyboardNav = $state(true); // Start with keyboard mode for initial focus

    function updatePosition() {
        if (!menuEl) return;

        const rect = menuEl.getBoundingClientRect();
        const winWidth = window.innerWidth;
        const winHeight = window.innerHeight;

        let newX = x;
        let newY = y;

        // X-Axis constraint
        if (newX + rect.width > winWidth) {
            newX = winWidth - rect.width - 5;
        }

        // Y-Axis constraint (Status Bar protection)
        const statusBarHeight = 32;
        const padding = 8;

        // If the menu height is taller than available space, we let flex/scroll handle it via max-h
        // We just need to ensure the top doesn't start too low if it would push bottom off screen
        if (newY + rect.height > winHeight - statusBarHeight) {
            newY = winHeight - rect.height - statusBarHeight - padding;
        }

        adjustedX = Math.max(5, newX);
        adjustedY = Math.max(5, newY);
        submenuSide = adjustedX + rect.width + 180 > winWidth ? 'left' : 'right';
        isVisible = true;
    }

    function updateMenuItems() {
        if (!menuEl) return;
        // Get all focusable elements: buttons
        menuItems = queryHTMLElements(menuEl, 'button:not([disabled])');
    }

    function focusItem(index: number) {
        if (index >= 0 && index < menuItems.length) {
            menuItems[index]?.focus();
            focusedIndex = index;
            isKeyboardNav = true;
        }
    }

    function handleMouseMove() {
        // Mouse interaction switches to mouse mode
        isKeyboardNav = false;
    }

    function handleKeydown(e: KeyboardEvent) {
        updateMenuItems();

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                if (focusedIndex < menuItems.length - 1) {
                    focusItem(focusedIndex + 1);
                } else {
                    focusItem(0);
                }
                break;

            case 'ArrowUp':
                e.preventDefault();
                if (focusedIndex > 0) {
                    focusItem(focusedIndex - 1);
                } else {
                    focusItem(menuItems.length - 1);
                }
                break;

            case 'Enter':
            case ' ':
                e.preventDefault();
                if (focusedIndex >= 0 && focusedIndex < menuItems.length) {
                    menuItems[focusedIndex]?.click();
                }
                break;

            case 'ArrowRight':
                e.preventDefault();
                if (focusedIndex >= 0 && focusedIndex < menuItems.length) {
                    const item = menuItems[focusedIndex];
                    const submenuContainer = item?.closest('.submenu-container');
                    if (submenuContainer) {
                        // Open submenu by triggering mouseenter
                        const mouseEnterEvent = new MouseEvent('mouseenter', { bubbles: true });
                        submenuContainer.dispatchEvent(mouseEnterEvent);
                        // Focus first item in submenu
                        setTimeout(() => {
                            const submenuItems = submenuContainer.querySelectorAll(
                                '[data-submenu="true"] button:not([disabled])',
                            );
                            if (submenuItems.length > 0) {
                                const firstSubmenu = asHTMLElement(submenuItems[0]);
                                if (firstSubmenu) firstSubmenu.focus();
                                updateMenuItems();
                                const firstEl = submenuItems[0]
                                    ? asHTMLElement(submenuItems[0])
                                    : null;
                                focusedIndex = firstEl ? menuItems.indexOf(firstEl) : -1;
                            }
                        }, 50);
                    }
                }
                break;

            case 'ArrowLeft': {
                e.preventDefault();
                // Check if we're inside a submenu
                const submenuEl = menuItems[focusedIndex]?.closest('[data-submenu="true"]');
                if (submenuEl) {
                    // Close submenu and return to parent
                    const parentContainer = submenuEl.closest('.submenu-container');
                    if (parentContainer) {
                        const mouseLeaveEvent = new MouseEvent('mouseleave', { bubbles: true });
                        parentContainer.dispatchEvent(mouseLeaveEvent);
                        const triggerBtn = parentContainer.querySelector('button');
                        if (triggerBtn) {
                            triggerBtn.focus();
                            updateMenuItems();
                            const triggerElement = asHTMLElement(triggerBtn);
                            const idx = triggerElement ? menuItems.indexOf(triggerElement) : -1;
                            if (idx >= 0) focusedIndex = idx;
                        }
                    }
                }
                break;
            }

            case 'Escape':
                e.preventDefault();
                onClose();
                break;

            case 'Tab':
                e.preventDefault();
                break;
        }
    }

    $effect(() => {
        updatePosition();
    });

    onMount(() => {
        if (menuEl) {
            resizeObserver = new ResizeObserver(() => {
                requestAnimationFrame(() => updatePosition());
            });
            resizeObserver.observe(menuEl);
        }

        updatePosition();

        // Focus first menu item after render
        setTimeout(() => {
            updateMenuItems();
            if (menuItems.length > 0) {
                focusItem(0);
            }
        }, 0);

        return () => {
            resizeObserver?.disconnect();
        };
    });

    function handleBackdropContextMenu(e: MouseEvent) {
        e.preventDefault();
        const backdrop = asHTMLElement(e.currentTarget);
        if (!backdrop) return;
        const originalDisplay = backdrop.style.display;
        backdrop.style.display = 'none';
        const target = document.elementFromPoint(e.clientX, e.clientY);
        backdrop.style.display = originalDisplay;
        onClose();
        if (target) {
            const newEvent = new MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: e.clientX,
                clientY: e.clientY,
                button: 2,
                buttons: 2,
                ctrlKey: e.ctrlKey,
                shiftKey: e.shiftKey,
                altKey: e.altKey,
                metaKey: e.metaKey,
            });
            target.dispatchEvent(newEvent);
        }
    }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="fixed inset-0 z-200" onclick={onClose} oncontextmenu={handleBackdropContextMenu}>
    <div
        bind:this={menuEl}
        class="bg-bg-panel border-border-light text-fg-default no-scrollbar absolute z-200 max-h-[calc(100vh-64px)] max-w-75 min-w-50 overflow-y-auto rounded-md border py-1 shadow-xl"
        style="
            left: {adjustedX}px;
            top: {adjustedY}px;
            opacity: {isVisible ? 1 : 0};
        "
        onclick={(e) => e.stopPropagation()}
        oncontextmenu={(e) => e.preventDefault()}
        onkeydown={handleKeydown}
        onmousemove={handleMouseMove}
        onmouseenter={(e) => {
            // When mouse enters a button, blur any focused element to clear keyboard selection
            const target = asHTMLElement(e.target);
            if (!target) return;
            if (target.tagName === 'BUTTON' && !(target as HTMLButtonElement).disabled) {
                isKeyboardNav = false;
                if (document.activeElement && menuItems.includes(getActiveHTMLElement()!)) {
                    getActiveHTMLElement()?.blur();
                }
            }
        }}
        data-keyboard-nav={isKeyboardNav}>
        {@render children({ submenuSide })}
    </div>
</div>
