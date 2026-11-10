import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
await mkdir('docs/visual-v2-3/maximized', {recursive:true});
const browser=await chromium.launch({headless:true});
for (const [width,height,count] of [[960,640,2],[1440,900,2],[1920,1080,1],[1920,1080,2]]) {
 const page=await browser.newPage({viewport:{width,height}});
 await page.addInitScript((count)=>{ window.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback:()=>1,unregisterCallback:()=>{},invoke:async(cmd)=>{if(cmd==='runtime_snapshot')return {riot_client:false,league_client:false,league_game:false,valorant_game:false};if(cmd==='list_local_accounts')return Array.from({length:count},(_,i)=>({id:`fixture-${i}`,name:i?'Second Profile':'Main Profile',region:'EUW',rank:i?'Gold I':'Diamond II',notes:'',favorite:i===0,session_status:'saved',has_session:true,created_at:'2026-01-01',last_used_at:null}));return null;}};},count);
 await page.goto('http://127.0.0.1:1422/');await page.locator('.roster-card').first().waitFor();await page.waitForTimeout(300);
 await page.screenshot({path:`docs/visual-v2-3/maximized/open-${width}-${count}.png`});
 await page.getByRole('button',{name:'Hide details',exact:true}).click();await page.waitForTimeout(200);await page.screenshot({path:`docs/visual-v2-3/maximized/closed-${width}-${count}.png`});await page.close();
}
await browser.close();
