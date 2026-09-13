// Optional: POUCH_PLAYWRIGHT_MODULE may point to an existing Playwright installation.
const {chromium}=require(process.env.POUCH_PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1200,height:850}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(6000);
  await page.setContent('<body class="pouch-library"><div id="app"></div></body>');
  for(const file of ['pouch-theme.css','graph.css','node-graph.css','library-layout.css']) await page.addStyleTag({path:path.join(root,'media',file)});
  await page.addScriptTag({path:path.join(root,'model.js')});
  await page.evaluate(()=>{
   const M=window.ContextPouchModel;
   const rules=Array.from({length:18},(_,i)=>({id:String(i),key:M.key(i<14?'project':'personal',String(i)),scope:i<14?'project':'personal',title:['Reuse existing shared components','Keep modules focused','Prefer immutable bindings'][i%3]+` ${i+1}`,text:'Use existing components and follow the project conventions. Keep changes focused on the task.',category:i%2?'Architecture':'Code',related:[],isDefault:i===0}));
   const state={revision:1,project:'demo',projects:[{id:'demo',name:'Context Pouch'}],scopes:[{id:'project',name:'Context Pouch',writable:true},{id:'personal',name:'Global',writable:true}],rules,selected:[rules[0].key],wanted:[rules[0].key],overrides:[],conflicts:[],activeConflicts:[],presets:[{id:'preset',key:M.key('project','preset'),title:'Small bug fix',scope:'project',ruleIds:['0','1']}],instructions:'Instructions for the task'};
   window.acquireVsCodeApi=()=>({getState:()=>({}),setState:()=>{}});
   window.createPouchClient=(api,onState)=>async(action,data)=>{
    if(action==='libraryFocus')return null;
    if(action==='toggle'){state.wanted=data.checked?[...state.wanted,data.key]:state.wanted.filter(k=>k!==data.key);state.selected=[...state.wanted];}
    if(action==='select'){state.selected=data.keys;state.wanted=data.keys;}
    if(action==='graphState')return {graph:{activeProject:'demo',revision:1,nodes:[],edges:[],projects:[]}};
    onState(state);return state;
   };
   window.createPouchGraph=()=>({focus:()=>{},selected:()=>null,setData:()=>{},reveal:()=>{}});
   window.renderGraphInspector=()=>'<p>Choose a graph node.</p>';
  });
  for(const file of ['library-view.js','library-dialogs.js','library-layout.js','graph.js']) await page.addScriptTag({path:path.join(root,'media',file)});
  assert(!(await page.locator('.inspector').isVisible()));
  assert(!(await page.locator('.presets').isVisible()));
  await page.getByLabel('Selected only',{exact:true}).check();
  assert.equal(await page.locator('.rule-row').count(),1);
  await page.getByRole('button',{name:'Reset filters',exact:true}).click();
  await page.getByRole('searchbox',{name:'Search rules'}).fill('unmatched');
  assert(await page.getByText('No rules match your filters.').isVisible());
  await page.locator('.library-actions [data-action=reset-filters]').click();
  await page.screenshot({path:path.join(os.tmpdir(),'pouch-library.png')});
  await page.locator('.rule-link').first().click();
  assert(await page.getByRole('button',{name:'Edit saved rule',exact:true}).isVisible());
  assert(!(await page.getByRole('button',{name:'Make default',exact:true}).isVisible()));
  await page.getByText('Defaults & availability',{exact:true}).click();
  assert(await page.getByRole('button',{name:'Remove default',exact:true}).isVisible());
  await page.screenshot({path:path.join(os.tmpdir(),'pouch-library-details.png')});
  await page.setViewportSize({width:390,height:750});
  assert(!(await page.locator('.library').isVisible()));
  await page.getByRole('button',{name:'Back to rules',exact:true}).click();
  assert(await page.locator('.library').isVisible());
  assert(await page.locator('.rule-link').first().evaluate(el=>el===document.activeElement));
  await page.getByRole('button',{name:'Presets',exact:true}).click();
  assert(await page.locator('.presets').isVisible());
  await page.getByRole('button',{name:'Apply Small bug fix',exact:true}).click();
  assert(await page.locator('dialog').isVisible());
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('button',{name:'Rules',exact:true}).click();
  await page.screenshot({path:path.join(os.tmpdir(),'pouch-library-narrow.png')});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);
  console.log('PASS: library filtering, rule details, progressive controls, preset review, mobile back/focus and layout.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
