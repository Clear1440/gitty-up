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
- `GITTY_UP_DATA_DIR`: where the list of linked repositories is kept (default `~/.gitty-up`)
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

Run the release script from `main` with the new version:

```bash
npm run release -- 0.2.0
```

[scripts/release.js](scripts/release.js) checks that `main` is up to date with `origin` and that
the version is new. It commits any uncommitted changes, asking for a message first. Then it sets
the version in `package.json`, tags it as `v0.2.0` and pushes `main` and the tag. It shows what it
will do and asks before changing anything.

- `patch`, `minor` or `major` in place of a version bumps the current one.
- The version already in `package.json` tags it as it is, which suits a first release.
- `-m "message"` gives the commit message for uncommitted changes, and `-y` skips the question.

The tag starts [the Release workflow](.github/workflows/release.yml). It builds a Windows
installer (`.exe`) and a macOS disk image (`.dmg`, for both Intel and Apple Silicon) and attaches
them to a **draft** GitHub release, which you then publish.

### Code signing

Nothing is signed yet, so:

- **Windows:** SmartScreen says "Windows protected your PC". Choose **More info**, then
  **Run anyway**.
- **macOS:** the app is signed ad hoc only, so Gatekeeper blocks the first launch. Open it, then
  allow it under **System Settings → Privacy & Security → Open Anyway**. You can also run
  `xattr -cr "/Applications/Gitty Up.app"`.

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

`server/git/monoService.js` does this. It matches `gitService.js` function for function, so the
routes and most of the client work with a mono repo without knowing it is one.

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

Routes are declared in `src/router.jsx`, and `src/paths.js` builds URLs to them.

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
| Colors, fonts, sizes, spacing, corners      | `src/styles/tokens.css`                    |
| One component's look                        | The `.module.css` file next to it          |
| How Ant Design components use the tokens    | `src/styles/antdTheme.js`                  |
| Ant Design details with no theme token      | `src/styles/antd-overrides.css`            |
| App-wide element defaults                   | `src/styles/base.css`                      |

`tokens.css` is the single source of truth. `antdTheme.js` reads it when the app starts, so one
edit restyles our components and Ant Design's together. Keep token colors in hex, because Ant
Design derives its hover and active shades from them.

Use tokens in stylesheets rather than raw colors or sizes, so the look stays easy to change.

### Server (`server/`)

| File or folder       | Purpose                                                     |
| -------------------- | ----------------------------------------------------------- |
| `routes/`            | HTTP endpoints, kept thin                                   |
| `git/gitService.js`  | One function per git operation                              |
| `git/parsers.js`     | Turns git's machine-readable output into objects            |
| `git/runGit.js`      | Runs git without a shell, with timeouts                     |
| `store/`             | The list of linked repositories and their groups            |

## Security

The server can run git on any folder and has no login, so it must stay private to this machine:

- It only listens on `127.0.0.1`.
- It rejects any request whose `Host` or `Origin` is not local. Without this, any website you
  visit could send requests to it.
- Git runs without a shell, and refs starting with `-` are refused, so input cannot become a
  command or an option.

Revisit all of this before exposing the server to other users.
