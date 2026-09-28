/* Basic GA4 page measurement for the production web origin only.
 * No prompts or overlays. Honor saved opt-outs and browser privacy signals.
 * Keep this separate from Firebase's operational and legal consent authorities.
 */
(function () {
  "use strict";

  if (location.protocol !== "https:" || location.hostname !== "scaledcircle.com") return;

  // The production web stream from firebase_options.dart. Confirm it matches
  // the intended GA4 property before deploying this candidate.
  const measurementId = "G-9VY50190LG";
  const disableKey = "ga-disable-" + measurementId;
  const choiceKey = "scaledcircle.analytics.choice.v1";
  const settingsPage = location.pathname === "/analytics-settings.html";
  const browserOptOut = navigator.globalPrivacyControl === true ||
    navigator.doNotTrack === "1" || navigator.doNotTrack === "yes" || window.doNotTrack === "1";
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
  let allowed = choice !== "denied" && !browserOptOut;
  let preferenceSaved = true;
  window[disableKey] = !allowed;
  let tagStarted = false;
  let lastPath = null;
  let lastLocation = null;
  let timer = null;

  function route() {
    const fragment = location.hash.startsWith("#/") ? location.hash.slice(1) : "";
    // Firebase Hosting may canonicalize retained public pages with a trailing slash.
    const candidate = (fragment || location.pathname).split(/[?#]/, 1)[0].replace(/\/$/, "") || "/";
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

  function safeReferrer() {
    return lastLocation || (function () {
      try { return document.referrer ? new URL(document.referrer).origin : ""; }
      catch (_) { return ""; }
    })();
  }

  function pageView() {
    if (!allowed || !tagStarted || settingsPage) return;
    const path = route();
    if (path === lastPath) return;
    const pageLocation = safeLocation(path);
    const referrer = safeReferrer();
    // Override defaults before the event so background engagement measurement
    // uses the same bounded location. The GA4 stream must also disable its
    // automatic history page views to avoid duplicate SPA page views.
    gtag("config", measurementId, {
      send_page_view: false,
      page_location: pageLocation,
      page_title: "Scaled Circle — " + (publicTitles[path] || "App"),
      page_referrer: referrer
    });
    gtag("event", "page_view", {
      page_location: pageLocation,
      page_title: "Scaled Circle — " + (publicTitles[path] || "App"),
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
    // The standalone preferences page never loads Google, including when
    // someone enables analytics there for their next website visit.
    if (tagStarted || !allowed || settingsPage) return;
    tagStarted = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    gtag("consent", "default", {
      ad_storage: "denied",
      ad_user_data: "denied", ad_personalization: "denied"
    });
    gtag("js", new Date());
    // Do not allow the config command to send an unsanitized initial page view.
    gtag("config", measurementId, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      page_location: safeLocation(route()),
      page_title: "Scaled Circle — " + (publicTitles[route()] || "App"),
      page_referrer: safeReferrer()
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

  function setChoice(value, persist = true) {
    const wasAllowed = allowed;
    choice = value;
    if (persist) {
      try {
        localStorage.setItem(choiceKey, value);
        preferenceSaved = true;
      } catch (_) { preferenceSaved = false; }
    }
    allowed = choice !== "denied" && !browserOptOut;
    window[disableKey] = !allowed;
    if (allowed) {
      if (!tagStarted) startTag();
      else if (!wasAllowed) pageView();
    } else {
      // Google's disable flag stops collection, including automatically
      // generated events, without reloading or losing the visitor's work.
      clearAnalyticsCookies();
      lastPath = null;
      lastLocation = null;
    }
    renderPreferences();
  }

  function renderPreferences() {
    const status = document.getElementById("sc-analytics-status");
    const enable = document.getElementById("sc-analytics-enable");
    const disable = document.getElementById("sc-analytics-disable");
    if (!status || !enable || !disable) return;
    status.textContent = browserOptOut
      ? "Your browser's privacy setting keeps website analytics off."
      : "Website analytics are " + (allowed ? "on" : "off") + " for this browser.";
    if (!preferenceSaved) {
      status.textContent = "Your browser blocked saving this preference. Use your browser's Do Not Track or Global Privacy Control setting to keep analytics off across pages.";
    }
    enable.disabled = browserOptOut || allowed;
    disable.disabled = !allowed;
  }

  function init() {
    // Controls exist only on the page linked from the Privacy Policy.
    // Normal website visits never receive analytics UI.
    const enable = document.getElementById("sc-analytics-enable");
    const disable = document.getElementById("sc-analytics-disable");
    if (enable) enable.addEventListener("click", function () { setChoice("granted"); });
    if (disable) disable.addEventListener("click", function () { setChoice("denied"); });
    renderPreferences();
    if (allowed) startTag();
    else clearAnalyticsCookies();

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
      if (event.key !== choiceKey && event.key !== null) return;
      setChoice(event.key === null ? null : event.newValue, false);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
