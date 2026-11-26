import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
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

// Use the checked-in Saldoza icon for legacy and adaptive Android launchers.
// Do not depend on a remote resource or replace the user's web assets.
const res=new URL('./android/app/src/main/res/',import.meta.url);
for(const folder of ['drawable-nodpi/','drawable-v26/'])await mkdir(new URL(folder,res),{recursive:true});
// The 108 dp adaptive layer is inset so the wallet remains inside the safe zone.
await writeFile(new URL('drawable-v26/saldoza_launcher.xml',res),`<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
 <background android:drawable="@drawable/saldoza_launcher_background"/>
 <foreground android:drawable="@drawable/saldoza_launcher_foreground"/>
</adaptive-icon>
`);
await mkdir(new URL('drawable/',res),{recursive:true});
await writeFile(new URL('drawable/saldoza_launcher.xml',res),`<?xml version="1.0" encoding="utf-8"?>
<bitmap xmlns:android="http://schemas.android.com/apk/res/android" android:src="@drawable/saldoza_launcher_bitmap" android:gravity="fill"/>
`);
await writeFile(new URL('drawable/saldoza_launcher_background.xml',res),`<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"><solid android:color="#132f53"/></shape>
`);
await writeFile(new URL('drawable/saldoza_launcher_foreground.xml',res),`<?xml version="1.0" encoding="utf-8"?>
<inset xmlns:android="http://schemas.android.com/apk/res/android" android:inset="18dp" android:drawable="@drawable/saldoza_launcher_bitmap"/>
`);
// Give the underlying bitmap a distinct name to avoid adaptive-icon recursion.
await copyFile(new URL('../icon-512.png',import.meta.url),new URL('drawable-nodpi/saldoza_launcher_bitmap.png',res));
xml=xml.replace(/<application\b[^>]*>/,tag=>{
 for(const key of ['icon','roundIcon']){
  tag=tag.replace(new RegExp('\\sandroid:'+key+'="[^"]*"','g'),'');
  tag=tag.replace(/>$/,' android:'+key+'="@drawable/saldoza_launcher">');
 }
 return tag;
});
assert(xml.includes('android:icon="@drawable/saldoza_launcher"')&&xml.includes('android:roundIcon="@drawable/saldoza_launcher"'),'Launcher icons not configured');
await writeFile(file,xml);
console.log('Saldoza adaptive and legacy launcher icons configured.');

// Monochrome small icon for Android's notification status bar.
await writeFile(new URL('drawable/ic_saldoza_notification.xml',res),`<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
 <path android:fillColor="#FFFFFFFF" android:pathData="M3,5 L19,5 Q21,5 21,7 L21,9 L16,9 Q13,9 13,12 Q13,15 16,15 L21,15 L21,17 Q21,19 19,19 L3,19 Q2,19 2,17 L2,7 Q2,5 3,5 Z M16,10 L22,10 L22,14 L16,14 Q14,14 14,12 Q14,10 16,10 Z"/>
</vector>
`);
if(!xml.includes('android.permission.POST_NOTIFICATIONS')){
 xml=xml.replace(/<application\b/,'<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>\n    <application');
 await writeFile(file,xml);
}
