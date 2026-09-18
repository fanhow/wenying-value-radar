import {readdir,readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import {resolve,join,relative,sep} from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';

// Optimize only disposable build output. Original public assets and URLs stay intact.
const root=resolve('dist/client');
const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
async function list(directory) {
  const files=[];
  for(const item of await readdir(directory,{withFileTypes:true})) {
    const path=join(directory,item.name);
    if(item.isDirectory())files.push(...await list(path));
    else if(item.isFile()&&item.name.endsWith('.png'))files.push(path);
  }
  return files.sort();
}
const rows=[];
for(const path of await list(root)) {
  if(!path.startsWith(root+sep))throw new Error('BUILD_PATH_OUTSIDE_TARGET');
  const original=await readFile(path);
  const useWebp=relative(root,path).replaceAll('\\','/').startsWith('real-cases/');
  const opaque=(await sharp(original,{failOn:'error'}).stats()).isOpaque;
  let encoder=sharp(original,{failOn:'error'}).keepMetadata();
  if(opaque)encoder=encoder.removeAlpha();
  // Explicit full-colour output: palette quantisation can change chart pixels.
  const optimized=useWebp
    ? await encoder.webp({lossless:true,exact:true,effort:6}).toBuffer()
    : await encoder.png({compressionLevel:9,adaptiveFiltering:false,palette:false}).toBuffer();
  const decode=buffer=>sharp(buffer,{failOn:'error'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const [before,after]=await Promise.all([decode(original),decode(optimized)]);
  if(before.info.width!==after.info.width||before.info.height!==after.info.height||before.info.channels!==after.info.channels||!before.data.equals(after.data))throw new Error(`PIXEL_VERIFICATION_FAILED: ${relative(root,path)}`);
  const chosen=useWebp||optimized.length<original.length?optimized:original;
  const outputPath=useWebp?path.replace(/\.png$/,'.webp'):path;
  if(chosen!==original)await writeFile(outputPath,chosen);
  // Only remove the verified disposable build copy; never touch public originals.
  if(useWebp) {
    if(!resolve(path).startsWith(resolve(root,'real-cases')+sep))throw new Error('REMOVAL_OUTSIDE_BUILD_CASES');
    await unlink(path);
  }
  rows.push({path:relative(root,path).replaceAll('\\','/'),outputPath:relative(root,outputPath).replaceAll('\\','/'),width:before.info.width,height:before.info.height,
    originalBytes:original.length,optimizedBytes:chosen.length,originalSha256:sha(original),optimizedSha256:sha(chosen),decodedRgbaSha256:sha(before.data),pixelsIdentical:true});
}
const report={generatedAt:new Date().toISOString(),count:rows.length,
  originalBytes:rows.reduce((n,r)=>n+r.originalBytes,0),optimizedBytes:rows.reduce((n,r)=>n+r.optimizedBytes,0),rows};
await mkdir('outputs',{recursive:true});
await writeFile('outputs/png-compression-report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({event:'lossless-png-optimization',count:report.count,originalBytes:report.originalBytes,optimizedBytes:report.optimizedBytes,allPixelsIdentical:rows.every(r=>r.pixelsIdentical)}));
