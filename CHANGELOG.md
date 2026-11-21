# Changelog

What changed in each release of Gitty Up. The app shows this file under Settings › About, and
after an update. Add to **Unreleased** as you go: `npm run release` turns it into the new
version's section.

## Unreleased

### Added

- **Create, push and delete tags.** **Create tag…** is in a commit's menu in the history. A
  message makes the tag annotated, and a checkbox pushes it to the remote straight away. Tags
  have their own section in the sidebar, and a right-click menu there and on a tag's label in
  the history: check it out, push it, copy its name or delete it. Deleting asks first, and
  offers to delete it from the remote too when the remote has it. Clicking a tag in the sidebar
  scrolls to its commit. Creating a tag can be undone with Ctrl+Z (Cmd+Z). Mono repo tabs leave
  tags to each repository.
- **Tags for AI tools.** With full access, `delete_tag` deletes a local tag and `push_tag`
  pushes one, never forcing. `create_tag` now makes the same checks as the app's own dialog.
- **Ignore whitespace.** The new button beside **Inline** and **Split** hides changes to
  spaces and tabs in every diff, as `git diff -w` does, and is remembered next time. A file
  whose only changes are whitespace says so. While it is on, single lines and hunks can't be
  staged, unstaged or discarded, as the lines shown no longer match the file. Whole files
  still can.
- **See what AI tools did, and undo it.** **Settings › AI tools › Activity** lists every call
  AI tools make through the MCP server: when, which tool, which repository, and whether it
  worked, with the details a click away. It shows the changes they made unless you pick
  **Everything**. Commits, merges, rebases, resets, pulls, checkouts, new branches, tags and
  stashes can be undone from there, once Gitty Up has checked nothing has moved since. It says
  exactly what undoing will do and asks first, and never touches a remote. The last 500 changes
  are kept between launches; **Clear the log** empties it.
- **Recover lost work from the reflog.** The new **Reflog** button lists where HEAD has been,
  newest first. Commits left behind by a reset, a rebase, an amend or a deleted branch are
  marked **Not on any branch**, and a switch shows only those. Open one to see its files, then
  make a **New branch from here**, check it out, cherry-pick it or reset to it. Ctrl+Z only
  takes back the latest change made in the app, but the reflog goes back much further.

- **Create a pull request.** A branch's menu, in the sidebar or on its label in the history,
  has **Create pull request…**. Pick the branch it goes into, and change the title and
  description filled in from its commits, or make it a draft. A branch that isn't pushed, or
  is ahead of its remote, says so and offers to push first. On GitHub with a token it is
  created from the app, with a link to it. Otherwise the host's page opens in the browser,
  filled in.
- **Open pull request** in a branch's menu, for a branch that has one.
- **GitLab and Bitbucket.** Open merge requests on gitlab.com and pull requests on
  bitbucket.org show on branch labels too, and **Create merge request…** opens the host's
  page for one. Tokens come from `GITLAB_TOKEN` or `BITBUCKET_TOKEN`, or what git pushes with.

### Changed

- **AI tools need a token.** The MCP server now turns away any request without the token
  shown under **Settings › AI tools**, so other programs on this computer can no longer
  connect. **AI tools you have already set up stop connecting until you copy their config
  again** from **Settings › AI tools**: every snippet now holds the token. It is a secret, so
  the settings point each app at its config for every project, not a project's own file that
  may be shared. **Regenerate token** makes a new one, after asking, and every AI tool then
  needs its config again. To keep old configs working, untick **Require a token**: after a
  warning, any program on this computer can connect without one, as before.
- **Reviews and checks on pull request labels.** On GitHub, a branch's pull request label
  marks failing checks, changes requested, checks still running, or all clear, and its
  tooltip says which. This needs a token (`GH_TOKEN`, `GITHUB_TOKEN` or what git pushes
  with). Lists are kept for a minute, so switching tabs doesn't ask GitHub again.

### Fixed

- Locking, unlocking and removing a worktree finds it when its folder is given through a
  symlink, such as /var on macOS, which git names by the folder it points to.

## 0.4.0 - 2026-11-20

### Added

- **Discard lines and hunks.** Point at a changed line in the diff for buttons that stage
  (or unstage) and discard just that line. Unstaged hunks have **Discard hunk** beside
  **Stage hunk**, and lines picked with shift or ctrl can be discarded together. Discarding
  asks first, as it can't be undone.
