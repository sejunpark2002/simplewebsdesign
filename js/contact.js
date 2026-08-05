/* ============================================================
   SimpleWebs — contact form
   AJAX submit to /api/contact (Resend runs server-side); inline
   success/error state, no page reload.
   ============================================================ */
(function () {
  "use strict";

  var form = document.getElementById("contactForm");
  if (!form) return;

  var status = document.getElementById("formStatus");
  var submitBtn = form.querySelector(".form-submit");

  form.addEventListener("submit", function (e) {
    e.preventDefault();

    status.textContent = "";
    status.classList.remove("is-success", "is-error");

    var originalLabel = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";

    var payload = {};
    new FormData(form).forEach(function (value, key) { payload[key] = value; });

    fetch(form.action, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json", "Accept": "application/json" }
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) throw new Error(data.error || "Something went wrong sending your message.");
          return data;
        });
      })
      .then(function () {
        form.reset();
        status.textContent = "Thanks — your message is on its way. We'll be in touch within one business day.";
        status.classList.add("is-success");
      })
      .catch(function (err) {
        status.textContent = err.message || "Something went wrong — email us directly at info@simplewebsdesign.com.";
        status.classList.add("is-error");
      })
      .finally(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
      });
  });
})();
