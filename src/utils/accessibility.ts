// Orion IDE - Comprehensive Accessibility Support System
// Pure TypeScript, no external dependencies

// ─── Types & Interfaces ──────────────────────────────────────────────────────

export type AriaPoliteness = 'polite' | 'assertive' | 'off';

export type HighContrastTheme = 'none' | 'high-contrast-dark' | 'high-contrast-light';

export type ColorBlindnessType =
  | 'protanopia'
  | 'deuteranopia'
  | 'tritanopia'
  | 'achromatopsia';

export type NavigationAxis = 'horizontal' | 'vertical' | 'both';

export type WidgetRole =
  | 'tree'
  | 'treeitem'
  | 'tablist'
  | 'tab'
  | 'tabpanel'
  | 'toolbar'
  | 'menu'
  | 'menuitem'
  | 'menubar'
  | 'dialog'
  | 'alertdialog'
  | 'alert'
  | 'status'
  | 'listbox'
  | 'option'
  | 'grid'
  | 'row'
  | 'gridcell'
  | 'separator';

export interface AriaLiveRegionConfig {
  /** Politeness level for the live region */
  politeness: AriaPoliteness;
  /** Whether the entire region should be re-read on updates */
  atomic: boolean;
  /** Which parts of the region should be announced: 'additions' | 'removals' | 'text' | 'all' */
  relevant?: string;
  /** Debounce interval in ms to batch rapid announcements */
  debounceMs?: number;
  /** Maximum queue length before oldest messages are dropped */
  maxQueueSize?: number;
}

export interface FocusTrapConfig {
  /** The root element to trap focus within */
  containerId: string;
  /** Whether to restore focus to the previously focused element on release */
  restoreFocus: boolean;
  /** Selector for the element that should receive initial focus */
  initialFocusSelector?: string;
  /** Whether pressing Escape releases the trap */
  escapeDeactivates: boolean;
  /** Additional selectors to include as focusable */
  additionalFocusableSelectors?: string[];
  /** Callback invoked when the trap is deactivated */
  onDeactivate?: () => void;
}

export interface RovingTabindexConfig {
  /** Container element ID */
  containerId: string;
  /** Selector for items that participate in roving tabindex */
  itemSelector: string;
  /** Navigation axis */
  axis: NavigationAxis;
  /** Whether navigation wraps around at boundaries */
  wrap: boolean;
  /** Whether to activate/select items on focus */
  activateOnFocus: boolean;
  /** Callback when the active item changes */
  onActiveChange?: (element: HTMLElement, index: number) => void;
}

export interface HighContrastConfig {
  /** Whether to listen for OS-level high contrast changes */
  detectSystemPreference: boolean;
  /** CSS custom properties to override in high contrast mode */
  darkOverrides: Record<string, string>;
  /** CSS custom properties for high contrast light theme */
  lightOverrides: Record<string, string>;
  /** Callback when high contrast mode changes */
  onChange?: (theme: HighContrastTheme) => void;
}

export interface ReducedMotionConfig {
  /** Whether to detect the OS preference */
  detectSystemPreference: boolean;
  /** CSS class applied to the root element when reduced motion is active */
  rootClassName: string;
  /** Callback when preference changes */
  onChange?: (prefersReducedMotion: boolean) => void;
}

export interface FontScalingConfig {
  /** Base font size in pixels */
  baseSizePx: number;
  /** Minimum allowed font size in pixels */
  minSizePx: number;
  /** Maximum allowed font size in pixels */
  maxSizePx: number;
  /** Step increment in pixels */
  stepPx: number;
  /** CSS custom property name to set */
  cssVariable: string;
  /** Callback when font size changes */
  onChange?: (newSizePx: number) => void;
}

export interface ZoomConfig {
  /** Minimum zoom percentage */
  minPercent: number;
  /** Maximum zoom percentage */
  maxPercent: number;
  /** Step increment in percentage points */
  stepPercent: number;
  /** Initial zoom level */
  initialPercent: number;
  /** CSS custom property name for zoom */
  cssVariable: string;
  /** Callback when zoom changes */
  onChange?: (zoomPercent: number) => void;
}

export interface SkipLinkDefinition {
  /** Unique ID for the skip link */
  id: string;
  /** Visible label */
  label: string;
  /** Target element ID to focus on activation */
  targetId: string;
  /** Keyboard shortcut hint (display only) */
  shortcutHint?: string;
}

export interface SkipLinksConfig {
  /** Array of skip link definitions */
  links: SkipLinkDefinition[];
  /** CSS class for the skip links container */
  containerClassName: string;
  /** CSS class for individual skip link buttons */
  linkClassName: string;
}

export interface TabOrderEntry {
  /** Element selector or ID */
  selector: string;
  /** Assigned tabindex value */
  tabindex: number;
  /** Logical group name for the entry */
  group?: string;
}

export interface TabOrderConfig {
  /** Ordered entries defining tabindex assignments */
  entries: TabOrderEntry[];
  /** Whether to automatically update on DOM mutations */
  observeMutations: boolean;
}

export interface AccessibleNameResult {
  /** The computed accessible name */
  name: string;
  /** The source of the name: 'aria-labelledby' | 'aria-label' | 'label' | 'title' | 'placeholder' | 'content' | 'none' */
  source: string;
}

export interface AriaAttributeSet {
  role?: WidgetRole | string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-expanded'?: boolean;
  'aria-selected'?: boolean;
  'aria-checked'?: boolean | 'mixed';
  'aria-disabled'?: boolean;
  'aria-hidden'?: boolean;
  'aria-haspopup'?: boolean | string;
  'aria-controls'?: string;
  'aria-owns'?: string;
  'aria-activedescendant'?: string;
  'aria-level'?: number;
  'aria-setsize'?: number;
  'aria-posinset'?: number;
  'aria-multiselectable'?: boolean;
  'aria-orientation'?: 'horizontal' | 'vertical';
  'aria-live'?: AriaPoliteness;
  'aria-atomic'?: boolean;
  'aria-relevant'?: string;
  'aria-modal'?: boolean;
  'aria-required'?: boolean;
  'aria-invalid'?: boolean | 'grammar' | 'spelling';
  'aria-valuemin'?: number;
  'aria-valuemax'?: number;
  'aria-valuenow'?: number;
  'aria-valuetext'?: string;
  'aria-roledescription'?: string;
  'aria-keyshortcuts'?: string;
  tabIndex?: number;
  [key: string]: string | number | boolean | undefined;
}

// ─── Color Blindness Simulation Matrices ─────────────────────────────────────

