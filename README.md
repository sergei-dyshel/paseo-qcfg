# paseo-qcfg

A [Paseo](https://paseo.sh) plugin, ID `qcfg`. A click on a local file link in Paseo's formatted
text (agent replies, plans, Markdown previews) runs your own program with the link. Hold Cmd, Alt
or Shift (Ctrl on Windows and Linux) while clicking to open the link in Paseo instead.

## Set up

```bash
npm install
paseo plugin install .
```

Paseo runs installed plugins only while `pluginsEnabled` is `true` in the daemon's `config.json`.
Run `paseo reload` after changing it.

In Paseo, open **Settings → Plugins → qcfg → Link handler**, fill in **Program** and **Arguments**,
and choose **Save**. With no program, links behave as before.

| Token         | Value                                                                                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{link}`      | The link as the agent wrote it, unchanged: `src/app.ts:12-20`, `/tmp/a.md#L3`, `file:///tmp/a.md`.                                                                     |
| `{cwd}`       | The folder relative links start from: the agent's working directory in its chat, the file's folder in a Markdown preview, otherwise the workspace folder. The program runs in it. |
| `{workspace}` | The workspace folder, or empty outside a workspace.                                                                                                                    |

Arguments split on spaces, and double quotes group a value. Each token is replaced inside its own
argument, so a link with spaces stays one argument. The program runs without a shell. For example,
**Program** `code` with **Arguments** `-g {link}` opens `src/app.ts:12` at line 12.

## Behavior

- Exit code 0: nothing else happens.
- Another exit code, or a program that cannot start: an error shows the program's last output,
  and Paseo opens the link.
- A program still running after 20 seconds counts as success and keeps running.
- Links with a scheme other than `file:` (`https:`, `mailto:`) keep Paseo's behavior. So does a
  `/name` link that inserts one of the agent's commands.
- The program runs on the computer that runs the daemon, with the daemon's environment minus the
  variables the daemon sets for itself.

## Limits

- Desktop app and browser only. On iOS and Android, links open in Paseo.
- The plugin reads Paseo's page: links are `<a target="_blank">` elements, and panes and tabs carry
  `data-testid` values. When a Paseo update changes them, clicks go back to Paseo's behavior, or
  `{cwd}` becomes the workspace folder.
- On macOS, Ctrl+click opens the context menu and does not reach the link.

## Develop

```bash
npm run typecheck
npm test
paseo plugin reload qcfg
```
