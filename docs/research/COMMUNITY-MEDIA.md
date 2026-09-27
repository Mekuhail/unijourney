# Club media and local examples

Checked on 27 September 2026 (the frozen demo date).

## Verified public YU examples used as past highlights

Each one is paraphrased in a line or two, dated, linked to its source and labelled "Past highlight". None of them is presented as upcoming.

| Post | Club | Date | Source | How confident |
|---|---|---|---|---|
| Cisco Packet Tracer workshop (online, Ramadan Google Nights, led by Dr. Mohammed Obaid) | GDG on Campus YU | 15 Mar 2026 | gdg.community.dev event page | High: event page |
| Student Expo Day: "Discover GDG on Campus YU!" | GDG on Campus YU | 2 Sep 2026 | gdg.community.dev chapter page | High: chapter event list |
| Tech & Innovation Department project showcase | GDG on Campus YU | 1 Jun 2026 | gdg.community.dev chapter page | High. A "Tech & Innovation *Summit*" by that exact name was **not** found, so the verified title is used instead. |
| Spaghetti Bridge Challenge (College of Engineering with the Engineering & Architecture Club) | shown under the demo "Architecture & Design Society" | Feb 2026 (repost date; the original post date is unverified) | linkedin.com/company/architecture-club-yu | Medium: public LinkedIn page |

A fifth candidate was not used:

- **YU Student Clubs Day.** The LinkedIn school page is behind a sign-in. yu.edu.sa documents a clubs introductory day on 24 Jan 2024. It was left out rather than attributed to a demo club.

## Images

- None of the sources grants reuse rights, so **no external photos are used**.
- Each highlight carries an illustration drawn for this demo (`client/public/community/*.svg`). It is credited as "Illustration made for this demo, not a photo from the event".
- Real photos could be added by the clubs themselves through the upload flow, for example with permission from GDG on Campus YU.

## Media model

- `club_post_media`: an uploaded document or a curated asset. Each has width and height (the feed reserves space, so nothing shifts), alt text in English and Arabic, a caption and a credit. Up to four per post.
- `club_post_sources`: the original link, a label, the event date and a "past highlight" flag.
- Uploads reuse the existing documents pipeline (`post_media`, PNG, JPEG or WebP, owned by the poster). Alt text is required, and the same file cannot be attached to two posts. Images are readable by anyone who can see the post.
- Post text, alt text and captions go through the same moderation as the post body.
- The demo content arrives through the `club-media-v1` migration, so existing databases get it once without a reseed.

## Fictional demo content

"Open lab this week" is fictional. It links an event that already exists in the demo calendar, and it has no source line.
