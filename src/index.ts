import { createAction } from 'redux-act'
import { actions, fs, Icon, log, types, selectors, util } from 'vortex-api';
import { IExtensionContext } from 'vortex-api/lib/types/api';

import { GAME_ID, ID_CASC_VIEW, ID_D2_EXCEL, ID_MPQ_EDITOR, ID_D2_LAUNCHER, VORTEX_MERGED_MOD } from './constants';
import { testDefaultMod, installDefaultMod } from './installers';

import { ensureMergedEntry, removeMergedEntry } from './mergedMod';

import { testMerge, merge, resetMergeData } from './mergers';

import path from 'path';
import download from 'download-git-repo';

import winapi from 'winapi-bindings';
import { setD2RParameters } from './util';
import React from 'react';

const TOOL_URL = 'HighTechLowIQ/ModdingDiablo2Resurrected';
const supportedTools: any[] = [
  {
    id: ID_D2_LAUNCHER,
    name: 'Mod Launcher',
    logo: 'D2R.exe',
    executable: () => 'D2R.exe',
    parameters: [],
    requiredFiles: ['D2R.exe'],
    defaultPrimary: true,
    relative: true,
  },
  {
    id: ID_D2_EXCEL,
    name: 'D2 Excel',
    logo: 'Tools/D2Excel v1.0/D2Excel v1.0/D2Excel.exe',
    executable: () => 'Tools/D2Excel v1.0/D2Excel v1.0/D2Excel.exe',
    requiredFiles: [
      'Tools/D2Excel v1.0/D2Excel v1.0/D2Excel.exe',
    ],
    relative: true,
  },
  {
    id: ID_CASC_VIEW,
    name: 'Ladiks Casc Viewer',
    logo: 'Tools/Ladiks Casc Viewer/Ladiks Casc Viewer/x64/CascView.exe',
    executable: () => 'Tools/Ladiks Casc Viewer/Ladiks Casc Viewer/x64/CascView.exe',
    requiredFiles: [
      'Tools/Ladiks Casc Viewer/Ladiks Casc Viewer/x64/CascView.exe',
    ],
    relative: true,
  },
  {
    id: ID_MPQ_EDITOR,
    name: 'MPQ Editor',
    logo: 'Tools/mpqeditor_en/x64/MPQEditor.exe',
    executable: () => 'Tools/mpqeditor_en/x64/MPQEditor.exe',
    requiredFiles: [
      'Tools/mpqeditor_en/x64/MPQEditor.exe',
    ],
    relative: true,
  }
];

// actions
const setInfoSeen = createAction('D2R_INFO_SEEN',
  (profileId: string, time: number) => ({ profileId, time }));

const setActiveMPQ = createAction('D2R_ACTIVE_MPQ',
  (profileId: string, modId: string) => ({ profileId, modId }));

// reducer
const reducer: types.IReducerSpec = {
  reducers: {
    [setInfoSeen as any]: (state, payload) => {
      const { profileId, time } = payload;
      return util.setSafe(state, ['infoSeen', profileId], { time });
    },
  },
  defaults: {
    infoSeen: {},
  },
};

function queryPath(): any {
  try {
    const instPath = winapi.RegGetValue(
      'HKEY_LOCAL_MACHINE',
      'Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Diablo II Resurrected',
      'InstallLocation');
    if (!instPath) {
      throw new Error('empty registry key');
    }
    return instPath.value;
  } catch (err) {
    return Promise.reject(err);
  }
}

async function prepareForModding(api: types.IExtensionApi, discovery: types.IDiscoveryResult) {
  const toolsDir = path.join(discovery.path, 'Tools');
  await fs.ensureDirWritableAsync(path.join(discovery.path, 'mods'));
  try {
    await fs.statAsync(toolsDir);
  } catch (err) {
    await getTools(discovery.path);
    const archives = await fs.readdirAsync(toolsDir);
    const seven = new util.SevenZip();
    for (const arc of archives) {
      const src = path.join(toolsDir, arc);
      const dest = path.join(toolsDir, path.basename(arc, path.extname(arc)));
      await fs.ensureDirWritableAsync(dest);
      await seven.extractFull(src, dest);
      if (dest.includes('Ladiks Casc Viewer')) {
        const nestedPath = path.join(toolsDir, path.basename(arc, path.extname(arc)), 'Ladiks Casc Viewer');
        const nested = await fs.readdirAsync(nestedPath);
        const nestedArc = nested.find(file => file.startsWith('cascview_en'));
        await seven.extractFull(path.join(nestedPath, nestedArc), nestedPath);
      }
    }
  }

  const state = api.getState();
  const profile = selectors.lastActiveProfileForGame(state, GAME_ID);
  if (!api.getState().settings['diablo2resurrection']?.infoSeen?.[profile.id]) {
    api.sendNotification({
      type: 'info',
      noDismiss: true,
      message: 'Diablo 2 Resurrection Important Information',
      actions: [
        { title: 'More', action: (dismiss) => {
          dismiss();
          api.store.dispatch(setInfoSeen(profile.id, Date.now()));
          api.showDialog('info', 'Diablo 2: Resurrection game support', {
            text: 'Lets keep this brief - this game extension only supports MPQ mods (no loose files). Only one MPQ '
                + 'mod can be active at any time (blame the game) - you can select which one by right clicking the mod you want to activate '
                + 'in the mods page and select "D2R Make Active". Vortex has an experimental mods merging functionality - you can extract '
                + 'MPQ mods during their installation which will make them mergeable. Merging mods can get complex depending on the mods you have '
                + 'installed! Enjoy.',
          }, [ { label: 'Close' } ])
        }}
      ]
    });
  }
}

