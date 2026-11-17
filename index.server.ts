import type { PluginServerContext } from "@getpaseo/plugin/server";
import { openLink } from "./server/link-handler";
import { linkHandlerSettings, openLinkRpc } from "./shared/link-handler";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(linkHandlerSettings);
  server.handle(openLinkRpc, (input, { paseo }) => openLink(input, settings, paseo));
  return () => {};
}
