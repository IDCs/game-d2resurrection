import path from 'path';
import { fs, types, util } from 'vortex-api';
import { GAME_ID, MPQ_EXT, MERGED_MOD_INFO } from './constants';
import { extractMPQ, walk } from './util';

export function testDefaultMod(files: string[], gameId: string): Promise<types.ISupportedResult> {
  return Promise.resolve({ supported: gameId === GAME_ID && !!files.find(file => path.extname(file) === MPQ_EXT), requiredFiles: [] });
}

export async function installDefaultMod(api: types.IExtensionApi, files: string[], destinationPath: string, gameId: string): Promise<types.IInstallResult> {
  const mpqs = files.filter(file => path.extname(file) === MPQ_EXT);
  const dialogActions: types.IDialogAction[] = [{ label: 'Cancel' }, { label: 'Extract' }, { label: 'Copy/Deploy' }];
  return api.showDialog('question', 'Choose How to Install', {
    bbcode: 'The mod you are trying to install consists of one or more MPQ mods. '
          + 'Vortex will allow you to install ("Copy"/"Deploy") these directly into their relevant '
          + 'directories inside the Mods folder, but please be aware you can only run '
          + 'the game with one of these at a time by right clicking on the mod entry in '
          + 'the mods page.{{bl}}'
          + 'Alternatively, Vortex can extract the MPQ file/s and attempt to merge them '
          + 'alongside any other MPQs that are stored in extracted form, allowing you to '
          + 'mix and match several mods together; but please be aware that you may encounter '
          + 'game breaking file conflicts depending on the mods you are attempting to merge. ',
    parameters: { bl: '[br][/br][br][/br]' },
  }, dialogActions).then(async (result: types.IDialogResult) => {
    if (result.action === 'Cancel') {
      return Promise.reject(new util.UserCanceled());
    }

    if (result.action === 'Copy/Deploy') {
      const instructions: types.IInstruction[] = files.reduce((accum, file) => {
        if (accum.length === 0) {
          accum.push({ type: 'setmodtype', value: 'd2-mpq-mod' });
        }
        if (path.extname(file) === MPQ_EXT) {
          accum.push({
            type: 'copy',
            source: file,
            destination: path.join(path.basename(file, path.extname(file)), path.basename(file)),
          })

          accum.push({ type: 'attribute', key: 'mpqName', value: path.basename(file, path.extname(file)) });
        }
        return accum;
      }, []);
      return Promise.resolve({ instructions });
    }

    if (result.action === 'Extract') {
      const out = path.join(destinationPath, 'out');
      await fs.ensureDirWritableAsync(out);
      for (const mpqFile of mpqs) {
        const mpqFilePath = path.join(destinationPath, mpqFile);
        const stats : fs.Stats = await fs.statAsync(mpqFilePath);
        if (stats.isFile()) {
          await extractMPQ(api, mpqFilePath, out);
        } else if (stats.isDirectory()) {
          await fs.copyAsync(mpqFilePath, out);
        }
      }

      const instructions: types.IInstruction[] = [{ type: 'setmodtype', value: 'd2-merge-mod' }];
      for await (const iter of walk(out)) {
        if (iter.toLowerCase().endsWith(MERGED_MOD_INFO)) {
          // Do not include the modinfo.json file of the mod (we will use our own)
          continue;
        }
        if (!!path.extname(iter)) {
          const relPath = path.relative(out, iter);
          const data = await fs.readFileAsync(iter);
          instructions.push({
            type: 'generatefile',
            data,
            destination: relPath,
          });
        }
      }

      return Promise.resolve({ instructions });
    }
  })
}

export function testLooseMod(files: string[], gameId: string): Promise<types.ISupportedResult> {
  return Promise.resolve({ supported: gameId === GAME_ID && !files.find(file => path.extname(file) === MPQ_EXT)
    && !!files.find(file => path.basename(file) === 'data'), requiredFiles: [] });
}

export async function installLooseMod(api: types.IExtensionApi, files: string[], destinationPath: string, gameId: string): Promise<types.IInstallResult> {
 const instructions: types.IInstruction[] = files.reduce((accum, file) => {
   if (accum.length === 0) {
     accum.push({ type: 'setmodtype', value: 'd2-merge-mod' });
    }
    if (path.basename(file) === 'data') {
       accum.push({
        type: 'copy',
        source: file,
        destination: path.basename(file)
      })
    }
    return accum;
  }, []);
  return Promise.resolve({ instructions });
}
