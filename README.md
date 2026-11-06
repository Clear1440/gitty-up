# gity-up

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

Two environment variables change the defaults:

- `GITY_UP_PORT`: the server port (default `4317`)
- `GITY_UP_DATA_DIR`: where the list of linked repositories is kept (default `~/.gity-up`)

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
