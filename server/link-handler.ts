import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import {
  spawnProcess,
  type PluginHandlerContext,
  type PluginSettings,
} from "@getpaseo/plugin/server";
import { buildArgs, linkHandlerSettings, openLinkRpc } from "../shared/link-handler";

type Input = RpcInput<typeof openLinkRpc>;
type Output = RpcOutput<typeof openLinkRpc>;
type Paseo = PluginHandlerContext["paseo"];
export type Settings = PluginSettings<typeof linkHandlerSettings.schema>;

/** Longest wait for the program to exit. The daemon fails a plugin RPC after 30 seconds. */
const EXIT_WAIT_MS = 20_000;
const OUTPUT_TAIL_CHARS = 1_000;
/** Variables the daemon sets for its own processes. With `ELECTRON_RUN_AS_NODE`, Electron apps start as Node. */
const DAEMON_ENV = [
  "PASEO_NODE_ENV",
  "PASEO_DESKTOP_MANAGED",
  "PASEO_SUPERVISED",
  "ELECTRON_RUN_AS_NODE",
  "ELECTRON_NO_ATTACH_CONSOLE",
  "ESBUILD_BINARY_PATH",
];
const COMMAND_LINK = /^\/[^/\\\s]+$/;

/** Run the configured program for a clicked link and report whether Paseo should open it instead. */
export async function openLink(input: Input, settings: Settings, paseo: Paseo): Promise<Output> {
  const state = await settings.read();
  if (state.status !== "ready") {
    return { status: "failed", message: `qcfg: the settings are invalid: ${state.error}` };
  }
  const { program, args } = state.values;
  if (!program) return { status: "default" };
  if (input.agentId && COMMAND_LINK.test(input.link)) {
    if (await isAgentCommand(paseo, input.agentId, input.link)) return { status: "default" };
  }
  const { cwd, workspace } = await linkDirectories(input, paseo);
  return run(expandHome(program), buildArgs(args, { link: input.link, cwd, workspace }), cwd);
}

// Paseo turns `/name` into a link when `name` is one of the agent's commands, and a click inserts it
async function isAgentCommand(paseo: Paseo, agentId: string, link: string): Promise<boolean> {
  const result = await paseo.agents
    .ref(agentId)
    .commands()
    .catch(() => null);
  return result?.commands.some((command) => `/${command.name}` === link) ?? false;
}

/** Find the directory relative links start from, and the workspace directory. */
async function linkDirectories(
  input: Input,
  paseo: Paseo,
): Promise<{ cwd: string; workspace: string }> {
  const workspace = input.workspaceId ? await workspaceDirectory(paseo, input.workspaceId) : null;
  let linkBase: string | null = null;
  if (input.filePath) linkBase = fileDirectory(input.filePath, workspace);
  else if (input.agentId) linkBase = await agentCwd(paseo, input.agentId);
  for (const candidate of [linkBase, workspace]) {
    if (candidate && (await isDirectory(candidate))) {
      return { cwd: candidate, workspace: workspace ?? "" };
    }
  }
  return { cwd: homedir(), workspace: workspace ?? "" };
}

async function workspaceDirectory(paseo: Paseo, workspaceId: string): Promise<string | null> {
  const workspace = await paseo.workspaces
    .ref(workspaceId)
    .refresh()
    .catch(() => null);
  return workspace?.workspaceDirectory ?? null;
}

async function agentCwd(paseo: Paseo, agentId: string): Promise<string | null> {
  const agent = paseo.agents.ref(agentId);
  await agent.refresh().catch(() => null);
  return agent.cwd;
}

// file tabs name a file relative to the workspace directory, or by an absolute or `~/` path
function fileDirectory(path: string, workspace: string | null): string | null {
  let file: string | null = null;
  if (path.startsWith("~/")) file = join(homedir(), path.slice(2));
  else if (isAbsolute(path)) file = path;
  else if (workspace) file = join(workspace, path);
  return file ? dirname(file) : null;
}

async function isDirectory(path: string): Promise<boolean> {
  return stat(path).then(
    (stats) => stats.isDirectory(),
    () => false,
  );
}

function expandHome(path: string): string {
  return path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
}

/** Run the program and wait for its exit code. A program still running after the wait counts as done. */
function run(program: string, args: string[], cwd: string): Promise<Output> {
  return new Promise((resolve) => {
    let output = "";
    const timer = setTimeout(() => resolve({ status: "done" }), EXIT_WAIT_MS);
    const finish = (result: Output) => {
      clearTimeout(timer);
      resolve(result);
    };
    const env = { ...process.env };
    for (const key of DAEMON_ENV) delete env[key];
    try {
      const child = spawnProcess(program, args, { cwd, env, stdio: "pipe" });
      const collect = (chunk: Buffer) => {
        output = (output + chunk.toString()).slice(-OUTPUT_TAIL_CHARS);
      };
      child.stdout.on("data", collect);
      child.stderr.on("data", collect);
      child.stdin.end();
      child.once("error", (error) => {
        finish({ status: "failed", message: `qcfg: cannot run ${program}: ${error.message}` });
      });
      child.once("close", (code, signal) => {
        if (code === 0) {
          finish({ status: "done" });
          return;
        }
        const exit = code === null ? `was stopped by ${signal}` : `exited with code ${code}`;
        const tail = output.trim();
        finish({ status: "failed", message: `qcfg: ${program} ${exit}${tail ? `\n${tail}` : ""}` });
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      finish({ status: "failed", message: `qcfg: cannot run ${program}: ${reason}` });
    }
  });
}
