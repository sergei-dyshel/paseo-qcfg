import type { PluginClientContext } from "@getpaseo/plugin/client";
import { Platform } from "react-native";
import { isLocalLink, openLinkRpc } from "../shared/link-handler";

// This plugin typechecks without the DOM library. Declare only what this module uses.
interface Element {
  readonly style: Record<string, string>;
  readonly isConnected: boolean;
  textContent: string | null;
  closest(selector: string): Element | null;
  querySelector(selector: string): Element | null;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  appendChild(child: Element): void;
  remove(): void;
  addEventListener(type: "click", listener: () => void): void;
  dispatchEvent(event: MouseEvent): boolean;
}

interface MouseEvent {
  readonly target: unknown;
  readonly button: number;
  /** The click count: 2 for the second click of a double-click, 0 for a dispatched click. */
  readonly detail: number;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  preventDefault(): void;
  stopPropagation(): void;
}

declare const MouseEvent: {
  new (type: "click", init: { bubbles: boolean; cancelable: boolean; composed: boolean }): MouseEvent;
};
declare const document: {
  readonly body: Element;
  createElement(tag: "div"): Element;
  addEventListener(type: "click", listener: (event: MouseEvent) => void, capture: boolean): void;
  removeEventListener(type: "click", listener: (event: MouseEvent) => void, capture: boolean): void;
};
declare const window: { getComputedStyle(element: Element): { readonly fontFamily: string } };
declare const location: { readonly pathname: string };

/** Links in Paseo's formatted text open in a new target. App navigation links do not. */
const MARKDOWN_LINK = 'a[href][target="_blank"]';
const PANE = '[data-testid^="workspace-pane-"]';
const TAB_PREFIX = "workspace-tab-";
const SELECTED_TAB = `[data-testid^="${TAB_PREFIX}"][aria-selected="true"]`;
const ERROR_MS = 8_000;

interface LinkContext {
  workspaceId?: string;
  agentId?: string;
  filePath?: string;
}

function asElement(value: unknown): Element | null {
  return value && typeof value === "object" && "closest" in value ? (value as Element) : null;
}

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

// workspace IDs are URL-safe, so the route carries them as they are
function routeContext(pathname: string): LinkContext & { serverId?: string } {
  const match = /^\/h\/([^/]+)(?:\/(workspace|agent)\/([^/]+))?/.exec(pathname);
  if (!match?.[1]) return {};
  const serverId = decode(match[1]);
  if (!match[3]) return { serverId };
  return match[2] === "agent"
    ? { serverId, agentId: decode(match[3]) }
    : { serverId, workspaceId: decode(match[3]) };
}

/** Read which tab shows the link from the selected tab of the pane that holds it. */
function tabContext(anchor: Element): LinkContext {
  const tab = anchor.closest(PANE)?.querySelector(SELECTED_TAB);
  const id = tab?.getAttribute("data-testid")?.slice(TAB_PREFIX.length) ?? "";
  if (id.startsWith("agent_")) return { agentId: id.slice("agent_".length) };
  if (id.startsWith("file_")) return { filePath: id.slice("file_".length) };
  return {};
}

let errorBox: Element | null = null;

function showError(message: string, near: Element): void {
  errorBox?.remove();
  const box = document.createElement("div");
  box.setAttribute("role", "alert");
  box.textContent = message;
  Object.assign(box.style, {
    position: "fixed",
    left: "50%",
    bottom: "24px",
    transform: "translateX(-50%)",
    zIndex: "2147483647",
    maxWidth: "min(720px, calc(100vw - 32px))",
    maxHeight: "40vh",
    overflow: "auto",
    padding: "10px 14px",
    borderRadius: "8px",
    borderLeft: "4px solid rgb(220, 38, 38)",
    background: "rgb(32, 32, 32)",
    color: "rgb(236, 236, 236)",
    fontFamily: window.getComputedStyle(near).fontFamily,
    fontSize: "13px",
    lineHeight: "18px",
    whiteSpace: "pre-wrap",
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.28)",
    cursor: "pointer",
  });
  box.addEventListener("click", () => box.remove());
  document.body.appendChild(box);
  errorBox = box;
  setTimeout(() => box.remove(), ERROR_MS);
}

/**
 * Run the configured program for a plain click on a local file link in Paseo's formatted text.
 * A click with a modifier key, and every link that is not a local file, keeps Paseo's behavior.
 */
export function installLinkClicks(client: PluginClientContext): () => void {
  if (Platform.OS !== "web") return () => {};

  // The app loads this plugin once per connected host that has it, and every copy sees the click.
  // Only the copy whose host owns the page answers. undefined: not known yet. null: the host
  // cannot say, so answer every host page.
  let ownServerId: string | null | undefined;
  void client.paseo.hosts.list().then(
    (directory) => {
      ownServerId = directory.self.serverId;
    },
    () => {
      ownServerId = null;
    },
  );

  let replaying = false;
  // Paseo's own click handler opens the link, and `replaying` lets this click past the listener
  const openInPaseo = (anchor: Element) => {
    if (!anchor.isConnected) return;
    replaying = true;
    try {
      anchor.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, composed: true }));
    } finally {
      replaying = false;
    }
  };

  // capture on the document runs before React's listener on the app root
  const onClick = (event: MouseEvent) => {
    if (replaying || event.button !== 0) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const anchor = asElement(event.target)?.closest(MARKDOWN_LINK) ?? null;
    const link = anchor?.getAttribute("href") ?? "";
    if (!anchor || !isLocalLink(link)) return;
    const { serverId, ...route } = routeContext(location.pathname);
    if (!serverId || (ownServerId !== null && serverId !== ownServerId)) return;
    event.preventDefault();
    event.stopPropagation();
    // the first click of a double-click already ran the program
    if (event.detail > 1) return;
    void client
      .rpc(openLinkRpc, { link, ...route, ...tabContext(anchor) })
      .catch((error: unknown) => ({
        status: "failed" as const,
        message: `qcfg: ${error instanceof Error ? error.message : String(error)}`,
      }))
      .then((result) => {
        if (result.status === "done") return;
        if (result.status === "failed") {
          console.warn(result.message);
          showError(result.message, anchor);
        }
        openInPaseo(anchor);
      });
  };

  document.addEventListener("click", onClick, true);
  return () => {
    document.removeEventListener("click", onClick, true);
    errorBox?.remove();
  };
}
