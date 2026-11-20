# gitty-up

A dark mode git client built for clarity. Link the repositories on your machine, see every branch,
and run the common git actions from a bar at the top. Sharing information between users is the
longer-term goal.

## Getting started

You need Node 22 or newer and git on your `PATH`.

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

To run the built app from a single server instead, on http://localhost:4317:

```bash
npm run build
npm start
```

| Command        | What it does                                  |
| -------------- | --------------------------------------------- |
| `npm run dev`  | Starts the server and the Vite client         |
| `npm run build`| Builds the client into `dist/`                |
| `npm start`    | Runs the server, which also hosts `dist/`     |
| `npm test`     | Runs the tests, using real temporary git repos|
| `npm run lint` | Runs ESLint                                   |
| `npm run desktop` | Builds the client and opens it in the desktop app |
| `npm run package` | Builds an installer for this OS into `release/` |

These environment variables change the defaults:

- `GITTY_UP_PORT`: the server port (default `4317`)
- `GITTY_UP_DATA_DIR`: where settings and the list of linked repositories are kept (default
  `~/.gitty-up`). The list can be moved elsewhere from the settings page; `settings.json` stays
  here and records where it went.
- `GITTY_UP_HOST`: the address the server binds to (default `127.0.0.1`). Requests must still be
  addressed to `localhost`, so this only matters inside a container.

Only `express` is a runtime dependency. Everything the client uses is a dev dependency, because
Vite bundles it into `dist/`. Keeping it that way keeps the installers and Docker image small.

## Desktop app

