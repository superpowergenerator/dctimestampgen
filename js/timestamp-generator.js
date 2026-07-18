/* ==========================================================================
   timestamp-generator.js — Discord Timestamp Generator (enhanced)
   ==========================================================================
   Discord dynamic timestamps use the syntax:  <t:UNIX:STYLE>
     • UNIX  = absolute seconds since the Unix epoch (1970-01-01T00:00:00Z, UTC)
     • STYLE = one of  t T d D f F R   (Discord defaults to f when omitted)

   Accuracy notes
   --------------
   The hard part is turning a wall-clock time ("2026-07-14 21:30 in Tokyo")
   into the correct absolute UTC epoch, including Daylight Saving Time.
   We never hand-roll offsets. Instead we use the browser's Intl timezone
   database via a robust two-pass algorithm (see zonedTimeToEpochSeconds).

   Everything runs client-side. No data leaves the browser.
   ========================================================================== */
(function () {
  "use strict";

  /* -------------------------------------------------------------------- */
  /* Format catalogue. Each style's preview is composed from parts so it   */
  /* matches Discord's rendering exactly (Discord uses no "at" separator). */
  /* -------------------------------------------------------------------- */
  var STYLES = [
    { flag: "t", name: "Short Time", desc: "9:30 PM" },
    { flag: "T", name: "Long Time", desc: "9:30:45 PM" },
    { flag: "d", name: "Short Date", desc: "07/14/2026" },
    { flag: "D", name: "Long Date", desc: "July 14, 2026" },
    { flag: "f", name: "Short Date/Time", desc: "July 14, 2026 9:30 PM" },
    { flag: "F", name: "Long Date/Time", desc: "Tuesday, July 14, 2026 9:30 PM" },
    { flag: "R", name: "Relative Time", desc: "in 2 hours / 2 hours ago" }
  ];

  var LOCALE = "en-US"; // Matches Discord's documented example rendering.

  /* Cache Intl formatters per timezone to avoid rebuilding on every render. */
  var fmtCache = {};
  function fmt(timeZone, options) {
    var key = timeZone + "|" + JSON.stringify(options);
    if (!fmtCache[key]) {
      var opts = { timeZone: timeZone };
      for (var k in options) opts[k] = options[k];
      fmtCache[key] = new Intl.DateTimeFormat(LOCALE, opts);
    }
    return fmtCache[key];
  }

  /* ---- Individual part renderers (all timezone-aware) ---------------- */
  function partTime(d, tz) {
    return fmt(tz, { hour: "numeric", minute: "2-digit", hour12: true }).format(d);
  }
  function partLongTime(d, tz) {
    return fmt(tz, {
      hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true
    }).format(d);
  }
  function partShortDate(d, tz) {
    return fmt(tz, { year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  }
  function partLongDate(d, tz) {
    return fmt(tz, { year: "numeric", month: "long", day: "numeric" }).format(d);
  }
  function partWeekday(d, tz) {
    return fmt(tz, { weekday: "long" }).format(d);
  }

  /* Human relative time, e.g. "in 3 days" / "5 minutes ago". Timezone
     independent because it is measured against the current instant. */
  function renderRelative(epochSeconds) {
    var diffMs = epochSeconds * 1000 - Date.now();
    var abs = Math.abs(diffMs);
    var units = [
      ["year", 31536000000],
      ["month", 2592000000],
      ["week", 604800000],
      ["day", 86400000],
      ["hour", 3600000],
      ["minute", 60000],
      ["second", 1000]
    ];
    var rtf =
      typeof Intl !== "undefined" && Intl.RelativeTimeFormat
        ? new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" })
        : null;

    for (var i = 0; i < units.length; i++) {
      var name = units[i][0];
      var ms = units[i][1];
      if (abs >= ms || name === "second") {
        var value = Math.round(diffMs / ms);
        if (rtf) return rtf.format(value, name);
        var plural = Math.abs(value) === 1 ? "" : "s";
        return diffMs >= 0
          ? "in " + Math.abs(value) + " " + name + plural
          : Math.abs(value) + " " + name + plural + " ago";
      }
    }
    return "now";
  }

  /* Render one style's live preview for a given epoch + timezone. */
  function renderStyle(flag, epochSeconds, tz) {
    var d = new Date(epochSeconds * 1000);
    switch (flag) {
      case "t": return partTime(d, tz);
      case "T": return partLongTime(d, tz);
      case "d": return partShortDate(d, tz);
      case "D": return partLongDate(d, tz);
      case "f": return partLongDate(d, tz) + " " + partTime(d, tz);
      case "F":
        return partWeekday(d, tz) + ", " + partLongDate(d, tz) + " " + partTime(d, tz);
      case "R": return renderRelative(epochSeconds);
      default: return "";
    }
  }

  /* -------------------------------------------------------------------- */
  /* Timezone conversion core                                             */
  /* -------------------------------------------------------------------- */

  /* Break an instant down into wall-clock parts as seen in `timeZone`. */
  function getPartsInZone(date, timeZone) {
    var parts = fmt(timeZone, {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false, hourCycle: "h23"
    }).formatToParts(date);
    var map = {};
    for (var i = 0; i < parts.length; i++) map[parts[i].type] = parts[i].value;
    var hour = parseInt(map.hour, 10);
    if (hour === 24) hour = 0; // some engines emit "24" for midnight
    return {
      year: parseInt(map.year, 10),
      month: parseInt(map.month, 10),
      day: parseInt(map.day, 10),
      hour: hour,
      minute: parseInt(map.minute, 10),
      second: parseInt(map.second, 10)
    };
  }

  /* Offset (ms) of `timeZone` at instant `date`, where local = utc + offset. */
  function tzOffsetMs(timeZone, date) {
    var p = getPartsInZone(date, timeZone);
    var asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return asUTC - date.getTime();
  }

  /* Convert a wall-clock time in `timeZone` into an absolute epoch (seconds).
     Two-pass method: guess the offset, then refine once so DST transitions
     resolve correctly. This is the standard, reliable approach. */
  function zonedTimeToEpochSeconds(y, mo, d, h, mi, s, timeZone) {
    var guessUTC = Date.UTC(y, mo - 1, d, h, mi, s);
    var offset1 = tzOffsetMs(timeZone, new Date(guessUTC));
    var epochMs = guessUTC - offset1;
    var offset2 = tzOffsetMs(timeZone, new Date(epochMs));
    if (offset2 !== offset1) {
      epochMs = guessUTC - offset2;
    }
    return Math.floor(epochMs / 1000);
  }

  /* -------------------------------------------------------------------- */
  /* DOM wiring                                                            */
  /* -------------------------------------------------------------------- */
  function init() {
    var form = document.getElementById("generator-form");
    if (!form) return; // Tool not on this page

    var el = {
      date: document.getElementById("gen-date"),
      time: document.getElementById("gen-time"),
      tz: document.getElementById("gen-timezone"),
      unix: document.getElementById("gen-unix"),
      dateErr: document.getElementById("gen-date-error"),
      timeErr: document.getElementById("gen-time-error"),
      unixErr: document.getElementById("gen-unix-error"),
      generateBtn: document.getElementById("generate-btn"),
      empty: document.getElementById("results-empty"),
      body: document.getElementById("results-body"),
      tbody: document.getElementById("results-tbody"),
      unixValue: document.getElementById("unix-value"),
      copyUnixBtn: document.getElementById("copy-unix-btn"),
      copyAllBtn: document.getElementById("copy-all-btn"),
      resetBtn: document.getElementById("reset-btn"),
      btnNow: document.getElementById("btn-now"),
      btnUnixNow: document.getElementById("btn-unix-now"),
      btnClear: document.getElementById("btn-clear")
    };

    var localZone =
      (Intl.DateTimeFormat().resolvedOptions().timeZone) || "UTC";
    var syncing = false; // guards against feedback loops during field sync
    var lastResult = null; // { epoch, tz, codes: {flag: code} }

    populateTimezones(el.tz, localZone);
    setFieldsToNow();

    /* ---- helpers ---- */
    function pad(n) {
      return String(n).padStart(2, "0");
    }

    function setFieldsToNow() {
      syncing = true;
      var now = new Date();
      var p = getPartsInZone(now, el.tz.value || localZone);
      el.date.value = p.year + "-" + pad(p.month) + "-" + pad(p.day);
      el.time.value = pad(p.hour) + ":" + pad(p.minute) + ":" + pad(p.second);
      el.unix.value = Math.floor(now.getTime() / 1000);
      syncing = false;
    }

    function clearErrors() {
      [
        [el.date, el.dateErr], [el.time, el.timeErr], [el.unix, el.unixErr]
      ].forEach(function (pair) {
        pair[1].textContent = "";
        pair[0].classList.remove("is-invalid");
        pair[0].removeAttribute("aria-invalid");
      });
    }

    function fail(inputEl, errEl, message, focus) {
      errEl.textContent = message;
      inputEl.classList.add("is-invalid");
      inputEl.setAttribute("aria-invalid", "true");
      if (focus) inputEl.focus();
    }

    /* Read + validate the date/time fields → epoch seconds, or null. */
    function readDateTimeEpoch(focusOnError) {
      var dateVal = el.date.value.trim();
      var timeVal = el.time.value.trim();

      if (!dateVal) {
        fail(el.date, el.dateErr, "Please choose a date.", focusOnError);
        return null;
      }
      if (!timeVal) {
        fail(el.time, el.timeErr, "Please choose a time.", focusOnError);
        return null;
      }

      var dp = dateVal.split("-");
      var tp = timeVal.split(":");
      var year = parseInt(dp[0], 10);
      var month = parseInt(dp[1], 10);
      var day = parseInt(dp[2], 10);
      var hour = parseInt(tp[0], 10);
      var minute = parseInt(tp[1], 10);
      var second = tp[2] ? parseInt(tp[2], 10) : 0;

      if ([year, month, day, hour, minute, second].some(isNaN)) {
        fail(el.date, el.dateErr, "That date or time looks invalid.", focusOnError);
        return null;
      }

      // Reject impossible calendar dates (e.g. Feb 31, or Feb 29 on a
      // non-leap year). Date roll-over would silently change these.
      var check = new Date(year, month - 1, day);
      if (
        check.getFullYear() !== year ||
        check.getMonth() !== month - 1 ||
        check.getDate() !== day
      ) {
        fail(el.date, el.dateErr, "That date does not exist. Please check it.", focusOnError);
        return null;
      }
      if (hour > 23 || minute > 59 || second > 59) {
        fail(el.time, el.timeErr, "That time is out of range.", focusOnError);
        return null;
      }

      return zonedTimeToEpochSeconds(
        year, month, day, hour, minute, second, el.tz.value || localZone
      );
    }

    /* Parse + validate the Unix field → integer seconds, or null. */
    function readUnix(focusOnError) {
      var raw = el.unix.value.trim();
      if (raw === "") {
        fail(el.unix, el.unixErr, "Please enter a Unix timestamp.", focusOnError);
        return null;
      }
      if (!/^-?\d+$/.test(raw)) {
        fail(el.unix, el.unixErr, "Unix timestamps are whole numbers only.", focusOnError);
        return null;
      }
      var n = parseInt(raw, 10);
      // Guard against absurd values (JS date range is ±100M days from epoch).
      if (!isFinite(n) || Math.abs(n) > 8640000000000) {
        fail(el.unix, el.unixErr, "That timestamp is out of the supported range.", focusOnError);
        return null;
      }
      return n;
    }

    /* ---- Two-way synchronisation ---- */

    // Date / time / timezone changed → recompute the Unix field.
    function syncUnixFromFields() {
      if (syncing) return;
      clearErrors();
      var epoch = readDateTimeEpoch(false);
      if (epoch === null) return;
      syncing = true;
      el.unix.value = epoch;
      syncing = false;
    }

    // Unix field changed → fill the date/time fields (in the selected zone).
    function syncFieldsFromUnix() {
      if (syncing) return;
      clearErrors();
      var n = readUnix(false);
      if (n === null) return;
      var p = getPartsInZone(new Date(n * 1000), el.tz.value || localZone);
      syncing = true;
      el.date.value = p.year + "-" + pad(p.month) + "-" + pad(p.day);
      el.time.value = pad(p.hour) + ":" + pad(p.minute) + ":" + pad(p.second);
      syncing = false;
    }

    el.date.addEventListener("input", syncUnixFromFields);
    el.time.addEventListener("input", syncUnixFromFields);
    el.tz.addEventListener("change", syncUnixFromFields);
    el.unix.addEventListener("input", syncFieldsFromUnix);

    /* ---- Generate ---- */
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      generate();
    });

    function generate() {
      clearErrors();

      // Prefer the Unix field when the user has typed a value; otherwise
      // derive it from the date/time fields. Either way we validate.
      var epoch;
      if (document.activeElement === el.unix && el.unix.value.trim() !== "") {
        epoch = readUnix(true);
      } else {
        epoch = readDateTimeEpoch(true);
      }
      if (epoch === null) {
        showToast("Please fix the highlighted fields", true);
        return;
      }

      // Keep every field consistent with the resolved epoch.
      syncing = true;
      el.unix.value = epoch;
      var p = getPartsInZone(new Date(epoch * 1000), el.tz.value || localZone);
      el.date.value = p.year + "-" + pad(p.month) + "-" + pad(p.day);
      el.time.value = pad(p.hour) + ":" + pad(p.minute) + ":" + pad(p.second);
      syncing = false;

      // Loading animation only if the work exceeds 100ms (it rarely will).
      var loadingTimer = setTimeout(function () {
        el.generateBtn.classList.add("is-loading");
      }, 100);

      renderResults(epoch);

      clearTimeout(loadingTimer);
      el.generateBtn.classList.remove("is-loading");
      showToast("Generated every Discord timestamp format");
    }

    function renderResults(epoch) {
      var tz = el.tz.value || localZone;
      lastResult = { epoch: epoch, tz: tz, codes: {} };

      el.unixValue.textContent = String(epoch);
      el.tbody.innerHTML = "";

      STYLES.forEach(function (style) {
        var code = "<t:" + epoch + ":" + style.flag + ">";
        lastResult.codes[style.flag] = code;
        var preview = renderStyle(style.flag, epoch, tz);

        var tr = document.createElement("tr");

        var tdName = document.createElement("td");
        tdName.className = "fmt-name";
        tdName.innerHTML =
          escapeHtml(style.name) + "<small>:" + style.flag + "</small>";

        var tdSyntax = document.createElement("td");
        tdSyntax.className = "fmt-syntax";
        var codeEl = document.createElement("code");
        codeEl.textContent = code; // textContent keeps < and > literal + safe
        tdSyntax.appendChild(codeEl);

        var tdPreview = document.createElement("td");
        tdPreview.className = "fmt-preview";
        tdPreview.textContent = preview;

        var tdCopy = document.createElement("td");
        tdCopy.className = "fmt-copy";
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn btn--secondary btn--sm copy-btn";
        btn.setAttribute("data-label", "Copy");
        btn.setAttribute("aria-label", "Copy " + style.name + " format");
        btn.innerHTML = '<span class="copy-btn__text">Copy</span>';
        btn.addEventListener("click", function () {
          copyText(code, btn, "Copied " + code);
        });
        tdCopy.appendChild(btn);

        tr.appendChild(tdName);
        tr.appendChild(tdSyntax);
        tr.appendChild(tdPreview);
        tr.appendChild(tdCopy);
        el.tbody.appendChild(tr);
      });

      el.empty.hidden = true;
      el.body.hidden = false;
    }

    /* ---- Copy actions ---- */
    el.copyUnixBtn.addEventListener("click", function () {
      if (!lastResult) return;
      copyText(String(lastResult.epoch), el.copyUnixBtn, "Copied Unix timestamp");
    });

    el.copyAllBtn.addEventListener("click", function () {
      if (!lastResult) return;
      var all = STYLES.map(function (s) {
        return lastResult.codes[s.flag];
      }).join("\n");
      copyText(all, el.copyAllBtn, "Copied all 7 formats");
    });

    /* ---- Reset / quick actions ---- */
    el.resetBtn.addEventListener("click", function () {
      clearErrors();
      el.tz.value = localZone;
      setFieldsToNow();
      el.body.hidden = true;
      el.empty.hidden = false;
      lastResult = null;
      showToast("Reset to the current date and time");
    });

    el.btnNow.addEventListener("click", function () {
      clearErrors();
      setFieldsToNow();
      showToast("Set to the current time");
    });

    el.btnUnixNow.addEventListener("click", function () {
      clearErrors();
      var nowSeconds = Math.floor(Date.now() / 1000);
      el.unix.value = nowSeconds;
      syncFieldsFromUnix();
      showToast("Inserted the current Unix timestamp");
    });

    el.btnClear.addEventListener("click", function () {
      clearErrors();
      syncing = true;
      el.date.value = "";
      el.time.value = "";
      el.unix.value = "";
      syncing = false;
      el.date.focus();
      showToast("Cleared all fields");
    });
  }

  /* -------------------------------------------------------------------- */
  /* Timezone picker                                                      */
  /* -------------------------------------------------------------------- */
  function populateTimezones(select, localZone) {
    var zones = [];
    // Prefer the full IANA list when the browser exposes it.
    if (typeof Intl.supportedValuesOf === "function") {
      try {
        zones = Intl.supportedValuesOf("timeZone");
      } catch (e) {
        zones = [];
      }
    }
    if (!zones.length) {
      // Curated fallback for older browsers.
      zones = [
        "UTC", "America/New_York", "America/Chicago", "America/Denver",
        "America/Los_Angeles", "America/Sao_Paulo", "Europe/London",
        "Europe/Paris", "Europe/Berlin", "Europe/Moscow", "Africa/Cairo",
        "Asia/Dubai", "Asia/Kolkata", "Asia/Shanghai", "Asia/Tokyo",
        "Asia/Singapore", "Australia/Sydney", "Pacific/Auckland"
      ];
    }
    // Make sure the user's own zone is present and selectable.
    if (localZone && zones.indexOf(localZone) === -1) {
      zones.unshift(localZone);
    }

    var frag = document.createDocumentFragment();

    // Pin the detected local zone to the very top for convenience.
    var localOpt = document.createElement("option");
    localOpt.value = localZone;
    localOpt.textContent = "Your local time — " + localZone.replace(/_/g, " ");
    frag.appendChild(localOpt);

    zones.forEach(function (z) {
      if (z === localZone) return; // already pinned above
      var opt = document.createElement("option");
      opt.value = z;
      opt.textContent = z.replace(/_/g, " ");
      frag.appendChild(opt);
    });

    select.appendChild(frag);
    select.value = localZone;
  }

  /* -------------------------------------------------------------------- */
  /* Clipboard + toast + small utils                                      */
  /* -------------------------------------------------------------------- */
  function copyText(text, btn, toastMsg) {
    var onOk = function () {
      flashCopied(btn);
      showToast(toastMsg || "Copied to clipboard");
    };
    var onFail = function () {
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "absolute";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        onOk();
      } catch (err) {
        showToast("Copy failed — select the text manually", true);
      }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(onOk, onFail);
    } else {
      onFail();
    }
  }

  /* Show "✓ Copied" on a button for 2 seconds, then restore its label. */
  function flashCopied(btn) {
    if (!btn) return;
    var textSpan = btn.querySelector(".copy-btn__text");
    var original = btn.getAttribute("data-label") ||
      (textSpan ? textSpan.textContent : "Copy");
    btn.classList.add("is-copied");
    if (textSpan) textSpan.textContent = "✓ Copied";
    if (btn._copyTimer) clearTimeout(btn._copyTimer);
    btn._copyTimer = setTimeout(function () {
      btn.classList.remove("is-copied");
      if (textSpan) textSpan.textContent = original;
    }, 2000);
  }

  var toastTimer;
  function showToast(message, isError) {
    var toast = document.getElementById("toast");
    if (!toast) return;
    var msg = document.getElementById("toast-message");
    if (msg) msg.textContent = message;
    toast.classList.toggle("toast--error", !!isError);
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove("is-visible");
    }, 2600);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
