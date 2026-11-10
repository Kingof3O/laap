import { chromium } from '@playwright/test';
const browser=await chromium.launch({headless:true});
for (const [width,height] of [[960,640],[1160,760],[1440,900]]) for(const count of [1,2,10]) {
 const page=await browser.newPage({viewport:{width,height}});
 await page.addInitScript((count)=>{ window.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback:()=>1,unregisterCallback:()=>{},invoke:async(cmd)=>{if(cmd==='runtime_snapshot')return {riot_client:false,league_client:false,league_game:false,valorant_game:false};if(cmd==='list_local_accounts')return Array.from({length:count},(_,i)=>({id:`fixture-${i}`,name:`Profile ${i+1}`,region:'EUW',rank:'Gold I',notes:'',favorite:false,session_status:'saved',has_session:true,created_at:'2026-01-01',last_used_at:null}));return null;}};},count);
 await page.goto('http://127.0.0.1:1422/'); await page.locator('.roster-card').first().waitFor(); await page.waitForTimeout(250);
 await page.screenshot({path:`docs/visual-v2-3/final/grid-${count}-${width}.png`});
 await page.getByRole('button',{name:'List View'}).click(); await page.screenshot({path:`docs/visual-v2-3/final/list-${count}-${width}.png`});
 await page.close();
}
await browser.close();
