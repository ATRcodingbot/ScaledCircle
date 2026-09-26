"use strict";

// Provider URLs are constructed by maintained adapters, never by the caller.
// Never follow an error redirect carrying a Census key, or retain its body/URL.
const HOSTS = new Set(["opendata.maryland.gov", "api.census.gov", "tigerweb.geo.census.gov"]);
async function fetchJson(url, {timeoutMs = 10000, fetchImpl = fetch,
  onDiagnostic = () => {}} = {}) {
  const u = new URL(url);
  if (u.protocol !== "https:" || !HOSTS.has(u.hostname) || u.port || u.username || u.password) {
    throw Error("property_source_endpoint_not_allowed");
  }
  const base = {host: u.hostname, path: u.pathname, keySupplied: u.searchParams.has("key")};
  const fail = (code, details = {}) => {
    onDiagnostic({...base, code, ...details});
    throw Error(code);
  };
  let response;
  try { response = await fetchImpl(url, {redirect: "manual", signal: AbortSignal.timeout(timeoutMs),
    headers: {"User-Agent": "ScaledCircle Property Intelligence support@scaledcircle.com"}}); }
  catch (_) { return fail("property_source_transport_failed"); }
  const details = {status: response.status, contentType: response.headers.get("content-type") || "unknown"};
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    let redirectDestination = "invalid";
    try { const next = new URL(location, u); redirectDestination = next.origin + next.pathname; } catch (_) {}
    return fail("property_source_redirect_rejected", {...details, redirectDestination});
  }
  if (!response.ok) return fail(response.headers.get("cf-mitigated") === "challenge"
    ? "property_source_access_challenge" : `property_source_http_${response.status}`, details);
  if (!/\b(?:json|[\w.-]+\+json)\b/i.test(details.contentType)) return fail("property_source_non_json", details);
  const reader = response.body.getReader(); const chunks = []; let bytes = 0;
  try {
    while (true) {
      const {done, value} = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > 2 * 1024 * 1024) { await reader.cancel(); return fail("property_source_response_limit", details); }
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    if (error.message === "property_source_response_limit") throw error;
    return fail("property_source_transport_failed", details);
  }
  let value;
  try { value = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch (_) { return fail("property_source_invalid_json", details); }
  onDiagnostic({...base, ...details, code: "property_source_json_received", bytes});
  return value;
}
module.exports = {fetchJson};
