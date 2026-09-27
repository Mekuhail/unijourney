-- UniJourney schema (SQLite). All records synthetic demo data unless documented otherwise.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  roles TEXT NOT NULL DEFAULT '["student"]',   -- JSON array: applicant|student|reviewer|club_lead|security|operator|admission_officer|registrar
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  email TEXT NOT NULL,
  student_no TEXT,
  program_id TEXT,
  campus_id TEXT NOT NULL DEFAULT 'riyadh',
  stage TEXT NOT NULL DEFAULT 'current', -- applicant|admitted|orientation|current|graduating|alumni|staff
  level INTEGER NOT NULL DEFAULT 1,
  locale TEXT NOT NULL DEFAULT 'en',
  interests TEXT NOT NULL DEFAULT '[]',
  skills TEXT NOT NULL DEFAULT '[]',
  preferences TEXT NOT NULL DEFAULT '{}',
  avatar_color TEXT NOT NULL DEFAULT '#F0762B',
  department TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  link TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS email_outbox (
  id TEXT PRIMARY KEY,
  to_user_id TEXT,
  to_address TEXT NOT NULL,
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'simulated',   -- simulated (never sent) | sent (only if SMTP configured+authorized)
  module TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS calendar_entries (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,   -- section|exam|event|interview|task|personal|deadline
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  tz TEXT NOT NULL DEFAULT 'Asia/Riyadh',
  location_id TEXT,
  location_text TEXT,
  immovable INTEGER NOT NULL DEFAULT 0,
  link TEXT,
  meta TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  UNIQUE(owner_id, source_type, source_id)
);
CREATE INDEX IF NOT EXISTS idx_calendar_owner ON calendar_entries(owner_id, start_at);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,          -- medical|event_evidence|admission|lost_item|resource|cv|other
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  label TEXT,
  meta TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_events(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,           -- enrollment|excuse|study_plan|graduation|admission
  entity_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  payload_hash TEXT NOT NULL,
  status TEXT NOT NULL,         -- approved|invalidated|consumed|expired
  expires_at TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  decided_at TEXT
);

-- ---------------------------------------------------------------- admission
CREATE TABLE IF NOT EXISTS programs (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name_en TEXT NOT NULL, name_ar TEXT NOT NULL,
  college_en TEXT NOT NULL, college_ar TEXT NOT NULL,
  degree TEXT NOT NULL,
  total_credits INTEGER NOT NULL,
  duration_years REAL NOT NULL,
  description_en TEXT NOT NULL DEFAULT '',
  description_ar TEXT NOT NULL DEFAULT '',
  criteria TEXT NOT NULL DEFAULT '[]',      -- illustrative, labeled
  campus_ids TEXT NOT NULL DEFAULT '["riyadh"]',
  source_url TEXT,
  source_note TEXT
);

CREATE TABLE IF NOT EXISTS admission_applications (
  id TEXT PRIMARY KEY,
  applicant_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  program_id TEXT NOT NULL,
  campus_id TEXT NOT NULL DEFAULT 'riyadh',
  status TEXT NOT NULL DEFAULT 'draft',  -- draft|submitted|under_review|needs_information|admitted|rejected|enrolled
  personal TEXT NOT NULL DEFAULT '{}',
  checklist TEXT NOT NULL DEFAULT '[]',
  receipt TEXT,
  timeline TEXT NOT NULL DEFAULT '[]',
  reviewer_id TEXT,
  reviewer_note TEXT,
  submitted_at TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS application_documents (
  application_id TEXT NOT NULL REFERENCES admission_applications(id) ON DELETE CASCADE,
  checklist_key TEXT NOT NULL,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  PRIMARY KEY(application_id, checklist_key)
);

CREATE TABLE IF NOT EXISTS onboarding (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  steps TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);

-- ---------------------------------------------------------------- academics
CREATE TABLE IF NOT EXISTS courses (
  code TEXT PRIMARY KEY,
  title_en TEXT NOT NULL,
  title_ar TEXT NOT NULL DEFAULT '',
  credits INTEGER NOT NULL,
  dept TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  prereqs TEXT NOT NULL DEFAULT '[]',        -- JSON: array of groups, each group = array of alternative codes (AND of ORs)
  coreqs TEXT NOT NULL DEFAULT '[]',
  min_credits INTEGER NOT NULL DEFAULT 0,    -- e.g. 90 CH rule
  category TEXT NOT NULL DEFAULT 'major',    -- core|major|major_elective|hss_elective|gen|orientation
  description_en TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'demo'
);

CREATE TABLE IF NOT EXISTS course_sections (
  id TEXT PRIMARY KEY,
  course_code TEXT NOT NULL REFERENCES courses(code) ON DELETE CASCADE,
  term TEXT NOT NULL,
  section_no TEXT NOT NULL,
  instructor TEXT NOT NULL,
  campus_id TEXT NOT NULL DEFAULT 'riyadh',
  capacity INTEGER NOT NULL,
  enrolled INTEGER NOT NULL DEFAULT 0,
  meetings TEXT NOT NULL DEFAULT '[]',   -- [{day:0..6 (0=Sunday), start:'08:00', end:'09:15', location_id}]
  status TEXT NOT NULL DEFAULT 'open',   -- open|closed|cancelled
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_sections_term ON course_sections(term, course_code);

CREATE TABLE IF NOT EXISTS degree_requirements (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL,
  category TEXT NOT NULL,
  label_en TEXT NOT NULL, label_ar TEXT NOT NULL,
  required_credits INTEGER NOT NULL,
  course_codes TEXT NOT NULL DEFAULT '[]',
  min_courses INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transcript_entries (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_code TEXT NOT NULL,
  term TEXT NOT NULL,
  status TEXT NOT NULL,    -- completed|enrolled|planned|equivalent|failed|withdrawn
  grade TEXT,
  credits INTEGER NOT NULL,
  section_id TEXT,
  evidence TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(student_id, course_code, term)
);

CREATE TABLE IF NOT EXISTS enrollment_proposals (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  term TEXT NOT NULL,
  section_ids TEXT NOT NULL DEFAULT '[]',
  credits INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',  -- draft|needs_review|approved|submitting|submitted|partial|failed|outcome_unknown
  revision INTEGER NOT NULL DEFAULT 1,
  payload_hash TEXT NOT NULL DEFAULT '',
  checks TEXT NOT NULL DEFAULT '[]',
  rationale TEXT NOT NULL DEFAULT '',
  preferences TEXT NOT NULL DEFAULT '{}',
  options TEXT NOT NULL DEFAULT '[]',
  action_log TEXT NOT NULL DEFAULT '[]',
  approval_id TEXT,
  operation_id TEXT,
  receipt TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS portal_operations (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,           -- enrollment|excuse
  student_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,         -- pending|committed|partial|failed
  result TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section_id TEXT NOT NULL,
  course_code TEXT NOT NULL,
  session_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  location_id TEXT,
  status TEXT NOT NULL,          -- present|absent|late|excused
  original_status TEXT NOT NULL,
  excuse_request_id TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(student_id, section_id, session_date, start_time)
);

CREATE TABLE IF NOT EXISTS excuse_requests (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attendance_ids TEXT NOT NULL DEFAULT '[]',
  type TEXT NOT NULL,            -- medical|event|other
  reason TEXT NOT NULL DEFAULT '',
  from_date TEXT,
  to_date TEXT,
  reference TEXT,
  document_ids TEXT NOT NULL DEFAULT '[]',
  extracted TEXT NOT NULL DEFAULT '{}',
  event_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft',  -- draft|ready|approved|submitting|submitted|under_review|needs_information|accepted|rejected|failed|outcome_unknown
  portal_request_id TEXT,
  review_department TEXT NOT NULL DEFAULT 'Deanship of Student Affairs (demo)',
  reviewer_id TEXT,
  reviewer_note TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  payload_hash TEXT NOT NULL DEFAULT '',
  approval_id TEXT,
  operation_id TEXT,
  history TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS study_settings (
  student_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  daily_capacity_min INTEGER NOT NULL DEFAULT 180,
  weekday_capacity TEXT NOT NULL DEFAULT '{}',   -- {"5":60} overrides by weekday
  unavailable_dates TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS study_tasks (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_code TEXT,
  title TEXT NOT NULL,
  effort_min INTEGER NOT NULL,
  deadline TEXT,
  scheduled_date TEXT,
  locked INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'todo',   -- todo|partial|done
  progress INTEGER NOT NULL DEFAULT 0,
  actual_min INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual', -- manual|nl|enrollment|resource|event|repair
  resource_id TEXT,
  event_id TEXT,
  notes TEXT,
  priority INTEGER NOT NULL DEFAULT 2,
  history TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS study_plan_versions (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  reason TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS study_proposals (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,          -- schedule|repair
  trigger TEXT NOT NULL,
  before_state TEXT NOT NULL,
  after_state TEXT NOT NULL,
  changes TEXT NOT NULL DEFAULT '[]',
  infeasible TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'preview',  -- preview|applied|discarded
  created_at TEXT NOT NULL,
  applied_at TEXT
);

CREATE TABLE IF NOT EXISTS study_intake (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  raw_text TEXT NOT NULL,
  parsed TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL
);

-- ---------------------------------------------------------------- campus
CREATE TABLE IF NOT EXISTS campuses (
  id TEXT PRIMARY KEY,
  name_en TEXT NOT NULL, name_ar TEXT NOT NULL,
  city_en TEXT NOT NULL, city_ar TEXT NOT NULL,
  lat REAL NOT NULL, lng REAL NOT NULL, zoom REAL NOT NULL DEFAULT 17,
  boundary TEXT NOT NULL DEFAULT '[]',   -- [[lat,lng],...]
  osm_ref TEXT,
  geometry_status TEXT NOT NULL DEFAULT 'approx',   -- osm|approx|synthetic
  source_note TEXT
);

CREATE TABLE IF NOT EXISTS campus_locations (
  id TEXT PRIMARY KEY,
  campus_id TEXT NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,            -- building|room|entrance|library|service|security|parking|cafe|gate|mosque|lab|hall|outdoor|junction
  name_en TEXT NOT NULL, name_ar TEXT NOT NULL,
  building_id TEXT,
  floor INTEGER NOT NULL DEFAULT 0,
  lat REAL NOT NULL, lng REAL NOT NULL,
  accessible TEXT NOT NULL DEFAULT 'unknown',  -- yes|no|unknown
  tags TEXT NOT NULL DEFAULT '[]',
  description_en TEXT NOT NULL DEFAULT '',
  geometry_status TEXT NOT NULL DEFAULT 'synthetic',
  searchable INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_locations_campus ON campus_locations(campus_id);

CREATE TABLE IF NOT EXISTS path_edges (
  id TEXT PRIMARY KEY,
  campus_id TEXT NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  meters REAL NOT NULL,
  kind TEXT NOT NULL DEFAULT 'walkway',   -- walkway|indoor|stairs|ramp|elevator|road|crossing
  accessible TEXT NOT NULL DEFAULT 'unknown',
  bidirectional INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'synthetic'
);

CREATE TABLE IF NOT EXISTS clubs (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name_en TEXT NOT NULL, name_ar TEXT NOT NULL,
  description_en TEXT NOT NULL DEFAULT '', description_ar TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  lead_id TEXT,
  color TEXT NOT NULL DEFAULT '#F0762B',
  campus_id TEXT NOT NULL DEFAULT 'riyadh',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL,     -- pending|active|rejected|left
  role TEXT NOT NULL DEFAULT 'member',
  requested_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by TEXT,
  note TEXT,
  UNIQUE(club_id, user_id)
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  club_id TEXT REFERENCES clubs(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,          -- club|external|personal|university
  title_en TEXT NOT NULL, title_ar TEXT NOT NULL DEFAULT '',
  description_en TEXT NOT NULL DEFAULT '',
  start_at TEXT NOT NULL, end_at TEXT NOT NULL,
  tz TEXT NOT NULL DEFAULT 'Asia/Riyadh',
  campus_id TEXT,
  location_id TEXT,
  venue_text TEXT,
  capacity INTEGER,
  organizer TEXT NOT NULL DEFAULT '',
  provenance TEXT NOT NULL DEFAULT 'demo',
  source_url TEXT,
  evidence_note TEXT,
  deadline TEXT,
  eligibility TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  demo_label INTEGER NOT NULL DEFAULT 1,
  owner_id TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rsvps (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL,   -- going|cancelled|waitlisted
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(event_id, user_id)
);

CREATE TABLE IF NOT EXISTS achievements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_en TEXT NOT NULL, title_ar TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL,
  event_id TEXT,
  club_id TEXT,
  verified_by TEXT,
  evidence_document_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS resources (
  id TEXT PRIMARY KEY,
  course_code TEXT NOT NULL,
  term TEXT NOT NULL,
  type TEXT NOT NULL,        -- notes|slides|summary|past_exam|cheatsheet|lab
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_id TEXT,
  content_text TEXT NOT NULL DEFAULT '',   -- seeded original text for preview / cited summaries
  rights_confirmed INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending|published|rejected|reported
  helpful_count INTEGER NOT NULL DEFAULT 0,
  downloads INTEGER NOT NULL DEFAULT 0,
  pages INTEGER NOT NULL DEFAULT 1,
  language TEXT NOT NULL DEFAULT 'en',
  moderated_by TEXT,
  moderation_note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS resource_bookmarks (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY(user_id, resource_id)
);

CREATE TABLE IF NOT EXISTS resource_votes (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY(user_id, resource_id)
);

CREATE TABLE IF NOT EXISTS resource_reports (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  reporter_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lost_found_requests (
  id TEXT PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campus_id TEXT NOT NULL DEFAULT 'riyadh',
  item TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  lost_date TEXT NOT NULL,
  last_location_id TEXT,
  last_location_text TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL,
  document_id TEXT,
  status TEXT NOT NULL DEFAULT 'reported',  -- reported|searching|found|ready_for_collection|collected|closed
  collection_location_id TEXT,
  collection_note TEXT,
  found_by TEXT,
  found_at TEXT,
  handover TEXT,
  timeline TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS found_items (
  id TEXT PRIMARY KEY,
  campus_id TEXT NOT NULL DEFAULT 'riyadh',
  reported_by TEXT NOT NULL,
  item TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  description TEXT NOT NULL DEFAULT '',
  found_location_id TEXT,
  found_date TEXT NOT NULL,
  held_at_location_id TEXT,
  matched_request_id TEXT,
  status TEXT NOT NULL DEFAULT 'held',   -- held|matched|returned
  created_at TEXT NOT NULL
);

-- ---------------------------------------------------------------- career
CREATE TABLE IF NOT EXISTS opportunities (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  source_id TEXT NOT NULL,
  url TEXT,
  normalized_url TEXT,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  type TEXT NOT NULL,          -- internship|coop|entry|research|competition
  location TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  remote TEXT NOT NULL DEFAULT 'onsite',  -- onsite|remote|hybrid
  field TEXT NOT NULL DEFAULT '',
  skills TEXT NOT NULL DEFAULT '[]',
  eligibility TEXT NOT NULL DEFAULT '',
  deadline TEXT,
  posted_at TEXT,
  last_checked_at TEXT,
  status TEXT NOT NULL DEFAULT 'demo',   -- active|expired|unverified|demo
  description TEXT NOT NULL DEFAULT '',
  salary TEXT,
  demo_label INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  UNIQUE(source, source_id)
);

CREATE TABLE IF NOT EXISTS saved_opportunities (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY(user_id, opportunity_id)
);

CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opportunity_id TEXT REFERENCES opportunities(id) ON DELETE SET NULL,
  company TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT,
  normalized_url TEXT,
  type TEXT NOT NULL DEFAULT 'internship',
  status TEXT NOT NULL DEFAULT 'saved',  -- saved|preparing|applied|assessment|interview|offer|rejected|withdrawn
  notes TEXT NOT NULL DEFAULT '',
  cv_version TEXT,
  deadline TEXT,
  applied_at TEXT,
  attested_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_student_opp ON applications(student_id, opportunity_id) WHERE opportunity_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS application_events (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_id TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS interviews (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  start_at TEXT NOT NULL, end_at TEXT NOT NULL,
  tz TEXT NOT NULL DEFAULT 'Asia/Riyadh',
  location TEXT, link TEXT,
  kind TEXT NOT NULL DEFAULT 'interview',
  notes TEXT,
  calendar_entry_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hiring_emails (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_address TEXT NOT NULL,
  subject TEXT NOT NULL,
  snippet TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  received_at TEXT NOT NULL,
  category TEXT,
  confidence REAL NOT NULL DEFAULT 0,
  suggested_application_id TEXT,
  suggested_status TEXT,
  review_status TEXT NOT NULL DEFAULT 'pending',  -- auto_applied|pending|accepted|dismissed
  matched_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS career_profiles (
  student_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  headline TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  skills TEXT NOT NULL DEFAULT '[]',
  links TEXT NOT NULL DEFAULT '{}',
  cv_versions TEXT NOT NULL DEFAULT '[]',
  availability TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

-- ---------------------------------------------------------------- portfolio (career)
-- Items carry their source (manual, linkedin_export, github, university, competition) and a verification level
-- (self, link, issuer, university). Visibility is per item; everything is private unless the student shares it.
CREATE TABLE IF NOT EXISTS portfolio_items (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,           -- project|experience|certificate|award|volunteer|language|education
  title TEXT NOT NULL,
  org TEXT NOT NULL DEFAULT '',
  start_date TEXT,
  end_date TEXT,
  description TEXT NOT NULL DEFAULT '',
  url TEXT,
  credential_id TEXT,
  skills TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL DEFAULT 'manual',
  source_ref TEXT,
  verification TEXT NOT NULL DEFAULT 'self',
  visibility TEXT NOT NULL DEFAULT 'private',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_portfolio_student ON portfolio_items(student_id, kind);

-- Linked accounts. LinkedIn stores only the public profile URL; GitHub stores a cached public summary (no tokens).
CREATE TABLE IF NOT EXISTS external_accounts (
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,       -- linkedin|github
  handle TEXT NOT NULL,
  url TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  method TEXT NOT NULL DEFAULT 'url',   -- url|oidc_simulated|public_api
  last_synced_at TEXT,
  data TEXT NOT NULL DEFAULT 'null',
  error TEXT,
  PRIMARY KEY(student_id, provider)
);

-- Consent per purpose (Saudi PDPL): documented, specific, and as easy to withdraw as to give.
CREATE TABLE IF NOT EXISTS portfolio_consents (
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,        -- matching|staff_view
  text_version TEXT NOT NULL,
  granted_at TEXT,
  withdrawn_at TEXT,
  PRIMARY KEY(student_id, purpose)
);

-- ---------------------------------------------------------------- competitions (career)
CREATE TABLE IF NOT EXISTS competitions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  organiser TEXT NOT NULL,
  kind TEXT NOT NULL,           -- hackathon|programming|case|design|cyber|ai_data
  scope TEXT NOT NULL,          -- yu|saudi|international|online
  format TEXT NOT NULL,         -- onsite|online|hybrid
  city TEXT NOT NULL DEFAULT '',
  registration_opens TEXT,
  registration_deadline TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  team_min INTEGER NOT NULL DEFAULT 1,
  team_max INTEGER NOT NULL DEFAULT 1,
  eligibility TEXT NOT NULL DEFAULT '',
  prizes TEXT NOT NULL DEFAULT '',
  fee TEXT NOT NULL DEFAULT '',
  url TEXT,
  skills TEXT NOT NULL DEFAULT '[]',
  description TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'yu',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS competition_entries (
  id TEXT PRIMARY KEY,
  competition_id TEXT NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL,         -- interested|registered|team_formed|submitted|result
  team_name TEXT,
  result TEXT,
  portfolio_item_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(competition_id, student_id)
);

-- ---------------------------------------------------------------- graduation
CREATE TABLE IF NOT EXISTS graduation_requests (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft',   -- draft|submitted|under_review|approved|rejected
  audit_snapshot TEXT NOT NULL DEFAULT '{}',
  reviewer_id TEXT,
  reviewer_note TEXT,
  receipt TEXT,
  submitted_at TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clearance_items (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  label_en TEXT NOT NULL, label_ar TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending|cleared|blocked
  cleared_by TEXT,
  cleared_at TEXT,
  note TEXT,
  UNIQUE(student_id, key)
);

-- ---------------------------------------------------------------- club community (campus)
-- New tables rather than new columns: the schema has no migration step and existing volumes keep their tables.
CREATE TABLE IF NOT EXISTS club_profiles (
  club_id TEXT PRIMARY KEY REFERENCES clubs(id) ON DELETE CASCADE,
  tagline_en TEXT NOT NULL DEFAULT '', tagline_ar TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',          -- interest keys used for "For you" ranking
  meets_en TEXT NOT NULL DEFAULT '', meets_ar TEXT NOT NULL DEFAULT '',
  join_policy TEXT NOT NULL DEFAULT 'approval',   -- open|approval
  join_question_en TEXT, join_question_ar TEXT,
  founded TEXT,
  audience TEXT NOT NULL DEFAULT 'all'      -- all|riyadh|khobar (staff-set)
);

CREATE TABLE IF NOT EXISTS club_member_titles (
  membership_id TEXT PRIMARY KEY REFERENCES memberships(id) ON DELETE CASCADE,
  title_en TEXT NOT NULL, title_ar TEXT NOT NULL DEFAULT '',
  show_in_roster INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS club_join_answers (
  membership_id TEXT PRIMARY KEY REFERENCES memberships(id) ON DELETE CASCADE,
  answer TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS club_follows (
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (club_id, user_id)
);

CREATE TABLE IF NOT EXISTS club_posts (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                 -- announcement|discussion|question|poll
  body TEXT NOT NULL,
  event_id TEXT,
  pinned_until TEXT,                  -- announcements only; NULL = not pinned
  answer_comment_id TEXT,             -- questions: the accepted answer
  hidden INTEGER NOT NULL DEFAULT 0,  -- auto-hidden after repeated reports, pending the lead's review
  created_at TEXT NOT NULL,
  edited_at TEXT,
  removed_at TEXT, removed_by TEXT, removed_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_club_posts_club ON club_posts(club_id, created_at);

CREATE TABLE IF NOT EXISTS club_comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES club_posts(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  removed_at TEXT, removed_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_club_comments_post ON club_comments(post_id, created_at);

CREATE TABLE IF NOT EXISTS club_reactions (
  post_id TEXT NOT NULL REFERENCES club_posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS club_poll_options (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES club_posts(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS club_poll_votes (
  post_id TEXT NOT NULL REFERENCES club_posts(id) ON DELETE CASCADE,
  option_id TEXT NOT NULL REFERENCES club_poll_options(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS club_reports (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL REFERENCES club_posts(id) ON DELETE CASCADE,
  comment_id TEXT,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,               -- spam|harassment|off_topic|personal_info|other
  note TEXT,
  status TEXT NOT NULL DEFAULT 'open',  -- open|dismissed|removed
  created_at TEXT NOT NULL,
  resolved_at TEXT, resolved_by TEXT,
  UNIQUE(post_id, comment_id, reporter_id)
);

CREATE TABLE IF NOT EXISTS event_checkins (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  method TEXT NOT NULL,               -- qr_self|lead_manual
  created_at TEXT NOT NULL,
  PRIMARY KEY (event_id, user_id)
);

-- ---------------------------------------------------------------- feedback & help
-- Course feedback is anonymous in every read path: student_id exists only to check eligibility and stop duplicates.
CREATE TABLE IF NOT EXISTS course_feedback (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_code TEXT NOT NULL,
  term TEXT NOT NULL,
  section_id TEXT,
  instructor TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'end_of_term',   -- end_of_term|mid_term
  ratings TEXT NOT NULL,             -- {"clarity":1..5,"grading":..,"support":..,"organisation":..,"workload":..,"value":..}
  recommend INTEGER,                 -- 1|0|NULL
  hours_per_week INTEGER,
  comment TEXT NOT NULL DEFAULT '',  -- private: turned into theme counts, never returned to other students
  themes TEXT NOT NULL DEFAULT '[]', -- [{"key":"examples","tone":"strength"|"suggestion"}]
  status TEXT NOT NULL DEFAULT 'published',   -- published|held|rejected
  flags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(student_id, course_code, term)
);
CREATE INDEX IF NOT EXISTS idx_feedback_course ON course_feedback(course_code, term);
CREATE INDEX IF NOT EXISTS idx_feedback_instructor ON course_feedback(instructor, term);

CREATE TABLE IF NOT EXISTS feedback_actions (
  id TEXT PRIMARY KEY,
  course_code TEXT,
  instructor TEXT,
  kpi TEXT NOT NULL,
  body_en TEXT NOT NULL, body_ar TEXT NOT NULL DEFAULT '',
  author_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS help_tickets (
  id TEXT PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,            -- bug|suggestion|question|account|other
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  page TEXT,
  status TEXT NOT NULL DEFAULT 'open',   -- open|answered|closed
  reply TEXT,
  replied_by TEXT,
  replied_at TEXT,
  created_at TEXT NOT NULL
);

-- ---------------------------------------------------------------- campus community (profiles, student posts, messages)
-- Added by migration 'community-social-v1' on existing volumes (see server/core/migrations.ts); every table is new.
CREATE TABLE IF NOT EXISTS community_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT,                     -- NULL = the name on the student record
  bio TEXT NOT NULL DEFAULT '',
  avatar_color TEXT,                     -- NULL = the account colour
  show_program INTEGER NOT NULL DEFAULT 1,
  show_campus INTEGER NOT NULL DEFAULT 1,
  show_clubs INTEGER NOT NULL DEFAULT 1,
  dm_policy TEXT NOT NULL DEFAULT 'everyone',   -- everyone|club_mates|nobody
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS social_posts (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  media_document_id TEXT,
  media_alt TEXT,
  event_id TEXT,
  club_id TEXT,                          -- optional tag: a club the author belongs to
  audience TEXT NOT NULL DEFAULT 'all',  -- all|campus
  campus_id TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  edited_at TEXT,
  removed_at TEXT, removed_by TEXT, removed_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_social_posts_created ON social_posts(created_at);
CREATE INDEX IF NOT EXISTS idx_social_posts_author ON social_posts(author_id);

CREATE TABLE IF NOT EXISTS social_comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  removed_at TEXT, removed_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_social_comments_post ON social_comments(post_id);

CREATE TABLE IF NOT EXISTS social_likes (
  post_id TEXT NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS community_reports (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,             -- social_post|social_comment|message
  target_id TEXT NOT NULL,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'open',   -- open|dismissed|removed
  created_at TEXT NOT NULL,
  resolved_at TEXT, resolved_by TEXT,
  UNIQUE(target_type, target_id, reporter_id)
);

CREATE TABLE IF NOT EXISTS dm_conversations (
  id TEXT PRIMARY KEY,
  user_a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,   -- user_a < user_b
  user_b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  last_message_at TEXT,
  a_read_seq INTEGER NOT NULL DEFAULT 0,   -- rowid of the last message each side has read
  b_read_seq INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_a, user_b)
);

CREATE TABLE IF NOT EXISTS dm_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  removed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_dm_messages_conv ON dm_messages(conversation_id);

CREATE TABLE IF NOT EXISTS dm_blocks (
  blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);

-- ---------------------------------------------------------------- parking occupancy (campus map)
-- Added by migration 'parking-v1'. Bay geometry is fixed; occupancy is computed from simulated sensor readings.
CREATE TABLE IF NOT EXISTS parking_lots (
  location_id TEXT PRIMARY KEY REFERENCES campus_locations(id) ON DELETE CASCADE,
  campus_id TEXT NOT NULL,
  audience TEXT NOT NULL,              -- student|staff|visitor|mixed
  detection TEXT NOT NULL,             -- bay_sensor|entry_exit (FIWARE occupancyDetectionType: singleSpaceDetection|balancing)
  total_bays INTEGER NOT NULL,
  entry_lat REAL, entry_lng REAL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS parking_bays (
  id TEXT PRIMARY KEY,
  lot_id TEXT NOT NULL REFERENCES parking_lots(location_id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  kind TEXT NOT NULL,                  -- standard|disabled|visitor|staff|ev
  polygon TEXT NOT NULL,               -- [[lat,lng] x4]
  center_lat REAL NOT NULL, center_lng REAL NOT NULL,
  fill_rank REAL NOT NULL,             -- 0 = next to the entrance (fills first) .. 1 = farthest
  closed INTEGER NOT NULL DEFAULT 0,   -- coned off for maintenance (set by campus security)
  closed_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_parking_bays_lot ON parking_bays(lot_id, ordinal);

-- ---------------------------------------------------------------- study planner: professor announcements (academics)
-- Added by migration 'planner-v1'. A course email is parsed into an assessment, which becomes a to-do and a calendar
-- entry for every enrolled student; manual tasks keep using study_tasks, with exact times in study_task_times.
CREATE TABLE IF NOT EXISTS course_emails (
  id TEXT PRIMARY KEY,
  course_code TEXT NOT NULL,
  term TEXT NOT NULL,
  section_id TEXT,                      -- NULL = every section of the course this term
  from_name TEXT NOT NULL,
  from_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'email', -- email|lms|syllabus
  received_at TEXT NOT NULL,
  assessment_id TEXT,
  parse_note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_course_emails_course ON course_emails(course_code, term);

CREATE TABLE IF NOT EXISTS course_assessments (
  id TEXT PRIMARY KEY,
  course_code TEXT NOT NULL,
  term TEXT NOT NULL,
  section_id TEXT,
  kind TEXT NOT NULL,                   -- quiz|midterm|final|assignment|project|lab|presentation
  number INTEGER,
  title TEXT NOT NULL,                  -- the announcement's own subject line
  description TEXT NOT NULL,            -- the announcement's own text
  due_at TEXT NOT NULL,
  end_at TEXT,
  all_day INTEGER NOT NULL DEFAULT 0,
  location_id TEXT,
  location_text TEXT,
  email_id TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',   -- scheduled|cancelled
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS study_task_times (
  task_id TEXT PRIMARY KEY REFERENCES study_tasks(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'task',    -- task|reminder|assessment
  due_at TEXT,                          -- exact date-time (ISO); NULL = no time
  start_at TEXT, end_at TEXT,           -- a block on the schedule (drag to move)
  remind_at TEXT,
  reminded INTEGER NOT NULL DEFAULT 0,
  urgency TEXT NOT NULL DEFAULT 'medium',   -- high|medium|low
  assessment_id TEXT
);

-- GPA planner: one private, versioned document per student (current-course estimates and future scenarios).
-- The transcript stays the read-only baseline; nothing in this table changes official grades.
CREATE TABLE IF NOT EXISTS gpa_plans (student_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, doc TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL);

-- Classmate coordination for next term's registration: opt-in, revocable, nothing shared by default.
CREATE TABLE IF NOT EXISTS peer_invites (code TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, term TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, used_by TEXT, used_at TEXT);
CREATE TABLE IF NOT EXISTS peer_links (id TEXT PRIMARY KEY, a_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, b_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, term TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL, revoked_by TEXT, revoked_at TEXT);
CREATE INDEX IF NOT EXISTS idx_peer_links_a ON peer_links(a_id, term);
CREATE INDEX IF NOT EXISTS idx_peer_links_b ON peer_links(b_id, term);
CREATE TABLE IF NOT EXISTS peer_shares (link_id TEXT NOT NULL REFERENCES peer_links(id) ON DELETE CASCADE, user_id TEXT NOT NULL, course_code TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (link_id, user_id, course_code));
CREATE TABLE IF NOT EXISTS peer_proposals (id TEXT PRIMARY KEY, link_id TEXT NOT NULL REFERENCES peer_links(id) ON DELETE CASCADE, from_id TEXT NOT NULL, to_id TEXT NOT NULL, course_code TEXT NOT NULL, section_id TEXT NOT NULL, note TEXT, status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, result TEXT);

-- Club post media: uploads (documents) or curated demo illustrations (asset_path), always with alt text and size.
CREATE TABLE IF NOT EXISTS club_post_media (id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES club_posts(id) ON DELETE CASCADE, sort INTEGER NOT NULL DEFAULT 0, kind TEXT NOT NULL DEFAULT 'image', document_id TEXT, asset_path TEXT, width INTEGER NOT NULL, height INTEGER NOT NULL, alt_en TEXT NOT NULL, alt_ar TEXT, caption_en TEXT, caption_ar TEXT, credit_en TEXT, credit_ar TEXT, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_club_post_media_post ON club_post_media(post_id, sort);
-- Attribution for posts that retell a real, public YU event (past highlights): the original link and its date.
CREATE TABLE IF NOT EXISTS club_post_sources (post_id TEXT PRIMARY KEY REFERENCES club_posts(id) ON DELETE CASCADE, url TEXT NOT NULL, label_en TEXT NOT NULL, label_ar TEXT, happened_on TEXT, highlight INTEGER NOT NULL DEFAULT 0);

-- Portfolio entry details: where, what came of it, the student's own order, and whether an import still needs review.
CREATE TABLE IF NOT EXISTS portfolio_item_extra (item_id TEXT PRIMARY KEY REFERENCES portfolio_items(id) ON DELETE CASCADE, location TEXT, outcomes TEXT NOT NULL DEFAULT '[]', sort INTEGER, needs_review INTEGER NOT NULL DEFAULT 0);
