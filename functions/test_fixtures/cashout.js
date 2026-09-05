"use strict";
const runtime = () => ({environment: "local", projectId: "demo-scaledcircle", enabled: true,
  secretKey: "sk_test_offlinefixture"});
const account = () => ({id: "acct_fixture", livemode: false, payouts_enabled: true,
  details_submitted: true, capabilities: {transfers: "active"},
  requirements: {currently_due: [], past_due: []}, settings: {payouts: {schedule: {interval: "manual"}}}});
function mockStripe() {
  const transfers = new Map(); const payouts = new Map(); const calls = [];
  const controls = {account: account(), transferFailure: null, payoutFailure: null, payoutStatus: "pending"};
  const stripe = {balance: {retrieve: async () => ({livemode: false})}, accounts: {retrieve: async () => controls.account,
    create: async (data, options) => {calls.push({type: "account", data, options}); return controls.account;}},
  accountLinks: {create: async (data) => {calls.push({type: "link", data}); return {url: "https://connect.stripe.com/setup/fixture"};}},
  transfers: {
    list: async ({transfer_group: group}) => ({data: [...transfers.values()].filter((x) => x.transfer_group === group), has_more: false}),
    retrieve: async (key) => [...transfers.values()].find((x) => x.id === key),
    create: async (data, options) => {
      calls.push({type: "transfer", data, options});
      if (controls.transferFailure === "hard") throw {type: "StripeInvalidRequestError", code: "balance_insufficient"};
      if (controls.transferFailure === "before") throw new Error("connection unavailable");
      if (!transfers.has(options.idempotencyKey)) transfers.set(options.idempotencyKey,
        {...data, id: `tr_fixture${transfers.size + 1}`, livemode: false, amount_reversed: 0});
      if (controls.transferFailure === "lost") { controls.transferFailure = null; throw new Error("response lost"); }
      return transfers.get(options.idempotencyKey);
    },
  }, payouts: {
    list: async () => ({data: [...payouts.values()], has_more: false}),
    retrieve: async (key) => [...payouts.values()].find((x) => x.id === key),
    create: async (data, options) => {
      calls.push({type: "payout", data, options});
      if (controls.payoutFailure === "before") throw new Error("not available");
      if (!payouts.has(options.idempotencyKey)) payouts.set(options.idempotencyKey,
        {...data, id: `po_fixture${payouts.size + 1}`, livemode: false, status: controls.payoutStatus});
      if (controls.payoutFailure === "lost") { controls.payoutFailure = null; throw new Error("response lost"); }
      return payouts.get(options.idempotencyKey);
    },
  }};
  return {stripe, controls, calls, transfers, payouts};
}
module.exports = {runtime, account, mockStripe};