/** 3x3 color transformation matrices for color blindness simulation (row-major) */
export const COLOR_BLINDNESS_MATRICES: Record<ColorBlindnessType, number[]> = {
  protanopia: [
    0.56667, 0.43333, 0.0,
    0.55833, 0.44167, 0.0,
    0.0,     0.24167, 0.75833,
  ],
  deuteranopia: [
    0.625,  0.375, 0.0,
    0.70,   0.30,  0.0,
    0.0,    0.30,  0.70,
  ],
  tritanopia: [
    0.95,   0.05,    0.0,
    0.0,    0.43333, 0.56667,
    0.0,    0.475,   0.525,
  ],
  achromatopsia: [
    0.299, 0.587, 0.114,
    0.299, 0.587, 0.114,
    0.299, 0.587, 0.114,
  ],
};

// ─── Screen Reader Announcements ─────────────────────────────────────────────

interface QueuedAnnouncement {
  message: string;
  politeness: AriaPoliteness;
  timestamp: number;
}

export class AriaLiveRegionManager {
  private politeRegion: HTMLElement | null = null;
  private assertiveRegion: HTMLElement | null = null;
  private queue: QueuedAnnouncement[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private config: Required<AriaLiveRegionConfig>;
  private disposed = false;

  constructor(config: AriaLiveRegionConfig) {
    this.config = {
      politeness: config.politeness,
      atomic: config.atomic,
      relevant: config.relevant ?? 'additions text',
      debounceMs: config.debounceMs ?? 100,
      maxQueueSize: config.maxQueueSize ?? 50,
    };
  }

  /** Initialize live regions in the DOM */
  initialize(): void {
    this.politeRegion = this.createRegion('polite');
    this.assertiveRegion = this.createRegion('assertive');
  }

  private createRegion(politeness: AriaPoliteness): HTMLElement {
    const region = document.createElement('div');
    region.setAttribute('role', 'log');
    region.setAttribute('aria-live', politeness);
    region.setAttribute('aria-atomic', String(this.config.atomic));
    region.setAttribute('aria-relevant', this.config.relevant);
    region.style.position = 'absolute';
    region.style.width = '1px';
    region.style.height = '1px';
    region.style.overflow = 'hidden';
    region.style.clip = 'rect(0 0 0 0)';
    region.style.clipPath = 'inset(50%)';
    region.style.whiteSpace = 'nowrap';
    region.setAttribute('data-orion-a11y', `live-region-${politeness}`);
    document.body.appendChild(region);
    return region;
  }

  /** Announce a message to screen readers */
  announce(message: string, politeness?: AriaPoliteness): void {
    if (this.disposed) return;

    const level = politeness ?? this.config.politeness;
    const announcement: QueuedAnnouncement = {
      message,
      politeness: level,
      timestamp: Date.now(),
    };

    this.queue.push(announcement);

    // Enforce max queue size by dropping oldest
    while (this.queue.length > this.config.maxQueueSize) {
      this.queue.shift();
    }

    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.flushQueue();
    }, this.config.debounceMs);
  }

  /** Immediately announce without debouncing (for critical alerts) */
  announceImmediate(message: string): void {
    if (this.disposed) return;
    const region = this.assertiveRegion;
    if (region) {
      region.textContent = '';
      // Force reflow so screen readers detect the change
      void region.offsetHeight;
      region.textContent = message;
    }
  }

  /** Flush all queued announcements */
  private flushQueue(): void {
    if (this.queue.length === 0) return;

    const politeMessages: string[] = [];
    const assertiveMessages: string[] = [];

    for (const item of this.queue) {
      if (item.politeness === 'assertive') {
        assertiveMessages.push(item.message);
      } else {
        politeMessages.push(item.message);
      }
    }
    this.queue = [];

    if (politeMessages.length > 0 && this.politeRegion) {
      this.politeRegion.textContent = '';
      void this.politeRegion.offsetHeight;
      this.politeRegion.textContent = politeMessages.join('. ');
    }

    if (assertiveMessages.length > 0 && this.assertiveRegion) {
      this.assertiveRegion.textContent = '';
      void this.assertiveRegion.offsetHeight;
      this.assertiveRegion.textContent = assertiveMessages.join('. ');
    }
  }

  /** Clear all pending announcements */
  clearQueue(): void {
    this.queue = [];
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /** Get current queue length */
  getQueueLength(): number {
    return this.queue.length;
  }

  /** Dispose of live regions and clean up */
  dispose(): void {
    this.disposed = true;
    this.clearQueue();
    this.politeRegion?.remove();
    this.assertiveRegion?.remove();
    this.politeRegion = null;
    this.assertiveRegion = null;
  }
}

// ─── Focus Management ────────────────────────────────────────────────────────

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(', ');

export class FocusTrapManager {
  private activeTraps: Map<string, FocusTrapInstance> = new Map();
  private focusRestorationStack: HTMLElement[] = [];

  /** Activate a focus trap for a container */
  activate(config: FocusTrapConfig): FocusTrapInstance {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    if (previouslyFocused && config.restoreFocus) {
      this.focusRestorationStack.push(previouslyFocused);
    }

    const instance = new FocusTrapInstance(config, () => {
      this.activeTraps.delete(config.containerId);
      if (config.restoreFocus) {
        const toRestore = this.focusRestorationStack.pop();
        if (toRestore && typeof toRestore.focus === 'function') {
          toRestore.focus();
        }
      }
      config.onDeactivate?.();
    });

    this.activeTraps.set(config.containerId, instance);
    instance.engage();
    return instance;
  }

  /** Deactivate a specific focus trap by container ID */
  deactivate(containerId: string): void {
    const instance = this.activeTraps.get(containerId);
    if (instance) {
      instance.release();
    }
  }

  /** Deactivate all active focus traps */
  deactivateAll(): void {
    for (const instance of this.activeTraps.values()) {
      instance.release();
    }
    this.activeTraps.clear();
    this.focusRestorationStack = [];
  }

  /** Check if any focus trap is currently active */
  hasActiveTrap(): boolean {
    return this.activeTraps.size > 0;
  }

  /** Get the stack depth of nested traps */
  getStackDepth(): number {
    return this.focusRestorationStack.length;
  }
}

class FocusTrapInstance {
  private config: FocusTrapConfig;
  private onRelease: () => void;
  private handleKeyDown: ((e: KeyboardEvent) => void) | null = null;
  private handleFocusIn: ((e: FocusEvent) => void) | null = null;
  private active = false;

  constructor(config: FocusTrapConfig, onRelease: () => void) {
    this.config = config;
    this.onRelease = onRelease;
  }

