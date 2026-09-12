'use strict';

// Login seats and workspace membership remain in BusinessWorkspaceV1. These
// responsibilities grant access to internal customer operations, never Scaler
// marketplace execution, payment authority or provider sending by themselves.
const LABELS=Object.freeze({
  customersView:'View customers & leads', customersEdit:'Edit customers & leads',
  scheduleView:'View schedule', scheduleEdit:'Edit schedule', assignPeople:'Assign people',
  jobsView:'View all internal jobs', jobsAssigned:'View assigned internal jobs',
  jobsEdit:'Edit internal jobs', jobsStatus:'Update assigned job status',
  communicationsRead:'Read customer email', communicationsSend:'Send approved customer email',
  outreachApproval:'Approve Growth outreach', workspaceSettings:'Business settings',
  integrations:'Manage integrations',
});
const PERMISSIONS=Object.freeze(Object.keys(LABELS));
const PRESETS=Object.freeze({
  officeManager:['customersView','customersEdit','scheduleView','scheduleEdit','assignPeople','jobsView','jobsEdit','jobsStatus','communicationsRead','communicationsSend'],
  projectManager:['customersView','scheduleView','scheduleEdit','assignPeople','jobsView','jobsEdit','jobsStatus'],
  sales:['customersView','customersEdit','scheduleView','scheduleEdit','communicationsRead','communicationsSend'],
  fieldUser:['jobsAssigned','jobsStatus'],
});
module.exports={LABELS,PERMISSIONS,PRESETS};
