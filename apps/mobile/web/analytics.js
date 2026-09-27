/* Optional GA4 page measurement for the production web origin only.
 * No Google tag, analytics request, or analytics cookie is created before opt-in.
 * Keep this separate from Firebase's operational and legal consent authorities.
 */
(function () {
  "use strict";

  if (location.protocol !== "https:" || location.hostname !== "scaledcircle.com") return;

  // The production web stream from firebase_options.dart. Confirm it matches
  // the intended GA4 property before deploying this candidate.
  const measurementId = "G-9VY50190LG";
  const choiceKey = "scaledcircle.analytics.choice.v1";
  const publicTitles = {
    "/": "Home", "/i": "Explore", "/businesses": "For businesses",
    "/scalers": "For Scalers", "/pricing": "Pricing",
    "/how-it-works": "How it works", "/referrals": "Referrals",
    "/login": "Sign in", "/create-account": "Create account",
    "/legal": "Legal", "/terms": "Terms", "/privacy": "Privacy",
    "/payments-refunds": "Payments and refunds",
    "/scaler-terms": "Scaler terms", "/support": "Support"
  };
  const campaignKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
  let choice;
  try { choice = localStorage.getItem(choiceKey); } catch (_) { choice = null; }
  let tagStarted = false;
  let lastPath = null;
  let lastLocation = null;
  let timer = null;

  function route() {
    const fragment = location.hash.startsWith("#/") ? location.hash.slice(1) : "";
    const candidate = (fragment || location.pathname).split(/[?#]/, 1)[0];
    return Object.prototype.hasOwnProperty.call(publicTitles, candidate)
      ? candidate : "/app";
  }

  function safeLocation(path) {
    const url = new URL(path, "https://scaledcircle.com");
    // Only public pages may carry campaign parameters. Never send referral
    // codes, account details, checkout tokens, or arbitrary query strings.
    if (path !== "/app") {
      const raw = new URLSearchParams(location.search);
      const fragmentQuery = location.hash.indexOf("?");
      if (fragmentQuery !== -1) {
        const fromHash = new URLSearchParams(location.hash.slice(fragmentQuery + 1));
        for (const key of campaignKeys) if (!raw.has(key) && fromHash.has(key)) raw.set(key, fromHash.get(key));
      }
      for (const key of campaignKeys) {
        const value = raw.get(key);
        if (value && value.length <= 80 && /^[A-Za-z0-9._~-]+$/.test(value)) {
          url.searchParams.set(key, value);
        }
      }
    }
    return url.href;
  }

  function pageView() {
    if (choice !== "granted" || !tagStarted) return;
    const path = route();
    if (path === lastPath) return;
    const pageLocation = safeLocation(path);
    const referrer = lastLocation || (function () {
      try { return document.referrer ? new URL(document.referrer).origin : ""; }
      catch (_) { return ""; }
    })();
    // Override defaults before the event so background engagement measurement
    // uses the same bounded location. The GA4 stream must also disable its
    // automatic history page views to avoid duplicate SPA page views.
    gtag("config", measurementId, {
      send_page_view: false,
      page_location: pageLocation,
      page_title: "ScaledCircle — " + (publicTitles[path] || "App"),
      page_referrer: referrer
    });
    gtag("event", "page_view", {
      page_location: pageLocation,
      page_title: "ScaledCircle — " + (publicTitles[path] || "App"),
      page_referrer: referrer
    });
    lastPath = path;
    lastLocation = pageLocation;
  }

  function schedulePageView() {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(function () { timer = null; pageView(); }, 0);
  }

  function startTag() {
    if (tagStarted || choice !== "granted") return;
    tagStarted = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    gtag("consent", "default", {
      analytics_storage: "granted", ad_storage: "denied",
      ad_user_data: "denied", ad_personalization: "denied"
    });
    gtag("js", new Date());
    // Do not allow the config command to send an unsanitized initial page view.
    gtag("config", measurementId, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      page_location: safeLocation(route())
    });
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + measurementId;
    document.head.appendChild(script);
    pageView();
  }

  function clearAnalyticsCookies() {
    for (const entry of document.cookie.split(";")) {
      const name = entry.trim().split("=", 1)[0];
      if (!/^_ga(?:_|$)|^_gid$|^_gat(?:_|$)/.test(name)) continue;
      for (const domain of ["", ";domain=scaledcircle.com", ";domain=.scaledcircle.com"]) {
        document.cookie = name + "=; Max-Age=0; path=/" + domain + "; Secure; SameSite=Lax";
      }
    }
  }

  function setChoice(value) {
    const wasStarted = tagStarted;
    choice = value;
    try { localStorage.setItem(choiceKey, value); } catch (_) { /* session-only choice */ }
    if (value === "granted") startTag();
    else if (wasStarted) {
      gtag("consent", "update", { analytics_storage: "denied" });
      clearAnalyticsCookies();
      location.reload(); // Remove the loaded tag before any further navigation.
      return;
    }
    renderChoice();
  }

  function renderChoice() {
    const panel = document.getElementById("sc-analytics-choice");
    const settings = document.getElementById("sc-analytics-settings");
    if (!panel || !settings) return;
    panel.hidden = choice === "granted" || choice === "denied";
    settings.hidden = !panel.hidden;
    settings.setAttribute("aria-label", "Analytics settings; currently " +
      (choice === "granted" ? "allowed" : choice === "denied" ? "declined" : "unset"));
  }

  function init() {
    const panel = document.createElement("aside");
    panel.id = "sc-analytics-choice";
    panel.setAttribute("aria-label", "Optional website analytics");
    panel.innerHTML = '<strong>Optional website analytics</strong>' +
      '<p>Allow Google Analytics to help us understand visits and which links bring people here. ' +
      'We do not send account details, form entries, or work locations. ' +
      'You can change your choice any time. <a href="/#/privacy">Privacy Policy</a></p>' +
      '<div class="sc-actions"><button type="button" class="sc-allow">Allow analytics</button>' +
      '<button type="button" class="sc-decline">Decline</button></div>';
    const settings = document.createElement("button");
    settings.id = "sc-analytics-settings";
    settings.type = "button";
    settings.textContent = "Analytics settings";
    document.body.appendChild(panel);
    document.body.appendChild(settings);
    panel.querySelector(".sc-allow").addEventListener("click", function () { setChoice("granted"); });
    panel.querySelector(".sc-decline").addEventListener("click", function () { setChoice("denied"); });
    settings.addEventListener("click", function () { choice = null; renderChoice(); });
    renderChoice();
    if (choice === "granted") startTag();

    window.addEventListener("hashchange", schedulePageView);
    window.addEventListener("popstate", schedulePageView);
    for (const name of ["pushState", "replaceState"]) {
      const original = history[name];
      history[name] = function () {
        const result = original.apply(this, arguments);
        schedulePageView();
        return result;
      };
    }
    window.addEventListener("storage", function (event) {
      if (event.key !== choiceKey) return;
      if (tagStarted && event.newValue !== "granted") location.reload();
      else { choice = event.newValue; renderChoice(); if (choice === "granted") startTag(); }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
