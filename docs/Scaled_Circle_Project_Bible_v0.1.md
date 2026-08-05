# Scaled Circle Project Bible

Version: 0.1 (Founding Edition)

## Vision

Build the operating system for local marketing by connecting businesses
with verified Scalers who execute real-world campaigns. AI enhances
planning but never replaces user control.

## Core Principles

-   Businesses can always draw their own territories.
-   AI is an optional assistant.
-   GPS and photo verification build trust.
-   Design for scale from day one.
-   Ship small, iterate quickly.

## Brand

### Colors

-   Navy: #0A2348
-   Blue: #1478F3
-   Aqua: #1DBFD6
-   Green: #42D85A
-   White: #FFFFFF

### Logo

Scaled Circle official logo.

## Technology Stack

-   Flutter
-   Firebase Authentication
-   Cloud Firestore
-   Firebase Storage
-   Cloud Functions
-   Flutter Map + OpenStreetMap
-   Git + GitHub

## Current Roadmap

### Phase 0

-   [ ] Flutter SDK
-   [ ] Android Studio
-   [ ] Firebase
-   [ ] GitHub
-   [ ] Create Flutter project

### Phase 1

Build the reusable design system.

### Phase 2

Authentication.

### Phase 3

Business Dashboard.

### Phase 4

Campaign Builder.

### Phase 5

Interactive Maps.

### Phase 6

Neighborhood Intelligence.

### Phase 7

Scaler Experience.

### Phase 8

Live Tracking.

### Phase 9

Analytics.

### Phase 10

Payments.

### Phase 11

Public Launch.

## Decisions Log

  -----------------------------------------------------------------------
  Date                       Decision
  -------------------------- --------------------------------------------
  2026-08-02                 Flutter chosen as primary framework.

  2026-08-02                 AI is optional; manual territory drawing is
                             a first-class feature.

  2026-08-02                 Start with Attractive Remodel as launch
                             customer.
  -----------------------------------------------------------------------

## Ideas Parking Lot

-   AI neighborhood scoring
-   ROI calculator
-   Live campaign map
-   Heatmaps
-   Route optimization
-   Printing services
-   Landing pages
-   Call tracking

## Next Session

Finish Phase 0 and create the Scaled Circle Flutter project.








# Version 0.1 — Marketplace Foundation

## Project Status

Development Phase:
Marketplace Foundation Complete

---

## Completed Systems

### Infrastructure

* Flutter configured
* Firebase connected
* Cloud Firestore connected
* Firebase Authentication connected

### Authentication

* User Registration
* User Login
* Email/Password Authentication

### User System

Users Collection

Fields:

* uid
* email
* accountType
* createdAt
* completedJobs
* rating
* verified

### Business System

Business Dashboard

Features:

* Dashboard
* Campaign Overview
* Live Firestore Integration
* Campaign Counter

### Campaign System

Campaign Creation

Businesses can:

* Create Campaign
* Publish Campaign
* Save Campaign
* View Campaigns

Campaign Document

* campaignName
* description
* basePay
* bonus
* homes
* applications
* businessId
* businessEmail
* status
* createdAt

---

## Firebase Collections

users

campaigns

---

## Marketplace Status

Business Side

✅ Registration

✅ Login

✅ Dashboard

✅ Publish Campaign

✅ Live Campaign Feed

Marketer Side

✅ Registration

✅ Login

✅ Account Type

⬜ Dashboard

⬜ Browse Campaigns

⬜ Apply

⬜ Active Jobs

---

## Current Architecture

Flutter

↓

Firebase Authentication

↓

Cloud Firestore

↓

Business Dashboard

↓

Campaign Management

---

## Development Roadmap

Phase 1 ✅ Complete

* Firebase
* Authentication
* Firestore
* Business Dashboard
* Campaign Publishing
* Campaign Storage

Phase 2 (Current)

* Campaign Details
* Edit Campaign
* Delete Campaign
* Marketer Dashboard
* Browse Campaigns
* Apply to Campaign

Phase 3

* GPS Tracking
* Interactive Maps
* Route Verification
* AI Fraud Detection

Phase 4

* Stripe Payments
* Ratings
* Messaging
* Notifications

Phase 5

* AI Marketing Assistant
* Territory Optimization
* Analytics
* National Expansion



---

# Current Product Architecture — Milestone 2

## Marketplace Roles

Scaled Circle currently supports two account types:

### Business
Businesses create and manage local marketing campaigns and hire Scalers to perform campaign work.

### Scaler
Scalers discover local marketing opportunities, apply to campaigns, perform accepted work, and submit work for business approval.

---

## Campaign Lifecycle

Canonical campaign states:

```text
open
accepted
in_progress
submitted
completed