  engage(): void {
    const container = document.getElementById(this.config.containerId);
    if (!container) return;

    this.active = true;

    // Set initial focus
    if (this.config.initialFocusSelector) {
      const initial = container.querySelector<HTMLElement>(this.config.initialFocusSelector);
      initial?.focus();
    } else {
      const firstFocusable = this.getFocusableElements(container)[0];
      firstFocusable?.focus();
    }

    this.handleKeyDown = (e: KeyboardEvent) => {
      if (!this.active) return;

      if (e.key === 'Escape' && this.config.escapeDeactivates) {
        this.release();
        return;
      }

      if (e.key === 'Tab') {
        const focusables = this.getFocusableElements(container);
        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    this.handleFocusIn = (e: FocusEvent) => {
      if (!this.active) return;
      const target = e.target as HTMLElement;
      if (!container.contains(target)) {
        const focusables = this.getFocusableElements(container);
        if (focusables.length > 0) {
          focusables[0].focus();
        }
      }
    };

    document.addEventListener('keydown', this.handleKeyDown, true);
    document.addEventListener('focusin', this.handleFocusIn, true);
  }

  release(): void {
    if (!this.active) return;
    this.active = false;

    if (this.handleKeyDown) {
      document.removeEventListener('keydown', this.handleKeyDown, true);
    }
    if (this.handleFocusIn) {
      document.removeEventListener('focusin', this.handleFocusIn, true);
    }

    this.onRelease();
  }

  private getFocusableElements(container: HTMLElement): HTMLElement[] {
    const allSelectors = this.config.additionalFocusableSelectors
      ? `${FOCUSABLE_SELECTOR}, ${this.config.additionalFocusableSelectors.join(', ')}`
      : FOCUSABLE_SELECTOR;

    const elements = Array.from(container.querySelectorAll<HTMLElement>(allSelectors));
    return elements.filter((el) => {
      if (el.offsetParent === null && el.getAttribute('aria-hidden') === 'true') return false;
      return !el.closest('[aria-hidden="true"]') || el.hasAttribute('tabindex');
    });
  }

  isActive(): boolean {
    return this.active;
  }
}

// ─── Focus Ring Visibility ───────────────────────────────────────────────────

export class FocusRingManager {
  private usingKeyboard = false;
  private className: string;
  private handleKeyDown: ((e: KeyboardEvent) => void) | null = null;
  private handleMouseDown: (() => void) | null = null;

  constructor(className: string = 'orion-focus-visible') {
    this.className = className;
  }

  /** Start monitoring input method to toggle focus ring visibility */
  start(): void {
    this.handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab' || e.key === 'Escape' || e.key.startsWith('Arrow')) {
        if (!this.usingKeyboard) {
          this.usingKeyboard = true;
          document.documentElement.classList.add(this.className);
        }
      }
    };

    this.handleMouseDown = () => {
      if (this.usingKeyboard) {
        this.usingKeyboard = false;
        document.documentElement.classList.remove(this.className);
      }
    };

    document.addEventListener('keydown', this.handleKeyDown, true);
    document.addEventListener('mousedown', this.handleMouseDown, true);
  }

  /** Stop monitoring and clean up */
  stop(): void {
    if (this.handleKeyDown) {
      document.removeEventListener('keydown', this.handleKeyDown, true);
    }
    if (this.handleMouseDown) {
      document.removeEventListener('mousedown', this.handleMouseDown, true);
    }
    document.documentElement.classList.remove(this.className);
  }

  /** Check whether keyboard navigation is currently active */
  isKeyboardNavigating(): boolean {
    return this.usingKeyboard;
  }
}

// ─── Roving Tabindex Navigation ──────────────────────────────────────────────

export class RovingTabindexManager {
  private config: RovingTabindexConfig;
  private activeIndex = 0;
  private items: HTMLElement[] = [];
  private handleKeyDown: ((e: KeyboardEvent) => void) | null = null;
  private handleFocus: ((e: FocusEvent) => void) | null = null;

  constructor(config: RovingTabindexConfig) {
    this.config = config;
  }

  /** Initialize the roving tabindex on the container's children */
  initialize(): void {
    const container = document.getElementById(this.config.containerId);
    if (!container) return;

    this.items = Array.from(container.querySelectorAll<HTMLElement>(this.config.itemSelector));
    this.updateTabindices();

    this.handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const index = this.items.indexOf(target);
      if (index === -1) return;

      let nextIndex: number | null = null;

      const isHorizontal = this.config.axis === 'horizontal' || this.config.axis === 'both';
      const isVertical = this.config.axis === 'vertical' || this.config.axis === 'both';

      if ((e.key === 'ArrowRight' && isHorizontal) || (e.key === 'ArrowDown' && isVertical)) {
        e.preventDefault();
        nextIndex = this.getNextIndex(index, 1);
      } else if ((e.key === 'ArrowLeft' && isHorizontal) || (e.key === 'ArrowUp' && isVertical)) {
        e.preventDefault();
        nextIndex = this.getNextIndex(index, -1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        nextIndex = 0;
      } else if (e.key === 'End') {
        e.preventDefault();
        nextIndex = this.items.length - 1;
      }

      if (nextIndex !== null && nextIndex >= 0 && nextIndex < this.items.length) {
        this.setActiveItem(nextIndex);
      }
    };

    this.handleFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      const index = this.items.indexOf(target);
      if (index !== -1 && index !== this.activeIndex) {
        this.activeIndex = index;
        this.updateTabindices();
      }
    };

    container.addEventListener('keydown', this.handleKeyDown);
    container.addEventListener('focusin', this.handleFocus);
  }

  private getNextIndex(current: number, direction: 1 | -1): number {
    const total = this.items.length;
    if (total === 0) return current;

    let next = current + direction;

    if (this.config.wrap) {
      next = ((next % total) + total) % total;
    } else {
      next = Math.max(0, Math.min(total - 1, next));
    }

    // Skip disabled items
    let attempts = 0;
    while (attempts < total) {
      const item = this.items[next];
      if (!item.hasAttribute('disabled') && item.getAttribute('aria-disabled') !== 'true') {
        return next;
      }
      next = next + direction;
      if (this.config.wrap) {
        next = ((next % total) + total) % total;
      } else {
        next = Math.max(0, Math.min(total - 1, next));
      }
      attempts++;
    }

    return current;
  }

  /** Programmatically set the active item */
  setActiveItem(index: number): void {
    if (index < 0 || index >= this.items.length) return;
    this.activeIndex = index;
    this.updateTabindices();
    this.items[index].focus();
    this.config.onActiveChange?.(this.items[index], index);
  }

  private updateTabindices(): void {
    for (let i = 0; i < this.items.length; i++) {
      this.items[i].setAttribute('tabindex', i === this.activeIndex ? '0' : '-1');
    }
  }

  /** Refresh the items list (call after DOM changes) */
  refresh(): void {
    const container = document.getElementById(this.config.containerId);
    if (!container) return;
    this.items = Array.from(container.querySelectorAll<HTMLElement>(this.config.itemSelector));
    if (this.activeIndex >= this.items.length) {
      this.activeIndex = Math.max(0, this.items.length - 1);
    }
    this.updateTabindices();
  }

  /** Get the currently active index */
  getActiveIndex(): number {
    return this.activeIndex;
  }

  /** Dispose event listeners */
  dispose(): void {
    const container = document.getElementById(this.config.containerId);
    if (container) {
      if (this.handleKeyDown) container.removeEventListener('keydown', this.handleKeyDown);
      if (this.handleFocus) container.removeEventListener('focusin', this.handleFocus);
    }
    this.items = [];
  }
}

