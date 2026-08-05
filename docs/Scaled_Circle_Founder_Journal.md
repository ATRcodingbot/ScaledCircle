# Scaled Circle Founder Journal

## Entry 001 --- The Beginning

**Date:** August 2, 2026

Today marks the official beginning of building Scaled Circle.

### Why We're Building This

Local businesses need a better way to plan, launch, verify, and measure
neighborhood marketing campaigns. Existing options make it difficult to
coordinate canvassing, prove work was completed, and understand results.

### Product Vision

Scaled Circle will become the operating system for local marketing.

AI will enhance planning by suggesting territories and surfacing
insights, but businesses will always be able to draw and manage their
own campaign areas.

### First Launch Strategy

Launch with Attractive Remodel to validate the platform in a real
business environment before expanding to additional companies and
cities.

### Principles

* Build for trust.
* Keep the experience simple.
* Measure every campaign.
* Design for scale.
* Ship, learn, improve.

### Long-Term Vision

Grow from one local business to a marketplace serving businesses and
Scalers across the United States.

# August 5, 2026 — Milestone 1 Complete

Today marked the first major milestone for Scaled Circle. The application officially moved beyond a concept and into a functioning software platform.

## Accomplishments

### Firebase

* Connected Flutter to Firebase
* Configured Android, iOS, Web, Windows, and macOS
* Enabled Firebase Authentication
* Enabled Cloud Firestore
* Configured Firebase Security Rules
* Built required Firestore indexes

### Authentication

* User Registration
* User Login
* Email/Password Authentication
* Firebase User Accounts

### User Profiles

* Account Type Selection
* Business Accounts
* Marketer Accounts
* User records stored in Firestore

### Business Dashboard

* Created Business Dashboard UI
* Connected dashboard to Firestore
* Live campaign loading

### Campaign System

Businesses can now:

* Create campaigns
* Publish campaigns
* Save campaigns to Firestore
* View all of their campaigns
* Retrieve campaign information in real time

Campaign fields include:

* Campaign Name
* Description
* Base Pay
* Bonus
* Number of Homes
* Status
* Applications
* Business ID
* Business Email
* Timestamp

## Technical Challenges Solved

* FlutterFire configuration
* Firebase Authentication setup
* Firestore permissions
* Firestore security rules
* Firestore indexes
* Navigation between authentication and dashboard
* Cloud Firestore integration
* Live campaign retrieval

## Current State

Scaled Circle is now a working cloud application capable of:

* Registering users
* Logging users in
* Identifying Business vs Marketer accounts
* Saving user data
* Creating marketing campaigns
* Saving campaigns
* Loading campaigns from Firestore

This is the first fully functional backend milestone.

## Next Milestone

Build the marketplace itself.

Upcoming features:

* Campaign Details
* Edit Campaign
* Delete Campaign
* Marketer Dashboard
* Browse Campaigns
* Apply to Campaign
* Business Applicant Management
* GPS Verification
* Maps Integration
* Stripe Payments

Today's milestone transforms Scaled Circle from an idea into a working marketplace foundation.



### Reflection

Today isn't about launching a finished product---it's about laying a
foundation that can support a company for years to come.

---



\## Milestone 2 — Two-Sided Marketplace Workflow \& Notifications

\*\*Date:\*\* August 5, 2026



Scaled Circle has moved beyond basic campaign publishing into a functioning two-sided marketplace.



\### Completed



\#### Scaler Marketplace

\- Scalers can browse available campaigns.

\- Campaigns are loaded live from Firestore.

\- Search is available for campaigns.

\- Scalers can open campaign details.

\- Scalers now apply for campaigns instead of directly claiming them.

\- Duplicate applications are prevented.

\- Applications display a pending state after submission.



\#### Business Applicant Management

\- Businesses can see how many Scalers applied to each campaign.

\- Businesses can open a campaign's applicant list.

\- Businesses can accept or reject individual Scaler applications.

\- Accepting one Scaler:

&#x20; - assigns the campaign to that Scaler,

&#x20; - marks the selected application accepted,

&#x20; - rejects remaining applications,

&#x20; - changes the campaign status to accepted.



\#### Job Workflow

The working campaign lifecycle is now:



open

→ accepted

→ in\_progress

→ submitted

→ completed



Businesses may also return submitted work:



submitted

→ in\_progress with changes requested

→ submitted again



\#### Scaler My Jobs

\- Assigned campaigns appear in My Jobs.

\- Active and completed jobs are separated.

\- Statuses display throughout the workflow.

\- Accepted jobs can be started.

\- In-progress jobs can be submitted.

\- Submitted jobs remain visible while awaiting business review.

\- Completed jobs move into Completed Jobs.



\#### Changes Requested Workflow

\- Businesses can request changes on submitted work.

\- Businesses can include written feedback.

\- Scalers see the business feedback directly inside Job Details.

\- My Jobs displays “Changes Requested” instead of “Continue Job” when feedback exists.

\- Scalers can make corrections and resubmit the campaign.



\#### Business Completion Review

\- Submitted campaigns appear as needing review.

\- Businesses can approve completed work.

\- Approval moves the campaign to completed.

\- Businesses can alternatively request changes.



\#### Notification System

A Firestore-backed notification system is operational.



Supported notification events include:

\- New Scaler Application

\- Application Accepted

\- Application Rejected

\- Completion Submitted

\- Changes Requested

\- Campaign Completed



Notification features include:

\- unread notification badges,

\- notification bell on Business Dashboard,

\- notification bell on Scaler Marketplace,

\- notification history,

\- mark individual notifications as read,

\- mark all notifications as read,

\- login notification popups,

\- summarized business application alerts,

\- actionable notification cards,

\- deep-link navigation.



\#### Notification Deep Links

Notifications can route users directly to the relevant workflow:



\- New Scaler Application → Campaign Applicants

\- Completion Submitted → Campaign Details

\- Application Accepted → Scaler Job Details

\- Changes Requested → Scaler Job Details

\- Campaign Completed → Scaler Job Details

\- Application Rejected → campaign/job context



\#### Notification Data Model

Notifications now support structured metadata including:



\- userId

\- type

\- title

\- message

\- campaignId

\- campaignName

\- scalerId

\- scalerEmail

\- read

\- createdAt

\- readAt



This reduces reliance on parsing notification message text and creates a stronger foundation for future mobile push notifications.



\### Firestore Collections Now In Active Use



\- users

\- campaigns

\- applications

\- notifications



\### Infrastructure

\- Firebase Authentication working.

\- Cloud Firestore working.

\- Required composite indexes configured.

\- Real-time Firestore listeners working.

\- Flutter Web development workflow operational.

\- `flutter analyze` returning zero issues at milestone checkpoint.



\### Product Significance



Scaled Circle now has a functioning marketplace loop:



Business publishes campaign

→ Scalers discover campaign

→ Scalers apply

→ Business reviews applicants

→ Business selects Scaler

→ Scaler receives assignment

→ Scaler starts work

→ Scaler submits work

→ Business approves or requests changes

→ Campaign completes



This is the first working end-to-end implementation of the core Scaled Circle marketplace transaction.



\### Next Development Priorities



1\. GPS route tracking.

2\. Proof-of-work photo uploads.

3\. Campaign service-area mapping.

4\. Scaler profiles, ratings, and completed-job history.

5\. Business profiles and company names.

6\. Earnings and payout architecture.

7\. Push notifications through Firebase Cloud Messaging.

8\. Campaign deadlines and scheduling.

9\. Counteroffers / negotiated compensation.

10\. Production Firestore security rules.

