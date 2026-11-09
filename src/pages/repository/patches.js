/** File types offered when picking a patch, and recognised when one is dropped. */
export const PATCH_EXTENSIONS = ['.patch', '.diff'];

export const PatchHelper = {
  /** Whether git format-patch made it, so git am can turn it back into commits. */
  isMailbox: (patch) => /^From [0-9a-f]{40} /m.test(patch),

  /** How many files a patch changes, counted from its per-file headers. */
  countFiles: (patch) => new Set(patch.match(/^diff --git .+$/gm) ?? []).size,

  /** How many commits a format-patch file holds. */
  countCommits: (patch) => (patch.match(/^From [0-9a-f]{40} /gm) ?? []).length,

  isPatchFile: (file) =>
    PATCH_EXTENSIONS.some((extension) => file.name.toLowerCase().endsWith(extension)),

  /** Hands the patch to the browser as a file download. */
  download: ({ fileName, patch }) => {
    const url = URL.createObjectURL(new Blob([patch], { type: 'text/x-diff' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    // Some browsers read the blob after click returns.
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  },

  /** Opens the system file picker and resolves with the chosen file, or null. */
  pickFile: () =>
    new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = PATCH_EXTENSIONS.join(',');
      input.addEventListener('change', () => resolve(input.files?.[0] ?? null));
      input.addEventListener('cancel', () => resolve(null));
      input.click();
    }),
};
