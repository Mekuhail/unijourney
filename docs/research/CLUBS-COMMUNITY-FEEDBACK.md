# Clubs & community, and course feedback: research and decisions

September 2026. This covers two features: the club community in Campus Life and the new **Feedback & help** section.

## 1. Clubs & community

### What the reference site does

We looked at unijourney-yu.oekuhail418153.chatgpt.site/#clubs. It offers:

- Eight communities, filtered by category chips and a search box.
- A hero banner.
- An "Explore community" modal showing the description, upcoming events and a join/leave button.

It has no posts, roles, moderation, attendance or personalisation.

### What campus platforms offer

These are feature claims from vendor documentation. We did not test the products.

| Platform | Pattern we borrowed |
|---|---|
| Anthology Engage | Categories. Join is either instant or approved by officers. Officer positions. News posts with an email option. Co-curricular transcript. ([join](https://help.anthology.com/engage/en/joining-an-organization.html), [roster](https://help.anthology.com/engage/en/roster-walkthrough.html), [news](https://help.anthology.com/engage/en/news-walkthrough.html)) |
| CampusGroups / Ready Education | QR self check-in from a poster. Group feeds. Reported posts go to a moderation queue. ([QR](https://readyedu.atlassian.net/wiki/spaces/CGSD/pages/386203763/Tracking+Attendance+With+a+Self+Check-In+QR+Code), [moderation](https://resources.readyeducation.com/clients/campus-app/hc/en-us/articles/360000062533-Moderate-the-Community)) |
| Penn Clubs (MIT licence) | A role plus a free-text title for each member. "Favorite" is kept separate from "Subscribe", so following a club does not share your data. ([repo](https://github.com/pennlabs/penn-clubs)) |
| Discord / Discourse | Slow mode per member. A flag threshold hides a post until a moderator reviews it. ([slowmode](https://support.discord.com/hc/en-us/articles/360016150952-Slowmode-FAQ), [trust levels](https://blog.discourse.org/2018/06/understanding-discourse-trust-levels/)) |
| NN/g on tabs | Use at most four short tabs on phones. ([article](https://www.nngroup.com/articles/tabs-used-right/)) |

No anonymous posting: Yik Yak's shutdown over harassment is the cautionary case ([Inside Higher Ed](https://www.insidehighered.com/news/2022/03/07/yik-yak-re-emerges-after-shutdown)). We minimise the personal data we show, in line with Saudi Arabia's Personal Data Protection Law. Rosters are visible to members only. Officers and member counts are public. Student numbers are never shown.

### What we built

- **Directory**
  - Search.
  - Category chips.
  - Campus tabs.
  - "Suggested for you" cards. The ranking is rule-based: shared interests weigh most, then your campus, classmates from your programme who are members, and events in the next two weeks. Each card states the reason.
  - Follow and Join are separate actions.
- **Club page**
  - Four tabs: Posts, Events, Members and About. A fifth tab, Reports, appears for moderators.
  - An officers card with titles, such as "President" or "Web track lead".
  - Meeting times, the join policy and the audience.
- **Posts**
  - Announcements and polls come from the lead and officers only, can be pinned for up to 14 days and notify every member.
  - Discussions and questions come from members. A question can have an accepted answer.
  - One level of replies.
  - "Helpful" reactions.
  - Announcements are public. Other posts are for members only, and non-members see how many are hidden.
- **Safety**
  - A bilingual word filter and personal-data patterns (phone numbers, emails, student numbers) block a post. The author gets a message they can act on.
  - Slow mode of six posts per hour.
  - Three reports hide a post until a moderator reviews it.
  - Moderators see the reason for a report but not who filed it. They can dismiss the report or remove the post, and the author is notified when a post is removed.
- **Roles**
  - The lead can make a member an officer, with a title.
  - Clubs have either open or approval membership. Approval clubs can ask a join question, and the lead sees the answer in the club desk.
- **QR self check-in**
  - A poster code is valid from 30 minutes before the event until 60 minutes after it.
  - Checking in records attendance and a verified achievement on the digital card.
  - In the demo, the poster code is shown in place of a camera scan.
- **Campus Life** has a "From your clubs" feed with posts from clubs you joined and announcements from clubs you follow.

Seed data:

- Four new clubs: Cybersecurity, Competitive Programming, Architecture & Design, and Law Society.
- 27 synthetic members. Riyadh members have female names and Khobar members male names, matching YU's separate campuses.
- Posts, a poll, an answered question and one open report.

## 2. Feedback & help (KPI-based course feedback)

### How yurate.live works

We read its public JavaScript because the course and lecturer data has been removed. It works like this:

- Lecturers are rated anonymously from 1 to 5 stars on four criteria: Explains, Grading, Attitude and Attendance.
- Each review records the course, an optional grade received and a comment of 10 to 650 characters.
- A profanity check rejects comments.
- Other students can "like" a review.
- A separate Feedback button takes bug reports and suggestions.

Its main risk is that raw comments are public and usually negative.

### What we built instead

- **Six KPI statements** rated on a 1 to 5 agreement scale:
  - Clear explanations.
  - Fair, transparent grading.
  - Approachable and supportive.
  - Well organised.
  - Balanced workload.
  - Learning value.
- Each response also records whether the student would recommend the course and their study hours per week.
- **Only aggregates are published**, from the last three completed terms, and only once 5 or more students have responded.
  - Each KPI shows its mean, the share who agree, a band, the college average, a trend across terms, a 0 to 100 index, the recommend rate and weekly hours.
  - Bands have no red: strong is 4.2 or above, on track is 3.6 to 4.1, and anything lower is a "focus area".
- **Comments are never shown.** They are classified in English and Arabic into ten themes, each tagged as a strength or a suggestion. We publish the share of responses for each theme, such as "More worked examples: 22%".
- **Eligibility comes from the transcript.**
  - End-of-term feedback covers courses the student completed last term.
  - A mid-term check-in covers current courses. It is published only after the term ends.
  - One response per course, which the student can edit or withdraw while the window is open.
  - The audit log records submissions without the student's identity.
- **Quality office** (reviewer and registrar):
  - KPI alerts below target, compared with the college average.
  - Responses held by the wording filter, with personal data masked, to publish or reject.
  - Response rates by college.
  - Mid-term check-in results.
  - "You said, we did" posts, which notify every student who gave feedback on that course.
- **Help centre:**
  - FAQs.
  - A support form (bug, suggestion, question, account or other) that gets a public ticket ID.
  - The student sees their own tickets and the staff replies.

It sits in the side menu as **Support → Feedback & help**, separate from clubs.
