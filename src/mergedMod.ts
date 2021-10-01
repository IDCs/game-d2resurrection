import path from 'path';
import { actions, log, types } from 'vortex-api';

import { VORTEX_MERGED_MOD, GAME_ID } from './constants';

export async function createMergedEntry(api: types.IExtensionApi, modName: string): Promise<void> {
  const mod = {
    id: modName,
    state: 'installed',
    attributes: {
      name: 'Diablo 2 Merged Mod',
      description: 'This is a "dummy" mod entry that can be used to modify the '
                 + 'Diablo 2 mod launcher to start up the mergedvortex mod. '
                 + 'Vortex has created an MPQ bundle containing one or more mods; '
                 + 'to run this bundle, please right click the mod entry in the mods table '
                 + 'and select "D2R Make Active" before launching the game through the top left play button',
      logicalFileName: 'Diablo 2 Merged Mod',
      modId: 42, // Meaning of life
      version: '1.0.0',
      installTime: new Date(),
      mpqName: path.basename(VORTEX_MERGED_MOD, path.extname(VORTEX_MERGED_MOD)),
    },
    installationPath: modName,
    type: '',
  };

  return new Promise((resolve, reject) => {
    api.events.emit('create-mod', GAME_ID, mod, async (error) => {
      if (error !== null) {
        return reject(error);
      }
      resolve();
    });
  });
}

export async function ensureMergedEntry(api: types.IExtensionApi) {
  const state = api.store.getState();
  const modName = path.basename(VORTEX_MERGED_MOD, path.extname(VORTEX_MERGED_MOD));
  const mod = state.persistent.mods[GAME_ID]?.[modName];
  if (mod === undefined) {
    try {
      await createMergedEntry(api, modName);
    } catch (err) {
      return Promise.reject(err);
    }
  }
  return Promise.resolve(modName);
}

export async function removeMergedEntry(api: types.IExtensionApi): Promise<void> {
  const state = api.store.getState();
  const modName = path.basename(VORTEX_MERGED_MOD, path.extname(VORTEX_MERGED_MOD));
  const mod = state.persistent.mods[GAME_ID]?.[modName];
  if (mod === undefined) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    api.events.emit('remove-mod', GAME_ID, mod.id, async (error) => {
      if (error !== null) {
        // The fact that we're attempting to remove the aggregated menu mod means that
        //  the user no longer has any menu mods installed and therefore it's safe to
        //  ignore any errors that may have been raised during removal.
        // The main problem here is the fact that users are actively messing with
        //  the menu mod we generate causing odd errors to pop up.
        log('error', 'failed to remove menu mod', error);
        // return reject(error);
      }
      return resolve();
    });
  });
}
