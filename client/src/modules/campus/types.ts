import type { CalendarEntry } from '@shared/types';

export interface UserBrief { id: string; name_en: string; name_ar: string; avatar_color: string; student_no: string | null; program_id: string | null; campus_id: string }

export interface LocationSummary { id: string; campus_id: string; kind: string; name_en: string; name_ar: string; building_id: string | null; building_name_en: string | null; building_name_ar: string | null; floor: number; lat: number; lng: number; accessible: 'yes' | 'no' | 'unknown'; geometry_status: string }

export interface Club {
  id: string; slug: string; name_en: string; name_ar: string; description_en: string; description_ar: string; category: string; lead_id: string | null; color: string; campus_id: string; created_at: string;
  lead: UserBrief | null;
  my_membership: { id: string; status: string; role: string; requested_at: string; decided_at: string | null; note: string | null } | null;
  member_count: number; pending_count: number; upcoming_events: number; tracks: string[]; is_lead: boolean;
  profile: ClubProfile; officers: Officer[]; following: boolean; follower_count: number; next_event: { id: string; title_en: string; title_ar: string; start_at: string } | null;
  posts_this_week: number; can_moderate: boolean; for_you?: ForYou | null;
}

export interface ClubTag { key: string; en: string; ar: string }
export interface ClubProfile { tagline_en: string; tagline_ar: string; tags: ClubTag[]; meets_en: string; meets_ar: string; join_policy: 'open' | 'approval'; join_question_en: string | null; join_question_ar: string | null; founded: string | null; audience: 'all' | 'riyadh' | 'khobar' }
export interface Officer { membership_id: string; user_id: string; role: 'lead' | 'officer'; title_en: string | null; title_ar: string | null; name_en: string; name_ar: string; avatar_color: string; program_id: string | null }
export interface ForYou { score: number; same_campus: boolean; reasons: Array<{ key: string; params: Record<string, string | number> }> }

export interface PostAuthor { id: string; name_en: string; name_ar: string; avatar_color: string; program_id: string | null; role: 'lead' | 'officer' | 'member' | null; title_en: string | null; title_ar: string | null }
export interface PostComment { id: string; author_id: string; body: string; created_at: string; author: PostAuthor | null; is_answer: boolean; can_delete: boolean }
export type PostKind = 'announcement' | 'discussion' | 'question' | 'poll';
export interface Post {
  id: string; club_id: string; kind: PostKind; body: string; created_at: string; edited_at: string | null; pinned: boolean; pinned_until: string | null; hidden: boolean;
  author: PostAuthor | null; event: { id: string; title_en: string; title_ar: string; start_at: string; end_at: string } | null;
  reactions: number; reacted: boolean; comments: PostComment[]; answer_comment_id: string | null;
  poll: { total: number; my_vote: string | null; options: Array<{ id: string; label: string; votes: number | null }> } | null;
  can: { edit: boolean; delete: boolean; pin: boolean; comment: boolean; react: boolean; vote: boolean; accept: boolean; report: boolean };
  club?: { id: string; name_en: string; name_ar: string; color: string };
}
export interface PostList { pinned: Post[]; items: Post[]; members_only_hidden: number; can_post: Record<'announcement' | 'discussion' | 'question' | 'poll', boolean>; open_reports: number }
export interface ClubReport { id: string; post_id: string; comment_id: string | null; reason: string; note: string | null; status: string; created_at: string; post_body: string; post_kind: string; hidden: boolean; comment_body: string | null; author: UserBrief | null }
export interface CheckinState { opens_at: string; closes_at: string; open: boolean; checked_in: { at: string; method: string } | null; count: number; code: string | null; qr_payload: string | null; is_organiser: boolean }

export interface ClubMember { id: string; user_id: string; status: string; role: string; requested_at: string; decided_at?: string | null; note?: string | null; name_en: string; name_ar: string; avatar_color: string; student_no?: string | null; program_id?: string | null; level?: number; title_en?: string | null; title_ar?: string | null; answer?: string | null }

export interface ConflictItem { entry: CalendarEntry; overlapMinutes: number; isClass: boolean }

export interface EventItem {
  id: string; club_id: string | null; kind: 'club' | 'external' | 'personal' | 'university'; title_en: string; title_ar: string; description_en: string; start_at: string; end_at: string; campus_id: string | null; location_id: string | null; venue_text: string | null; capacity: number | null;
  organizer: string; provenance: string; source_url: string | null; evidence_note: string | null; deadline: string | null; eligibility: string | null; tags: string[]; demo_label: boolean; owner_id: string | null; status: string;
  club: { id: string; name_en: string; name_ar: string; color: string; lead_id: string | null } | null;
  location: LocationSummary | null; venue_label: string; going_count: number; waitlist_count: number; remaining: number | null; full: boolean;
  my_rsvp: { status: string; created_at: string } | null; conflicts: ConflictItem[]; can_edit: boolean; is_past: boolean; map_link: string | null;
}

export interface Suggestions { excuseDraftAvailable: boolean; attendanceIds: string[]; mapLink: string | null; studyRepairLink: string; note?: string }
export interface EventDetail extends EventItem { suggestions: Suggestions; checkin: CheckinState | null }
export interface RsvpResult { rsvp: { status: string }; event: EventItem; conflicts: ConflictItem[]; suggestions: Suggestions }