function isD2R(gameId: string) {
  return gameId === GAME_ID;
}

function isMPQMod(mod: types.IMod) {
  return (mod?.type === 'd2-mpq-mod' || mod.attributes.mpqName === path.basename(VORTEX_MERGED_MOD, path.extname(VORTEX_MERGED_MOD)));
}

function main(context: IExtensionContext) {
  context.registerReducer(['settings', 'diablo2resurrection'], reducer);
  context.registerGame({
    id: GAME_ID,
    name: 'Diablo II:\tResurrected',
    mergeMods: true,
    queryPath,
    queryModPath: () => '.',
    logo: 'gameart.jpg',
    executable: () => 'D2R.exe',
    setup: discovery => prepareForModding(context.api, discovery),
    supportedTools,
    requiredFiles: [
      'D2R.exe',
    ],
  });

  const getMPQPath = (game: types.IGame) => {
    const state = context.api.store.getState();
    const discovery = state.settings.gameMode.discovered[game.id];
    return path.join(discovery.path, 'mods');
  };

  context.registerModType('d2-mpq-mod', 25, isD2R, getMPQPath,
    () => Promise.resolve({ supported: false }), { name: 'MPQ Mod' });

  context.registerModType('d2-merge-mod', 25, isD2R, getMPQPath,
    () => Promise.resolve({ supported: false }), { name: 'Merge Mod' });

  context.registerInstaller('d2-mod-installer', 25, testDefaultMod,
    (files: string[], destinationPath: string, gameId: string) =>
      installDefaultMod(context.api, files, destinationPath, gameId));

  context.registerMerge((game: types.IGame, discovery: types.IDiscoveryResult) => testMerge(context.api, game, discovery),
    (filePath: string, mergePath: string) => merge(context.api, filePath, mergePath), 'd2-merge-mod');

  context.registerAction('mods-action-icons', 999, 'resume', {}, 'D2R Make Active', instanceIds => {
    const state = context.api.getState();
    const modId = instanceIds[0];
    const mod: types.IMod = state.persistent.mods[GAME_ID]?.[modId];
    if (mod?.attributes?.mpqName !== undefined && isMPQMod(mod)) {
      const profile = selectors.activeProfile(state);
      if (util.getSafe(profile, ['modState', mod.id, 'enabled'], false)) {
        setD2RParameters(context.api, ['-mod', mod.attributes.mpqName]);
        const mods: { [modId: string]: types.IMod } = state.persistent.mods[GAME_ID] || {};
        Object.keys(mods).forEach(key => {
          context.api.store.dispatch(actions.setModAttribute(GAME_ID, key, 'isActiveMPQ', key === modId));
        })
      }
    }
  }, instanceIds => {
    const modId = instanceIds[0];
    const state = context.api.store.getState();
    const mod: types.IMod = state.persistent.mods[GAME_ID]?.[modId];
    const profile = selectors.activeProfile(state);
    return profile?.gameId === GAME_ID && isMPQMod(mod) && (util.getSafe(profile, ['modState', modId, 'enabled'], false));
  });

  context.registerTableAttribute('mods', {
    id: 'd2activempq',
    name: 'Active MPQ Mod',
    description: 'The currently active MPQ mod for Diablo II: Resurrected',
    icon: 'resume',
    placement: 'table',
    calc: (mod: types.IMod) => util.getSafe(mod, ['attributes', 'isActiveMPQ'], false),
    customRenderer: (mod: types.IMod) => util.getSafe(mod, ['attributes', 'isActiveMPQ'], false) ? React.createElement(Icon, { name: 'resume' }, []) : null,
    isToggleable: false,
    edit: {},
    isSortable: false,
    isGroupable: false,
    isDefaultVisible: true,
  });
  context.once(() => {
    context.api.onAsync('did-deploy', async (profileId, deployment) => {
      resetMergeData();
      const state = context.api.getState();
      const profile = selectors.profileById(state, profileId);
      if (profile?.gameId !== GAME_ID) {
        return Promise.resolve();
      }

      const mods = state.persistent.mods[GAME_ID];
      const valid = Object.keys(mods).filter(id => mods[id].type === 'd2-merge-mod' && util.getSafe(profile, ['modState', id, 'enabled'], false));
      if (valid.length > 0) {
        return ensureMergedEntry(context.api);
      } else {
        return removeMergedEntry(context.api);
      }
    });
  });
  return true;
}

async function getTools(destination: string): Promise<void> {
  return new Promise((resolve, reject) =>
    download(TOOL_URL, destination, (err) => err ? reject(err) : resolve()));
}

module.exports = {
  default: main,
};
