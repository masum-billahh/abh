// Applies translations (lang/*.json) to the static page, builds the
// language switch, then starts the wizard (assets/script.js).
// Replaces the PHP templating that index.php used to do.
(function () {
  "use strict";

  var SUPPORTED = ["de", "en", "fr"];
  var params = new URLSearchParams(window.location.search);
  var lang = params.get("lang") || "de";
  if (SUPPORTED.indexOf(lang) === -1) lang = "en";

  function load(code) {
    return fetch("lang/" + code + ".json").then(function (res) {
      if (!res.ok) throw new Error("lang_load_failed");
      return res.json();
    });
  }

  function apply(strings, code) {
    window.APP_STRINGS = strings;
    window.APP_LANG = code;

    document.documentElement.lang = code;
    if (strings.page_title) document.title = strings.page_title;

    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      if (strings[key] !== undefined) el.textContent = strings[key];
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-placeholder");
      if (strings[key] !== undefined) el.setAttribute("placeholder", strings[key]);
    });

    var nav = document.getElementById("lang-switch");
    nav.textContent = "";
    SUPPORTED.forEach(function (c) {
      var p = new URLSearchParams(window.location.search);
      p.set("lang", c);
      var a = document.createElement("a");
      a.href = "?" + p.toString();
      a.textContent = c.toUpperCase();
      if (c === code) a.className = "active";
      nav.appendChild(a);
    });

    document.documentElement.classList.remove("i18n-pending");

    var s = document.createElement("script");
    s.src = "assets/script.js";
    document.body.appendChild(s);
  }

  load(lang)
    .then(function (strings) { apply(strings, lang); })
    .catch(function () {
      // Fall back to English once; if that fails too, show the page untranslated.
      load("en")
        .then(function (strings) { apply(strings, "en"); })
        .catch(function () {
          window.APP_STRINGS = {};
          window.APP_LANG = "en";
          document.documentElement.classList.remove("i18n-pending");
          var s = document.createElement("script");
          s.src = "assets/script.js";
          document.body.appendChild(s);
        });
    });
})();
