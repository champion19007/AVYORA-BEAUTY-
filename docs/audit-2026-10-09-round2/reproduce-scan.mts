// Disposable PGlite and in-memory images only. No external database or real photo.
import sharp from 'sharp';
import { createMigratedDb } from '../../src/test/migrated-db';
import { grantConsent } from '../../src/modules/personal/personal-records';
import { createHostedScan, uploadScanImage, getScan, discardUnprocessedPhoto } from '../../src/modules/scans/sessions';
import type { PrivateStorage } from '../../src/modules/scans/private-storage';
const ctx=await createMigratedDb();
try {
 const db=ctx.db as never;
 const owner={kind:'user' as const,userId:'audit-round2'};
 await ctx.client.exec("INSERT INTO users(id,email) VALUES('audit-round2','audit-round2@example.test')");
 await grantConsent(db,owner,'photo_processing','synthetic');
 const created=await createHostedScan(db,owner,null);
 if(!created.ok)throw Error(created.code);
 const objects=new Map<string,Uint8Array>();
 let puts=0; let release!:()=>void; const barrier=new Promise<void>(r=>release=r);
 const storage:PrivateStorage={kind:'audit-memory',async put(key,bytes){objects.set(key,bytes);if(++puts===2)release();await barrier},async get(key){return objects.get(key)??null},async delete(key){objects.delete(key)},async list(){return [...objects.keys()].map(key=>({key,modifiedAt:new Date()}))}};
 const image=new Uint8Array(await sharp({create:{width:640,height:480,channels:3,background:{r:120,g:110,b:100}}}).jpeg().toBuffer());
 const uploads=await Promise.all([uploadScanImage(db,storage,owner,created.id,image),uploadScanImage(db,storage,owner,created.id,image)]);
 const winner=(await ctx.client.query<{object_key:string}>('SELECT object_key FROM scan_sessions WHERE id=$1',[created.id])).rows[0];
 const winnerPreserved=objects.has(winner.object_key);
 const failing={...storage,async delete(){throw Error('SYNTHETIC storage failure')}};
 const deleted=await discardUnprocessedPhoto(db,failing,created.id);
 const status=await getScan(db,owner,created.id);
 console.log(JSON.stringify({uploads,winnerPreserved,objectCount:objects.size,discardConfirmed:deleted,statusAfterFailedDelete:status,storedPhotoStillExists:objects.has(winner.object_key),statusExposesPhotoDeletion:status!==null&&'photo' in status},null,2));
} finally {await ctx.client.close()}
