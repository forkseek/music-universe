import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
const outputs='C:/path/to/universe-workspace'
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']})
const errors=[]
try{
  const page=await browser.newPage({viewport:{width:1600,height:900}})
  page.on('pageerror',e=>errors.push(e.message))
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
  await page.goto('http://127.0.0.1:5188/',{waitUntil:'networkidle'})
  await page.locator('.scene-loading').waitFor({state:'detached',timeout:45000})
  await expect(page.locator('canvas')).toHaveAttribute('data-camera-mode','orbit')
  await expect(page.locator('canvas')).toHaveAttribute('data-scene-object-count','11')
  await expect(page.locator('canvas')).toHaveAttribute('data-star-artwork-mapping','paired-hemispheres')
  const imageLoaded=await page.locator('.space-motion-backdrop').evaluate(async element=>{
    const source=getComputedStyle(element).backgroundImage.match(/url\(["']?(.+?)["']?\)/)?.[1]
    const img=new Image();img.src=source;await img.decode();return img.naturalWidth>512
  })
  assert.equal(imageLoaded,true)
  await page.screenshot({path:outputs+'/music-universe-space-motion.png'})
  assert.deepEqual(errors,[])
  await writeFile(outputs+'/music-universe-live-report.json',JSON.stringify({url:page.url(),passed:true,imageLoaded,errors},null,2))
  console.log(JSON.stringify({url:page.url(),passed:true,imageLoaded,errors}))
}finally{await browser.close()}
