/* ==========================================================================
   contact.js — Client-side validation for the contact form.
   This is a front-end demo: it validates input and confirms locally.
   No data is transmitted or stored.
   ========================================================================== */
(function () {
  "use strict";

  function init() {
    var form = document.getElementById("contact-form");
    if (!form) return;

    var fields = {
      name: {
        el: document.getElementById("c-name"),
        err: document.getElementById("c-name-error"),
        validate: function (v) {
          if (!v) return "Please enter your name.";
          if (v.length < 2) return "Name must be at least 2 characters.";
          return "";
        }
      },
      email: {
        el: document.getElementById("c-email"),
        err: document.getElementById("c-email-error"),
        validate: function (v) {
          if (!v) return "Please enter your email address.";
          // Pragmatic email pattern
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v))
            return "Please enter a valid email address.";
          return "";
        }
      },
      message: {
        el: document.getElementById("c-message"),
        err: document.getElementById("c-message-error"),
        validate: function (v) {
          if (!v) return "Please enter a message.";
          if (v.length < 10) return "Message must be at least 10 characters.";
          return "";
        }
      }
    };

    function setError(field, message) {
      field.err.textContent = message;
      if (message) {
        field.el.classList.add("is-invalid");
        field.el.setAttribute("aria-invalid", "true");
      } else {
        field.el.classList.remove("is-invalid");
        field.el.removeAttribute("aria-invalid");
      }
    }

    // Live-clear errors as the user fixes them
    Object.keys(fields).forEach(function (key) {
      var field = fields[key];
      if (!field.el) return;
      field.el.addEventListener("input", function () {
        if (field.el.classList.contains("is-invalid")) {
          setError(field, field.validate(field.el.value.trim()));
        }
      });
    });

    // Destination address lives in one place: the form's data-contact-email
    // attribute. Swap it there (in contact.html) to change where mail goes.
    var contactEmail = form.getAttribute("data-contact-email") || "";
    var subjectEl = document.getElementById("c-subject");

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var firstInvalid = null;

      Object.keys(fields).forEach(function (key) {
        var field = fields[key];
        var msg = field.validate(field.el.value.trim());
        setError(field, msg);
        if (msg && !firstInvalid) firstInvalid = field.el;
      });

      if (firstInvalid) {
        firstInvalid.focus();
        showToast("Please fix the highlighted fields", true);
        return;
      }

      // Build a mailto: link and hand off to the user's email client.
      var name = fields.name.el.value.trim();
      var email = fields.email.el.value.trim();
      var message = fields.message.el.value.trim();
      var subject = subjectEl && subjectEl.value.trim()
        ? subjectEl.value.trim()
        : "Message from " + name;
      var body =
        "From: " + name + " <" + email + ">\n\n" + message;

      var href =
        "mailto:" + contactEmail +
        "?subject=" + encodeURIComponent(subject) +
        "&body=" + encodeURIComponent(body);

      window.location.href = href;
      showToast("Opening your email app to send the message.");
    });
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
    }, 2800);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
