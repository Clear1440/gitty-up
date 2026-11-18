# Changelog

What changed in each release of Gitty Up. The app shows this file under Settings › About, and
after an update. Add to **Unreleased** as you go: `npm run release` turns it into the new
version's section.

## Unreleased

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