// ─── High Contrast Mode ─────────────────────────────────────────────────────

export class HighContrastManager {
  private config: HighContrastConfig;
  private currentTheme: HighContrastTheme = 'none';
  private mediaQuery: MediaQueryList | null = null;
  private mediaListener: ((e: MediaQueryListEvent) => void) | null = null;
  private styleElement: HTMLStyleElement | null = null;

  constructor(config: HighContrastConfig) {
    this.config = config;
  }

  /** Start detecting and applying high contrast mode */
  initialize(): void {
    if (this.config.detectSystemPreference && typeof window !== 'undefined' && window.matchMedia) {
      this.mediaQuery = window.matchMedia('(forced-colors: active)');

      this.mediaListener = (e: MediaQueryListEvent) => {
        this.handleContrastChange(e.matches);
      };

      this.mediaQuery.addEventListener('change', this.mediaListener);
      this.handleContrastChange(this.mediaQuery.matches);
    }
  }

  private handleContrastChange(isHighContrast: boolean): void {
    if (isHighContrast) {
      // Detect light vs dark by checking the background color
      const bg = getComputedStyle(document.documentElement).backgroundColor;
      const isLight = this.isLightColor(bg);
      this.currentTheme = isLight ? 'high-contrast-light' : 'high-contrast-dark';
    } else {
      this.currentTheme = 'none';
    }

    this.applyOverrides();
    this.config.onChange?.(this.currentTheme);
  }

  private isLightColor(color: string): boolean {
    const match = color.match(/\d+/g);
    if (!match || match.length < 3) return false;
    const [r, g, b] = match.map(Number);
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    return luminance > 128;
  }

  private applyOverrides(): void {
    if (this.styleElement) {
      this.styleElement.remove();
      this.styleElement = null;
    }

    if (this.currentTheme === 'none') {
      document.documentElement.removeAttribute('data-orion-high-contrast');
      return;
    }

    document.documentElement.setAttribute('data-orion-high-contrast', this.currentTheme);

    const overrides =
      this.currentTheme === 'high-contrast-light'
        ? this.config.lightOverrides
        : this.config.darkOverrides;

    if (Object.keys(overrides).length > 0) {
      this.styleElement = document.createElement('style');
      this.styleElement.setAttribute('data-orion-a11y', 'high-contrast-overrides');
      const declarations = Object.entries(overrides)
        .map(([prop, value]) => `  ${prop}: ${value};`)
        .join('\n');
      this.styleElement.textContent = `:root[data-orion-high-contrast] {\n${declarations}\n}`;
      document.head.appendChild(this.styleElement);
    }
  }

  /** Manually set the high contrast theme */
  setTheme(theme: HighContrastTheme): void {
    this.currentTheme = theme;
    this.applyOverrides();
    this.config.onChange?.(this.currentTheme);
  }

  /** Get the current high contrast theme */
  getTheme(): HighContrastTheme {
    return this.currentTheme;
  }

  /** Dispose listeners and clean up */
  dispose(): void {
    if (this.mediaQuery && this.mediaListener) {
      this.mediaQuery.removeEventListener('change', this.mediaListener);
    }
    this.styleElement?.remove();
    document.documentElement.removeAttribute('data-orion-high-contrast');
  }
}

// ─── Reduced Motion ──────────────────────────────────────────────────────────

export class ReducedMotionManager {
  private config: ReducedMotionConfig;
  private prefersReducedMotion = false;
  private mediaQuery: MediaQueryList | null = null;
  private mediaListener: ((e: MediaQueryListEvent) => void) | null = null;
  private styleElement: HTMLStyleElement | null = null;

  constructor(config: ReducedMotionConfig) {
    this.config = config;
  }

  /** Start detecting and responding to reduced motion preference */
  initialize(): void {
    if (this.config.detectSystemPreference && typeof window !== 'undefined' && window.matchMedia) {
      this.mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

      this.mediaListener = (e: MediaQueryListEvent) => {
        this.handleChange(e.matches);
      };

      this.mediaQuery.addEventListener('change', this.mediaListener);
      this.handleChange(this.mediaQuery.matches);
    }
  }

  private handleChange(prefers: boolean): void {
    this.prefersReducedMotion = prefers;

    if (prefers) {
      document.documentElement.classList.add(this.config.rootClassName);
      this.injectMotionStyles();
    } else {
      document.documentElement.classList.remove(this.config.rootClassName);
      this.removeMotionStyles();
    }

    this.config.onChange?.(prefers);
  }

  private injectMotionStyles(): void {
    if (this.styleElement) return;

    this.styleElement = document.createElement('style');
    this.styleElement.setAttribute('data-orion-a11y', 'reduced-motion');
    this.styleElement.textContent = `
      .${this.config.rootClassName} *,
      .${this.config.rootClassName} *::before,
      .${this.config.rootClassName} *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }
    `;
    document.head.appendChild(this.styleElement);
  }

  private removeMotionStyles(): void {
    if (this.styleElement) {
      this.styleElement.remove();
      this.styleElement = null;
    }
  }

  /** Manually set reduced motion preference */
  setReducedMotion(enabled: boolean): void {
    this.handleChange(enabled);
  }

  /** Check whether reduced motion is currently preferred */
  isReducedMotion(): boolean {
    return this.prefersReducedMotion;
  }

  /** Get a safe duration: returns 0 if reduced motion, otherwise the given value */
  getSafeDuration(durationMs: number): number {
    return this.prefersReducedMotion ? 0 : durationMs;
  }

  /** Dispose and clean up */
  dispose(): void {
    if (this.mediaQuery && this.mediaListener) {
      this.mediaQuery.removeEventListener('change', this.mediaListener);
    }
    this.removeMotionStyles();
    document.documentElement.classList.remove(this.config.rootClassName);
  }
}

// ─── ARIA Helpers ────────────────────────────────────────────────────────────

/** Generate ARIA attributes for a tree view container */
export function ariaForTreeView(label: string, multiselectable: boolean = false): AriaAttributeSet {
  return {
    role: 'tree',
    'aria-label': label,
    'aria-multiselectable': multiselectable,
  };
}

/** Generate ARIA attributes for a tree item */
export function ariaForTreeItem(
  label: string,
  level: number,
  positionInSet: number,
  setSize: number,
  expanded?: boolean,
  selected?: boolean
): AriaAttributeSet {
  const attrs: AriaAttributeSet = {
    role: 'treeitem',
    'aria-label': label,
    'aria-level': level,
    'aria-posinset': positionInSet,
    'aria-setsize': setSize,
    tabIndex: -1,
  };
  if (expanded !== undefined) {
    attrs['aria-expanded'] = expanded;
  }
  if (selected !== undefined) {
    attrs['aria-selected'] = selected;
  }
  return attrs;
}

