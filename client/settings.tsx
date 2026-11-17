import { useState } from "react";
import { Text } from "react-native";
import { useSettings, type PluginSurfaceProps, type SettingsState } from "@getpaseo/plugin/client";
import {
  SettingsAction,
  SettingsCard,
  SettingsInput,
  SettingsSection,
} from "@getpaseo/plugin/client/ui";
import { linkHandlerSettings } from "../shared/link-handler";

type ReadySettings = Extract<
  SettingsState<typeof linkHandlerSettings.schema>,
  { status: "ready" }
>;

const TITLE = "Link handler";
const PROGRAM_HINT =
  "Runs on the daemon host when you click a local file link. Hold a modifier key to open the link in Paseo instead. Leave empty to keep Paseo's behavior.";
const ARGS_HINT =
  "{link}: the link as written. {cwd}: the folder relative links start from, where the program runs. {workspace}: the workspace folder. Double quotes group a value.";

export function SettingsScreen({ theme }: PluginSurfaceProps) {
  const settings = useSettings(linkHandlerSettings);
  if (settings.status === "loading") return null;
  if (settings.status === "ready") return <Editor key={settings.revision} settings={settings} />;
  const invalid = settings.status === "invalid";
  return (
    <SettingsSection title={TITLE}>
      <Text style={{ color: theme.colors.statusDanger }}>{settings.error}</Text>
      <SettingsAction
        label={invalid ? "Stored settings" : "Settings"}
        actionLabel={invalid ? "Reset" : "Reload"}
        onPress={() => void (invalid ? settings.reset() : settings.reload())}
      />
    </SettingsSection>
  );
}

// a save changes the revision, which remounts the editor with the saved values
function Editor({ settings }: { settings: ReadySettings }) {
  const [draft, setDraft] = useState(settings.values);
  return (
    <SettingsSection title={TITLE}>
      <SettingsCard>
        <SettingsInput
          label="Program"
          hint={PROGRAM_HINT}
          placeholder="code"
          initialValue={draft.program}
          disabled={settings.saving}
          onChangeText={(program) => setDraft((current) => ({ ...current, program }))}
        />
        <SettingsInput
          label="Arguments"
          hint={ARGS_HINT}
          placeholder="{link}"
          initialValue={draft.args}
          disabled={settings.saving}
          onChangeText={(args) => setDraft((current) => ({ ...current, args }))}
        />
        <SettingsAction
          label="Program and arguments"
          actionLabel="Save"
          error={settings.saveError}
          disabled={settings.saving}
          onPress={() => void settings.save(draft, settings.revision)}
        />
      </SettingsCard>
    </SettingsSection>
  );
}
