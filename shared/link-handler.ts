import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

/** Program and argument template that a click on a local file link runs, per daemon host. */
export const linkHandlerSettings = defineSettings({
  id: "link-handler",
  scope: "host",
  version: 1,
  schema: z.object({
    program: z.string().trim().max(1024).default(""),
    args: z.string().trim().max(4096).default("{link}"),
  }),
});

export const openLinkRpc = defineRpc({
  name: "link.open",
  input: z.object({
    /** The link as written: the destination of a Markdown link, or the path Paseo recognized. */
    link: z.string().min(1).max(16_384),
    workspaceId: z.string().min(1).optional(),
    /** The agent whose tab shows the link. */
    agentId: z.string().min(1).optional(),
    /** The file whose tab shows the link: relative to the workspace directory, or absolute. */
    filePath: z.string().min(1).optional(),
  }),
  output: z.discriminatedUnion("status", [
    z.object({ status: z.literal("done") }),
    /** Paseo opens the link: no program is set, or the link is one of the agent's commands. */
    z.object({ status: z.literal("default") }),
    z.object({ status: z.literal("failed"), message: z.string() }),
  ]),
});

const SCHEME = /^([A-Za-z][A-Za-z0-9+.-]*):([\s\S]*)$/;

/**
 * Whether a link names a local file or folder rather than a URL.
 *
 * Paths, `file:` URLs and Windows drive paths are local. So is a `name:line` suffix such as
 * `README.md:12`, which reads like a URL scheme. Every other scheme is a URL.
 */
export function isLocalLink(link: string): boolean {
  const value = link.trim();
  if (!value || value.startsWith("#")) return false;
  const match = SCHEME.exec(value);
  if (!match) return true;
  const [, scheme = "", rest = ""] = match;
  if (scheme.toLowerCase() === "file") return true;
  if (scheme.length === 1 && /^[\\/]/.test(rest)) return true;
  return /^\d[\d:,-]*$/.test(rest);
}

/** Split an argument line on whitespace. Double quotes group a value, and backslashes stay literal. */
export function splitArgs(line: string): string[] {
  const args: string[] = [];
  let current = "";
  let started = false;
  let quoted = false;
  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
      started = true;
    } else if (!quoted && /\s/.test(char)) {
      if (started) args.push(current);
      current = "";
      started = false;
    } else {
      current += char;
      started = true;
    }
  }
  if (started) args.push(current);
  return args;
}

/**
 * Build the program's arguments from the template: split it first, then replace each `{name}`
 * token inside its argument, so a value with spaces stays one argument. Unknown tokens stay as written.
 */
export function buildArgs(template: string, values: Readonly<Record<string, string>>): string[] {
  return splitArgs(template).map((arg) =>
    arg.replace(/\{([a-z]+)\}/g, (token, name: string) =>
      Object.hasOwn(values, name) ? values[name] : token,
    ),
  );
}
