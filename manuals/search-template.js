document.addEventListener("DOMContentLoaded", function() {
  var input = document.querySelector(".search-box");
  var resultsEl = document.getElementById("search-results");
  var mainContent = document.getElementById("main-content");

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  function highlight(text, terms) {
    if (terms.length === 0) return text;
    var re = new RegExp("(" + terms.map(escapeRe).join("|") + ")", "gi");
    return text.replace(re, "<mark>$1</mark>");
  }

  function snippet(text, terms, maxLen) {
    maxLen = maxLen || 200;
    if (terms.length === 0) return text.slice(0, maxLen);
    var lower = text.toLowerCase();
    var bestIdx = -1;
    for (var i = 0; i < terms.length; i++) {
      var idx = lower.indexOf(terms[i].toLowerCase());
      if (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) bestIdx = idx;
    }
    if (bestIdx === -1) return text.slice(0, maxLen);
    var start = Math.max(0, bestIdx - 60);
    var end = Math.min(text.length, start + maxLen);
    var s = text.slice(start, end);
    if (start > 0) s = "\u2026" + s;
    if (end < text.length) s = s + "\u2026";
    return s;
  }

  function search(query) {
    var terms = query.trim().split(/\s+/).filter(Boolean);
    if (terms.length === 0) {
      resultsEl.innerHTML = "";
      mainContent.style.display = "";
      return;
    }

    mainContent.style.display = "none";

    var results = [];
    for (var i = 0; i < DATA.length; i++) {
      var sec = DATA[i];
      var haystack = (sec.docTitle + " " + sec.heading + " " + sec.text).toLowerCase();
      var allMatch = true;
      for (var j = 0; j < terms.length; j++) {
        if (haystack.indexOf(terms[j].toLowerCase()) === -1) { allMatch = false; break; }
      }
      if (allMatch) results.push(sec);
    }

    if (results.length === 0) {
      resultsEl.innerHTML = '<div class="no-results">\u8a72\u5f53\u3059\u308b\u30bb\u30af\u30b7\u30e7\u30f3\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3067\u3057\u305f</div>';
      return;
    }

    var html = "";
    for (var i = 0; i < results.length; i++) {
      var r = results[i];
      var snip = highlight(snippet(r.text, terms), terms);
      var headingHtml = r.heading !== r.docTitle
        ? '<span class="result-section">' + highlight(r.heading, terms) + '</span>'
        : '';
      html += '<a class="result" href="./' + r.slug + '.html" style="display:block;text-decoration:none;color:inherit;">' +
        '<div class="result-header"><span class="result-doc">' + highlight(r.docTitle, terms) + '</span>' + headingHtml + '</div>' +
        '<div class="result-text">' + snip + '</div></a>';
    }

    resultsEl.innerHTML = '<div class="result-count">' + results.length + ' \u4ef6\u898b\u3064\u304b\u308a\u307e\u3057\u305f</div>' + html;
  }

  input.addEventListener("input", function() { search(input.value); });
});
