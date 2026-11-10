import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
await mkdir('docs/visual-v2-2/pass-1', {recursive:true});
const browser = await chromium.launch({headless:true});
async function fixture(count, width=960, height=640) {
 const page = await browser.newPage({viewport:{width,height}});
 await page.addInitScript((count) => {
  window.__TAURI_INTERNALS__ = {metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}}, transformCallback:()=>1, unregisterCallback:()=>{}, invoke:async (cmd) => {
   if(cmd==='runtime_snapshot') return {riot_client:false,league_client:false,league_game:false,valorant_game:false};
   if(cmd==='list_local_accounts') return Array.from({length:count},(_,i)=>({id:`fixture-${i}`,name:i?`Profile ${i+1}`:'Main Profile',region:'EUW',rank:i?'Gold I':'Diamond II',notes:'',favorite:i===0,session_status:'saved',has_session:true,created_at:'2026-01-01',last_used_at:null}));
   return null;
  }};
 }, count);
 await page.goto('http://127.0.0.1:1422/'); await page.waitForTimeout(700);
 return page;
}
for (const [width,height] of [[960,640],[1160,760],[1440,900]]) {
 const page=await fixture(2,width,height);
 await page.screenshot({path:`docs/visual-v2-2/pass-1/roster-${width}.png`});
 await page.getByRole('button',{name:'Settings',exact:true}).click();
 await page.screenshot({path:`docs/visual-v2-2/pass-1/settings-${width}.png`});
 if(width===960) for(const category of ['Appearance','Riot Client','Presence','Updates','Security & Vault','Advanced','About']) {
  await page.getByRole('dialog',{name:'Settings'}).getByRole('tab',{name:category,exact:true}).click();
  await page.waitForTimeout(250);
  await page.screenshot({path:`docs/visual-v2-2/pass-1/settings-${category.toLowerCase().replace(/[^a-z]+/g,'-')}.png`});
 }
 await page.close();
}
for(const count of [0,1,10]) {
 const page=await fixture(count);
 await page.screenshot({path:`docs/visual-v2-2/pass-1/roster-${count}-accounts.png`});
 if(count===10) {await page.getByRole('button',{name:'List View'}).click(); await page.screenshot({path:'docs/visual-v2-2/pass-1/roster-list.png'});}
 if(count===1) {await page.getByRole('button',{name:'Options for Main Profile'}).click(); await page.screenshot({path:'docs/visual-v2-2/pass-1/account-menu.png'});}
 await page.close();
}
await browser.close();
