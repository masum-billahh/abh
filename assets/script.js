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

  // ---------- Step 1: address autocomplete + validation ----------

  const addressInput = document.getElementById("address");
  const suggestBox    = document.getElementById("suggestions");
  const statusIcon     = document.getElementById("address-status-icon");
  const statusMessage  = document.getElementById("address-status-message");
  const addressField   = document.getElementById("address-field");

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

  function clearSuggestions() {
    suggestBox.innerHTML = "";
    suggestBox.classList.remove("show");
    currentSuggestions = [];
    activeIndex = -1;
  }

  function clearHiddenFields() {
    Object.values(hidden).forEach((el) => (el.value = ""));
  }

  function setAddressStatus(state, message) {
    statusIcon.classList.remove("valid", "invalid", "loading", "show");
    statusMessage.classList.remove("valid", "invalid");
    addressField.classList.remove("has-status");

    if (state === "none") {
      statusMessage.textContent = "";
      return;
    }

    addressField.classList.add("has-status");
    statusIcon.classList.add("show", state);
    statusMessage.textContent = message || "";
    if (state === "valid" || state === "invalid") {
      statusMessage.classList.add(state);
    }
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

  function selectSuggestion(item) {
    addressInput.value = item.label;
    hidden.street.value = item.street || "";
    hidden.house_number.value = item.house_number || "";
    hidden.zip.value = item.zip || "";
    hidden.city.value = item.city || "";
    hidden.country.value = item.country || "CH";

    clearSuggestions();
    validateAddress();
  }

  async function fetchSuggestions(query) {
    try {
      const res = await fetch(
        API + "/suggest?q=" + encodeURIComponent(query) + "&lang=" + LANG
      );
      if (!res.ok) throw new Error("bad_response");
      const data = await res.json();
      renderSuggestions(data.suggestions || []);
    } catch (err) {
      clearSuggestions();
    }
  }

  async function validateAddress() {
  addressValidated = false;
  hidden.house_key.value = "";

  // Check house number first
  if (!hidden.house_number.value.trim()) {
    setAddressStatus(
      "invalid",
      STRINGS.house_number_missing || "House number is missing."
    );
    return;
  }

  setAddressStatus("loading", STRINGS.validating || "");

  try {
    const res = await fetch(API + "/validate-address", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name: document.getElementById("first_name").value,
        last_name: document.getElementById("last_name").value,
        street: hidden.street.value,
        house_number: hidden.house_number.value,
        zip: hidden.zip.value,
        city: hidden.city.value,
        country: hidden.country.value,
      }),
    });

    const data = await res.json();

    if (data.valid) {
      addressValidated = true;
      hidden.house_key.value = data.houseKey || "";
      setAddressStatus("valid", STRINGS.address_valid || "");
    } else {
      setAddressStatus(
        "invalid",
        STRINGS.address_invalid || ""
      );
    }
  } catch (err) {
    setAddressStatus(
      "invalid",
      STRINGS.address_invalid || ""
    );
  }
}

  addressInput.addEventListener("input", () => {
    addressValidated = false;
    setAddressStatus("none");
    clearHiddenFields();

    const query = addressInput.value.trim();
    clearTimeout(debounceTimer);

    if (query.length < 3) {
      clearSuggestions();
      return;
    }

    debounceTimer = setTimeout(() => fetchSuggestions(query), 300);
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
    const firstName = document.getElementById("first_name").value.trim();
    const lastName = document.getElementById("last_name").value.trim();

    if (!firstName || !lastName || !addressInput.value.trim()) {
      formError.textContent = STRINGS.required_field || "";
      return false;
    }
    if (!addressValidated || !hidden.house_key.value) {
      formError.textContent = STRINGS.select_suggestion || "";
      addressInput.focus();
      return false;
    }
    return true;
  }

  function validateStep2() {
    if (!pickupDateSelect.value || !pickupPlaceSelect.value) {
      formError.textContent = STRINGS.required_field || "";
      return false;
    }
    return true;
  }

  function validateStep4() {
    const email = document.getElementById("email").value.trim();
    const phone = document.getElementById("phone").value.trim();
    if (!email || !phone) {
      formError.textContent = STRINGS.required_field || "";
      return false;
    }
    return true;
  }

  nextBtn.addEventListener("click", async () => {
    formError.textContent = "";

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
    formError.textContent = "";
    if (currentStep > 1) {
      currentStep -= 1;
      updateStepUI();
    }
  });

  // ---------- Final submit ----------

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    formError.textContent = "";

    if (!validateStep4()) return;

    submitBtn.disabled = true;
    submitBtn.textContent = STRINGS.processing || "";

    try {
      const res = await fetch(API + "/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: document.getElementById("first_name").value,
          last_name: document.getElementById("last_name").value,
          company: document.getElementById("company").value,
          street: hidden.street.value,
          house_number: hidden.house_number.value,
          zip: hidden.zip.value,
          city: hidden.city.value,
          house_key: hidden.house_key.value,
          pickup_date: pickupDateSelect.value,
          pickup_place: pickupPlaceSelect.value,
          parcel_size: "LARGE",
          email: document.getElementById("email").value,
          phone: document.getElementById("phone").value,
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
        formError.textContent = STRINGS.order_failed || "";
        submitBtn.disabled = false;
        submitBtn.textContent = STRINGS.submit || "";
      }
    } catch (err) {
      formError.textContent = STRINGS.order_failed || "";
      submitBtn.disabled = false;
      submitBtn.textContent = STRINGS.submit || "";
    }
  });

  updateStepUI();
})();
