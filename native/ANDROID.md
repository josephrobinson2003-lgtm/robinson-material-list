# Android test build

Android is the first install path. The app requires Android 8.0 or newer.
The iPhone plugin source stays in `plugins/robinson-geofence/ios` and is
not required for this build.

This APK has not been installed on a phone in this change. Locked-phone
geofence behavior is still unverified until someone runs it on a device.

## What the app is allowed to use

The Android manifest asks only for location permissions, a location
foreground service, and the notification that shows while suggestions are on.
It does not ask for contacts, the photo library, or storage of the whole camera roll.
Job photos use the system picker.

Background location is refused until the person has granted "Allow all the
time". The in-app text before arming says suggestions watch saved jobs only
for today and are not a driving route. Play's data-safety draft is
`native/play-data-safety.yaml`. It has not been submitted.

## Sideload a debug APK

Install JDK 21 and Android Studio, with Android SDK 36. Then, from this
`native` folder:

```bash
npm install
node scripts/stage-www.mjs
npx cap sync android
cd android
./gradlew assembleDebug
```

The Android project is already in `android/`. Run `npx cap add android` only
if that folder is missing.

The test APK is `android/app/build/outputs/apk/debug/app-debug.apk`.
Install it with `adb install -r` on a phone that allows installs from this
computer. No Play account is required for that.

This environment does not have the Android SDK, so the APK was not built here.

## Play internal testing

A Google Play developer account is required. This repo does not contain a
signing keystore or a Play service account. Create the keystore outside the
repo, build a release bundle with `./gradlew bundleRelease`, and upload it to
an internal testing track. The Play Console location declaration must match
the draft: location is used on the device to match saved jobs while
suggestions are armed, it is not a route, and it is not sent as raw GPS in
the weekly file.

## Still not set up

Sunday email needs the private backend. Job-photo upload needs Microsoft
sign-in limited to the job-photo folders. Neither is turned on by this APK.
