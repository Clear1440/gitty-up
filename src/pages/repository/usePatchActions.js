import { App } from 'antd';
import { gitApi } from '../../api';
import { PatchHelper } from './patches.js';
import { useRepositoryContext } from './RepositoryContext.js';

/**
 * Making and applying patches. `savePatch` takes what `gitApi.createPatch` does and
 * downloads the result. `openPatchFile` reads a file and asks how to apply it.
 */
export function usePatchActions() {
  const { repository, openDialog } = useRepositoryContext();
  const { message } = App.useApp();

  const savePatch = async (source) => {
    try {
      const result = await gitApi.createPatch(repository.id, source);
      PatchHelper.download(result);
      message.success(`Saved ${result.fileName}`);
    } catch (error) {
      message.error(error.message);
    }
  };

  const openPatchFile = async (file) => {
    if (!file) return;
    const patch = await file.text();
    if (!patch.trim()) {
      message.error(`${file.name} is empty`);
      return;
    }
    openDialog('applyPatch', { name: file.name, patch });
  };

  const pickPatchFile = async () => openPatchFile(await PatchHelper.pickFile());

  return { savePatch, openPatchFile, pickPatchFile };
}