/** Generate ARIA attributes for a tab list */
export function ariaForTabList(
  label: string,
  orientation: 'horizontal' | 'vertical' = 'horizontal'
): AriaAttributeSet {
  return {
    role: 'tablist',
    'aria-label': label,
    'aria-orientation': orientation,
  };
}

/** Generate ARIA attributes for an individual tab */
export function ariaForTab(
  label: string,
  panelId: string,
  selected: boolean,
  positionInSet?: number,
  setSize?: number
): AriaAttributeSet {
  const attrs: AriaAttributeSet = {
    role: 'tab',
    'aria-label': label,
    'aria-selected': selected,
    'aria-controls': panelId,
    tabIndex: selected ? 0 : -1,
  };
  if (positionInSet !== undefined) attrs['aria-posinset'] = positionInSet;
  if (setSize !== undefined) attrs['aria-setsize'] = setSize;
  return attrs;
}

/** Generate ARIA attributes for a tab panel */
export function ariaForTabPanel(label: string, tabId: string, hidden: boolean = false): AriaAttributeSet {
  return {
    role: 'tabpanel',
    'aria-label': label,
    'aria-labelledby': tabId,
    'aria-hidden': hidden,
    tabIndex: 0,
  };
}

/** Generate ARIA attributes for a toolbar */
export function ariaForToolbar(
  label: string,
  orientation: 'horizontal' | 'vertical' = 'horizontal'
): AriaAttributeSet {
  return {
    role: 'toolbar',
    'aria-label': label,
    'aria-orientation': orientation,
  };
}

/** Generate ARIA attributes for a menu */
export function ariaForMenu(label: string, orientation: 'horizontal' | 'vertical' = 'vertical'): AriaAttributeSet {
  return {
    role: 'menu',
    'aria-label': label,
    'aria-orientation': orientation,
  };
}

/** Generate ARIA attributes for a menu item */
export function ariaForMenuItem(
  label: string,
  hasSubmenu: boolean = false,
  disabled: boolean = false,
  keyShortcut?: string
): AriaAttributeSet {
  const attrs: AriaAttributeSet = {
    role: 'menuitem',
    'aria-label': label,
    'aria-disabled': disabled,
    tabIndex: -1,
  };
  if (hasSubmenu) {
    attrs['aria-haspopup'] = true;
    attrs['aria-expanded'] = false;
  }
  if (keyShortcut) {
    attrs['aria-keyshortcuts'] = keyShortcut;
  }
  return attrs;
}

/** Generate ARIA attributes for a dialog */
export function ariaForDialog(
  label: string,
  descriptionId?: string,
  modal: boolean = true
): AriaAttributeSet {
  const attrs: AriaAttributeSet = {
    role: 'dialog',
    'aria-label': label,
    'aria-modal': modal,
  };
  if (descriptionId) {
    attrs['aria-describedby'] = descriptionId;
  }
  return attrs;
}

/** Generate ARIA attributes for an alert dialog */
export function ariaForAlertDialog(label: string, descriptionId: string): AriaAttributeSet {
  return {
    role: 'alertdialog',
    'aria-label': label,
    'aria-describedby': descriptionId,
    'aria-modal': true,
  };
}

/** Generate ARIA attributes for an alert region */
export function ariaForAlert(label?: string): AriaAttributeSet {
  const attrs: AriaAttributeSet = {
    role: 'alert',
    'aria-live': 'assertive',
    'aria-atomic': true,
  };
  if (label) attrs['aria-label'] = label;
  return attrs;
}

/** Generate ARIA attributes for a status bar region */
export function ariaForStatus(label: string): AriaAttributeSet {
  return {
    role: 'status',
    'aria-label': label,
    'aria-live': 'polite',
    'aria-atomic': true,
  };
}

/** Generate ARIA attributes for a listbox */
export function ariaForListbox(
  label: string,
  multiselectable: boolean = false,
  activedescendantId?: string
): AriaAttributeSet {
  const attrs: AriaAttributeSet = {
    role: 'listbox',
    'aria-label': label,
    'aria-multiselectable': multiselectable,
    tabIndex: 0,
  };
  if (activedescendantId) {
    attrs['aria-activedescendant'] = activedescendantId;
  }
  return attrs;
}

/** Generate ARIA attributes for a listbox option */
export function ariaForOption(
  label: string,
  selected: boolean,
  positionInSet: number,
  setSize: number,
  disabled: boolean = false
): AriaAttributeSet {
  return {
    role: 'option',
    'aria-label': label,
    'aria-selected': selected,
    'aria-posinset': positionInSet,
    'aria-setsize': setSize,
    'aria-disabled': disabled,
  };
}

/** Apply an AriaAttributeSet to an HTMLElement */
export function applyAriaAttributes(element: HTMLElement, attrs: AriaAttributeSet): void {
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined) continue;
    if (key === 'tabIndex') {
      element.tabIndex = value as number;
    } else {
      element.setAttribute(key, String(value));
    }
  }
}

// ─── Color Blindness Simulation ──────────────────────────────────────────────

/** Apply a color transformation for a given color blindness type to an RGB color */
export function simulateColorBlindness(
  r: number,
  g: number,
  b: number,
  type: ColorBlindnessType
): { r: number; g: number; b: number } {
  const m = COLOR_BLINDNESS_MATRICES[type];
  return {
    r: Math.round(Math.min(255, Math.max(0, m[0] * r + m[1] * g + m[2] * b))),
    g: Math.round(Math.min(255, Math.max(0, m[3] * r + m[4] * g + m[5] * b))),
    b: Math.round(Math.min(255, Math.max(0, m[6] * r + m[7] * g + m[8] * b))),
  };
}

/** Get a CSS filter string that approximates a color blindness simulation */
export function getColorBlindnessFilter(type: ColorBlindnessType): string {
  const m = COLOR_BLINDNESS_MATRICES[type];
  // SVG filter matrix format (5x4 - last column is translation, set to 0)
  const svgMatrix = [
    m[0], m[1], m[2], 0, 0,
    m[3], m[4], m[5], 0, 0,
    m[6], m[7], m[8], 0, 0,
    0,    0,    0,    1, 0,
  ].join(' ');

  return `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'><filter id='cb'><feColorMatrix type='matrix' values='${svgMatrix}'/></filter></svg>#cb")`;
}

/**
 * Create an inline SVG filter element for color blindness simulation
 * and return its filter ID for use in CSS filter property
 */
export function createColorBlindnessSVGFilter(type: ColorBlindnessType, filterId: string): string {
  const m = COLOR_BLINDNESS_MATRICES[type];
  const values = [
    m[0], m[1], m[2], 0, 0,
    m[3], m[4], m[5], 0, 0,
    m[6], m[7], m[8], 0, 0,
    0,    0,    0,    1, 0,
  ].join(' ');

  const existing = document.getElementById(`orion-cb-filter-${filterId}`);
  if (existing) existing.remove();

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('id', `orion-cb-filter-${filterId}`);
  svg.setAttribute('style', 'position:absolute;width:0;height:0;');
  svg.innerHTML = `<filter id="${filterId}"><feColorMatrix type="matrix" values="${values}"/></filter>`;
  document.body.appendChild(svg);

  return `url(#${filterId})`;
}

