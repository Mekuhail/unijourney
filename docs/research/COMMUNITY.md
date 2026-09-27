# Campus community: audit, design direction and data safety

September 2026. The community is a destination at `/campus/community`, entered from a prominent board at the top of Campus Life.

## Audit before building

| Already in UniJourney | Gap this release closes |
|---|---|
| Clubs with follow and join, officer roles, and private rosters | No community destination and no entry point on Campus Life |
| Club posts: announcements, discussions, Q&A and polls, with replies, reactions, reports and a moderation queue | No university-wide student posts, no images, no editing |
| Events with real RSVP, waitlist, calendar entries and QR check-in | Workshops were not gathered in one place |
| Notification bell, synthetic personas and community members | No profiles, no messaging, no blocking |
| A full reseed whenever `SEED_VERSION` changes | No way to add demo data to the live volume without a reseed |

References we used:

- **The Swift *YU Community* app**
  - Contributed: a club directory, bilingual posts, a month schedule, event notifications, and club-admin posting with approval.
  - Its hard-coded admin passwords were not carried over.
- **universe-new.onrender.com**
  - Rendered a blank page when we checked, so we used it only for the idea of a lively feed, groups and messaging.

## Design direction: a lamplit campus noticeboard

- **Purpose:** students between classes, mostly on phones, checking what is on and who is around, and answering a classmate.
- **Tone:** refined warmth, grounded in the product's world: the warm dark brand, YU gold, and Kufic lettering as seen on campus signage.
- **Signature element:** the community's display voice is **Reem Kufi**, a Kufic face with a matching Latin, used for headings only. Workshops appear as **tickets**:
  - a gold date stub, a perforated edge, and the student's real RSVP state stamped on the ticket.
- **Kept quiet:** a single feed column, list rows for people, and no card grids, kickers, gradient text or glass.
- **Body type:** remains Inter / IBM Plex Sans Arabic, as PRODUCT.md commits.
- **Motion:** one moment only, a new chat bubble settling from 6px below. It is disabled under reduced motion.

### Critique that shaped it

- Campus Life had no path to the social layer; the club feed sat below events.
  - **Fix:** a board at the top that stays dark in both themes, like the digital card, previewing real activity.
- Club post headers squeezed author names at 375px.
  - **Fix:** badges moved under the name.
- Three stacked workshop tickets pushed the phone feed below the fold.
  - **Fix:** tickets became a swipeable row on phones.
- Colour alone must never carry state.
  - **Fix:** RSVP state, unread counts and ticket states all carry text.

### Self-check

- **Aesthetic risk:** a Kufic display face inside a product UI. **Removed:** the separate "From your clubs" block on Campus Life, which duplicated the feed.
- **Contrast:** bubble timestamps on orange raised to 85% ink. Axe is clean on all community routes in English and Arabic, light and dark, at 375 and 1440px.
- **Brand facts:** no brand facts were invented. All people and content are synthetic.

## Permissions (enforced in the API)

**Posting and editing**

- Only students write posts. Authors edit their own posts.
- Authors, the post's author (for replies on their post) and the academic reviewer can remove content.
- Campus-only posts are hidden from the other campus.
- Three reports hide a post until the reviewer acts.

**Profiles**

- Profiles never include email or student number.
- Programme, campus and clubs are shown only if the student allows it.
- Profile edits accept an allow-listed set of fields only.

**Messages**

- Only the two participants can read a conversation. Anyone else gets a 404, which does not reveal that the conversation exists.
- A block stops both directions.
- Each student chooses who may start a conversation with them: everyone, club mates, or nobody.
- A report shares only the reported message with the moderator.
- Unread state uses per-side message sequence numbers, so it stays correct under the frozen demo clock.

## Data safety on the Fly volume

**Schema:** only new tables, created with `CREATE TABLE IF NOT EXISTS` on start.

**Demo content:** added by a registered migration (`community-social-v1`, `server/core/migrations.ts`). It:

- runs once on an existing database;
- uses `INSERT OR IGNORE` with fixed ids;
- references only people, clubs and events that already exist;
- is recorded in `settings.migrations_applied`.

**Fresh seeds:** a full seed already contains the same content and marks the migration as applied.

**Version:** `SEED_VERSION` is unchanged, so deploying does not wipe or reseed the live data.

**Test:** `tests/campus.social.test.ts` simulates the live volume and runs the migration twice. Users and club posts are unchanged, and the second run does nothing.
