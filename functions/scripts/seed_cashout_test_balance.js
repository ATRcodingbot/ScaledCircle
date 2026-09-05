"use strict";
// Explicit, one-time TEST fixture. Never imports production earnings or receipts.
const {initializeApp} = require("firebase-admin/app");
const {getFirestore} = require("firebase-admin/firestore");
const crypto = require("node:crypto");

async function seed({db, uid, amountCents, projectId}) {
  if (!["demo-scaledcircle", "scaledcircle-staging"].includes(projectId) ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(uid || "") ||
      !Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > 10000) {
    throw new Error("cashout_test_fixture_arguments_invalid");
  }
  const key = crypto.createHash("sha256").update(JSON.stringify(["cashout-test-fixture-v1", uid])).digest("hex");
  const fundingRef = db.collection("scalerCashoutTestFunding").doc(key);
  const balanceRef = db.collection("scalerCashoutBalances").doc(uid);
  const walletRef = db.collection("wallets").doc(uid);
  return db.runTransaction(async (tx) => {
    const [user, wallet, balance, funding] = await Promise.all([
      tx.get(db.collection("users").doc(uid)), tx.get(walletRef), tx.get(balanceRef), tx.get(fundingRef),
    ]);
    if (user.data()?.role !== "scaler" || wallet.data()?.ownerId !== uid || wallet.data()?.ownerType !== "scaler") {
      throw new Error("cashout_test_fixture_owner_mismatch");
    }
    if (balance.exists || funding.exists) throw new Error("cashout_test_fixture_already_exists");
    tx.create(fundingRef, {ownerId: uid, mode: "test", amountCents, source: "bounded_test_fixture", createdAtMillis: Date.now()});
    tx.create(balanceRef, {ownerId: uid, mode: "test", currency: "usd", source: "bounded_test_fixture",
      fundedCents: amountCents, availableCents: amountCents, pendingCents: 0, paidCents: 0, settlementFrozen: false});
    tx.update(walletRef, {cashoutMode: "test", cashoutAvailableCents: amountCents, cashoutPendingCents: 0, cashoutPaidCents: 0});
    return {mode: "test", fundedCents: amountCents};
  });
}

if (require.main === module) {
  const [projectId, uid, amount, confirmation] = process.argv.slice(2);
  if (confirmation !== "CONFIRM_ISOLATED_TEST" || !["demo-scaledcircle", "scaledcircle-staging"].includes(projectId) ||
      (projectId === "demo-scaledcircle" && !/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || "")) ||
      (projectId === "scaledcircle-staging" && process.env.FIRESTORE_EMULATOR_HOST)) {
    throw new Error("cashout_test_fixture_environment_invalid");
  }
  const db = getFirestore(initializeApp({projectId}));
  seed({db, projectId, uid, amountCents: Number(amount)})
    .then((result) => process.stdout.write(JSON.stringify(result) + "\n"))
    .catch(() => {process.stderr.write("TEST fixture refused. No retry or reset is automatic.\n"); process.exitCode = 1;})
    .finally(() => db.terminate());
}
module.exports = {seed};
