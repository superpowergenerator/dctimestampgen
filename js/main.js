/* ==========================================================================
   main.js — Global site behaviour (navigation, footer year, shared UI)
   Runs on every page. Kept dependency-free and defensive.
   ========================================================================== */
(function () {
  "use strict";

  /* ----- Mobile navigation toggle ------------------------------------- */
  function initNav() {
    var toggle = document.querySelector("[data-nav-toggle]");
    var menu = document.querySelector("[data-nav-menu]");
    if (!toggle || !menu) return;

    function closeMenu() {
      menu.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    }

    toggle.addEventListener("click", function () {
      var isOpen = menu.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });

    // Close when a link is chosen
    menu.addEventListener("click", function (e) {
      if (e.target.closest("a")) closeMenu();
    });

    // Close on Escape
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeMenu();
    });

    // Close when resizing back to desktop
    var mq = window.matchMedia("(min-width: 861px)");
    (mq.addEventListener ? mq.addEventListener.bind(mq, "change") :
      mq.addListener.bind(mq))(function () {
      if (mq.matches) closeMenu();
    });
  }

  /* ----- Current year in footer --------------------------------------- */
  function initYear() {
    var nodes = document.querySelectorAll("[data-year]");
    var year = String(new Date().getFullYear());
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = year;
    }
  }

  /* ----- FAQ: allow only one open at a time (nice-to-have) ------------- */
  function initFaq() {
    var items = document.querySelectorAll("[data-faq] .faq-item");
    if (!items.length) return;
    items.forEach(function (item) {
      item.addEventListener("toggle", function () {
        if (!item.open) return;
        items.forEach(function (other) {
          if (other !== item) other.open = false;
        });
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initNav();
    initYear();
    initFaq();
  });
})();
