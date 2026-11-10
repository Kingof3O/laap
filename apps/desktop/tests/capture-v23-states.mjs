import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const root='docs/visual-v2-3/final'; await mkdir(root,{recursive:true}); const browser=await chromium.launch({headless:true});
for(const [width,height] of [[960,640],[1160,760],[1440,900]]) {
 const page=await browser.newPage({viewport:{width,height}});
 await page.addInitScript(()=>{
  localStorage.setItem('laap_auto_check_updates','false'); window.syncMode='success'; window.presenceState='next_launch';
  const view={windows:true,settings:{riot_client_path:null,presence_enabled:true,presence_mode:'offline',startup_presence:'online'},detected_client:null,detection_error:null,presence_ready:true,presence_supported:true};
  const status=()=>({enabled:true,desired_mode:'offline',applied_mode:null,state:window.presenceState,message:window.presenceState==='restart_required'?'Restart Riot with presence controls to apply offline mode.':'Appear offline on next login.'});
  window.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback:()=>1,unregisterCallback:()=>{},invoke:async(cmd)=>{
   if(cmd==='runtime_snapshot')return {riot_client:false,league_client:false,league_game:false,valorant_game:false};
   if(cmd==='list_local_accounts')return [{id:'a',name:'Aurora Main',region:'EUW',rank:'Diamond II',notes:'Evening games',favorite:true,session_status:'saved',has_session:true,created_at:'2026-01-01',last_used_at:null,customization:{auto_sync_icon:true,auto_sync_rank:false}},{id:'b',name:'Second Profile',region:'NA',rank:'Gold I',notes:'',favorite:false,session_status:'saved',has_session:true,created_at:'2026-01-01',last_used_at:null}];
   if(cmd==='get_launcher_settings'||cmd==='prepare_presence_support')return view;
   if(cmd==='initialize_presence'||cmd==='get_presence_status'||cmd==='retry_presence'||cmd==='set_presence_mode')return status();
   if(cmd==='sync_profile_customizations') {if(window.syncMode==='slow') await new Promise(r=>setTimeout(r,1500)); if(window.syncMode==='error')throw Error('Test connection failure');return {changed:false,state:'success',message:null};}
   return null;
  }};
 });
 await page.goto('http://127.0.0.1:1422/');await page.locator('.roster-card').first().waitFor();await page.waitForTimeout(300);
 await page.screenshot({path:`${root}/details-open-${width}.png`});
 await page.getByRole('button',{name:'Hide details'}).click();await page.screenshot({path:`${root}/details-closed-${width}.png`});await page.getByText('Filters',{exact:true}).click();await page.screenshot({path:`${root}/filters-${width}.png`});await page.keyboard.press('Escape');
 await page.getByRole('button',{name:/^Online presence:/}).click();await page.waitForTimeout(220);await page.screenshot({path:`${root}/presence-${width}.png`});await page.keyboard.press('Escape');
 await page.evaluate(()=>{window.presenceState='restart_required'; window.dispatchEvent(new Event('laap:refresh'));}); await page.waitForTimeout(5300);await page.getByRole('button',{name:/^Online presence:/}).click();await page.waitForTimeout(200);await page.screenshot({path:`${root}/presence-restart-${width}.png`});await page.keyboard.press('Escape');
 await page.locator('.sync-compact summary').click();await page.screenshot({path:`${root}/sync-idle-${width}.png`});
 await page.evaluate(()=>window.syncMode='slow'); await page.getByRole('button',{name:'Sync now',exact:true}).click();await page.screenshot({path:`${root}/sync-progress-${width}.png`});await page.waitForTimeout(1800);
 await page.evaluate(()=>window.syncMode='error'); await page.getByRole('button',{name:'Sync now',exact:true}).click();await page.waitForTimeout(200);await page.screenshot({path:`${root}/sync-error-${width}.png`});await page.locator('.sync-compact summary').click();
 await page.getByRole('button',{name:'Add Profile',exact:true}).click();await page.waitForTimeout(200);await page.screenshot({path:`${root}/add-${width}.png`});await page.getByText('Advanced customization',{exact:true}).click();await page.screenshot({path:`${root}/add-advanced-${width}.png`});await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.waitForTimeout(200);await page.screenshot({path:`${root}/settings-general-${width}.png`});for(const cat of ['Appearance','Updates','About']){await page.getByRole('tab',{name:cat,exact:true}).click();await page.waitForTimeout(200);await page.screenshot({path:`${root}/settings-${cat.toLowerCase()}-${width}.png`});}
 await page.close();
}
await browser.close();
