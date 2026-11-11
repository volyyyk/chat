# MedChat 0.0.1 — test release

This release branch is cut from `main` for the owner-led Android smoke test.

## Build inputs

- Source baseline on `main`: `17b7ec5b862f2e0a540660221b262230b072dbae`.
- CI run used by the release workflow: the latest successful `CI` run on `main`.
- Android client: unsigned debug APK.
- ServerMock: debug APK with an in-memory API mock; demo data is synthetic and is lost when the mock server process/data is reset.

## Owner test checklist

1. Install both APKs on one Android device.
2. Start ServerMock, then connect MedChat to `http://127.0.0.1:8080`.
3. Send a message containing Russian, English, digits and emoji in the first demo chat.
4. Switch to the second demo chat and verify that the first chat's message is not present.
5. Check back navigation, tablet loader layout, doctor specialty and settings/reset behavior.

## Safety and scope

- This is a test build, not a production release.
- Use only synthetic names, accounts and messages.
- Do not enter real patient data or credentials.
- QR invitations and secure history transfer are not implemented in this release.
- A green CI run and downloadable APKs do not constitute a security or clinical-readiness approval.
