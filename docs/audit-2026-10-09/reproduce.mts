// Audit-only synthetic inputs. These are not clinical directions or formulations.
import { PRODUCTS } from '../../src/data/mock-data';
import { ROUTINE_ROLES } from '../../src/data/routine-roles';
import { TREATMENTS, APPROVED_DIRECTIONS } from '../../src/data/product-directions';
import { FORMULATIONS, EVIDENCE_SOURCES } from '../../src/data/formulations';
import { catalogRecords } from '../../src/modules/catalog/catalog-records';
import { INTERACTION_RULES } from '../../src/modules/ingredients/interaction-rules';
import { selectProducts } from '../../src/modules/personalization/core/selection';
import { planWeek } from '../../src/modules/personalization/core/planner';
import { computeRoutine } from '../../src/modules/personalization/core/routine';
import { compileRelease } from '../../src/modules/knowledge/compile';
import { developmentFixtureInput } from '../../src/modules/knowledge/__fixtures__/development-fixture';
import { reportError } from '../../src/lib/observability';
import { formulationProblems } from '../../src/modules/ingredients/formulations';

const { variants } = catalogRecords(PRODUCTS);
const offers = Object.fromEntries(variants.map(v => [v.id, {pricePaise: 10000, stock: 10}]));
const profile = {pregnancy:'no', nursing:'no', currentlyIrritated:'no', reactivity:'low', ageBand:'adult', allergyHistory:'no', allergyIngredientIds:[], prescribedTreatment:'no', priorities:['dryness'], budgetPaise:500000, maxDailySteps:4, ownedItems:[]} as const;
const knowledge = {formulations:FORMULATIONS, evidence:EVIDENCE_SOURCES, directions:APPROVED_DIRECTIONS};
const select = (p:any, k:any=knowledge) => selectProducts({profile:p, products:PRODUCTS, variants, roles:ROUTINE_ROLES, treatments:TREATMENTS, knowledge:k, interactions:INTERACTION_RULES, safety:{excludedClasses:[], maxTreatments:null,ruleIds:[]},offers});
const plan = (p:any,k:any=knowledge) => planWeek(select(p,k), {products:PRODUCTS,knowledge:k,interactions:INTERACTION_RULES,treatments:TREATMENTS,ownedItems:p.ownedItems,currentlyIrritated:p.currentlyIrritated,maxDailySteps:p.maxDailySteps,templates:[]});
const allergy = {...profile,allergyHistory:'yes',allergyIngredientIds:['niacinamide'],ownedItems:[{id:'unknown-cream',label:'Synthetic unknown cream',ingredientIds:[],coverage:'unknown',prescribed:false,role:'moisturise'}]};
const irritation = {...profile,currentlyIrritated:'yes',ownedItems:[{id:'active-cream',label:'Synthetic retinol cream',ingredientIds:['retinol'],coverage:'known',prescribed:false,role:'moisturise'}]};
const conflict = {...profile,ownedItems:[{id:'a',label:'Synthetic A',ingredientIds:['benzoyl-peroxide'],coverage:'known',prescribed:false,role:'cleanse'},{id:'b',label:'Synthetic B',ingredientIds:['tretinoin'],coverage:'known',prescribed:false,role:'moisturise'}]};
const conflictPlan=plan(conflict);
const syntheticDirection={session:'pm',frequency:'SYNTHETIC maximum 2 weekly',text:'SYNTHETIC',reviewedBy:'AUDIT',reviewedAt:'2026-10-09',source:'AUDIT',formulationVersion:1,maxWeeklyUses:2,evidenceIds:[]};
const directionKnowledge={...knowledge,directions:{'face-wash':syntheticDirection,'centella-cleansing-balm':syntheticDirection}};
const directionPlan=plan({...profile,budgetPaise:500000},directionKnowledge);
const fixture=developmentFixtureInput();
const compiled=compileRelease(fixture,{fixture:true});
if(!compiled.ok) throw Error(compiled.errors.join(';'));
const release={manifest:compiled.release.manifest,artifacts:Object.fromEntries(Object.entries(compiled.release.artifacts).map(([k,v])=>[k,JSON.parse(v)]))};
const v2:any={...profile,schemaVersion:2,skinType:'dry',priorities:['dryness_reported'],experience:'new',adherence:'low',preferences:{eyeCare:false,bodyCare:false}};
const baseline=computeRoutine({profile:v2,release,products:PRODUCTS,offers});
const seasoned=computeRoutine({profile:{...v2,experience:'experienced',adherence:'high',skinType:'oily'},release,products:PRODUCTS,offers});
fixture.parameters[0].groups.push({evidenceGroup:'self_report_breakouts',observation:'rare',pGivenConcern:0.8,pGivenNotConcern:0.9});
const invalidDistribution=compileRelease(fixture,{fixture:true});
const mismatchedFormulation:any={productId:'face-wash',version:1,coverage:'complete',fullInci:'Niacinamide',ingredients:[{position:1,inciLabel:'Aqua',ingredientId:null,concentration:{known:false}}],sourceId:'fixture-evidence-not-real',reviewedBy:'AUDIT SYNTHETIC',reviewedAt:'2026-10-09'};
const mismatchProblems=formulationProblems(mismatchedFormulation,fixture.evidence);
const badKnowledge={...knowledge,formulations:[mismatchedFormulation]};
const mislabelledSelection=select({...profile,allergyHistory:'yes',allergyIngredientIds:['niacinamide']},badKnowledge);
const budgetProducts=PRODUCTS.filter(p=>['face-wash','ceramide-cream','sorbet-moisturizer','sunscreen'].includes(p.id)).map(p=>({...p,concerns:p.id==='ceramide-cream'?['dryness']:[]}));
const budgetOffers=Object.fromEntries(variants.filter(v=>budgetProducts.some(p=>p.id===v.productId)).map(v=>[v.id,{pricePaise:v.productId==='ceramide-cream'?15000:10000,stock:10}]));
const budgetSelection=selectProducts({profile:{...profile,budgetPaise:30000},products:budgetProducts,variants,roles:ROUTINE_ROLES,treatments:TREATMENTS,knowledge,interactions:INTERACTION_RULES,safety:{excludedClasses:[],maxTreatments:null,ruleIds:[]},offers:budgetOffers});
let capturedLog='';
const previousConsoleError=console.error;
console.error=(value:any)=>{capturedLog=String(value)};
reportError(new Error('synthetic-person@example.test /newsletter?token=SYNTHETIC_SECRET'),{scope:'audit-synthetic'});
console.error=previousConsoleError;
console.log(JSON.stringify({
 allergyUnknownOwned:select(allergy).essentials,
 irritatedOwnedRetinol:{status:plan(irritation).status,scheduledUses:plan(irritation).days.flatMap(d=>[...d.am,...d.pm]).filter(s=>s.ownedItemId==='active-cream').length,problems:plan(irritation).problems},
 conflictingOwned:{status:conflictPlan.status,problemCount:conflictPlan.problems.length,firstProblem:conflictPlan.problems[0],scheduledUses:conflictPlan.days.flatMap(d=>[...d.am,...d.pm]).filter(s=>s.source==='owned').length},
 essentialDirectionViolation:{uses:directionPlan.days.flatMap(d=>[...d.am,...d.pm]).filter(s=>s.role==='cleanse').length,approvedMaximum:2,problems:directionPlan.problems},
 beginnerRule:{appliedRules:baseline.ruleIds,purchases:baseline.purchaseList.map(p=>p.productId),newVsExperiencedSameSchedule:JSON.stringify(baseline.days)===JSON.stringify(seasoned.days)},
 invalidBayesianDistributionAccepted:invalidDistribution.ok,
 errorLogLeaksSyntheticEmailAndToken:capturedLog.includes('synthetic-person@example.test') && capturedLog.includes('SYNTHETIC_SECRET'),
 mismatchedInciAccepted:{validationProblems:mismatchProblems,selectedFaceWash:mislabelledSelection.essentials.some(s=>s.source==='catalogue'&&s.productId==='face-wash')},
 feasibleBudgetReturnsPartial:{budgetPaise:30000,cheapestCompleteCorePaise:30000,resultStatus:budgetSelection.status,slots:budgetSelection.essentials.map(s=>({role:s.role,source:s.source,productId:s.source==='catalogue'?s.productId:null}))},
},null,2));
