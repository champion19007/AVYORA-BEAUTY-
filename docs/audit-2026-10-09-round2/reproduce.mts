// Audit-only synthetic records. Not product data or clinical guidance.
import { readFileSync } from 'node:fs';
import { PRODUCTS } from '../../src/data/mock-data';
import { catalogRecords } from '../../src/modules/catalog/catalog-records';
import { selectProducts } from '../../src/modules/personalization/core/selection';
import { planWeek } from '../../src/modules/personalization/core/planner';
import { previewOnboarding } from '../../src/modules/catalog/onboarding';
import { reportError } from '../../src/lib/observability';

const profile:any={pregnancy:'no',nursing:'no',currentlyIrritated:'no',reactivity:'low',ageBand:'adult',allergyHistory:'no',allergyIngredientIds:[],prescribedTreatment:'no',priorities:['dryness'],budgetPaise:30000,maxDailySteps:4,ownedItems:[]};
const template=PRODUCTS.find(p=>p.id==='ceramide-cream')!;
const evidence:any=[{id:'audit',title:'SYNTHETIC ONLY',url:null,sourceType:'formulation_dossier',retrievedAt:'2026-10-09',limitations:'Synthetic test'}];
const formulation=(id:string,coverage='complete')=>({productId:id,version:1,coverage,fullInci:coverage==='complete'?'Retinol':null,ingredients:[{position:1,inciLabel:'Retinol',ingredientId:'retinol',concentration:{known:true,value:0.2,unit:'percent_w_w'}}],sourceId:'audit',reviewedBy:'AUDIT SYNTHETIC',reviewedAt:'2026-10-09'});
const direction:any={session:'pm',frequency:'SYNTHETIC twice weekly',text:'Synthetic only',reviewedBy:'AUDIT',reviewedAt:'2026-10-09',source:'audit',formulationVersion:1,maxWeeklyUses:2,evidenceIds:['audit']};
const select=(products:any[],roles:any,knowledge:any,patch:any={},safety:any={excludedClasses:[],maxTreatments:null,ruleIds:[]},prices:any={})=>{
 const {variants}=catalogRecords(products);
 const offers=Object.fromEntries(variants.map(v=>[v.id,{pricePaise:prices[v.productId]??10000,stock:10}]));
 return selectProducts({profile:{...profile,...patch},products,variants,roles,treatments:{},knowledge,interactions:[],safety,offers});
};
const cream={...template,id:'synthetic-active-cream',slug:'synthetic-active-cream',ingredients:['Glycerin']};
const activeKnowledge:any={formulations:[formulation(cream.id)],evidence,directions:{[cream.id]:direction}};
const activeSelection=select([cream],{[cream.id]:'moisturise'},activeKnowledge,{prescribedTreatment:'yes'},{excludedClasses:['retinoid'],maxTreatments:0,ruleIds:['synthetic-retinoid-exclusion']});
const activePlan=planWeek(activeSelection,{products:[cream],knowledge:activeKnowledge,interactions:[],treatments:{},ownedItems:[],currentlyIrritated:'no',maxDailySteps:4,templates:[]});
const partialKnowledge:any={...activeKnowledge,formulations:[formulation(cream.id,'partial')]};
const partialSelection=select([cream],{[cream.id]:'moisturise'},partialKnowledge,{currentlyIrritated:'yes'});

const cleanse={...template,id:'synthetic-cleanse',slug:'synthetic-cleanse',ingredients:[],concerns:[]};
const protect={...template,id:'synthetic-protect',slug:'synthetic-protect',ingredients:[],concerns:[]};
const creams=Array.from({length:11},(_,i)=>({...template,id:`synthetic-cream-${i}`,slug:`synthetic-cream-${i}`,ingredients:[],concerns:i<10?['dryness']:[]}));
const budgetProducts=[cleanse,protect,...creams];
const roles=Object.fromEntries(budgetProducts.map(p=>[p.id,p===cleanse?'cleanse':p===protect?'protect':'moisturise']));
const prices=Object.fromEntries(budgetProducts.map(p=>[p.id,creams.slice(0,10).includes(p)?15000:10000]));
const budget=select(budgetProducts,roles,{formulations:[],evidence:[],directions:{}},{},undefined,prices);

const sample=JSON.parse(readFileSync('docs/onboarding/example-products.synthetic.json','utf8'));
const dossier:any=[{id:'synthetic-dossier',title:'Synthetic',url:null,sourceType:'formulation_dossier',retrievedAt:'2026-10-09',limitations:'Synthetic'}];
let malformed:any;
try {malformed=previewOnboarding([{...sample[0],formulation:{}}],dossier)} catch(e) {malformed={threw:true,message:String(e)}}
const badUsage=structuredClone(sample[0]);
badUsage.role='treatment';
badUsage.directions={...direction,evidenceIds:['synthetic-dossier'],session:'not-a-session',maxWeeklyUses:999,introductionWeeklyUses:-5,reviewedBy:'',reviewedAt:'not-a-date',frequency:'',text:''};
const usagePreview=previewOnboarding([badUsage],dossier);

let logged=''; const previous=console.error;
console.error=(value:any)=>{logged=String(value)};
reportError(new Error('Synthetic'),{scope:'audit',extra:{a:{b:{c:{d:{payload:{email:'nested-person@example.test',token:'SYNTHETIC_NESTED_TOKEN'}}}}}}});
console.error=previous;
console.log(JSON.stringify({
 roleBasedActiveBypass:{selected:activeSelection.essentials.some(s=>s.source==='catalogue'),scheduledUses:activePlan.days.flatMap(d=>[...d.am,...d.pm]).length,status:activePlan.status,problems:activePlan.problems},
 partialActiveIgnored:{selectedWhenIrritated:partialSelection.essentials.some(s=>s.source==='catalogue'),exclusions:partialSelection.excluded},
 feasibleCorePruned:{cheapestCompletePaise:30000,budgetPaise:30000,status:budget.status,slots:budget.essentials},
 malformedOnboarding:malformed,
 invalidUsageOnboarding:usagePreview,
 nestedLogLeaksEmailAndToken:logged.includes('nested-person@example.test')&&logged.includes('SYNTHETIC_NESTED_TOKEN')
},null,2));
