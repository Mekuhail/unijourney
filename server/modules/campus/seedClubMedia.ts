import type { Db } from '../../core/db.ts';
import { addDays, localToIso, todayIso } from '../../core/clock.ts';
import { registerMigration } from '../../core/migrations.ts';

/**
 * Club posts with media. Four are *past highlights* of real, public YU events, each verified at its source (see
 * docs/research/COMMUNITY-MEDIA.md), paraphrased in a line or two, dated, linked and labelled as past. The images are
 * UniJourney illustrations, not photos from the events: we have no rights to reuse the clubs' photos. One post is
 * fictional demo content (an upcoming open lab that already exists in the demo calendar), marked as such.
 */
export function seedClubMedia(d: Db, today = todayIso()) {
  const has = (t: string, id: string) => !!d.get(`SELECT 1 FROM ${t} WHERE id = ?`, id);
  if (!has('clubs', 'club_gdg')) return;
  const at = (days: number, time: string) => new Date(localToIso(addDays(today, days), time)).toISOString();
  const lead = (club: string) => d.get<{ lead_id: string | null }>('SELECT lead_id FROM clubs WHERE id = ?', club)?.lead_id ?? 'u_lead';
  const post = (id: string, club: string, body: string, created: string, extra: { event_id?: string } = {}) => {
    if (!has('clubs', club)) return false;
    d.insertOrIgnore('club_posts', { id, club_id: club, author_id: lead(club), kind: 'announcement', body, event_id: extra.event_id && has('events', extra.event_id) ? extra.event_id : null, pinned_until: null, answer_comment_id: null, hidden: 0, created_at: created, edited_at: null, removed_at: null, removed_by: null, removed_reason: null });
    return true;
  };
  const media = (postId: string, i: number, file: string, alt_en: string, alt_ar: string) => d.insertOrIgnore('club_post_media', {
    id: `${postId}_m${i}`, post_id: postId, sort: i, kind: 'image', document_id: null, asset_path: `/community/${file}`, width: 1200, height: 675,
    alt_en, alt_ar, caption_en: null, caption_ar: null,
    credit_en: 'Illustration made for this demo, not a photo from the event', credit_ar: 'رسم توضيحي للعرض التجريبي، وليس صورة من الفعالية', created_at: new Date().toISOString()
  });
  const source = (postId: string, url: string, label_en: string, label_ar: string, happened_on: string | null) => d.insertOrIgnore('club_post_sources', { post_id: postId, url, label_en, label_ar, happened_on, highlight: 1 });

  if (post('cpost_hl_packet_tracer', 'club_gdg', 'Looking back: our Cisco Packet Tracer workshop during Ramadan Google Nights. Members built a small network step by step and tested it together, online. Thanks to Dr. Mohammed Obaid for leading it.', at(-6, '20:00'))) {
    media('cpost_hl_packet_tracer', 0, 'gdg-packet-tracer.svg', 'Illustration: routers and switches connected in a small network diagram', 'رسم توضيحي: موجّهات ومبدّلات متصلة في مخطط شبكة صغير');
    source('cpost_hl_packet_tracer', 'https://gdg.community.dev/events/details/google-gdg-on-campus-al-yamamah-university-riyadh-saudi-arabia-presents-cisco-packet-tracer-workshop/', 'Event page on GDG Community', 'صفحة الفعالية على مجتمع GDG', '2026-03-15');
  }
  if (post('cpost_hl_expo_day', 'club_gdg', 'Thank you to everyone who stopped by our table at Student Expo Day. If you signed up to hear about the web and cloud tracks, the first sessions are already on the calendar.', at(-3, '18:30'))) {
    media('cpost_hl_expo_day', 0, 'gdg-expo-day.svg', 'Illustration: club tables with banners in a campus hall', 'رسم توضيحي: طاولات أندية ولافتات في قاعة بالحرم');
    source('cpost_hl_expo_day', 'https://gdg.community.dev/gdg-on-campus-al-yamamah-university-riyadh-saudi-arabia/', 'GDG on Campus YU chapter page', 'صفحة فرع GDG في الجامعة', '2026-09-02');
  }
  if (post('cpost_hl_showcase', 'club_gdg', 'From the archive: the Tech & Innovation Department project showcase in June, where teams presented the projects they had built during the year.', at(-9, '12:00'))) {
    media('cpost_hl_showcase', 0, 'gdg-project-showcase.svg', 'Illustration: presentation screens showing app interfaces', 'رسم توضيحي: شاشات عرض تظهر واجهات تطبيقات');
    source('cpost_hl_showcase', 'https://gdg.community.dev/gdg-on-campus-al-yamamah-university-riyadh-saudi-arabia/', 'GDG on Campus YU chapter page', 'صفحة فرع GDG في الجامعة', '2026-06-01');
  }
  if (post('cpost_hl_spaghetti', 'club_arch', 'A favourite from last semester: the Spaghetti Bridge Challenge, run by the College of Engineering with the Engineering & Architecture Club. Teams designed trusses from dry spaghetti and tested how much load they could carry.', at(-12, '17:00'))) {
    media('cpost_hl_spaghetti', 0, 'arch-spaghetti-bridge.svg', 'Illustration: a truss bridge made of thin sticks holding a hanging weight', 'رسم توضيحي: جسر جملوني من أعواد رفيعة يحمل ثقلًا معلقًا');
    source('cpost_hl_spaghetti', 'https://www.linkedin.com/company/architecture-club-yu', 'Shared on the Architecture Club’s LinkedIn page (Feb 2026)', 'نُشر على صفحة نادي العمارة في لينكدإن (فبراير 2026)', null);
  }
  // Fictional demo content, attached to an event that already exists in the demo calendar.
  if (post('cpost_demo_openlab', 'club_gdg', 'Open lab this week: bring your laptop and your CV. Mentors will review portfolios and help you set up your first GitHub project. Drop in any time during the session.', at(-1, '16:00'), { event_id: 'evt_gdg_openlab' })) {
    media('cpost_demo_openlab', 0, 'gdg-open-lab.svg', 'Illustration: laptops on a shared table with code on the screens', 'رسم توضيحي: حواسيب محمولة على طاولة مشتركة وعلى شاشاتها شيفرة برمجية');
  }
}

registerMigration({ id: 'club-media-v1', description: 'club post media, attributed past highlights and demo illustrations', run: (d) => seedClubMedia(d) });