// ─── Font Scaling ────────────────────────────────────────────────────────────

export class FontScalingManager {
  private config: FontScalingConfig;
  private currentSizePx: number;

  constructor(config: FontScalingConfig) {
    this.config = config;
    this.currentSizePx = config.baseSizePx;
  }

  /** Apply the current font size to the document */
  apply(): void {
    document.documentElement.style.setProperty(this.config.cssVariable, `${this.currentSizePx}px`);
  }

  /** Increase font size by one step */
  increase(): number {
    const next = Math.min(this.config.maxSizePx, this.currentSizePx + this.config.stepPx);
    if (next !== this.currentSizePx) {
      this.currentSizePx = next;
      this.apply();
      this.config.onChange?.(this.currentSizePx);
    }
    return this.currentSizePx;
  }

  /** Decrease font size by one step */
  decrease(): number {
    const next = Math.max(this.config.minSizePx, this.currentSizePx - this.config.stepPx);
    if (next !== this.currentSizePx) {
      this.currentSizePx = next;
      this.apply();
      this.config.onChange?.(this.currentSizePx);
    }
    return this.currentSizePx;
  }

  /** Reset to the base font size */
  reset(): number {
    this.currentSizePx = this.config.baseSizePx;
    this.apply();
    this.config.onChange?.(this.currentSizePx);
    return this.currentSizePx;
  }

  /** Set an exact font size (will be clamped to min/max bounds) */
  setSize(sizePx: number): number {
    this.currentSizePx = Math.max(this.config.minSizePx, Math.min(this.config.maxSizePx, sizePx));
    this.apply();
    this.config.onChange?.(this.currentSizePx);
    return this.currentSizePx;
  }

  /** Get the current font size in pixels */
  getSize(): number {
    return this.currentSizePx;
  }

  /** Get the current scale factor relative to base */
  getScaleFactor(): number {
    return this.currentSizePx / this.config.baseSizePx;
  }
}

// ─── Tab Order Management ────────────────────────────────────────────────────

export class TabOrderManager {
  private config: TabOrderConfig;
  private observer: MutationObserver | null = null;

  constructor(config: TabOrderConfig) {
    this.config = config;
  }

  /** Apply tabindex values according to the configuration */
  apply(): void {
    for (const entry of this.config.entries) {
      const elements = document.querySelectorAll<HTMLElement>(entry.selector);
      elements.forEach((el) => {
        el.tabIndex = entry.tabindex;
        if (entry.group) {
          el.setAttribute('data-orion-tab-group', entry.group);
        }
      });
    }
  }

  /** Start observing DOM mutations to reapply tab order */
  startObserving(): void {
    if (!this.config.observeMutations) return;
    if (this.observer) return;

    this.observer = new MutationObserver(() => {
      this.apply();
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  /** Stop observing DOM mutations */
  stopObserving(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  /** Add a new entry dynamically */
  addEntry(entry: TabOrderEntry): void {
    this.config.entries.push(entry);
    this.apply();
  }

  /** Remove entries for a given group */
  removeGroup(group: string): void {
    this.config.entries = this.config.entries.filter((e) => e.group !== group);
    const elements = document.querySelectorAll<HTMLElement>(`[data-orion-tab-group="${group}"]`);
    elements.forEach((el) => {
      el.removeAttribute('data-orion-tab-group');
      el.removeAttribute('tabindex');
    });
  }

  /** Get the ordered list of entries */
  getEntries(): TabOrderEntry[] {
    return [...this.config.entries];
  }

  /** Dispose and clean up */
  dispose(): void {
    this.stopObserving();
  }
}

// ─── Accessible Name Computation ─────────────────────────────────────────────

/** Compute the accessible name for an element following a simplified algorithm */
export function computeAccessibleName(element: HTMLElement): AccessibleNameResult {
  // 1. aria-labelledby
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const ids = labelledBy.split(/\s+/);
    const texts: string[] = [];
    for (const id of ids) {
      const refElement = document.getElementById(id);
      if (refElement) {
        texts.push(getTextContent(refElement));
      }
    }
    const name = texts.join(' ').trim();
    if (name) return { name, source: 'aria-labelledby' };
  }

  // 2. aria-label
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel && ariaLabel.trim()) {
    return { name: ariaLabel.trim(), source: 'aria-label' };
  }

  // 3. Associated <label> element (for form controls)
  const id = element.id;
  if (id) {
    const label = document.querySelector<HTMLLabelElement>(`label[for="${id}"]`);
    if (label) {
      const name = getTextContent(label).trim();
      if (name) return { name, source: 'label' };
    }
  }

  // 3b. Wrapping <label>
  const parentLabel = element.closest('label');
  if (parentLabel) {
    const name = getTextContent(parentLabel as HTMLElement).trim();
    if (name) return { name, source: 'label' };
  }

  // 4. title attribute
  const title = element.getAttribute('title');
  if (title && title.trim()) {
    return { name: title.trim(), source: 'title' };
  }

  // 5. placeholder (for inputs)
  const placeholder = element.getAttribute('placeholder');
  if (placeholder && placeholder.trim()) {
    return { name: placeholder.trim(), source: 'placeholder' };
  }

  // 6. Text content (for non-input elements)
  const tagName = element.tagName.toLowerCase();
  if (tagName !== 'input' && tagName !== 'select' && tagName !== 'textarea') {
    const text = getTextContent(element).trim();
    if (text) return { name: text, source: 'content' };
  }

  return { name: '', source: 'none' };
}

/** Recursively get the text content of an element, excluding hidden children */
function getTextContent(element: HTMLElement): string {
  if (element.getAttribute('aria-hidden') === 'true') return '';

  const parts: string[] = [];
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      parts.push(child.textContent ?? '');
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as HTMLElement;
      if (el.getAttribute('aria-hidden') !== 'true' && getComputedStyle(el).display !== 'none') {
        parts.push(getTextContent(el));
      }
    }
  }
  return parts.join(' ').replace(/\s+/g, ' ');
}

// ─── Skip Links ──────────────────────────────────────────────────────────────

export class SkipLinksManager {
  private config: SkipLinksConfig;
  private container: HTMLElement | null = null;

  constructor(config: SkipLinksConfig) {
    this.config = config;
  }

