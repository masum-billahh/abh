(function () {
  "use strict";

  const STRINGS = window.APP_STRINGS || {};
  const LANG = (window.APP_LANG || "en");

  // Backend = the WordPress REST API (see assets/config.js).
  const API = String(window.ABHOLEN_API_BASE || "").replace(/\/+$/, "");

  const form        = document.getElementById("pickup-form");
  const stepsNav     = document.getElementById("steps");
  const panels       = Array.from(document.querySelectorAll(".panel"));
  const prevBtn       = document.getElementById("prev-btn");
  const nextBtn       = document.getElementById("next-btn");
  const submitBtn     = document.getElementById("submit-btn");
  const formError      = document.getElementById("form-error");
  const resultEl       = document.getElementById("result");

  const TOTAL_STEPS = panels.length;
  let currentStep = 1;
  
  
  // ---------- Error helpers (field highlighting + messages with phone link) ----------

  const SUPPORT_PHONE = window.SUPPORT_PHONE || "+41782570450";
  const SUPPORT_PHONE_DISPLAY = window.SUPPORT_PHONE_DISPLAY || "+41 78 257 04 50";

  /** Writes a message into `el`; the {phone} placeholder becomes a tel: link. */
  function setMessage(el, template) {
    el.textContent = "";
    const parts = String(template || "").split("{phone}");
    parts.forEach((part, i) => {
      if (part) el.appendChild(document.createTextNode(part));
      if (i < parts.length - 1) {
        const a = document.createElement("a");
        a.href = "tel:" + SUPPORT_PHONE;
        a.textContent = SUPPORT_PHONE_DISPLAY;
        el.appendChild(a);
      }
    });
  }

  function clearFieldError(input) {
    const field = input && input.closest ? input.closest(".field") : null;
    if (!field) return;
    field.classList.remove("has-error");
    const p = field.querySelector(".field-error");
    if (p) p.remove();
    input.removeAttribute("aria-invalid");
  }

  function clearFieldErrors() {
    document.querySelectorAll(".field.has-error").forEach((f) => f.classList.remove("has-error"));
    document.querySelectorAll(".field-error").forEach((p) => p.remove());
    document.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));
    formError.textContent = "";
  }

  function setFieldError(input, message) {
    const field = input.closest(".field");
    if (!field) return;
    field.classList.add("has-error");
    input.setAttribute("aria-invalid", "true");
    const p = document.createElement("p");
    p.className = "field-error";
    setMessage(p, message);
    field.appendChild(p);
  }

  /**
   * errors: [{ input, message, kind: "missing" | "invalid" }]
   * Highlights every failing field and shows one summary. The phone link is
   * only added when something other than "field missing" is wrong.
   */
  function reportErrors(errors) {
    clearFieldErrors();
    if (!errors.length) return true;
    errors.forEach((e) => setFieldError(e.input, e.message));
    const onlyMissing = errors.every((e) => e.kind === "missing");
    setMessage(formError, onlyMissing ? STRINGS.err_summary_missing : STRINGS.err_summary_with_phone);
    errors[0].input.focus();
    return false;
  }

  // Typing or changing a field removes its own error.
  form.addEventListener("input", (e) => clearFieldError(e.target));
  form.addEventListener("change", (e) => clearFieldError(e.target));

    // Accepts Swiss landline or mobile numbers in national (0627970260) or
  // international (+41786021989) form; spaces, dashes, slashes, brackets are
  // ignored. Foreign +numbers are allowed too. Returns the cleaned number
  // or null if it doesn't look like a phone number.
  function normalizePhone(raw) {
    let d = String(raw).replace(/[\s().\-\/]/g, "");
    if (d.startsWith("0041")) d = "+" + d.slice(2);
    else if (/^41\d{9}$/.test(d)) d = "+" + d;
    d = d.replace(/^\+410/, "+41");                 // +41 (0)78 ... -> +4178 ...
    if (/^\+41\d{9}$/.test(d)) return d;            // +41786021989
    if (/^0\d{9}$/.test(d)) return d;               // 0627970260
    if (/^\+(?!41)[1-9]\d{7,14}$/.test(d)) return d; // other countries
    return null;
  }

    // ---------- Name length limit (first + last name combined) ----------

  // Combined limit, counted as "first last" (the two names plus the space between).
  const MAX_NAME_LENGTH = 49;
  const firstNameInput = document.getElementById("first_name");
  const lastNameInput  = document.getElementById("last_name");
  const nameLimitMsg   = document.getElementById("name-limit-message");

  function combinedNameLength(first, last) {
    return first.length + last.length + (first && last ? 1 : 0);
  }

  function showNameLimit(show) {
    nameLimitMsg.hidden = !show;
    nameLimitMsg.textContent = show
      ? (STRINGS.name_limit || "First and last name combined can be at most {max} characters.")
          .replace("{max}", String(MAX_NAME_LENGTH))
      : "";
  }

  /** Cuts the edited field so first + last never exceed the limit. */
  function enforceNameLimit(input, other) {
    const otherLen = other.value.length;
    const room = Math.max(0, MAX_NAME_LENGTH - otherLen - (otherLen ? 1 : 0));
    let exceeded = false;

    if (input.value.length > room) {
      const caret = input.selectionStart;
      input.value = input.value.slice(0, room);
      if (caret !== null) input.setSelectionRange(Math.min(caret, room), Math.min(caret, room));
      exceeded = true;
    }
    showNameLimit(exceeded);
  }

  firstNameInput.addEventListener("input", () => enforceNameLimit(firstNameInput, lastNameInput));
  lastNameInput.addEventListener("input", () => enforceNameLimit(lastNameInput, firstNameInput));

  // Typing into a field that is already at the limit changes nothing, so no
  // "input" event fires: catch that attempt here and show the message.
  [[firstNameInput, lastNameInput], [lastNameInput, firstNameInput]].forEach(([input, other]) => {
    input.addEventListener("beforeinput", (e) => {
      if (!e.data && e.inputType !== "insertFromPaste") return;
      const selected = input.selectionEnd - input.selectionStart;
      const room = MAX_NAME_LENGTH - other.value.length - (other.value ? 1 : 0);
      if (input.value.length - selected >= room) {
        showNameLimit(true);
      }
    });
  });

    // ---------- Customer type switch (individual / company) ----------

  const typeRadios       = Array.from(document.querySelectorAll('input[name="customer_type"]'));
  const individualFields = document.getElementById("individual-fields");
  const companyFields    = document.getElementById("company-fields");
  const companyInput     = document.getElementById("company");

  function getCustomerType() {
    const checked = typeRadios.find((r) => r.checked);
    return checked ? checked.value : "individual";
  }

  function applyCustomerType() {
    const isCompany = getCustomerType() === "company";
    individualFields.hidden = isCompany;
    companyFields.hidden = !isCompany;
	
	clearFieldErrors();

    // Never keep data from the hidden mode.
    if (isCompany) {
      firstNameInput.value = "";
      lastNameInput.value = "";
      showNameLimit(false);
    } else {
      companyInput.value = "";
    }
  }

  typeRadios.forEach((r) => r.addEventListener("change", applyCustomerType));

  // ---------- Step 1: address autocomplete + validation ----------

  const addressInput = document.getElementById("address");
  const suggestBox    = document.getElementById("suggestions");
  const statusIcon     = document.getElementById("address-status-icon");
  const statusMessage  = document.getElementById("address-status-message");
  const addressField   = document.getElementById("address-field");
  const numberChoicesBox  = document.getElementById("number-choices");
  const numberChoicesList = document.getElementById("number-choices-list");
  
    const addressHelp     = document.getElementById("address-help");
  const addressHelpText = document.getElementById("address-help-text");

  function showAddressHelp(show) {
    addressHelp.hidden = !show;
    if (show) setMessage(addressHelpText, STRINGS.address_not_found_text);
    else addressHelpText.textContent = "";
  }

  const hidden = {
    street: document.getElementById("hidden-street"),
    house_number: document.getElementById("hidden-house-number"),
    zip: document.getElementById("hidden-zip"),
    city: document.getElementById("hidden-city"),
    country: document.getElementById("hidden-country"),
    house_key: document.getElementById("hidden-house-key"),
  };

  let debounceTimer = null;
  let activeIndex = -1;
  let currentSuggestions = [];
  let addressValidated = false;
  // Bumped on every new input/selection so a slow, outdated response is ignored.
  let validationSeq = 0;
  // Suggestion waiting for the user to pick one of its house numbers.
  let pendingAddress = null;

  function clearSuggestions() {
    suggestBox.innerHTML = "";
    suggestBox.classList.remove("show");
    currentSuggestions = [];
    activeIndex = -1;
  }

  function clearHiddenFields() {
    Object.values(hidden).forEach((el) => (el.value = ""));
  }

  function clearNumberChoices() {
    pendingAddress = null;
    numberChoicesList.innerHTML = "";
    numberChoicesBox.hidden = true;
  }

  function setAddressStatus(state, message) {
    showAddressHelp(false);	
    statusIcon.classList.remove("valid", "invalid", "loading", "show");
    statusMessage.classList.remove("valid", "invalid");
    addressField.classList.remove("has-status");

    if (state === "none") {
      statusMessage.textContent = "";
      return;
    }

    addressField.classList.add("has-status");
    statusIcon.classList.add("show", state);
    setMessage(statusMessage, message || "");
    if (state === "valid" || state === "invalid") {
      statusMessage.classList.add(state);
    }
  }

  /** "Schwimmbadweg 1, 9104 Waldstatt" - one label format for the whole flow. */
  function formatAddressLabel(a) {
    const streetLine = [a.street, a.house_number].filter(Boolean).join(" ");
    const cityLine = [a.zip, a.city].filter(Boolean).join(" ");
    return [streetLine, cityLine].filter(Boolean).join(", ");
  }

  function setHidden(a) {
    hidden.street.value = a.street || "";
    hidden.house_number.value = a.house_number || "";
    hidden.zip.value = a.zip || "";
    hidden.city.value = a.city || "";
    hidden.country.value = a.country || "CH";
    hidden.house_key.value = "";
    clearFieldError(addressInput);	
  }

  function renderSuggestions(list) {
    currentSuggestions = list;
    activeIndex = -1;
    suggestBox.innerHTML = "";

    if (!list.length) {
      suggestBox.classList.remove("show");
      return;
    }

    list.forEach((item, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = item.label;
      btn.addEventListener("click", () => selectSuggestion(item));
      btn.dataset.index = String(index);
      suggestBox.appendChild(btn);
    });

    suggestBox.classList.add("show");
  }

  /** "26 - 28" / "26-28" -> ["26","27","28"]; null when not a numeric range. */
  function expandHouseNumberRange(value) {
    const match = String(value).trim().match(/^(\d+)\s*[-\u2013]\s*(\d+)$/);
    if (!match) return null;
    const start = Number(match[1]);
    const end = Number(match[2]);
    if (end <= start) return null;
    // Absurdly wide ranges are bad data; offer just the endpoints.
    if (end - start > 12) return [String(start), String(end)];
    const numbers = [];
    for (let n = start; n <= end; n++) numbers.push(String(n));
    return numbers;
  }

  async function selectSuggestion(item) {
    const seq = ++validationSeq;
    addressValidated = false;
    clearNumberChoices();
    clearSuggestions();
    setHidden(item);
    addressInput.value = item.label;

    if (!String(item.house_number).trim()) {
      setAddressStatus("invalid", STRINGS.house_number_missing || "House number is missing.");
      return;
    }

    // OSM sometimes maps a whole building row as one range entry ("26 - 28");
    // Swiss Post only knows the single numbers, so let the user pick theirs.
    const range = expandHouseNumberRange(item.house_number);
    if (!range) {
      validateAddress(item);
      return;
    }

    setAddressStatus("loading", STRINGS.validating || "");
    let existing = range;
    try {
      const res = await fetch(
        API + "/house-numbers?" + new URLSearchParams({
          zip: item.zip,
          street: item.street,
          numbers: range.join(","),
        })
      );
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.numbers)) existing = data.numbers;
      }
    } catch (err) {
      // Lookup failed: keep every candidate, validation is the final gate.
    }
    if (seq !== validationSeq) return;

    const choices = existing.length ? existing : range;
    if (choices.length === 1) {
      validateAddress(withHouseNumber(item, choices[0]));
      return;
    }

    setAddressStatus("none");
    pendingAddress = item;
    choices.forEach((number) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = number;
      btn.addEventListener("click", () => chooseNumber(number));
      numberChoicesList.appendChild(btn);
    });
    numberChoicesBox.hidden = false;
  }

  function withHouseNumber(item, houseNumber) {
    const next = Object.assign({}, item, { house_number: houseNumber });
    next.label = formatAddressLabel(next);
    return next;
  }

  function chooseNumber(houseNumber) {
    if (!pendingAddress) return;
    const address = withHouseNumber(pendingAddress, houseNumber);
    clearNumberChoices();
    ++validationSeq;
    setHidden(address);
    addressInput.value = address.label;
    validateAddress(address);
  }

  async function fetchSuggestions(query) {
    try {
      const url =
        "https://api.maptiler.com/geocoding/" + encodeURIComponent(query) + ".json?" +
        new URLSearchParams({
          key: window.MAPTILER_KEY || "",
          country: "ch",
          language: LANG,
          limit: "6",
          autocomplete: "true",
          types: "address",
        });

      const res = await fetch(url);
      if (!res.ok) throw new Error("bad_response");
      const data = await res.json();
	  if (query !== addressInput.value.trim()) return; // outdated response

      // MapTiler's `municipality.*` is the commune; `place.*` is only a
      // neighbourhood/hamlet, so it is the last resort.
      const CITY_PREFIXES = ["municipality", "locality", "place"];
      const contextText = (context, prefix) => {
        const hit = context.find((c) => typeof c.id === "string" && c.id.indexOf(prefix + ".") === 0);
        return hit && hit.text ? String(hit.text).trim() : "";
      };

      const suggestions = (data.features || [])
        .map((f) => {
          // Second line of defence next to `country=ch`: Swiss street addresses only.
          if (!f.properties || f.properties.country_code !== "ch") return null;
          if (!Array.isArray(f.place_type) || f.place_type.indexOf("address") === -1) return null;

          const context = Array.isArray(f.context) ? f.context : [];
          const street = String(f.text || "").trim();
          const houseNumber = typeof f.address === "string" ? f.address.trim() : "";
          const zip = contextText(context, "postal_code");
          let city = "";
          for (const prefix of CITY_PREFIXES) {
            city = contextText(context, prefix);
            if (city) break;
          }
          if (!street || !city) return null;

          const item = { street, house_number: houseNumber, zip, city, country: "CH" };
          item.label = formatAddressLabel(item);
          return item;
        })
        .filter(Boolean);

      renderSuggestions(suggestions);
	  // Nothing found for a reasonably complete query: explain + offer the way out.
      // 8 = minimum characters before we conclude "not found"; tune as needed.
      if (!suggestions.length && query.length >= 8) {
        setAddressStatus("none");
        showAddressHelp(true);
      }
    } catch (err) {
      clearSuggestions();
    }
  }

  async function validateAddress(address) {
    const seq = ++validationSeq;
    addressValidated = false;
    hidden.house_key.value = "";

    if (!String(address.house_number).trim()) {
      setAddressStatus("invalid", STRINGS.house_number_missing || "House number is missing.");
      return;
    }

    setAddressStatus("loading", STRINGS.validating || "");

    try {
      const res = await fetch(API + "/validate-address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Swiss Post requires the name keys, but company mode sends them empty.
          first_name: getCustomerType() === "company" ? "" : document.getElementById("first_name").value,
          last_name: getCustomerType() === "company" ? "" : document.getElementById("last_name").value,
          street: address.street,
          house_number: address.house_number,
          zip: address.zip,
          city: address.city,
          country: address.country,
        }),
      });

      const data = await res.json();
      if (seq !== validationSeq) return; // user typed or picked something else meanwhile

      if (data.valid && data.houseKey) {
        // The backend may have matched a postal locality that differs from
        // MapTiler's commune (6067 Melchtal vs Kerns) - use the matched one.
        const city = data.city || address.city;
        hidden.city.value = city;
        hidden.house_key.value = data.houseKey;
        addressInput.value = formatAddressLabel(Object.assign({}, address, { city }));
        addressValidated = true;
        setAddressStatus("valid", STRINGS.address_valid || "");
      } else if (data.valid) {
        // Matched but without a building key: pickup dates can't be looked up.
        setAddressStatus("invalid", STRINGS.not_deliverable || STRINGS.address_invalid || "");
        showAddressHelp(true);
      } else {
        const technical = ["rate_limited", "auth_failed", "validation_unreachable"].indexOf(data.message) !== -1;
        if (technical) {
          // Not the customer's fault: apologise + phone number.
          setAddressStatus("invalid", STRINGS.address_check_failed || STRINGS.address_invalid || "");
        } else {
          // Address not supported by Swiss Post: explanation + solution (3ai).
          setAddressStatus("invalid", STRINGS.not_deliverable || STRINGS.address_invalid || "");
          showAddressHelp(true);
        }
      }
    } catch (err) {
      if (seq !== validationSeq) return;
      setAddressStatus("invalid", STRINGS.address_check_failed || STRINGS.address_invalid || "");
    }
  }

  addressInput.addEventListener("input", () => {
    ++validationSeq;
    addressValidated = false;
    setAddressStatus("none");
    clearHiddenFields();
    clearNumberChoices();

    const query = addressInput.value.trim();
    clearTimeout(debounceTimer);

    if (query.length < 2) {
      clearSuggestions();
      return;
    }

    debounceTimer = setTimeout(() => fetchSuggestions(query), 250);
  });

  addressInput.addEventListener("keydown", (e) => {
    if (!currentSuggestions.length) return;
    const buttons = Array.from(suggestBox.querySelectorAll("button"));

    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, buttons.length - 1);
      buttons.forEach((b, i) => b.classList.toggle("active", i === activeIndex));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      buttons.forEach((b, i) => b.classList.toggle("active", i === activeIndex));
    } else if (e.key === "Enter") {
      if (activeIndex >= 0) {
        e.preventDefault();
        selectSuggestion(currentSuggestions[activeIndex]);
      }
    } else if (e.key === "Escape") {
      clearSuggestions();
    }
  });

  document.addEventListener("click", (e) => {
    if (!addressField.contains(e.target)) {
      clearSuggestions();
    }
  });

  // ---------- Step 2: pickup date / place ----------

  const pickupDateSelect  = document.getElementById("pickup_date");
  const pickupPlaceSelect = document.getElementById("pickup_place");
  const pickupLoading      = document.getElementById("pickup-options-loading");
  const pickupError        = document.getElementById("pickup-options-error");
   setMessage(pickupError, STRINGS.pickup_options_error);
  let pickupOptionsLoaded = false;

  async function loadPickupOptions() {
    pickupLoading.style.display = "block";
    pickupError.style.display = "none";
    pickupOptionsLoaded = false;

    try {
      const res = await fetch(
        API + "/collection-instructions?house_key=" + encodeURIComponent(hidden.house_key.value) + "&lang=" + LANG
      );
      const data = await res.json();

      pickupDateSelect.innerHTML = '<option value="">' + (STRINGS.choose_date || "") + "</option>";
      (data.dates || []).forEach((date) => {
        const opt = document.createElement("option");
        opt.value = date;
        opt.textContent = date;
        pickupDateSelect.appendChild(opt);
      });

      pickupPlaceSelect.innerHTML = '<option value="">' + (STRINGS.choose_place || "") + "</option>";
      (data.places || []).forEach((place) => {
        const opt = document.createElement("option");
        opt.value = place.name;
        opt.textContent = place.label;
        pickupPlaceSelect.appendChild(opt);
      });

      pickupLoading.style.display = "none";

      if (!(data.dates || []).length && !(data.places || []).length) {
        pickupError.style.display = "block";
      } else {
        pickupOptionsLoaded = true;
      }
    } catch (err) {
      pickupLoading.style.display = "none";
      pickupError.style.display = "block";
    }
  }

  // ---------- Step navigation ----------

  function updateStepUI() {
    panels.forEach((p) => p.classList.toggle("active", Number(p.dataset.panel) === currentStep));
    stepsNav.querySelectorAll(".step").forEach((li) => {
      const n = Number(li.dataset.step);
      li.classList.toggle("active", n === currentStep);
      li.classList.toggle("done", n < currentStep);
    });

    prevBtn.style.display = currentStep === 1 ? "none" : "inline-block";
    nextBtn.style.display = currentStep === TOTAL_STEPS ? "none" : "inline-block";
    submitBtn.style.display = currentStep === TOTAL_STEPS ? "inline-block" : "none";
  }

      function validateStep1() {
    const isCompany = getCustomerType() === "company";
    const firstName = firstNameInput.value.trim();
    const lastName = lastNameInput.value.trim();
    const errors = [];

    if (isCompany) {
      if (!companyInput.value.trim()) {
        errors.push({ input: companyInput, kind: "missing", message: STRINGS.err_company_missing });
      }
    } else {
      if (!firstName) errors.push({ input: firstNameInput, kind: "missing", message: STRINGS.err_first_name_missing });
      if (!lastName) errors.push({ input: lastNameInput, kind: "missing", message: STRINGS.err_last_name_missing });
      if (firstName && lastName && combinedNameLength(firstName, lastName) > MAX_NAME_LENGTH) {
        showNameLimit(true);
        errors.push({
          input: firstNameInput,
          kind: "invalid",
          message: (STRINGS.name_limit || "").replace("{max}", String(MAX_NAME_LENGTH)),
        });
      }
    }

    if (!addressInput.value.trim()) {
      errors.push({ input: addressInput, kind: "missing", message: STRINGS.err_address_missing });
    } else if (!addressValidated || !hidden.house_key.value) {
      if (pendingAddress) {
        errors.push({ input: addressInput, kind: "missing", message: STRINGS.err_pick_number });
      } else if (statusIcon.classList.contains("loading")) {
        errors.push({ input: addressInput, kind: "missing", message: STRINGS.address_checking });
      } else if (hidden.street.value && !hidden.house_number.value.trim()) {
        errors.push({ input: addressInput, kind: "missing", message: STRINGS.house_number_missing });
      } else if (!addressHelp.hidden || statusMessage.classList.contains("invalid")) {
        errors.push({ input: addressInput, kind: "invalid", message: STRINGS.err_address_failed });
      } else {
        errors.push({ input: addressInput, kind: "missing", message: STRINGS.select_suggestion });
      }
    }

    return reportErrors(errors);
  }

  function validateStep2() {
    if (!pickupOptionsLoaded) {
      return reportErrors([{ input: pickupDateSelect, kind: "invalid", message: STRINGS.pickup_options_error }]);
    }
    const errors = [];
    if (!pickupDateSelect.value) {
      errors.push({ input: pickupDateSelect, kind: "missing", message: STRINGS.err_pickup_date_missing });
    }
    if (!pickupPlaceSelect.value) {
      errors.push({ input: pickupPlaceSelect, kind: "missing", message: STRINGS.err_pickup_place_missing });
    }
    return reportErrors(errors);
  }

  function validateStep4() {
    const emailInput = document.getElementById("email");
    const phoneInput = document.getElementById("phone");
    const email = emailInput.value.trim();
    const phone = phoneInput.value.trim();
    const errors = [];

    if (!email) {
      errors.push({ input: emailInput, kind: "missing", message: STRINGS.err_email_missing });
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      errors.push({ input: emailInput, kind: "invalid", message: STRINGS.err_email_invalid });
    }

    if (!phone) {
      errors.push({ input: phoneInput, kind: "missing", message: STRINGS.err_phone_missing });
    } else if (!normalizePhone(phone)) {
      errors.push({ input: phoneInput, kind: "invalid", message: STRINGS.err_phone_invalid });
    }

    return reportErrors(errors);
  }

  nextBtn.addEventListener("click", async () => {
    clearFieldErrors();

    if (currentStep === 1) {
      if (!validateStep1()) return;
      currentStep = 2;
      updateStepUI();
      if (!pickupOptionsLoaded) {
        await loadPickupOptions();
      }
      return;
    }

    if (currentStep === 2) {
      if (!validateStep2()) return;
      currentStep = 3;
      updateStepUI();
      return;
    }
  });

  prevBtn.addEventListener("click", () => {
    clearFieldErrors();
    if (currentStep > 1) {
      currentStep -= 1;
      updateStepUI();
    }
  });

  // ---------- Final submit ----------

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearFieldErrors();

    if (!validateStep4()) return;

    submitBtn.disabled = true;
    submitBtn.textContent = STRINGS.processing || "";

    try {
      const res = await fetch(API + "/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_type: getCustomerType(),
          first_name: getCustomerType() === "company" ? "" : firstNameInput.value,
          last_name: getCustomerType() === "company" ? "" : lastNameInput.value,
          company: getCustomerType() === "company" ? companyInput.value : "",
          street: hidden.street.value,
          house_number: hidden.house_number.value,
          zip: hidden.zip.value,
          city: hidden.city.value,
          house_key: hidden.house_key.value,
          pickup_date: pickupDateSelect.value,
          pickup_place: pickupPlaceSelect.value,
          parcel_size: "LARGE",
          email: document.getElementById("email").value,
          phone: normalizePhone(document.getElementById("phone").value) || "",
          lang: LANG,
          contact_hp: document.getElementById("contact_hp").value, // honeypot, must stay empty
        }),
      });
      const data = await res.json();

      if (data.success) {
        form.style.display = "none";
        stepsNav.style.display = "none";
        resultEl.style.display = "block";
        resultEl.className = "result success";
        resultEl.textContent = "";
        const addLine = (text) => {
          const p = document.createElement("p");
          p.textContent = text;
          resultEl.appendChild(p);
          return p;
        };
        addLine(STRINGS.order_success || "");
        addLine((STRINGS.order_reference || "") + ": " + data.reference);
        if (data.trackingUrl && /^https:\/\//i.test(data.trackingUrl)) {
          const p = document.createElement("p");
          const a = document.createElement("a");
          a.href = data.trackingUrl;
          a.target = "_blank";
          a.rel = "noopener";
          a.textContent = STRINGS.track_shipment || "";
          p.appendChild(a);
          resultEl.appendChild(p);
        }
      } else {
        setMessage(formError, STRINGS.order_failed);
        submitBtn.disabled = false;
        submitBtn.textContent = STRINGS.submit || "";
      }
    } catch (err) {
      setMessage(formError, STRINGS.order_failed);
      submitBtn.disabled = false;
      submitBtn.textContent = STRINGS.submit || "";
    }
  });

  updateStepUI();
})();
