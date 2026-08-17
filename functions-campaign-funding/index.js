const {
  setGlobalOptions
} = require("firebase-functions/v2");
const {
  onCall,
  onRequest,
  HttpsError
} = require("firebase-functions/v2/https");
const {
  initializeApp
} = require("firebase-admin/app");
const {
  getFirestore,
  FieldValue,
  Timestamp
} = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");
const campaignFundingQuote = require("./campaign_funding_quote");
initializeApp();
const db = getFirestore();
setGlobalOptions({
  maxInstances: 10,
  region: "us-east1"
});
async function authenticatedUserContext(request, message) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", message);
  }
  const userReference = db.collection("users").doc(request.auth.uid);
  const userSnapshot = await userReference.get();
  const user = userSnapshot.data() || {};
  const role = typeof user.role === "string" ? user.role.toLowerCase() : "";
  return {
    uid: request.auth.uid,
    user,
    role,
    isAdmin: role === "admin",
    emailVerified: request.auth.token.email_verified === true
  };
}
async function requireVerifiedUser(request, message) {
  const context = await authenticatedUserContext(request, message);
  if (!context.isAdmin && !context.emailVerified) {
    throw new HttpsError("permission-denied", "Verify your email address before using billing or receiving payments.");
  }
  return context;
}
const CAMPAIGN_QUOTE_FUNCTION_OPTIONS = {
  enforceAppCheck: false,
  maxInstances: 20,
  concurrency: 40,
  timeoutSeconds: 30,
  memory: "256MiB"
};
function safeCampaignQuoteCallable(name, handler) {
  return onCall(CAMPAIGN_QUOTE_FUNCTION_OPTIONS, async request => {
    try {
      return await handler(request);
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error(`${name} failed.`, {
        error: error instanceof Error ? error.message : String(error)
      });
      throw new HttpsError("internal", "The campaign quote could not be prepared.");
    }
  });
}
async function requireFinancialRole(request, role, message) {
  const context = await requireVerifiedUser(request, message);
  if (!context.isAdmin && context.role !== role) {
    throw new HttpsError("permission-denied", `Only a ${role} can perform this operation.`);
  }
  return context;
}
exports.quoteCampaignFunding = safeCampaignQuoteCallable("quoteCampaignFunding", async request => {
  await requireFinancialRole(request, "business", "Sign in as a Business to request campaign pricing.");
  const workerAmountCents = Number(request.data?.workerAmountCents);
  try {
    return {
      ...campaignFundingQuote.quoteCampaignFunding(workerAmountCents),
      quoteVersion: 1
    };
  } catch (_) {
    throw new HttpsError("invalid-argument", "The worker amount is invalid.");
  }
});

// Purchased wallet credits are intentionally retired for marketplace money.
// Historical promotional balances remain readable but cannot fund Scaler pay.