  /** Create and insert skip links into the DOM at the start of the body */
  initialize(): void {
    this.container = document.createElement('nav');
    this.container.setAttribute('aria-label', 'Skip links');
    this.container.className = this.config.containerClassName;
    this.container.setAttribute('data-orion-a11y', 'skip-links');

    // Visually hidden until focused
    this.container.style.position = 'fixed';
    this.container.style.top = '0';
    this.container.style.left = '0';
    this.container.style.zIndex = '100000';
    this.container.style.display = 'flex';
    this.container.style.gap = '4px';
    this.container.style.padding = '4px';

    for (const link of this.config.links) {
      const btn = document.createElement('a');
      btn.href = `#${link.targetId}`;
      btn.id = link.id;
      btn.className = this.config.linkClassName;
      btn.textContent = link.label;

      if (link.shortcutHint) {
        btn.setAttribute('title', link.shortcutHint);
      }

      // sr-only until focused, then reveal
      btn.style.position = 'absolute';
      btn.style.left = '-10000px';
      btn.style.top = 'auto';
      btn.style.width = '1px';
      btn.style.height = '1px';
      btn.style.overflow = 'hidden';

      btn.addEventListener('focus', () => {
        btn.style.position = 'static';
        btn.style.width = 'auto';
        btn.style.height = 'auto';
        btn.style.overflow = 'visible';
      });

      btn.addEventListener('blur', () => {
        btn.style.position = 'absolute';
        btn.style.left = '-10000px';
        btn.style.width = '1px';
        btn.style.height = '1px';
        btn.style.overflow = 'hidden';
      });

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.getElementById(link.targetId);
        if (target) {
          if (!target.hasAttribute('tabindex')) {
            target.setAttribute('tabindex', '-1');
          }
          target.focus();
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });

      this.container.appendChild(btn);
    }

    // Insert as first child of body
    if (document.body.firstChild) {
      document.body.insertBefore(this.container, document.body.firstChild);
    } else {
      document.body.appendChild(this.container);
    }
  }

  /** Remove skip links from the DOM */
  dispose(): void {
    this.container?.remove();
    this.container = null;
  }
}

/** Create the default Orion IDE skip links */
export function createDefaultSkipLinks(): SkipLinksManager {
  return new SkipLinksManager({
    links: [
      {
        id: 'skip-to-editor',
        label: 'Skip to editor',
        targetId: 'orion-editor-main',
        shortcutHint: 'Ctrl+1',
      },
      {
        id: 'skip-to-sidebar',
        label: 'Skip to sidebar',
        targetId: 'orion-sidebar',
        shortcutHint: 'Ctrl+Shift+E',
      },
      {
        id: 'skip-to-terminal',
        label: 'Skip to terminal',
        targetId: 'orion-terminal-panel',
        shortcutHint: 'Ctrl+`',
      },
      {
        id: 'skip-to-status',
        label: 'Skip to status bar',
        targetId: 'orion-status-bar',
      },
    ],
    containerClassName: 'orion-skip-links',
    linkClassName: 'orion-skip-link',
  });
}

// ─── Zoom Level Management ───────────────────────────────────────────────────

export class ZoomManager {
  private config: ZoomConfig;
  private currentPercent: number;
  private styleElement: HTMLStyleElement | null = null;

  constructor(config: ZoomConfig) {
    this.config = config;
    this.currentPercent = this.clamp(config.initialPercent);
  }

  private clamp(value: number): number {
    return Math.max(this.config.minPercent, Math.min(this.config.maxPercent, value));
  }

  /** Apply the current zoom level to the document */
  apply(): void {
    const scale = this.currentPercent / 100;
    document.documentElement.style.setProperty(this.config.cssVariable, String(scale));
    document.documentElement.style.setProperty('--orion-zoom-percent', `${this.currentPercent}%`);

    // Apply transform-based zoom for the main workbench
    if (!this.styleElement) {
      this.styleElement = document.createElement('style');
      this.styleElement.setAttribute('data-orion-a11y', 'zoom');
      document.head.appendChild(this.styleElement);
    }

    this.styleElement.textContent = `
      :root {
        ${this.config.cssVariable}: ${scale};
        --orion-zoom-percent: ${this.currentPercent}%;
        font-size: ${scale * 100}%;
      }
    `;
  }

  /** Zoom in by one step */
  zoomIn(): number {
    const next = this.clamp(this.currentPercent + this.config.stepPercent);
    if (next !== this.currentPercent) {
      this.currentPercent = next;
      this.apply();
      this.config.onChange?.(this.currentPercent);
    }
    return this.currentPercent;
  }

  /** Zoom out by one step */
  zoomOut(): number {
    const next = this.clamp(this.currentPercent - this.config.stepPercent);
    if (next !== this.currentPercent) {
      this.currentPercent = next;
      this.apply();
      this.config.onChange?.(this.currentPercent);
    }
    return this.currentPercent;
  }

  /** Reset to initial zoom level */
  reset(): number {
    this.currentPercent = this.config.initialPercent;
    this.apply();
    this.config.onChange?.(this.currentPercent);
    return this.currentPercent;
  }

  /** Set an exact zoom level (clamped to min/max) */
  setZoom(percent: number): number {
    const clamped = this.clamp(percent);
    if (clamped !== this.currentPercent) {
      this.currentPercent = clamped;
      this.apply();
      this.config.onChange?.(this.currentPercent);
    }
    return this.currentPercent;
  }

  /** Get the current zoom percentage */
  getZoom(): number {
    return this.currentPercent;
  }

  /** Get the current zoom as a scale factor (1.0 = 100%) */
  getScale(): number {
    return this.currentPercent / 100;
  }

  /** Check if currently at default zoom */
  isDefaultZoom(): boolean {
    return this.currentPercent === this.config.initialPercent;
  }

  /** Dispose and clean up */
  dispose(): void {
    this.styleElement?.remove();
    this.styleElement = null;
    document.documentElement.style.removeProperty(this.config.cssVariable);
    document.documentElement.style.removeProperty('--orion-zoom-percent');
  }
}

// ─── Accessibility Orchestrator ──────────────────────────────────────────────

export interface AccessibilitySystemConfig {
  ariaLive?: AriaLiveRegionConfig;
  highContrast?: HighContrastConfig;
  reducedMotion?: ReducedMotionConfig;
  fontScaling?: FontScalingConfig;
  zoom?: ZoomConfig;
  focusRingClassName?: string;
  skipLinks?: boolean;
  tabOrder?: TabOrderConfig;
}

/**
 * Central orchestrator that initializes and manages all accessibility subsystems.
 * Provides a single entry point for Orion IDE's accessibility layer.
 */
export class AccessibilitySystem {
  private liveRegion: AriaLiveRegionManager | null = null;
  private focusTrap: FocusTrapManager;
  private focusRing: FocusRingManager;
  private highContrast: HighContrastManager | null = null;
  private reducedMotion: ReducedMotionManager | null = null;
  private fontScaling: FontScalingManager | null = null;
  private zoomManager: ZoomManager | null = null;
  private skipLinks: SkipLinksManager | null = null;
  private tabOrder: TabOrderManager | null = null;
  private rovingManagers: Map<string, RovingTabindexManager> = new Map();

