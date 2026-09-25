# Git, Deployment & Mobile Build Protocol

1. **NEVER Push or Deploy Automatically**:
   - Never stage, commit, push code to GitHub (`git push`), or trigger live deployments without explicit user consent.
   - Always inform the user first and request confirmation.

2. **Mandatory Post-Change Confirmation**:
   - After completing any code edits, bug fixes, or feature implementations:
     - Verify and type-check the changes (`npx tsc --noEmit`).
     - Explicitly ask the user: "Would you like to push these changes to GitHub and deploy to live?"
   - For mobile features or screens:
     - Inform the user that the mobile codebase is ready.
     - Ask if they would like to generate/build an Android App Bundle (`.aab`) or APK (`.apk`).

3. **Execution Only Upon Explicit Instruction**:
   - Only execute `git push`, deploy commands, or mobile builds (`eas build -p android`) after the user confirms.
