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
  const accounts = new Map();
  const v2Account = () => ({id: controls.account.id, livemode: controls.account.livemode,
    configuration: {recipient: {capabilities: {stripe_balance: {
      stripe_transfers: {status: controls.account.capabilities?.transfers},
      payouts: {status: controls.account.payouts_enabled && controls.account.details_submitted ? "active" : "pending"}}}}},
    requirements: {summary: {minimum_deadline: controls.account.requirements?.currently_due?.length ? {status: "currently_due"} : null}}});
  stripe.v2 = {core: {accounts: {
    retrieve: async () => v2Account(),
    create: async (data, options) => {
      calls.push({type: "account", data, options});
      if (controls.accountFailure === "before") throw new Error("account_create_failed");
      if (!accounts.has(options.idempotencyKey)) accounts.set(options.idempotencyKey, {...v2Account(), metadata: data.metadata});
      if (controls.accountFailure === "lost") {controls.accountFailure = null; throw new Error("account_response_lost");}
      return accounts.get(options.idempotencyKey);
    }}, accountLinks: {create: async data => {
      calls.push({type: "link", data});
      if (controls.linkFailure) throw new Error("link_failed");
      return {url: controls.linkUrl || "https://connect.stripe.com/setup/fixture"};
    }}}};
  stripe.balanceSettings = {
    retrieve: async () => ({payments: {payouts: {schedule: controls.account.settings?.payouts?.schedule}}}),
    update: async (data, options) => {calls.push({type: "settings", data, options}); return {payments: data.payments};}};
  stripe.accounts.create = async () => {throw new Error("Accounts v1 creation forbidden");};
  stripe.accountLinks.create = async () => {throw new Error("Account Links v1 forbidden");};
  return {stripe, controls, calls, transfers, payouts, accounts};
}
module.exports = {runtime, account, mockStripe};
