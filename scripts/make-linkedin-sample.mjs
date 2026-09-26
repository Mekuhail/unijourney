// Builds client/public/samples/linkedin-export-sample.zip: a synthetic LinkedIn data export for the demo persona
// (Sara). Same file names and columns as the real "Get a copy of your data" archive; every value is invented.
// It also contains files the importer must ignore (Connections.csv, messages.csv) to show that they are never read.
import { zipSync, strToU8 } from 'fflate';
import { writeFileSync } from 'node:fs';

const csv = (rows) => rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n') + '\n';
const files = {
  'Profile.csv': csv([
    ['First Name', 'Last Name', 'Maiden Name', 'Address', 'Birth Date', 'Headline', 'Summary', 'Industry', 'Zip Code', 'Geo Location', 'Twitter Handles', 'Websites', 'Instant Messengers'],
    ['Sara', 'Al-Otaibi', '', '', '', 'Software Engineering student · web and UX', 'Third-year software engineering student at Al Yamamah University. I build web apps with React and Node.js and care about making campus services easier to use.', 'Software Development', '', 'Riyadh, Saudi Arabia', '', '', '']
  ]),
  'Positions.csv': csv([
    ['Company Name', 'Title', 'Description', 'Location', 'Started On', 'Finished On'],
    ['YU IT Help Desk', 'Student assistant (part-time)', 'Answered student tickets, documented fixes and wrote a FAQ that cut repeat questions.', 'Riyadh, Saudi Arabia', 'Feb 2026', 'Jun 2026'],
    ['GDG on Campus – Al Yamamah', 'Web track volunteer', 'Helped run a four-week TypeScript workshop series for first-year students.', 'Riyadh, Saudi Arabia', 'Sep 2025', '']
  ]),
  'Education.csv': csv([
    ['School Name', 'Start Date', 'End Date', 'Notes', 'Degree Name', 'Activities'],
    ['Al Yamamah University', '2024', '2028', '', 'Bachelor of Science - BS, Software Engineering', 'GDG on Campus, Debate & Public Speaking club']
  ]),
  'Skills.csv': csv([['Name'], ['React'], ['Node.js'], ['TypeScript'], ['Figma'], ['SQL'], ['Technical Writing']]),
  'Certifications.csv': csv([
    ['Name', 'Url', 'Authority', 'Started On', 'Finished On', 'License Number'],
    ['Responsive Web Design', 'https://example.org/certificates/demo-rwd', 'freeCodeCamp', 'Jan 2026', '', 'demo-rwd-0001']
  ]),
  'Projects.csv': csv([
    ['Title', 'Description', 'Url', 'Started On', 'Finished On'],
    ['Study room finder', 'A React and Node.js app that shows free study rooms on campus in real time.', 'https://example.org/projects/study-room-finder', 'Mar 2026', 'May 2026'],
    ['Arabic-first to-do app', 'A small RTL-friendly task app built to learn TypeScript and accessibility.', '', 'Oct 2025', 'Nov 2025']
  ]),
  'Languages.csv': csv([['Name', 'Proficiency'], ['Arabic', 'Native or bilingual proficiency'], ['English', 'Full professional proficiency']]),
  'Honors.csv': csv([['Title', 'Description', 'Issued On'], ["Dean's list", 'College of Engineering and Architecture, Fall 2025', 'Jan 2026']]),
  // Present in real exports; the importer must never open these.
  'Connections.csv': csv([['Notes:'], ['First Name', 'Last Name', 'URL', 'Email Address', 'Company', 'Position', 'Connected On'], ['Demo', 'Contact', 'https://example.org', '', 'Example Co', 'Engineer', '01 Jan 2026']]),
  'messages.csv': csv([['CONVERSATION ID', 'FROM', 'TO', 'DATE', 'CONTENT'], ['demo', 'Demo Contact', 'Sara', '2026-01-01', 'This file must never be read by the importer.']])
};
const zipped = zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));
writeFileSync(new URL('../client/public/samples/linkedin-export-sample.zip', import.meta.url), zipped);
console.log('wrote', zipped.length, 'bytes');
