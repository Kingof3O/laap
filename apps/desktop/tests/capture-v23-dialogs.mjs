import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const root = 'docs/visual-v2-3/final'; await mkdir(root,{recursive:true});
const browser=await chromium.launch({headless:true}); const metrics=[];
for (const [width,height] of [[960,640],[1160,760],[1440,900]]) {
 const page=await browser.newPage({viewport:{width,height}});
 await page.addInitScript(()=>{
  localStorage.setItem('laap_auto_check_updates','false'); window.testUpdateMode='available';
  window.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback:()=>1,unregisterCallback:()=>{},invoke:async(cmd)=>{
   if(cmd==='runtime_snapshot') return {riot_client:false,league_client:false,league_game:false,valorant_game:false};
   if(cmd==='list_local_accounts') return [{id:'one',name:'Main Profile',region:'EUW',rank:'Diamond II',notes:'Climb with the evening team.',favorite:true,session_status:'saved',has_session:true,created_at:'2026-01-01',last_used_at:null},{id:'two',name:'Second Profile',region:'NA',rank:'Gold I',notes:'',favorite:false,session_status:'saved',has_session:true,created_at:'2026-01-01',last_used_at:null}];
   if(cmd==='get_app_version') return '1.0.0';
   if(cmd==='check_github_update') {if(window.testUpdateMode==='error') throw Error('Test network failure'); return {has_update:true,current_version:'1.0.0',latest_version:'1.0.1',release_name:'Test release',release_notes:'Release notes fixture.',published_at:'2026-01-01',html_url:'https://github.com/Kingof3O/laap/releases',edition:'offline',platform:'windows-x86_64'};}
   return null;
  }};
 });
 const start=Date.now(); await page.goto('http://127.0.0.1:1422/'); await page.locator('.roster-card').first().waitFor(); await page.evaluate(()=>document.fonts.ready); await page.waitForTimeout(250);
 metrics.push({width,initialRenderMs:Date.now()-start,...await page.evaluate(()=>({bodyFont:getComputedStyle(document.body).fontFamily,headingFont:getComputedStyle(document.querySelector('.inspector-top h2')).fontFamily,manropeLoaded:document.fonts.check('400 13px Manrope'),soraLoaded:document.fonts.check('600 23px Sora'),scrollWidth:document.documentElement.scrollWidth,innerWidth:innerWidth}))});
 await page.screenshot({path:`${root}/roster-${width}.png`});
 await page.getByRole('button',{name:'Options for Main Profile'}).click(); await page.waitForTimeout(250); await page.screenshot({path:`${root}/menu-${width}.png`}); await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Add Profile',exact:true}).click(); await page.waitForTimeout(250); await page.screenshot({path:`${root}/add-${width}.png`}); await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Edit Main Profile',exact:true}).click(); await page.waitForTimeout(250); await page.screenshot({path:`${root}/edit-${width}.png`}); await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Settings',exact:true}).click(); const dialog=page.getByRole('dialog',{name:'Settings'}); await page.waitForTimeout(200); await page.screenshot({path:`${root}/general-${width}.png`});
 for(const cat of ['Appearance','Updates']) {await dialog.getByRole('tab',{name:cat,exact:true}).click(); await page.waitForTimeout(200); await page.screenshot({path:`${root}/${cat.toLowerCase()}-${width}.png`});}
 await dialog.getByRole('button',{name:'Check for Updates'}).click(); await page.waitForTimeout(250); await page.screenshot({path:`${root}/update-available-${width}.png`});
 await page.getByRole('dialog',{name:'Update available'}).getByRole('button',{name:'Close modal'}).click();
 await page.getByRole('tab',{name:'Updates',exact:true}).click(); await page.evaluate(()=>window.testUpdateMode='error'); await page.getByRole('button',{name:'Check for Updates'}).click(); await page.waitForTimeout(250); await page.screenshot({path:`${root}/update-error-${width}.png`});
 await page.close();
}
await writeFile(`${root}/metrics.json`,JSON.stringify(metrics,null,2)); await browser.close();
