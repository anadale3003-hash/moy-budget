import {access,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const keystore=process.env.SALDOZA_TEST_KEYSTORE;
const password=process.env.SALDOZA_TEST_KEYSTORE_PASSWORD;
assert(Boolean(keystore)===Boolean(password),'Test keystore path and password must be configured together');
if(keystore)await access(keystore);
const gradleFile=new URL('./android/app/build.gradle',import.meta.url);
let gradle=await readFile(gradleFile,'utf8');
const marker='def saldozaTestKeystore = System.getenv("SALDOZA_TEST_KEYSTORE")';
if(!gradle.includes(marker)){
 const buildTypes='    buildTypes {';
 assert(gradle.includes(buildTypes),'Build type declaration missing');
 gradle=gradle.replace('android {',`${marker}
def saldozaTestPassword = System.getenv("SALDOZA_TEST_KEYSTORE_PASSWORD")

android {`).replace(buildTypes,`    signingConfigs {
        if (saldozaTestKeystore) {
            saldozaTest {
                storeFile file(saldozaTestKeystore)
                storeType "PKCS12"
                storePassword saldozaTestPassword
                keyAlias "saldoza-test"
                keyPassword saldozaTestPassword
            }
        }
    }
    buildTypes {
        debug {
            if (saldozaTestKeystore) signingConfig signingConfigs.saldozaTest
        }`);
 await writeFile(gradleFile,gradle);
}
console.log(keystore?'Dedicated test keystore configured':'Temporary debug key enabled');