- **Rename a branch on its remote too.** The rename dialog can also rename the branch it
  tracks, such as origin/topic, and keep tracking it under the new name.
- **Arrow keys.** Up and Down step through the files of a commit, a stash or the
  uncommitted changes, and through the commit history.
- **Let AI tools work with your repositories.** Turn on **Settings › AI tools › MCP server** and
  Gitty Up serves an MCP server that Claude Code, Claude Desktop, opencode, Cursor, VS Code,
  Windsurf, Codex and Gemini CLI can connect to. It is off until turned on, and read-only until
  you choose **Full access**: read-only lets them list your linked repositories and read their
  status, branches, history, commits, diffs, tags, stashes, worktrees and committed files. Full
  access adds git commands such as commit, branch, merge, rebase, stash, reset and push, after a
  warning. Force pushing is never offered. **Repositories** limits them to chosen groups or
  repositories, or allows all (`*`, the default). The settings show the config to paste into
  each app: pick it from the list to see its snippet.

### Changed

- A branch checked out in another worktree shows a tree in the branch list and on its
  label in the history, and the worktree list uses the same tree.
- Ctrl+W (Cmd+W on a Mac) closes the open tab instead of the app.
- Middle-clicking a tab closes it when the button is let go, as in a browser, and only if
  it was pressed on that tab.
- The desktop app runs on Electron 44 instead of 45, whose windows resized and snapped
  badly on macOS.

### Fixed

- Closing a tab with the middle button no longer leaves another tab outlined.
- Staging or unstaging a line keeps the same file on screen, rather than jumping to its
  other copy when the file ends up both staged and unstaged.

## 0.3.1 - 2026-11-18

### Added

- **Drag several repositories at once.** Ctrl-click or shift-click repositories on the home
  page, then drag any one of them to move them all into a group. Hold Ctrl (Option on a Mac)
  to copy instead. The drag shows how many repositories it carries.

### Fixed

- A group's repository count now lines up with the group's name.
- Outside the desktop app, the page no longer asks the server about updates twice a second.
- Opening a repository's tab no longer loads everything in it twice. The quiet fetch from the
  remotes on opening it only reloads the tab when it brings in something new.

### Changed

- **Easier to tell characters apart.** Text uses the complete Inter font with its
  disambiguation set: a tail on l, serifs on I, a flagged 1 and a slashed zero, so branch
  names, hashes and versions such as `illegal-Il1` or `1.10.0` read without guessing.
- Lines divide the local branches, remote branches, stashes and worktrees in the sidebar.
- **Counts beside the branch.** On the home page, a repository's changed files and commits to
  push and pull now follow its branch name directly, centered on it, instead of sitting in
  columns sized to the longest branch in the list.

## 0.3.0 - 2026-11-17

### Added

- **Rename a branch.** Right-click a local branch and choose **Rename…**. Its commits and
  upstream stay with it. In a mono repo, **Rename in every repository…** renames it in each
  repository of the group that has it, so the names stay together, or in none if any can't.
- **Stacked branch labels.** A commit with several branches shows them as a stack in the tree,
  the selected or checked out branch in front and readable in full. Hover to drop the rest
  down, and click one to select it.

### Changed

- The repository list shows uncommitted changes right beside the branch, with the counts after
  the widest branch name so they still line up.
- Toasts show at the top right, clear of the toolbar and branches.
- Stash, save as patch and discard in Uncommitted changes, and Open as mono repo, are icon
  buttons named by their tooltips.
- The branch list makes the checked out branch bold, sets back branches whose upstream is
  gone, and says on hover what each branch tracks.

## 0.2.5 - 2026-11-17

Nothing in the app changed. Releases are now prepared as a pull request, which the Release
workflow tags and builds once it merges.

## 0.2.4 - 2026-11-17

### Added

- **Revert a commit.** Right-click a commit in the history and choose **Revert commit…**. Keep
  the commit message to commit straight away as `Revert "…"`, or untick it to stage the undoing
  changes and commit them with a message of your own.
- The branch list can hide local branches whose upstream is gone, with the button beside the
  filter. The checked out branch always shows.
- **Updates from inside the app.** Gitty Up checks for a new release when it starts, and shows
  **Update available** beside the settings button when there is one. Click it to download and
  install the update; the app restarts into it. **Settings › About › Updates** checks on demand.
