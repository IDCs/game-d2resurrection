import path from 'path';
import { fs, types, selectors, util } from 'vortex-api';
import { IDeployedFile } from 'vortex-api/lib/types/IExtensionContext';

import { createMPQ, addToMPQ } from './util';

import { GAME_ID, VORTEX_MERGED_MOD } from './constants';
export function testMerge(api: types.IExtensionApi, game: types.IGame, discovery: types.IDiscoveryResult): types.IMergeFilter {
  if (game.id !== GAME_ID) {
    return undefined;
  }

  const state = api.getState();
  const stagingFolder = selectors.installPathForGame(state, GAME_ID);
  const stagingSegLength = stagingFolder.split(path.sep).length;
  const dataIdx = stagingSegLength + 1;

  return {
    baseFiles: (deployedFiles: IDeployedFile[]) => [],
    filter: (filePath: string) => {
      const segments = path.dirname(filePath).split(path.sep);
      return segments[dataIdx] && segments[dataIdx].toLowerCase() === 'data';
    },
  }
}

let _MERGED = [];
export function resetMergeData() {
  _MERGED = [];
}

export async function merge(api: types.IExtensionApi, filePath: string, mergePath: string): Promise<void> {
  const staging = selectors.installPathForGame(api.getState(), GAME_ID);
  const idx = staging.split(path.sep).length + 1;
  const dirPath = filePath.split(path.sep).slice(0, idx).join(path.sep);
  if (_MERGED.includes(dirPath)) {
    // Already merged this mod.
    return Promise.resolve();
  }
  _MERGED.push(dirPath);
  const mergedModPath = path.join(mergePath, path.basename(VORTEX_MERGED_MOD, path.extname(VORTEX_MERGED_MOD)), VORTEX_MERGED_MOD);
  try {
    await fs.statAsync(mergedModPath);
  } catch (err) {
    await fs.ensureDirWritableAsync(path.dirname(mergedModPath));
    await createMPQ(api, mergedModPath);
    await addToMPQ(api, mergedModPath, path.join(__dirname, 'modinfo'));
  }

  return addToMPQ(api, mergedModPath, dirPath);
}