The desktop app is the same server and client inside [Electron](https://www.electronjs.org/).
`electron/main.js` starts the server on `127.0.0.1` and opens a window on it. If port `4317` is
taken, it uses any free port. It shares `~/.gitty-up` with `npm start`, so both list the same
repositories. Git must already be installed on the machine.

### Releasing

Changes reach `main` only through pull requests, and a release is one too. Run the release
script with the new version, from any branch with no uncommitted changes:

```bash
npm run release -- 0.3.0
```

[scripts/release.js](scripts/release.js) fetches `origin` and checks that the version is new.
On a `release/v0.3.0` branch cut from `origin/main`, it sets the version in `package.json` and
commits it as `Release v0.3.0`. It pushes that branch and opens a pull request into `main`,
with the [GitHub CLI](https://cli.github.com) (`gh`) when it is installed and signed in, or else
by printing the link that opens one. It shows what it will do and asks before changing anything,
and leaves the branch you ran it from checked out.

- `patch`, `minor` or `major` in place of a version bumps the one on `main`.
- `-y` skips the question.

Merging the pull request releases it: the merge changes the version in `package.json` on `main`,
so [the Release workflow](.github/workflows/release.yml) tags that commit as `v0.3.0` and builds
it. To release the version already on `main` as it is, or to retry a release whose build failed,
run the Release workflow from the repository's **Actions** tab.

#### Changelog

[CHANGELOG.md](CHANGELOG.md) is bundled into the app, which shows it from **Settings › About ›
What's new**, and once after an update with the releases since the last version that ran. Add
what changes under `## Unreleased` as you go, in `### Added`, `### Changed` and `### Fixed`
sections of `- ` items (`**bold**`, `` `code` `` and links work). The release script moves those
notes under the new version's heading, dated, in the release commit. It stops if there are
none, as every version needs its own section: the Release workflow's tests check for it, and a
release without one fails before anything is built. When nothing in the app changed, a line
under `## Unreleased` saying so is enough.

#### Builds

[The Release workflow](.github/workflows/release.yml) builds a Windows
installer (`.exe`), a macOS disk image (`.dmg`, for both Intel and Apple Silicon) and a Linux
AppImage (`.AppImage`, x64), attaches them to a GitHub release, and publishes it as the latest
release once all three have built. If one fails, the release stays a draft with whatever did build.

### Code signing

Nothing is signed yet, so:

- **Windows:** SmartScreen says "Windows protected your PC". Choose **More info**, then
  **Run anyway**.
- **macOS:** the app is signed ad hoc only, so Gatekeeper blocks the first launch. Open it, then
  allow it under **System Settings → Privacy & Security → Open Anyway**. You can also run
  `xattr -cr "/Applications/Gitty Up.app"`.
- **Linux:** AppImages aren't signed. Make the file executable (`chmod +x gitty-up-*.AppImage`)
  and run it. Distributions without FUSE 2 (such as Ubuntu 22.04 and later) need `libfuse2`
  (`libfuse2t64` on Ubuntu 24.04) installed first.

To sign later, add these secrets to the repository and the workflow's env:

- **macOS:** `CSC_LINK` and `CSC_KEY_PASSWORD` (a Developer ID certificate), plus `APPLE_ID`,
  `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` for notarization. Then remove
  `"identity": "-"` and `"hardenedRuntime": false` from `build.mac` in `package.json`.
- **Windows:** a certificate in `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`, or Azure Trusted
  Signing through `build.win.azureSignOptions`.

## Docker

The image builds the client and runs the server with git installed. Your repositories are mounted
in from the host.

```bash
docker compose up -d --build
```

Then open http://localhost:4317. [compose.yaml](compose.yaml) sets up:

- **Repositories:** the folder named by `GITTY_UP_REPOS`, which defaults to `~/projects`. It is
  mounted at `/home/node/repos`, the `repos` folder in the folder picker. Repository paths are the
  container's paths, so the container keeps its own list in the `gitty-up-data` volume.
- **Port:** published on `127.0.0.1` only. The server has no sign-in, so don't publish it to
  your network.
- **Pushing:** over HTTPS to GitHub, set `GH_TOKEN` in your shell or a `.env` file next to
  `compose.yaml`. The image's credential helper uses it. SSH keys are not mounted.
- **Commits:** need your name and email. Uncomment the `.gitconfig` mount, or run
  `git config user.name` and `git config user.email` inside each repository.
- **Windows hosts:** uncomment the `core.autocrlf` lines in `compose.yaml`. Otherwise files
  checked out with Windows line endings can all show as changed.
- **Linux hosts:** the container runs as uid 1000. If your user's uid is different, add
  `user: "<uid>:<gid>"` to the service so it can write to your repositories.

## Mono repos

A group on the Repositories page can open as a mono repo: one tab that treats its repositories
as a single repository. Use **Open as mono repo** on the group's heading.

- Only repositories on the same branch join. If they disagree, you pick the branch, and the rest
  are left out. The chip beside the branch name in the tab lists them and can switch them over.
- The sidebar lists only the branches every repository in the tab has.
- Changed files appear under a folder per repository. Stage from any of them, and one commit
  message goes to every repository with something staged.
- Checkout and new branches are all or nothing. Other actions run in every repository and say
  which ones failed.
- Amend, undoing a commit and pull request labels stay with each repository's own tab.
- Merge, merge into, rebase and stashes are not offered either, as they would quietly change
  several repositories at once. Open a repository on its own to use them. If a repository was
  left mid-merge elsewhere, the banner can still abort or continue it.

`server/git/monoService.js` does this. It matches `gitService.js` function for function, so the
routes and most of the client work with a mono repo without knowing it is one.

## AI tools (MCP)

Gitty Up can serve an [MCP](https://modelcontextprotocol.io) server, so AI tools can work with
the repositories you have linked. Turn it on under **Settings › AI tools**, which then shows the
config to add to Claude Code, Claude Desktop, opencode, Cursor, VS Code, Windsurf, Codex or
Gemini CLI. It speaks Streamable HTTP at `http://127.0.0.1:4317/mcp` (the settings show the real
port), and is off until turned on.

**Access** is **Read-only** by default, which offers only the tools that read. **Full access**
adds git commands. Both settings are read for every request, so a change applies at once, though
an AI tool may need reconnecting to see the new list of tools.

Every tool takes a repository by the id, name or folder that `list_repositories` gives. The
read-only tools:

| Tool                   | What it reads                                                       |
| ---------------------- | ------------------------------------------------------------------- |
| `list_repositories`    | Linked repositories, with branch, ahead/behind, changes, last commit |
| `get_status`           | Staged, unstaged, untracked and conflicted files, and any operation |
| `list_branches`        | Local and remote branches, with upstreams and tracking              |
| `get_log`              | History with parents, by ref or every branch, filtered by path, message or author |
| `get_commit`           | One commit's message and the files it changed                       |
| `get_commit_diff`      | A commit's patch, whole or for one path                             |
| `get_uncommitted_diff` | The staged and unstaged changes                                     |
| `compare_refs`         | What a branch has that its base does not, as a pull request shows it |
| `list_files`           | The files tracked at a ref                                          |
| `read_file`            | A file as committed at a ref                                        |
| `list_tags`, `list_stashes`, `list_worktrees` | Just that                                    |

Full access adds `fetch`, `pull`, `push`, `checkout`, `checkout_commit`, `create_branch`,
`rename_branch`, `delete_branch`, `merge`, `rebase`, `abort_operation`, `continue_operation`,
`stage`, `unstage`, `discard`, `commit`, `cherry_pick`, `revert`, `reset`, `create_tag`,
`stash_save`, `stash_apply`, `stash_pop`, `stash_drop`, `add_worktree` and `remove_worktree`.
They go through `gitService.js`, with the same checks as the app's own buttons, and each answers
with where the repository stands afterwards. Those that can lose work are marked destructive, so
AI tools that honor the hint ask first.

The server lives in `server/mcp/` (`gitTools.js` reads, `gitWriteTools.js` changes), and
`server/routes/mcp.js` serves it.

## Scripts (`.gitty`)

A repository with a `.gitty` file at its top level gets an **Available scripts** dropdown in its
tab, beside the current branch. Picking a script runs it in the repository's folder and shows its
output. The file is JSON:

```json
{
  "extends": ["../team-config/.gitty", "https://example.com/shared.gitty"],
  "scripts": [
    { "name": "Build", "path": "tools/build.ps1", "args": ["-Release"], "description": "Release build" },
    { "name": "Lint", "command": "npm run lint" },
    { "name": "Tidy", "shell": "bash", "command": ["git fetch --prune", "git branch --merged | grep -v main"] },
    "tools/deploy.sh"
  ]
}
```

- `extends` is one or more shared `.gitty` files to inherit scripts from: a path relative to this
  file, an absolute path, or an `http(s)` URL. Shared files can extend others. A script here
  replaces an inherited one with the same name.
- `scripts` is a list, or an object mapping names to scripts. Each script is a path to a file, or
  an object with a `name` and either a `path` or a `command`, plus optional `args` and
  `description`.
- A `path` is relative to the file that lists it. For a shared file fetched over HTTP, it is
  relative to the repository instead. Files run by extension: `.js` with node, `.ps1` with
  PowerShell, `.sh` with bash (Git for Windows' bash on Windows), `.py` with Python, `.cmd` and
  `.bat` with cmd, and anything else directly.
- A `command` is a terminal command, or a list of them to run in order. It stops at the first
  one that fails. `shell` picks what runs it: `bash`, `sh`, `powershell`, `pwsh` or `cmd`.
  Without one it runs in the system shell (cmd on Windows, sh elsewhere). On Windows, `bash` and
  `sh` use the bash that comes with Git for Windows. Any `args` are quoted and added to the end
  of the last command.
- Scripts get `GITTY_REPO_PATH` and `GITTY_SCRIPT_NAME` in their environment, and stop after 10
  minutes.

### Parameters

A script can ask for values before it runs. Picking it opens a form, which remembers the last
answers for next time:

```json
{
  "name": "Deploy",
  "shell": "bash",
  "command": "npm run deploy -- --env {{env}} {{dryRun}} --tag {{tag}}",
  "params": [
    { "name": "env", "label": "Environment", "options": ["staging", "production"], "default": "staging" },
    { "name": "tag", "required": true, "placeholder": "v1.2.3" },
    { "name": "dryRun", "label": "Dry run", "type": "boolean", "flag": "--dry-run", "default": true },
    { "name": "retries", "type": "number", "default": 3, "description": "How often to retry" }
  ]
}
```

- `params` is a list, or an object mapping names to parameters. A parameter has a `name` (letters,
  digits, `_` and `-`), and optionally a `type`, `label`, `description`, `placeholder`, `default`
  and `required`.
- `type` is `string` (the default), `number`, `boolean` (a checkbox) or `choice`, which needs
  `options`, a list of strings. Giving `options` alone makes it a choice.
- `{{name}}` in a `command` or in `args` is replaced by the answer. In a `command` it is quoted for
  the shell, so don't put quotes around it yourself. An empty answer leaves nothing behind, and an
  arg that is just a placeholder is dropped when its answer is empty.
- A boolean gives `true` or `false`. With a `flag`, it gives the flag when ticked and nothing when
  not.
- Every answer is also in the environment as `GITTY_PARAM_<NAME>` (in capitals, `-` as `_`), and
  all of them as JSON in `GITTY_PARAMS`.

### Console

A running script's output streams into a console at the bottom of the window, which can be
closed and reopened from the dropdown while the script carries on. It can stop the script, and
everything it started, or run it again with the same answers. When the console is closed, a
notification says how the script ended.

Problems in the file, such as a shared file that cannot be loaded, show at the bottom of the
dropdown. Mono repo tabs do not offer scripts. `server/scripts/` does this.

## How it fits together

A browser cannot run git, so a small local server does that and the React app talks to it over
HTTP.

```
React pages -> src/queries (cache, hooks) -> src/api (HTTP) -> server/routes -> server/git -> git
```

### Client (`src/`)

| Folder                  | Purpose                                                            |
| ----------------------- | ------------------------------------------------------------------ |
| `api/`                  | All network traffic. `client.js` is the only file that calls `fetch` |
| `queries/`              | TanStack Query hooks. `useGitActions.js` runs and reports git actions |
| `pages/home/`           | The repository list in the permanent first tab                     |
| `pages/repository/`     | The workspace: action bar, branch sidebar, history, commit panel   |
| `pages/repository/history/` | The git tree. `commitGraph.js` lays it out, with no UI code    |
| `layouts/`              | The app shell and tab bar                                          |
| `tabs/`                 | Open tab state, saved to `localStorage`                            |
| `styles/`               | Design tokens, global styles and the Ant Design theme              |
| `utils/`                | Shared helper classes, such as `TextHelper` and `ListHelper`       |

Routes are declared in `src/router.jsx`, and `src/paths.js` builds URLs to them.

Code used in more than one place lives in a static helper class named for what it works on, such
as `ListHelper.toggle()` or `StatusHelper.countChangedFiles()`. General ones are in `src/utils/`,
and ones about a repository's status or commits are in `src/pages/repository/`. Older function
exports, such as `readStored`, still work and point at the helpers. They are marked
`@deprecated`, so new code uses the helper instead.

ESLint rejects `fetch` anywhere outside `src/api/client.js`, so the API layer stays the single
path to the network.

To add a git action:

1. Add a function to `server/git/gitService.js`.
2. Register a route in `server/routes/repositories.js`.
3. Add a call to `src/api/git.js`.
4. Add an entry to `GIT_ACTIONS` in `src/queries/useGitActions.js`.

### Styling

| To change                                   | Edit                                       |
| ------------------------------------------- | ------------------------------------------ |
| Colors of a color scheme (light and dark)   | `src/styles/themes.js`                     |
| Fonts, sizes, spacing, corners              | `src/styles/tokens.css`                    |
| One component's look                        | The `.module.css` file next to it          |
| How Ant Design components use the tokens    | `src/styles/antdTheme.js`                  |
| Ant Design details with no theme token      | `src/styles/antd-overrides.css`            |
| App-wide element defaults                   | `src/styles/base.css`                      |

`tokens.css` and `themes.js` are the single source of truth. Each scheme in `themes.js` sets every
`--color-*` token for dark and light mode; the settings page picks one, and `antdTheme.js` builds
Ant Design's theme from the same palette, so one edit restyles our components and Ant Design's
together. Keep palette colors in hex, because Ant Design derives its hover and active shades from
them. A new scheme needs every key the others have.

Use tokens in stylesheets rather than raw colors or sizes, so the look stays easy to change.

### Server (`server/`)

| File or folder       | Purpose                                                     |
| -------------------- | ----------------------------------------------------------- |
| `routes/`            | HTTP endpoints, kept thin                                   |
| `git/gitService.js`  | One function per git operation                              |
| `git/parsers.js`     | Turns git's machine-readable output into objects            |
| `git/runGit.js`      | Runs git without a shell, with timeouts                     |
| `git/GitRefHelper.js` | Branch, remote and commit names as git spells them         |
| `store/`             | The list of linked repositories and their groups            |
| `utils/`             | Shared helper classes, such as `ValidationHelper`           |
| `errors.js`          | `ApiError`, whose static methods make every error code sent |

The client and server each have their own helpers, as they are built and shipped separately.

## Security

The server can run git on any folder and has no login, so it must stay private to this machine:

- It only listens on `127.0.0.1`.
- It rejects any request whose `Host` or `Origin` is not local. Without this, any website you
  visit could send requests to it.
- Git runs without a shell, and refs starting with `-` are refused, so input cannot become a
  command or an option.
- The MCP server for AI tools is off until turned on in the settings, and has the same
  local-only checks. Any AI tool on this machine can then read every linked repository,
  including files committed to it. Its git commands are offered only with **Full access**, which
  lets any such tool change every linked repository, so it starts read-only and warns before
  allowing that.
- Scripts from a `.gitty` file are the exception: they run whatever the file says, with your
  permissions, so only run scripts from repositories and shared files you trust. Only scripts the
  file lists can run, and it is reread before each one.

Revisit all of this before exposing the server to other users.
