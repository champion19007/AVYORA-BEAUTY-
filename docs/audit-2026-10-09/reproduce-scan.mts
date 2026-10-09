// Audit-only in-memory database/storage. No production data or real photos.
import sharp from 'sharp';
import { createMigratedDb } from '../../src/test/migrated-db';
import { grantConsent } from '../../src/modules/personal/personal-records';
import { createHostedScan, uploadScanImage, getScan } from '../../src/modules/scans/sessions';
import { scanObjectKey, type PrivateStorage } from '../../src/modules/scans/private-storage';

async function main() {
 const ctx=await createMigratedDb();
 try {
  const db=ctx.db as never;
  const owner={kind:'user' as const,userId:'audit-synthetic'};
  await ctx.client.exec("INSERT INTO users(id,email) VALUES('audit-synthetic','audit@example.test')");
  await grantConsent(db,owner,'photo_processing','audit-synthetic-v1');
  const scan=await createHostedScan(db,owner,null);
  if(!scan.ok)throw Error(scan.code);
  const objects=new Map<string,Uint8Array>();
  let putCount=0;
  let release!:()=>void;
  const barrier=new Promise<void>(resolve=>{release=resolve});
  const storage:PrivateStorage={kind:'audit-memory',async put(key,bytes){objects.set(key,bytes);if(++putCount===2)release();await barrier},async get(key){return objects.get(key)??null},async delete(key){objects.delete(key)}};
  const image=new Uint8Array(await sharp({create:{width:640,height:480,channels:3,background:{r:120,g:110,b:100}}}).jpeg().toBuffer());
  const results=await Promise.all([uploadScanImage(db,storage,owner,scan.id,image),uploadScanImage(db,storage,owner,scan.id,image)]);
  console.log(JSON.stringify({results,finalSession:await getScan(db,owner,scan.id),storedPhotoExists:objects.has(scanObjectKey(scan.id))},null,2));
 } finally {await ctx.client.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
