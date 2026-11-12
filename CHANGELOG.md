# Changelog

What changed in each release of Gitty Up. The app shows this file under Settings › About, and
after an update. Add to **Unreleased** as you go: `npm run release` turns it into the new
version's section.

## Unreleased

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
