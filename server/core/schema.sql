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
