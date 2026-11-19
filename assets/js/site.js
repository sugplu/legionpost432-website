/* ==========================================================================
   American Legion Post 432 — site script (plain JavaScript, no libraries)

   Everything volunteers edit lives in /content/*.json (edited through the
   website editor). This file reads those files and draws them on the page.
   Regular events (meetings, breakfasts, bingo, dinners) are calculated from
   their rule — e.g. "3rd Saturday" — so their dates never need updating.
   ========================================================================== */
(function () {
  "use strict";

  var TZ = "America/Los_Angeles";
  var ORDINALS = { "1st": 1, "2nd": 2, "3rd": 3, "4th": 4, "Last": -1 };
  var WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var LEVEL_ORDER = ["Commodore", "Patriot", "Eagle", "Minuteman", "Friend"];

  /* ---------- small helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else n.setAttribute(k, v === true ? "" : v);
    });
    (kids || []).forEach(function (c) { if (c != null) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  function safeUrl(u) {
    if (!u) return "";
    u = String(u).trim();
    if (/^(https?:|mailto:|tel:)/i.test(u)) return u;
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return ""; // block javascript: etc.
    return u.replace(/^\/+/, ""); // site-relative paths work from any folder
  }
  function store(key, val) {
    try { if (val === undefined) return window.localStorage.getItem(key); window.localStorage.setItem(key, val); } catch (e) { return null; }
  }
  var cache = {};
  function getJSON(name) {
    if (!cache[name]) {
      cache[name] = fetch("content/" + name + ".json", { cache: "no-cache" })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .catch(function (err) {
          if (window.console) console.warn("Could not load content/" + name + ".json", err);
          return null;
        });
    }
    return cache[name];
  }

  /* ---------- dates (all calculated in Cambria's time zone) ---------- */
  function todayISO() {
    try {
      var p = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
      var o = {}; p.forEach(function (x) { o[x.type] = x.value; });
      return o.year + "-" + o.month + "-" + o.day;
    } catch (e) {
      var d = new Date(); return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
    }
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function iso(y, m, d) { return y + "-" + pad(m) + "-" + pad(d); }
  function parts(s) { var a = String(s).split("-").map(Number); return { y: a[0], m: a[1], d: a[2] }; }
  function utc(s) { var p = parts(s); return new Date(Date.UTC(p.y, p.m - 1, p.d)); }
  function addDays(s, n) { var d = utc(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function fmt(s, opts) { return new Intl.DateTimeFormat("en-US", Object.assign({ timeZone: "UTC" }, opts)).format(utc(s)); }
  function validDate(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s); }

  function nthWeekday(y, m, weekday, n) {
    if (n > 0) {
      var first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
      var day = 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
      var dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
      return day <= dim ? iso(y, m, day) : null;
    }
    var lastDate = new Date(Date.UTC(y, m, 0));
    var back = (lastDate.getUTCDay() - weekday + 7) % 7;
    return iso(y, m, lastDate.getUTCDate() - back);
  }

  /* Next dates for one regular event, starting today. */
  function occurrences(rule, fromISO, untilISO) {
    var out = [];
    var wd = WEEKDAYS.indexOf(rule.weekday);
    if (wd < 0) return out;
    var skip = (rule.skip || []).map(function (x) { return String(x).slice(0, 10); });
    if (rule.repeats === "Every week") {
      var first = utc(fromISO).getUTCDay();
      var s = addDays(fromISO, (wd - first + 7) % 7);
      while (s <= untilISO) { if (skip.indexOf(s) < 0) out.push(s); s = addDays(s, 7); }
    } else {
      var n = ORDINALS[rule.week] || 1;
      var f = parts(fromISO), y = f.y, m = f.m;
      for (var i = 0; i < 14; i++) {
        var d = nthWeekday(y, m, wd, n);
        if (d && d >= fromISO && d <= untilISO && skip.indexOf(d) < 0) out.push(d);
        m++; if (m > 12) { m = 1; y++; }
        if (iso(y, m, 1) > untilISO) break;
      }
    }
    return out;
  }
  function ruleLabel(r) {
    if (r.repeats === "Every week") return "Every " + r.weekday;
    return (r.week || "1st") + " " + r.weekday + " monthly";
  }

  /* ---------- text size control ---------- */
  function initTextSize() {
    var root = document.documentElement;
    var saved = store("ap432-text");
    if (saved === "lg" || saved === "xl") root.setAttribute("data-text", saved);
    $$("[data-textsize]").forEach(function (btn) {
      var v = btn.getAttribute("data-textsize");
      btn.setAttribute("aria-pressed", String((root.getAttribute("data-text") || "md") === v));
      btn.addEventListener("click", function () {
        if (v === "md") root.removeAttribute("data-text"); else root.setAttribute("data-text", v);
        store("ap432-text", v);
        $$("[data-textsize]").forEach(function (b) { b.setAttribute("aria-pressed", String(b === btn)); });
      });
    });
  }

  /* ---------- navigation ---------- */
  function initNav() {
    var menuBtn = $(".menu-button"), panel = $("#mobile-menu");
    if (menuBtn && panel) {
      menuBtn.addEventListener("click", function () {
        var open = menuBtn.getAttribute("aria-expanded") === "true";
        menuBtn.setAttribute("aria-expanded", String(!open));
        panel.hidden = open;
        $(".menu-button__label", menuBtn).textContent = open ? "Menu" : "Close";
      });
    }
    var toggles = $$(".nav__toggle");
    function closeAll(except) {
      toggles.forEach(function (t) {
        if (t === except) return;
        t.setAttribute("aria-expanded", "false");
        var m = document.getElementById(t.getAttribute("aria-controls")); if (m) m.hidden = true;
      });
    }
    toggles.forEach(function (t) {
      var menu = document.getElementById(t.getAttribute("aria-controls"));
      if (menu && menu.querySelector('[aria-current="page"]')) t.classList.add("is-current");
      t.addEventListener("click", function (e) {
        e.stopPropagation();
        var open = t.getAttribute("aria-expanded") === "true";
        closeAll(t);
        t.setAttribute("aria-expanded", String(!open));
        if (menu) menu.hidden = open;
      });
    });
    document.addEventListener("click", function (e) { if (!e.target.closest(".nav__list > li")) closeAll(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        var openT = toggles.filter(function (t) { return t.getAttribute("aria-expanded") === "true"; })[0];
        closeAll(); if (openT) openT.focus();
      }
    });
  }

  /* ---------- announcement banner (content/settings.json) ---------- */
  function renderAnnouncement(settings) {
    var box = $("[data-announcement]");
    if (!box || !settings || !settings.announcement) return;
    var a = settings.announcement;
    if (!a.show || !a.text) return;
    var p = $("p", box); p.textContent = a.text + " ";
    var href = safeUrl(a.link);
    if (href && a.linkText) p.appendChild(el("a", { href: href, text: a.linkText }));
    box.hidden = false;
  }

  /* ---------- events ---------- */
  function dateBadge(dISO, today) {
    return el("div", { class: "event__date", "aria-hidden": "true" }, [
      el("span", { class: "m", text: fmt(dISO, { month: "short" }) }),
      el("span", { class: "d", text: String(parts(dISO).d) }),
      el("span", { class: "w", text: dISO === today ? "Today" : fmt(dISO, { weekday: "short" }) })
    ]);
  }
  function eventItem(ev, today) {
    var li = el("li");
    var art = el("article", { class: "event" + (ev.date === today ? " event--today" : "") });
    var body = el("div");
    var h = el("h3", { text: ev.title });
    if (ev.tag) h.appendChild(el("span", { class: "event__tag", text: ev.tag }));
    body.appendChild(h);
    var when = fmt(ev.date, { weekday: "long", month: "long", day: "numeric" });
    var meta = el("p", { class: "event__meta" }, [el("strong", { text: (ev.date === today ? "Today" : when) + (ev.time ? " · " + ev.time : "") })]);
    if (ev.location) meta.appendChild(document.createTextNode(" — " + ev.location));
    body.appendChild(meta);
    if (ev.description) body.appendChild(el("p", { class: "event__desc", text: ev.description }));
    if (ev.audience) body.appendChild(el("p", { class: "event__desc" }, [el("span", { class: "event__tag event__tag--who", text: ev.audience })]));
    var href = safeUrl(ev.link);
    if (href) body.appendChild(el("p", { class: "event__desc" }, [el("a", { class: "link-arrow", href: href, text: ev.linkText || "Details" })]));
    art.appendChild(dateBadge(ev.date, today)); art.appendChild(body); li.appendChild(art);
    return li;
  }
  function upcomingList(data, today, days, onlyHome) {
    var until = addDays(today, days);
    var list = [];
    (data.recurring || []).forEach(function (r) {
      if (onlyHome && !r.showOnHome) return;
      occurrences(r, today, until).forEach(function (d) {
        list.push({ date: d, title: r.title, time: r.time, location: r.location, description: r.description, audience: r.audience, sort: r.sortTime || r.time || "" });
      });
    });
    (data.featured || []).forEach(function (f) {
      if (!validDate(f.date)) return;
      var end = validDate(f.endDate) ? f.endDate : f.date;
      if (end < today || f.date > until) return;
      list.push({ date: f.date < today ? today : f.date, title: f.title, time: f.time, location: f.location, description: f.summary, link: f.link, linkText: f.linkText, tag: "Special event" });
    });
    list.sort(function (a, b) { return a.date === b.date ? toMinutes(a.sort || a.time) - toMinutes(b.sort || b.time) : (a.date < b.date ? -1 : 1); });
    return list;
  }
  function toMinutes(t) {
    var m = /(\d{1,2})(?::(\d{2}))?\s*([AaPp])/.exec(t || "");
    if (!m) return 9999;
    var h = Number(m[1]) % 12 + (/[Pp]/.test(m[3]) ? 12 : 0);
    return h * 60 + Number(m[2] || 0);
  }

  function renderEvents(data) {
    if (!data) return;
    var today = todayISO();

    $$('[data-render="upcoming"]').forEach(function (box) {
      var limit = Number(box.getAttribute("data-limit")) || 8;
      var days = Number(box.getAttribute("data-days")) || 45;
      var items = upcomingList(data, today, days, box.hasAttribute("data-home")).slice(0, limit);
      var ul = el("ul", { class: "event-list" });
      items.forEach(function (ev) { ul.appendChild(eventItem(ev, today)); });
      box.innerHTML = ""; box.appendChild(items.length ? ul : el("p", { class: "muted", text: "No events are scheduled right now. Please check back soon." }));
    });

    $$('[data-render="week"]').forEach(function (box) {
      var until = addDays(today, 70);
      var grid = el("div", { class: "week" });
      (data.recurring || []).filter(function (r) { return !box.hasAttribute("data-home") || r.showOnHome; }).forEach(function (r) {
        var next = occurrences(r, today, until)[0];
        var item = el("div", { class: "week__item" }, [
          el("p", { class: "week__when", text: ruleLabel(r) }),
          el("h3", { text: r.title })
        ]);
        if (r.time) item.appendChild(el("p", { class: "week__time", text: r.time }));
        if (r.description) item.appendChild(el("p", { text: r.description }));
        if (r.location) item.appendChild(el("p", { class: "week__where", text: "Where: " + r.location }));
        if (next) item.appendChild(el("p", { class: "week__next", text: "Next: " + (next === today ? "Today" : fmt(next, { weekday: "short", month: "short", day: "numeric" })) }));
        grid.appendChild(item);
      });
      box.innerHTML = ""; box.appendChild(grid);
    });

    $$("[data-next]").forEach(function (node) {
      var key = node.getAttribute("data-next");
      var rule = (data.recurring || []).filter(function (r) { return r.key === key; })[0];
      if (!rule) return;
      var next = occurrences(rule, today, addDays(today, 70))[0];
      if (!next) return;
      node.textContent = (next === today ? "Today" : fmt(next, { weekday: "short", month: "short", day: "numeric" })) + (rule.time ? " · " + rule.time : "");
    });

    $$('[data-render="featured"]').forEach(function (box) {
      var limit = Number(box.getAttribute("data-limit")) || 3;
      var items = (data.featured || []).filter(function (f) { return validDate(f.date) && (validDate(f.endDate) ? f.endDate : f.date) >= today; })
        .sort(function (a, b) { return a.date < b.date ? -1 : 1; }).slice(0, limit);
      box.innerHTML = "";
      if (!items.length) { box.closest("[data-hide-if-empty]") && (box.closest("[data-hide-if-empty]").hidden = true); return; }
      var wrap = el("div", { class: "stack" });
      items.forEach(function (f) {
        var card = el("article", { class: "featured-event" });
        var img = safeUrl(f.image);
        if (img) card.appendChild(el("div", { class: "featured-event__media" }, [el("img", { src: img, alt: f.imageAlt || "", loading: "lazy", decoding: "async" })]));
        var when = fmt(f.date, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
        if (validDate(f.endDate) && f.endDate !== f.date) when += " – " + fmt(f.endDate, { month: "long", day: "numeric" });
        var body = el("div", { class: "featured-event__body" }, [
          el("span", { class: "featured-event__when", text: (f.label ? f.label + " · " : "") + when }),
          el("h3", { text: f.title })
        ]);
        var meta = [f.time, f.location].filter(Boolean).join(" · ");
        if (meta) body.appendChild(el("p", { class: "event__meta" }, [el("strong", { text: meta })]));
        if (f.summary) body.appendChild(el("p", { text: f.summary }));
        var href = safeUrl(f.link);
        if (href) body.appendChild(el("a", { class: "btn btn--navy btn--sm", href: href, text: f.linkText || "Learn more" }));
        card.appendChild(body); wrap.appendChild(card);
      });
      box.appendChild(wrap);
    });
  }

  /* ---------- officers (content/officers.json) ---------- */
  function renderOfficers(data) {
    if (!data) return;
    $$("[data-officers]").forEach(function (box) {
      var group = data[box.getAttribute("data-officers")] || [];
      var ul = el("ul", { class: "officers" });
      group.forEach(function (o) {
        if (!o || !o.title) return;
        ul.appendChild(el("li", null, [
          el("span", { class: "role", text: o.title }),
          o.name ? el("span", { class: "name", text: o.name }) : el("span", { class: "name tbd", text: "To be announced" })
        ]));
      });
      box.innerHTML = ""; box.appendChild(ul);
    });
    $$("[data-officers-note]").forEach(function (n) { if (data.updated) n.textContent = data.updated; });
  }

  /* ---------- The Bugle (content/bugle.json) ---------- */
  function issueLink(issue, cls, label) {
    var href = safeUrl(issue.file);
    if (issue.sample || !href) return el("span", { class: "muted small", text: issue.sample ? "Sample entry" : "Coming soon" });
    return el("a", { class: cls, href: href, target: "_blank", rel: "noopener", text: label });
  }
  function renderBugle(data) {
    if (!data) return;
    var issues = (data.issues || []).filter(function (i) { return i && i.title; })
      .sort(function (a, b) { return String(b.date || "") > String(a.date || "") ? 1 : -1; });
    $$('[data-render="bugle-latest"]').forEach(function (box) {
      var latest = issues[0];
      if (!latest) return;
      $$("[data-bugle-title]", box).forEach(function (n) { n.textContent = latest.title; });
      $$("[data-bugle-note]", box).forEach(function (n) { n.textContent = latest.note || ""; });
      $$("[data-bugle-sample]", box).forEach(function (n) { n.hidden = !latest.sample; });
      $$("[data-bugle-link]", box).forEach(function (n) {
        var href = safeUrl(latest.file);
        if (href && !latest.sample) { n.setAttribute("href", href); n.setAttribute("target", "_blank"); n.setAttribute("rel", "noopener"); }
      });
    });
    $$('[data-render="bugle-list"]').forEach(function (box) {
      var ul = el("ul", { class: "issue-list" });
      issues.forEach(function (i) {
        var title = el("span", { class: "issue__title", text: i.title });
        if (i.sample) title.appendChild(el("span", { class: "sample-flag", text: "Sample" }));
        var left = el("div", null, [title]);
        if (i.note) left.appendChild(el("span", { class: "issue__note", text: i.note }));
        ul.appendChild(el("li", null, [el("div", { class: "issue" }, [left, issueLink(i, "btn btn--outline btn--sm", "Read (PDF)")])]));
      });
      box.innerHTML = ""; box.appendChild(issues.length ? ul : el("p", { class: "muted", text: "Issues will be posted here." }));
    });
  }

  /* ---------- Post Everlasting (content/post-everlasting.json) ---------- */
  function renderEverlasting(data) {
    var box = $('[data-render="everlasting"]');
    if (!box || !data) return;
    var groups = (data.groups || []).filter(function (g) { return g && g.year && (g.names || []).length; });
    var input = $("#pe-search"), countNode = $("[data-pe-count]");
    var total = groups.reduce(function (n, g) { return n + g.names.length; }, 0);
    function draw(q) {
      q = (q || "").trim().toLowerCase();
      box.innerHTML = ""; var shown = 0;
      groups.forEach(function (g) {
        var names = g.names.filter(function (n) {
          if (!q) return true;
          var flipped = n.split(",").reverse().join(" ").toLowerCase();
          return n.toLowerCase().indexOf(q) > -1 || flipped.indexOf(q) > -1;
        });
        if (!names.length) return;
        shown += names.length;
        var ul = el("ul", { class: "pe-names" });
        names.forEach(function (n) { ul.appendChild(el("li", { text: n })); });
        box.appendChild(el("section", { class: "pe-group", "aria-label": "Passed in " + g.year }, [el("h3", { text: String(g.year) }), ul]));
      });
      if (!shown) box.appendChild(el("p", { class: "pe-empty", text: "No names match “" + q + "”. Try a last name only, or contact the Post if someone is missing from this list." }));
      if (countNode) countNode.textContent = q ? shown + " of " + total + " names shown" : total + " comrades remembered";
    }
    draw("");
    if (input) input.addEventListener("input", function () { draw(input.value); });
  }

  /* ---------- Sponsors (content/sponsors.json) ---------- */
  function sponsorTile(s) {
    var logo = safeUrl(s.logo), href = safeUrl(s.url);
    var inner = logo ? el("img", { src: logo, alt: s.name, loading: "lazy", decoding: "async" }) : el("span", { text: s.name });
    return el("li", null, [href ? el("a", { class: "sponsor", href: href, target: "_blank", rel: "noopener", title: s.name }, [inner]) : el("div", { class: "sponsor", title: s.name }, [inner])]);
  }
  function renderSponsors(data) {
    if (!data) return;
    var list = (data.sponsors || []).filter(function (s) { return s && s.name; });
    $$("[data-sponsor-heading]").forEach(function (n) { if (data.heading) n.textContent = data.heading; });
    $$('[data-render="sponsors"]').forEach(function (box) {
      box.innerHTML = "";
      if (box.hasAttribute("data-by-level")) {
        LEVEL_ORDER.forEach(function (lvl) {
          var group = list.filter(function (s) { return (s.level || "Friend") === lvl; });
          if (!group.length) return;
          var ul = el("ul", { class: "sponsors" + (lvl === "Commodore" || lvl === "Patriot" ? " sponsors--lg" : "") });
          group.forEach(function (s) { ul.appendChild(sponsorTile(s)); });
          box.appendChild(el("div", { class: "sponsor-level" }, [el("h3", { text: lvl + (lvl === "Friend" ? "s of the Picnic" : " Sponsors") }), ul]));
        });
      } else {
        var ul = el("ul", { class: "sponsors" });
        list.sort(function (a, b) { return LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level); }).forEach(function (s) { ul.appendChild(sponsorTile(s)); });
        box.appendChild(ul);
      }
    });
  }

  /* ---------- Google Calendar: list view on phones ---------- */
  function initCalendar() {
    $$("iframe[data-calendar]").forEach(function (f) {
      var base = f.getAttribute("data-calendar");
      var mode = window.matchMedia("(max-width: 699px)").matches ? "AGENDA" : "MONTH";
      f.src = base + (base.indexOf("?") > -1 ? "&" : "?") + "mode=" + mode;
    });
  }

  /* ---------- Contact form ---------- */
  function initContactForm(settings) {
    var form = $("[data-contact-form]");
    if (!form) return;
    var status = $(".form-status", form);
    var endpoint = settings && settings.contactFormEndpoint;
    var to = (settings && settings.contactEmail) || form.getAttribute("data-email");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      var fd = new FormData(form);
      if (endpoint) {
        status.hidden = false; status.textContent = "Sending…";
        fetch(endpoint, { method: "POST", body: fd, headers: { Accept: "application/json" } })
          .then(function (r) { if (!r.ok) throw new Error(r.status); form.reset(); status.textContent = "Thank you! Your message was sent. Someone from the Post will get back to you soon."; })
          .catch(function () { status.textContent = "Sorry, your message could not be sent. Please email " + to + " or call (805) 927-5010."; });
        return;
      }
      var body = "Name: " + (fd.get("name") || "") + "\nEmail: " + (fd.get("email") || "") + "\nPhone: " + (fd.get("phone") || "") + "\n\n" + (fd.get("message") || "");
      window.location.href = "mailto:" + to + "?subject=" + encodeURIComponent("Website message: " + (fd.get("topic") || "General question")) + "&body=" + encodeURIComponent(body);
      status.hidden = false;
      status.textContent = "Your email program should open with your message ready to send. If nothing happened, please email " + to + " or call (805) 927-5010.";
    });
  }

  /* ---------- Memorial brick preview ---------- */
  function initBrick() {
    var tool = $("[data-brick]");
    if (!tool) return;
    var inputs = $$("input", tool), lines = $$(".brick__line", tool), outs = $$("output", tool);
    function clean(v) { return v.toUpperCase().replace(/\./g, "").slice(0, 16); }
    function update() {
      inputs.forEach(function (inp, i) {
        var v = clean(inp.value);
        if (v !== inp.value) inp.value = v;
        lines[i].textContent = v || " ";
        outs[i].textContent = v.length + " / 16";
        outs[i].classList.toggle("full", v.length === 16);
      });
    }
    inputs.forEach(function (inp) { inp.addEventListener("input", update); });
    update();
    var printBtn = $("[data-brick-print]", tool);
    if (printBtn) printBtn.addEventListener("click", function () {
      var esc = function (s) { return s.replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
      var rows = inputs.map(function (inp) {
        var v = clean(inp.value), cells = "";
        for (var i = 0; i < 16; i++) cells += "<td>" + esc(v.charAt(i) || "") + "</td>";
        return "<tr>" + cells + "</tr>";
      }).join("");
      var w = window.open("", "_blank");
      if (!w) { window.print(); return; }
      w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Memorial Brick Order — American Legion Post 432</title><style>body{font:14pt/1.5 Georgia,serif;margin:2.5rem;color:#000}h1{font-size:20pt;margin:0}h2{font-size:13pt;margin:1.5rem 0 .5rem}table{border-collapse:collapse;margin:.5rem 0 1rem}td{width:1.6rem;height:1.9rem;border:1px solid #000;text-align:center;font:bold 14pt monospace}.line{border-bottom:1px solid #000;height:1.9rem;margin:.6rem 0}small{font-size:10pt}</style></head><body>' +
        '<h1>American Legion Post 432 — Memorial Brick Order</h1><p>Cambria Veterans Memorial · Minimum donation $125 per brick</p>' +
        '<h2>Engraving (3 lines, 16 characters each)</h2><table>' + rows + '</table>' +
        '<h2>Your information</h2><div>Name</div><div class="line"></div><div>Phone</div><div class="line"></div><div>Address</div><div class="line"></div><div>Email</div><div class="line"></div><div>Amount enclosed</div><div class="line"></div>' +
        '<h2>Mail this form with your check</h2><p>Make checks payable to <b>“American Legion Post 432”</b> and mail to:<br>Paver Project, American Legion Post 432<br>P.O. Box 697, Cambria, CA 93428-0697</p>' +
        '<p><small>Your contribution may be tax deductible; consult your tax advisor. American Legion Post 432 reserves the right to refuse brick applications that do not reflect the spirit of the memorial.</small></p>' +
        '<script>window.onload=function(){window.print()}<\/script></body></html>');
      w.document.close();
    });
  }

  /* ---------- preview notice (only on the <account>.github.io test address) ---------- */
  // Shows a "not live yet" strip and asks search engines not to list the preview.
  // On www.legionpost432.com this does nothing, so there is nothing to remove at launch.
  function initPreview() {
    if (!/\.github\.io$/i.test(location.hostname)) return;
    document.head.appendChild(el("meta", { name: "robots", content: "noindex" }));
    document.body.insertBefore(el("div", { class: "preview-bar", role: "note" }, [
      el("div", { class: "wrap" }, [el("p", {}, [
        el("strong", { text: "Preview:" }),
        " this is the proposed new website for American Legion Post 432. It isn't live yet. Once approved, it will replace legionpost432.com at the same address."
      ])])
    ]), document.body.firstChild);
  }

  /* ---------- start ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    document.documentElement.classList.add("js");
    initPreview();
    initTextSize();
    initNav();
    initCalendar();
    initBrick();
    $$("[data-year]").forEach(function (n) { n.textContent = String(new Date().getFullYear()); });

    getJSON("settings").then(function (s) { renderAnnouncement(s); initContactForm(s); });
    if ($('[data-render="upcoming"], [data-render="week"], [data-render="featured"], [data-next]')) getJSON("events").then(renderEvents);
    if ($("[data-officers]")) getJSON("officers").then(renderOfficers);
    if ($('[data-render^="bugle"]')) getJSON("bugle").then(renderBugle);
    if ($('[data-render="everlasting"]')) getJSON("post-everlasting").then(renderEverlasting);
    if ($('[data-render="sponsors"]')) getJSON("sponsors").then(renderSponsors);
  });
})();
