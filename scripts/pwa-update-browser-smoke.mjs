// Serve an archived Pages build, then upgrade it with another old game still open.
// CRD_PREVIOUS_BUILD_DIR and CRD_UPDATE_DIR select production build directories.
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const { chromium }=require(process.env.CRD_PLAYWRIGHT_MODULE||'playwright');
const http=require('node:http');const fs=require('node:fs/promises');const path=require('node:path');const assert=require('node:assert/strict');
(async()=>{
 assert(process.env.CRD_PREVIOUS_BUILD_DIR, 'Set CRD_PREVIOUS_BUILD_DIR to an archived Pages build');
 const expectFixed=process.env.CRD_EXPECT_FIXED!=='0';
 let directory=path.resolve(process.env.CRD_PREVIOUS_BUILD_DIR);
 const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.woff2':'font/woff2','.webp':'image/webp'};
 const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');const name=url.pathname.slice('/CRD/'.length)||'index.html';
 if(!url.pathname.startsWith('/CRD/')||name.includes('..')){res.writeHead(404).end();return}
 const data=await fs.readFile(path.join(directory,name));res.writeHead(200,{'Content-Type':types[path.extname(name)]||'application/octet-stream','Cache-Control':'no-store'}).end(data);
 }catch{res.writeHead(404).end()}});
 await new Promise(r=>server.listen(4211,'127.0.0.1',r));const browser=await chromium.launch({headless:true});
 try{
 const context=await browser.newContext();const page=await context.newPage();
 await page.goto('http://127.0.0.1:4211/CRD/'+(process.env.CRD_RECOVERY?'?update=1':''));
 await page.evaluate(async()=>{await navigator.serviceWorker.ready});
 await page.reload();
 await page.getByRole('button',{name:'Open menu',exact:true}).click();
 await page.locator('.screen-menu__toggle').filter({hasText:'Testing'}).click();
 assert.equal(await page.getByRole('radio',{name:'20Cards',exact:true}).count(),0);

 const oldPage=await context.newPage();await oldPage.goto('http://127.0.0.1:4211/CRD/');
 await oldPage.evaluate(async()=>{await navigator.serviceWorker.ready});await oldPage.reload();
 const originalWorker=await oldPage.evaluate(async()=>{for(const n of await caches.keys()){for(const r of await(await caches.open(n)).keys()){if(r.url.includes('searchAi.worker-'))return r.url}}});
 const before=await page.evaluate(()=>{const g=JSON.parse(localStorage.getItem('crd-local-game-v1')).state.game;return [g.playerHand,g.opponentHand,g.deck,g.draftRow].map(cards=>cards.map(c=>c.uid))});
 const oldScripts=await oldPage.evaluate(()=>[...document.scripts].map(s=>s.src));
 await page.evaluate(()=>{window.controllerChanges=0;navigator.serviceWorker.addEventListener('controllerchange',()=>window.controllerChanges++)});
 directory=path.resolve(process.env.CRD_UPDATE_DIR||'dist');
 const nextHtml=await fs.readFile(path.join(directory,'index.html'),'utf8');
 const nextScript=nextHtml.match(/src="([^"]+\.js)"/)[1];
 await page.evaluate(async()=>{await(await navigator.serviceWorker.getRegistration()).update()});
 if(expectFixed){
 if(process.env.CRD_RECOVERY) await page.waitForURL('http://127.0.0.1:4211/CRD/',{timeout:30000});
 else await page.waitForFunction(expected=>[...document.scripts].some(s=>s.src.endsWith(expected)),nextScript,{timeout:30000});
 }else{
 await page.waitForFunction(async()=>Boolean((await navigator.serviceWorker.getRegistration()).waiting),null,{timeout:30000});
 }
 if(!expectFixed&&!process.env.CRD_RECOVERY) await page.reload();
 await page.getByRole('button',{name:'Open menu',exact:true}).click();
 const result=await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();return {waiting:!!r.waiting,testing:JSON.parse(localStorage.getItem('crd-local-game-v1')).state.settings.testing,scripts:[...document.scripts].map(x=>x.src)}});
 result.hasTwentyCards=await page.getByRole('radio',{name:'20Cards',exact:true}).count()>0;
 result.hasSecretCard=await page.locator('.screen-menu__toggle').filter({hasText:'Secret Card'}).count()>0;
 assert.equal(result.hasTwentyCards,expectFixed);
 assert.equal(result.hasSecretCard,expectFixed);
 if(expectFixed){
 const after=await page.evaluate(()=>{const g=JSON.parse(localStorage.getItem('crd-local-game-v1')).state.game;return [g.playerHand,g.opponentHand,g.deck,g.draftRow].map(cards=>cards.map(c=>c.uid))});
 assert.deepEqual(after,before);result.savedDealPreserved=true;
 assert.notDeepEqual(await oldPage.evaluate(()=>[...document.scripts].map(s=>s.src)),oldScripts);
 assert.equal(new URL(oldPage.url()).search,'');
 await context.setOffline(true);
 const oldWorker=originalWorker;
 assert(oldWorker);
 assert.equal(await oldPage.evaluate(async url=>(await fetch(url)).ok,oldWorker),true);
 result.legacyPageMigratesWithoutQuery=true;result.oldWorkerAvailableOffline=true;
 }
 console.log(JSON.stringify(result));
 await fs.writeFile(process.env.CRD_BROWSER_RECEIPT||'logs/pwa-update-browser.json',JSON.stringify(result,null,2));
 }finally{await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
