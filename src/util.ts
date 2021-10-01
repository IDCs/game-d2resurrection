import path from 'path';
import { spawn } from 'child_process';
import { actions, log, types, util } from 'vortex-api';

import fs from 'fs/promises';
import { Dirent } from 'fs';

import { GAME_ID, ID_D2_LAUNCHER, ID_MPQ_EDITOR } from './constants';

export async function extractMPQ(api: types.IExtensionApi, mpqFilePath: string, destPath: string) {
  return run(api, ['e', quote(mpqFilePath), '*.*', quote(destPath), '/fp']);
}

export async function addToMPQ(api: types.IExtensionApi, mpqFilePath: string, srcPath: string, recursive?: boolean) {
  return (recursive === false)
    ? run(api, ['a', quote(mpqFilePath), quote(srcPath)])
    : run(api, ['a', quote(mpqFilePath), quote(srcPath), '/r']);
}

export async function createMPQ(api: types.IExtensionApi, mpqFilePath: string) {
  return run(api, ['n', quote(mpqFilePath)]);
}

function getMPQExecPath(api: types.IExtensionApi) {
  const state = api.getState();
  const discovery = state.settings.gameMode.discovered[GAME_ID];
  return discovery?.tools?.[ID_MPQ_EDITOR]?.path;
}

function quote(input: string): string {
  return '"' + input + '"';
}

async function run(api: types.IExtensionApi, args: string[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let isClosed = false;
    let process;
    try {
      process = spawn(quote(getMPQExecPath(api)), args, { shell: true });
    } catch (err) {
      return reject(err);
    }

    process.on('error', (err) => {
      isClosed = true;
      return reject(err);
    });

    process.stdout.on('data', data => {
      const formatted = data.toString().split('\n');
      formatted.forEach(line => {
        log('debug', 'MPQ operation output', line);
      });
    });

    process.stderr.on('data', data => {
      const formatted = data.toString().split('\n');
      formatted.forEach(line => {
        log('error', 'failed to run MPQ operation', line);
      });
    });

    process.on('close', (code, signal) => {
      isClosed = true;
      if (code !== 0) {
        return reject(new Error(`MPQEditor exited with code ${code}`));
      }

      return resolve();
    });
  })
}

export async function* walk(rootPath: string): AsyncIterableIterator<string> {
	const directories: Dirent[] = await fs.readdir(rootPath, { withFileTypes: true });
	for (const dir of directories) {
		const fullPath = path.resolve(rootPath, dir.name);
		if (dir.isDirectory()) {
			yield* walk(fullPath);
		} else {
			yield fullPath;
		}
	}
}

export function setD2RParameters(api: types.IExtensionApi, parameters: string[]) {
  const state = api.store.getState();
  const discovery: types.IDiscoveryResult = util.getSafe(state,
    ['settings', 'gameMode', 'discovered', GAME_ID], undefined);

  createD2RTool(api, discovery, parameters);
}
export function createD2RTool(api: types.IExtensionApi, discovery: types.IDiscoveryResult, parameters: string[]) {
  api.store.dispatch(actions.addDiscoveredTool(GAME_ID, ID_D2_LAUNCHER, {
    id: ID_D2_LAUNCHER,
    name: 'Mod Launcher',
    logo: path.join(__dirname, 'gameart.jpg'),
    executable: (gamePath) => path.join(gamePath, 'D2R.exe'),
    parameters: parameters,
    requiredFiles: [],
    path: path.join(discovery.path, 'D2R.exe'),
    hidden: false,
    custom: false,
    workingDirectory: discovery.path,
    defaultPrimary: true,
  }, true));
}
