import type { PluginClientContext } from "@getpaseo/plugin/client";
import { SettingsScreen } from "./client/settings";
import { installLinkClicks } from "./client/web";

export default function contribute(client: PluginClientContext) {
  const removeLinkClicks = installLinkClicks(client);
  const removeSettings = client.addSettingsScreen({
    id: "link-handler",
    title: "Link handler",
    icon: "SquareArrowOutUpRight",
    Component: SettingsScreen,
  });
  return () => {
    removeSettings();
    removeLinkClicks();
  };
}