export interface ClubDetail extends Club { events: Array<EventItem & { upcoming: boolean }>; members: ClubMember[]; roster_visible: boolean }

export interface CardData {
  user: { id: string; name_en: string; name_ar: string; student_no: string | null; stage: string; level: number; avatar_color: string };
  program: { code: string; name_en: string; name_ar: string } | null;
  campus: { id: string; name_en: string; name_ar: string } | null;
  memberships: Array<{ role: string; requested_at: string; club_id: string; name_en: string; name_ar: string; color: string; category: string }>;
  achievements: Array<{ id: string; title_en: string; title_ar: string; kind: string; event_id: string | null; club_id: string | null; verified_by: string | null; created_at: string; event_title_en: string | null; event_start_at: string | null; club_name_en: string | null; verified_by_name: string | null }>;
  qr: { payload: string; demo: boolean; note: string };
  issued_at: string;
}

export interface Resource {
  id: string; course_code: string; course_title_en: string | null; course_title_ar: string | null; term: string; term_label: string; term_label_ar: string; type: string; title: string; description: string;
  author: { id: string; name_en: string; name_ar: string; avatar_color: string; program_id: string | null } | null;
  status: string; helpful_count: number; downloads: number; pages: number; language: string; created_at: string; rights_confirmed: boolean; moderation_note: string | null; moderated_by: string | null;
  document: { id: string; filename: string; mime: string; size: number } | null; bookmarked: boolean; voted: boolean; is_owner: boolean; open_reports: number; preview_chars: number;
}
export interface ResourceList { items: Resource[]; facets: { courses: Array<{ course_code: string; n: number }>; terms: Array<{ term: string; label: string; label_ar: string }>; types: readonly string[] } }
export interface ResourcePreview extends Resource { content_text: string; paragraphs: string[]; file_url: string | null }
export interface SummaryResult { points: Array<{ text: string; citation: { paragraph: number; page: number } }>; provider: string; label: string; note: string }
export interface ResourceReport { id: string; resource_id: string; reporter_id: string; reason: string; status: string; created_at: string; resource_title: string; course_code: string; reporter_name: string }
export interface ModerationData { items: Resource[]; reports: ResourceReport[]; counts: { pending: number; reported: number; published: number; rejected: number; open_reports: number } }

export interface Campus { id: string; name_en: string; name_ar: string; city_en: string; city_ar: string; lat: number; lng: number; zoom: number; boundary: Array<[number, number]>; osm_ref: string | null; geometry_status: string; source_note: string | null; locations: number; edges: number }
export interface MapLocation extends LocationSummary { tags: string[]; description_en: string; searchable: boolean; polygon?: Array<[number, number]> | null }
export interface RouteStep { from: string; from_name_en: string; from_name_ar: string; to: string; to_name_en: string; to_name_ar: string; kind: string; meters: number; instruction_en: string; instruction_ar: string; accessible: 'yes' | 'no' | 'unknown' }
export interface RouteResult { found: boolean; reason?: string; reason_code?: string; mode: 'walking' | 'accessible'; from: MapLocation | null; to: MapLocation | null; distance_m: number; duration_min: number; steps: RouteStep[]; polyline: Array<[number, number]>; warnings: string[]; unknownAccessibilitySegments: number; stairsSegments: number; nodes: number }
export interface NextClass { entry: CalendarEntry | null; location: MapLocation | null; note?: string }

export interface TimelineItem { at: string; status: string; by: string | null; note?: string; email_id?: string; collection_location_id?: string }
export interface LostFoundRequest {
  id: string; public_id: string; owner_id: string; campus_id: string; item: string; category: string; lost_date: string; last_location_id: string | null; last_location_text: string; description: string; contact_email: string; document_id: string | null;
  status: string; collection_location_id: string | null; collection_note: string | null; found_by: string | null; found_at: string | null; handover: Record<string, unknown> | null; timeline: TimelineItem[]; created_at: string; updated_at: string;
  owner: UserBrief | null; last_location: LocationSummary | null; collection_location: LocationSummary | null; document: { id: string; filename: string; mime: string; size: number; url: string } | null; found_by_user: UserBrief | null; map_link: string | null; email_id: string | null; is_owner: boolean; reported_local_date: string;
  matched_found_items: Array<{ id: string; item: string; category: string; found_date: string; held_at_location_id: string | null; status: string }>;
}
export interface LostFoundMinimal { public_id: string; status: string; updated_at: string; restricted: true; note: string }
export interface FoundItem { id: string; campus_id: string; reported_by: string; item: string; category: string; description: string; found_location_id: string | null; found_date: string; held_at_location_id: string | null; matched_request_id: string | null; status: string; created_at: string; found_location: LocationSummary | null; held_at: LocationSummary | null; reporter: UserBrief | null; matched_request: { id: string; public_id: string; item: string; status: string } | null; suggested_count: number }
export interface MatchSuggestion { request_id: string; public_id: string; item: string; category: string; lost_date: string; last_location: string; status: string; owner: UserBrief | null; score: number; reasons: string[] }
export interface LfLocations { locations: Array<{ id: string; campus_id: string; kind: string; name_en: string; name_ar: string; building_id: string | null }>; collection_points: Array<{ id: string; campus_id: string; kind: string; name_en: string; name_ar: string }>; categories: readonly string[] }