  constructor(config: AccessibilitySystemConfig) {
    // Aria live region
    if (config.ariaLive) {
      this.liveRegion = new AriaLiveRegionManager(config.ariaLive);
    }

    // Focus management
    this.focusTrap = new FocusTrapManager();
    this.focusRing = new FocusRingManager(config.focusRingClassName);

    // High contrast
    if (config.highContrast) {
      this.highContrast = new HighContrastManager(config.highContrast);
    }

    // Reduced motion
    if (config.reducedMotion) {
      this.reducedMotion = new ReducedMotionManager(config.reducedMotion);
    }

    // Font scaling
    if (config.fontScaling) {
      this.fontScaling = new FontScalingManager(config.fontScaling);
    }

    // Zoom
    if (config.zoom) {
      this.zoomManager = new ZoomManager(config.zoom);
    }

    // Skip links
    if (config.skipLinks) {
      this.skipLinks = createDefaultSkipLinks();
    }

    // Tab order
    if (config.tabOrder) {
      this.tabOrder = new TabOrderManager(config.tabOrder);
    }
  }

  /** Initialize all configured accessibility subsystems */
  initialize(): void {
    this.liveRegion?.initialize();
    this.focusRing.start();
    this.highContrast?.initialize();
    this.reducedMotion?.initialize();
    this.fontScaling?.apply();
    this.zoomManager?.apply();
    this.skipLinks?.initialize();
    this.tabOrder?.apply();
    this.tabOrder?.startObserving();
  }

  /** Get the live region manager for screen reader announcements */
  getLiveRegion(): AriaLiveRegionManager | null {
    return this.liveRegion;
  }

  /** Get the focus trap manager */
  getFocusTrap(): FocusTrapManager {
    return this.focusTrap;
  }

  /** Get the focus ring manager */
  getFocusRing(): FocusRingManager {
    return this.focusRing;
  }

  /** Get the high contrast manager */
  getHighContrast(): HighContrastManager | null {
    return this.highContrast;
  }

  /** Get the reduced motion manager */
  getReducedMotion(): ReducedMotionManager | null {
    return this.reducedMotion;
  }

  /** Get the font scaling manager */
  getFontScaling(): FontScalingManager | null {
    return this.fontScaling;
  }

  /** Get the zoom manager */
  getZoom(): ZoomManager | null {
    return this.zoomManager;
  }

  /** Get the tab order manager */
  getTabOrder(): TabOrderManager | null {
    return this.tabOrder;
  }

  /** Register a roving tabindex manager for a specific container */
  registerRoving(config: RovingTabindexConfig): RovingTabindexManager {
    const manager = new RovingTabindexManager(config);
    manager.initialize();
    this.rovingManagers.set(config.containerId, manager);
    return manager;
  }

  /** Unregister and dispose a roving tabindex manager */
  unregisterRoving(containerId: string): void {
    const manager = this.rovingManagers.get(containerId);
    if (manager) {
      manager.dispose();
      this.rovingManagers.delete(containerId);
    }
  }

  /** Convenience: announce a message to screen readers */
  announce(message: string, politeness?: AriaPoliteness): void {
    this.liveRegion?.announce(message, politeness);
  }

  /** Convenience: announce an immediate critical message */
  announceImmediate(message: string): void {
    this.liveRegion?.announceImmediate(message);
  }

  /** Dispose all accessibility subsystems */
  dispose(): void {
    this.liveRegion?.dispose();
    this.focusTrap.deactivateAll();
    this.focusRing.stop();
    this.highContrast?.dispose();
    this.reducedMotion?.dispose();
    this.zoomManager?.dispose();
    this.skipLinks?.dispose();
    this.tabOrder?.dispose();
    for (const manager of this.rovingManagers.values()) {
      manager.dispose();
    }
    this.rovingManagers.clear();
  }
}

// ─── Utility Functions ───────────────────────────────────────────────────────

/** Generate a unique ID suitable for ARIA references */
export function generateAriaId(prefix: string): string {
  const random = Math.random().toString(36).substring(2, 9);
  return `${prefix}-${random}`;
}

/** Check if an element is currently visible (not hidden by aria-hidden or display:none) */
export function isAriaVisible(element: HTMLElement): boolean {
  if (element.getAttribute('aria-hidden') === 'true') return false;
  const style = getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  // Walk up the DOM tree
  const parent = element.parentElement;
  if (parent && parent !== document.documentElement) {
    return isAriaVisible(parent);
  }
  return true;
}

/** Set the document's lang attribute for screen readers */
export function setDocumentLanguage(lang: string): void {
  document.documentElement.setAttribute('lang', lang);
}

/** Create a visually hidden element that is still accessible to screen readers */
export function createVisuallyHiddenElement(
  tagName: string,
  textContent: string,
  attributes?: Record<string, string>
): HTMLElement {
  const el = document.createElement(tagName);
  el.textContent = textContent;
  el.style.position = 'absolute';
  el.style.width = '1px';
  el.style.height = '1px';
  el.style.padding = '0';
  el.style.margin = '-1px';
  el.style.overflow = 'hidden';
  el.style.clip = 'rect(0, 0, 0, 0)';
  el.style.whiteSpace = 'nowrap';
  el.style.border = '0';
  if (attributes) {
    for (const [key, value] of Object.entries(attributes)) {
      el.setAttribute(key, value);
    }
  }
  return el;
}

/**
 * Compute the contrast ratio between two colors in #RRGGBB format.
 * Useful for checking WCAG compliance (4.5:1 for normal text, 3:1 for large text).
 */
export function computeContrastRatio(hex1: string, hex2: string): number {
  const l1 = getRelativeLuminance(hex1);
  const l2 = getRelativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function getRelativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** Check if a contrast ratio meets WCAG AA requirements */
export function meetsWCAG_AA(contrastRatio: number, isLargeText: boolean = false): boolean {
  return isLargeText ? contrastRatio >= 3.0 : contrastRatio >= 4.5;
}

/** Check if a contrast ratio meets WCAG AAA requirements */
export function meetsWCAG_AAA(contrastRatio: number, isLargeText: boolean = false): boolean {
  return isLargeText ? contrastRatio >= 4.5 : contrastRatio >= 7.0;
}

/** Announce a keyboard shortcut to screen readers in a human-readable format */
export function formatKeyboardShortcut(keys: string[]): string {
  const keyNames: Record<string, string> = {
    'ctrl': 'Control',
    'cmd': 'Command',
    'alt': 'Alt',
    'option': 'Option',
    'shift': 'Shift',
    'enter': 'Enter',
    'return': 'Return',
    'esc': 'Escape',
    'escape': 'Escape',
    'tab': 'Tab',
    'space': 'Space',
    'backspace': 'Backspace',
    'delete': 'Delete',
    'up': 'Up Arrow',
    'down': 'Down Arrow',
    'left': 'Left Arrow',
    'right': 'Right Arrow',
    'home': 'Home',
    'end': 'End',
    'pageup': 'Page Up',
    'pagedown': 'Page Down',
  };

  return keys
    .map((k) => keyNames[k.toLowerCase()] ?? k.toUpperCase())
    .join(' + ');
}