- **See a merge before you make it.** The merge dialogs show which branch goes into which, how
  many commits that brings in, and whether it fast-forwards. In a mono repo they do so for each
  repository, and name the ones the merge leaves alone.
- **Branches across part of a mono repo.** A branch that two or more of a group's repositories
  have is listed under **Across some repositories**. Choosing one lines the whole group up on
  it: those with the branch switch to it, and the rest go to their main or master branch. The
  dialog shows where each repository goes, and nothing switches if any of them has staged
  changes, conflicts or something under way, or if one fails to switch.
- Repositories riding along on their main branch show beside the branch name, with the branch
  they are on, rather than as left out.

### Changed

- **Mono repos read as one repository, made of several.** Each repository keeps one color
  throughout the tab: on its commits, its folder in the file lists, and the member dots by the
  branch name. The members list says where each one's branch stands, and opens any of them in a
  tab of its own.
- Merge messages name both branches, and in a mono repo the repositories they were merged in.
- Opening a group as a mono repo picks **main**, or else **master**, when some of its repositories
  are on it. The merge dialog offers the same branch to merge in.

- **Clearer dialogs.** Fields in the branch, merge, stash, publish and worktree dialogs have
  labels that stay on show, and each dialog says in a sentence what its button will do.
- The commit box always says which files a commit takes, and why Commit is greyed out.
- Hovering a toolbar button says what its count means, and why it can't be used right now.
- Linking a repository names its two choices **Folder on this machine** and **Git URL**, and
  shows the folder that will be linked.
- Discarding a file's changes shows as a trash can.
- Tooltips show below their button, and go away as soon as the pointer leaves it, even onto
  the tooltip.
- The repository list keeps its counts and times in columns that line up from row to row.
- The Stash button no longer shows a count.

## 0.2.3 - 2026-11-12

### Added

- **Script parameters.** A script in `.gitty` can ask for values before it runs: text, a
  number, a checkbox or a choice. They reach the script as `{{name}}` placeholders, quoted for
  the shell, and as `GITTY_PARAM_<NAME>` environment variables. The form remembers your last
  answers.
- **Script console.** A script's output streams into a console at the bottom of the window as
  it runs, with Stop, Run again and Copy. Close it and the script carries on; reopen it from
  the scripts menu.
- **What's new.** This changelog, under Settings › About, and shown once after an update.
- Ctrl+Z undoes the latest change in the open repository.
- Merging works across every repository in a mono repo.
- The app version shows at the bottom of Settings.
- Middle-clicking anywhere on a tab closes it, not just on its name.

### Changed

- Scripts run with the environment a new terminal would have, so tools set up in your shell
  profile, or added to the PATH since the app started, are found.
- Stopping a script, or its 10-minute timeout, ends everything it started.
- Coming back to the app refreshes the open tab, and the screen refreshes in one go after
  merges, pushes and fetches.
- The Fetch button spins during background fetches.
- The window reopens where it was, sized to fit its screen.

### Fixed

- The window repaints after sleep and display changes.
- The HEAD pulse in the commit graph no longer animates forever.
- Resize handles no longer grab a pane on hover.
- A long command no longer makes the scripts menu scroll sideways.

## 0.2.2 - 2026-11-09

### Added

- Repository groups you can reorder and color, with repositories dragged between them or kept
  in several, and a condensed view of the list.
- Stash previews, stashes in the branch tree, and creating and applying patches.
- The changes view gains file menus, multi-select, finer diffs, click to stage, and amend.
- Git worktrees in the repository sidebar.
- Commit search, protected branches, undo while resolving conflicts, and a theme that follows
  the system.
- A Linux AppImage.

### Changed

- Pushing into an upstream that belongs to another branch asks first.
- Groups are colored, rather than individual repositories.

## 0.2.1 - 2026-11-07

### Added

- A Settings page, with several color schemes.
- Scripts from a `.gitty` file, as files or inline commands.

### Changed

- Mono repos no longer offer actions that are risky across many repositories.

### Fixed

- The notification icon no longer sits under the button.

## 0.2.0 - 2026-11-07

### Added

- Cherry-pick a commit, or check one out.
- Fetching when you switch tabs.
- A new logo.

### Changed

- Renamed from gity-up to Gitty Up.

## 0.1.0 - 2026-11-07

The first release.
