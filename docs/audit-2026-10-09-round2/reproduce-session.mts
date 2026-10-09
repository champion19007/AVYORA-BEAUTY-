// Synthetic network responses; no server, account or database access.
import { PRODUCTS } from '../../src/data/mock-data';
import { catalogRecords } from '../../src/modules/catalog/catalog-records';
import { compileRelease } from '../../src/modules/knowledge/compile';
import { productionInput } from '../../src/modules/knowledge/production-input';
import { computeRoutine } from '../../src/modules/personalization/core/routine';
import { RoutineSession } from '../../src/app/routine-finder/routine-session';
import { resetQuoteClient } from '../../src/lib/quote-client';
const compiled=compileRelease(productionInput().input,{fixture:false});
if(!compiled.ok)throw Error(compiled.errors.join(';'));
const release={manifest:compiled.release.manifest,artifacts:Object.fromEntries(Object.entries(compiled.release.artifacts).map(([k,v])=>[k,JSON.parse(v)]))};
const profile:any={schemaVersion:2,skinType:'dry',pregnancy:'no',nursing:'no',currentlyIrritated:'no',reactivity:'low',ageBand:'adult',allergyHistory:'no',allergyIngredientIds:[],prescribedTreatment:'no',priorities:['dryness_reported'],budgetPaise:100000,maxDailySteps:3,ownedItems:[],experience:'new',adherence:'medium',preferences:{eyeCare:false,bodyCare:false}};
const {variants}=catalogRecords(PRODUCTS);
const offers=Object.fromEntries(variants.map(v=>[v.id,{pricePaise:10000,stock:10}]));
const saved=computeRoutine({profile,release,products:PRODUCTS,offers});
let price=10000;let failQuote=false;
const fetchImpl:any=async(url:string)=>{
 if(url.startsWith('/api/routines/'))return Response.json({routine:{id:'synthetic-saved',validity:'current',expiresAt:'2026-12-01T00:00:00Z',profile,result:saved,kbRelease:saved.kbRelease}});
 if(url.startsWith('/api/catalog/release'))return Response.json({...release,published:true});
 if(url.startsWith('/api/catalog/availability')){
  if(failQuote)throw Error('SYNTHETIC disconnected');
  return Response.json({prices:Object.fromEntries(variants.map(v=>[v.legacyStockKey,{price,wasPrice:null,offerLabel:null}])),stock:Object.fromEntries(variants.map(v=>[v.legacyStockKey,10])),quoteVersion:'synthetic',validUntil:new Date(Date.now()+60000).toISOString()});
 }
 throw Error('Unexpected synthetic request');
};
resetQuoteClient();
const session=new RoutineSession(fetchImpl);
await session.loadSaved('synthetic-saved');
const before=session.getState();
price=15000;resetQuoteClient();
await session.setBudget(90000);
const after=session.getState();
failQuote=true;resetQuoteClient();
const failedSession=new RoutineSession(fetchImpl);await failedSession.loadSaved('synthetic-saved');
const failed=failedSession.getState();
console.log(JSON.stringify({
 savedThenRecomputed:{previousQuotePaise:before.quote?.[0].currentPaise,newPurchasePaise:after.result?.purchaseList[0]?.pricePaise,retainedQuotePaise:after.quote?.[0]?.currentPaise,savedView:after.saved,phase:after.phase},
 failedSavedQuote:{phase:failed.phase,error:failed.error,quote:failed.quote,pricesExpireAt:failed.pricesExpireAt,stock:failed.stock,historicalPurchaseList:failed.result?.purchaseList}
},null,2));
