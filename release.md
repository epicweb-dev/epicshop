# Epic Workshop updates since v6.45.0

Over the last couple of months we've shipped a lot of improvements to the Epic
Workshop experience. This update highlights the biggest learner-facing changes
since v6.45.0, grouped by theme rather than release order.

## Tutorial-first onboarding

- A new tutorial workshop (`epicshop-tutorial`) is now the default first run.
  `epicshop init` clones it automatically and starts the tutorial, replacing the
  old onboarding video with a hands-on walkthrough.
- The onboarding flow now supports optional authentication, clearer prompts, and
  a multi-select workshop picker so you can grab multiple workshops at once.
- Onboarding indicators and guide content now point out key features (like Files
  and Playground) the first time you encounter them, with a first-time "Set
  Playground" dialog that prevents accidental overwrites.

## Learning flow and practice

- Interleaved practice mode adds a "practice a past lesson" button that jumps to
  a random completed step to reinforce retention.
- Finished pages now surface retrieval practice components so you can reflect on
  what you just completed before moving on.
- Extras navigation now flows directly from the final exercise into the extra
  apps list, with consistent previous/next controls inside the extras section.
- Exercise step headers and layouts were refined to avoid horizontal scrolling
  and improve usability on narrow screens.
- Keyboard shortcuts are now easier to discover with a dedicated navigation
  button and clearer shortcuts dialog messaging.

## Video learning experience (online and offline)

- Offline video downloads are now available, with encrypted-at-rest storage,
  per-video controls, and bulk download management from Preferences.
- Download quality can be chosen (best/high/medium/low), and real-time progress
  indicators show download status.
- Video metadata is now fetched dynamically so duration and download sizes are
  more accurate, and download URLs are more reliable.
- Transcript parsing and duration estimates improve how the video player
  represents timing, especially across long lessons.
- Mermaid diagrams now render correctly in dark mode, improving readability for
  embedded visuals.

## Playgrounds and extras

- Extras are now easier to discover with dedicated list and detail pages for
  standalone extra apps.
- Extras now have their own navigation sub-list and a "Set to Playground"
  button, making it easy to explore and switch your playground target.
- Saved playgrounds can be restored from a dedicated dialog, keeping your
  previous experiments accessible without cluttering the main app chooser.
- Playground UX also gains clearer first-time guidance and better indicators
  when the current playground does not match the step you're on.

## CLI and setup improvements

- The CLI is now `epicshop`, with clearer, flatter command structure and
  interactive selection for `diff` and `playground` when you do not pass args.
- `epicshop add` supports `repo#ref` so you can clone a specific workshop
  version, plus custom destination directories when you want to control where
  the repo is checked out.
- Setup flows now auto-detect your package manager and support configuration for
  more predictable installs across npm, pnpm, yarn, and bun.
- Update flows and dependency checks are smarter, with clearer prompts when a
  workshop or dependency is out of date.
- Windows-specific fixes make editor detection, command resolution, and clone
  workflows more reliable.

Examples:

```bash
epicshop init
epicshop add epicshop-tutorial
epicshop add full-stack-foundations#v1.2.0
epicshop add web-forms --directory ~/my-workshops
epicshop list
epicshop start
epicshop open
epicshop playground set
epicshop diff
epicshop update
```

## MCP server and AI assistant support

- The MCP server now supports a Notifications API so assistants can surface
  important events from your workshop session.
- New MCP tools can list and restore saved playgrounds, helping assistants keep
  your learning state in sync.

## Reliability and polish

- Error boundaries and server-down states are more resilient, making the app
  recover gracefully when something goes wrong.
- Sidecar status indicators and admin controls make background tooling more
  visible and manageable.
- The Preferences page loads faster, and the account screen gives clearer cues
  for editing your avatar.

Thanks for learning with Epic Workshop, and keep the feedback coming!
