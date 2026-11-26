import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const file=new URL('./android/app/src/main/AndroidManifest.xml',import.meta.url);
let xml=await readFile(file,'utf8');
assert([...xml.matchAll(/<application\b[^>]*>/g)].length===1,'Unexpected application manifest');
xml=xml.replace(/<application\b[^>]*>/,tag=>{
 for(const [key,value] of [['allowBackup','false'],['usesCleartextTraffic','false']]){
  const re=new RegExp('\\sandroid:'+key+'="[^"]*"','g');
  tag=tag.replace(re,'');
  tag=tag.replace(/>$/,' android:'+key+'="'+value+'">');
 }
 return tag;
});
await writeFile(file,xml);
console.log('Android manifest: automatic backup and cleartext traffic disabled.');
