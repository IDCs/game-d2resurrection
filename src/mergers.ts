import path from 'path';
import { fs, types, selectors, util } from 'vortex-api';
import { IDeployedFile } from 'vortex-api/lib/types/IExtensionContext';

import { createMPQ, addToMPQ } from './util';

import { GAME_ID, VORTEX_MERGED_MOD } from './constants';
let _MOD_DIR_PATHS = [];
export function testMerge(api: types.IExtensionApi, game: types.IGame, discovery: types.IDiscoveryResult): types.IMergeFilter {
  if (game.id !== GAME_ID) {
    return undefined;
  }

  const state = api.getState();
  const stagingFolder = selectors.installPathForGame(state, GAME_ID);
  const stagingSegLength = stagingFolder.split(path.sep).length;
  const mods: { [modId: string]: types.IMod } = util.getSafe(state, ['persistent', 'mods', GAME_ID], {});
  const profile = selectors.lastActiveProfileForGame(game.id);
  const enabled = Object.keys(mods).filter(id => mods[id].type === 'd2-merge-mod' && util.getSafe(profile, ['modState', id, 'enabled'], false));
  return {
    baseFiles: (deployedFiles: IDeployedFile[]) => enabled.map(id =>
      ({ 
        in: path.join(stagingFolder, mods[id].installationPath),
        out: path.basename(VORTEX_MERGED_MOD, path.extname(VORTEX_MERGED_MOD))
      })),
    filter: (filePath: string) => {
      const segments = path.dirname(filePath).split(path.sep);
      if (_MOD_DIR_PATHS.includes(segments.join(path.sep))) {
        return false;
      }
      if (stagingSegLength + 1 === segments.length) {
        _MOD_DIR_PATHS.push(segments.join(path.sep));
        return true;
      }
       return false;
    },
  }
}

export async function merge(api: types.IExtensionApi, filePath: string, mergePath: string): Promise<void> {
  _MOD_DIR_PATHS = [];
  const dirPath = path.dirname(filePath);
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