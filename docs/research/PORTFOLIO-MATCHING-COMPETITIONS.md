# Research: student portfolio, matching, and competitions (26 Sep 2026)

Question from the product owner: make the student profile an active portfolio (ideally connected to LinkedIn), match it
to co-op and training opportunities more realistically, and separate university competitions from the job market.

## What exists today

- `career_profiles`: headline, summary, skills[], links{}, cv_versions, availability.
- `server/modules/career/match.ts`: score = skill ratio 50, interest 20, stage 10, location 10, availability 5.
  Eligibility is parsed separately from free text (`checkEligibility`) and kept apart from the score.
- Skill matching uses a hard-coded alias map (`normSkill` in `shared.ts`).
- Real evidence already in the database: `transcript_entries` (grades, credits) and `courses.min_credits` (e.g. 90 CH).

## LinkedIn: what is actually possible without a partnership

- **Sign In with LinkedIn (OpenID Connect)** is self-serve. Scopes `openid profile email`; `/v2/userinfo` returns name,
  picture, locale and email only. Needs a verified LinkedIn Company Page.
  [MS Learn](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2)
- **Positions, skills, education** need the restricted Profile API (approved partners only).
  [Profile API](https://learn.microsoft.com/en-gb/linkedin/shared/integrations/people/profile-api)
- **Member data portability API** is EEA members only, so it does not help Saudi students.
- **Scraping is not allowed** (User Agreement §8; hiQ v. LinkedIn ended with an injunction).
- **Member data export** ("Get a copy of your data") is the realistic import path: the student downloads a ZIP and
  uploads it. Useful CSVs: `Profile`, `Positions`, `Education`, `Skills`, `Certifications`, `Projects`, `Languages`,
  `Honors`. Match headers case-insensitively and treat every file as optional.
  [Help](https://www.linkedin.com/help/linkedin/answer/a1339364/downloading-your-account-data),
  mapping reference: [JMPerez/linkedin-to-json-resume](https://github.com/JMPerez/linkedin-to-json-resume) (MIT)
- **"Add to Profile" links** need no API: the university can push certificates and competition awards to a student's
  LinkedIn. [addtoprofile.linkedin.com](https://addtoprofile.linkedin.com/)
- "Save to PDF" works only for English profiles on desktop; a poor fit for Arabic profiles.

**Approach:** store and validate the public profile URL; import from the export ZIP with a review screen; optional
"Verify with LinkedIn" (OIDC) behind an adapter, simulated until credentials exist; outbound "Add to LinkedIn" buttons.

## Other real data sources

- **GitHub REST API**, public data without auth (60 req/h per IP; cache on the server, skip forks):
  `GET /users/{u}/repos?sort=pushed`, `GET /repos/{o}/{r}/languages`.
  [Rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
- **JSON Resume 1.0.0** (MIT) as the portfolio export format. [Schema](https://jsonresume.org/schema)
- **Open Badges 3.0** as a later format for YU-issued competition badges. [1EdTech](https://www.imsglobal.org/spec/ob/v3p0)

## Open-source projects

| Repo | Licence | Use |
|---|---|---|
| [JMPerez/linkedin-to-json-resume](https://github.com/JMPerez/linkedin-to-json-resume) | MIT | LinkedIn export CSV → JSON Resume mapping |
| [reactive-resume/reactive-resume](https://github.com/reactive-resume/reactive-resume) | MIT | Resume schemas and section UX |
| [arifszn/gitprofile](https://github.com/arifszn/gitprofile) | MIT | Portfolio from GitHub data |
| [github-linguist/linguist](https://github.com/github-linguist/linguist) | MIT | Language aliases and colours |
| [srbhr/Resume-Matcher](https://github.com/srbhr/Resume-Matcher) | Apache-2.0 | Gap-analysis UX ideas |
| [NaturalNode/natural](https://github.com/NaturalNode/natural), [krisk/Fuse](https://github.com/krisk/Fuse) | MIT / Apache-2.0 | TF-IDF, fuzzy search in Node |
| [xitanggg/open-resume](https://github.com/xitanggg/open-resume) | AGPL-3.0 | Ideas only, no code |
| [joshuatz/linkedin-to-jsonresume](https://github.com/joshuatz/linkedin-to-jsonresume) | MIT | Do not use: scrapes LinkedIn pages |

Skills taxonomies: **ESCO** (Arabic labels, essential vs optional skills, free download) is the best seed;
**O\*NET** (CC BY 4.0) adds "Hot Technology" flags; Lightcast Open Skills forbids redistribution; the Saudi HRSD skills
taxonomy is browse-only.

## Matching without paid APIs

1. Normalise skills with a taxonomy (plus Arabic letter normalisation); partial credit through parent/child skills.
2. Split required and preferred skills on each opportunity.
3. Weight each skill by its strongest evidence: self-declared 0.4, passed course 0.6 (+0.2 for B+), linked project 0.7,
   recent GitHub repo 0.75, co-op/work 0.85, verifiable certificate 0.85, competition placement 0.9, university-verified 1.0.
4. Structured eligibility rules from the student record (min credits, GPA, level, majors, required courses), shown as
   met / not met / unknown with "12 CH to go" style messages.
5. Explainable breakdown per score line.

Saudi co-op norms for reference: KFUPM requires more than 85 CH and GPA ≥ 2.00; PSU requires all courses except co-op.
YU's Co-op Policy v3.0 PDF is image-based; **the app's 90 CH / CIS 490 rule should be checked against it.**

## Separating competitions from jobs

Career tabs: **Opportunities** (co-op, internship, graduate jobs, research), **Competitions**, **My applications**
(with the inbox), **Portfolio**.

- Opportunities: type chips, "Eligible now" and "Counts for co-op" toggles, sort by match / closing soon / newest.
- Competitions: segments Open for registration / Upcoming / Past & results; kind chips (Hackathon, Programming, Case,
  Design, Cyber, AI/Data); cards show organiser, format, registration deadline, event dates, team size, eligibility,
  prizes. Own lifecycle: Interested → Registered → Team formed → Submitted → Result; a result becomes a portfolio award.
- Optional live feed: Codeforces `contest.list` (public, no auth).

## Privacy (Saudi PDPL)

Consent per purpose, easy withdrawal, access/correction/deletion rights, processing records. Items private by default
with per-item visibility; import only whitelisted LinkedIn files (never connections, messages or other people's
recommendations); store GitHub username and a derived summary, not tokens; JSON Resume export and "delete all".
