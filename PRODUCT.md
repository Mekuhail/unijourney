# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Al Yamamah University students, mostly on phones between classes: checking what is next, excusing an absence, finding a room, tracking an application. Secondary audiences: university staff personas (reviewer, security, admissions/registrar, club lead) working their queues, and hackathon judges walking the demo.

## Product Purpose

UniJourney connects the student journey from admission to graduation and career in one workspace: timetable and registration, attendance excuses, study planning, prerequisite chains, campus life and navigation, lost and found, career tracking, and graduation. Success is a student finishing a task in a few taps with the right information visible on first paint.

## Operating Context

Register: product (app UI; the design serves the task, not persuasion). Used one-handed on phones at ~375 px, and on laptops. English and Arabic (RTL), Asia/Riyadh time, Sunday–Thursday teaching week. Deployed demo at https://unijourney-yu-a12fda.fly.dev with a frozen demo clock and switchable synthetic personas.

## Capabilities and Constraints

React 19 + Tailwind v4 client, Express + SQLite server. Backend behaviour and API contracts are fixed during design passes. EduGate, Sehhaty, email and job boards are simulated behind adapters; every record is synthetic.

## Brand Commitments

Warm dark theme with a light counterpart; EduGate orange accent with YU gold; Inter for Latin and IBM Plex Sans Arabic for Arabic. The campus community uses Reem Kufi (Kufic, with a matching Latin) for headings only. Tone: calm and trustworthy.

## Evidence on Hand

Official YU study plans (server/seed/data), OpenStreetMap campus geometry, the annotated YU campus map (server/seed/data/riyadh-campus-annotated.jpg). No real student data, testimonials or metrics; do not fabricate them.

## Product Principles

- Content before motion: nothing the student needs is hidden behind an animation.
- One home for each thing: no duplicated sections or navigation.
- Honest demo boundaries: simulated services are labelled once, in one place.
- Arabic is a first-class language, not a translation afterthought.

## Accessibility & Inclusion

WCAG 2.1 AA contrast in both themes, 44×44 px touch targets, visible focus, one h1 per route, reduced-motion respected.
