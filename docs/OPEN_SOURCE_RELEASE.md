# Public-source release gate

This repository is private while the following rights decisions are pending. Do not change its visibility yet.

1. **Project license:** the copyright holder must choose and approve a license for original UniJourney code. There is
   no root `LICENSE` file yet; attribution alone does not grant reuse rights.
2. **Team-supplied campus image:** confirm written permission to redistribute
   `server/seed/data/riyadh-campus-annotated.jpg` publicly, or remove it and update references before release.
3. **Vendored React Bits component:** confirm that public distribution of
   `client/src/components/reactbits/TiltedCard.tsx` complies with the upstream MIT + Commons Clause terms. Keep its
   attribution and license notice; replace the component if the intended project license or use conflicts.
4. **Other assets and data:** review `client/public/samples/linkedin-export-sample.zip`, map data, curriculum excerpts,
   screenshots and documentation for personal data and redistribution rights. Demo names and email domains are
   intended to be synthetic; review them before publication.
5. **Final commit checks:** after rights are resolved and the release commit is fixed, run GitHub secret scanning over
   all branches and history, review alerts, rotate any exposed credentials, and run `npm audit --omit=dev` plus the
   full `npm audit` on the release lockfile. Keep the repository private until those checks and the production
   deployment configuration are reviewed.

The hosted app is a synthetic shared demo. `DEMO_MODE=false` disables fixture seeding but does not add real-user
authentication or make this prototype ready to hold real student records.
