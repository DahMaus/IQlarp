/* Wortschatz — Oberfläche und Anwendungslogik */

(function () {
  'use strict';

  var DATEN = window.WSDATA;
  var STORE = window.WSSTORE;
  var WOERTER = DATEN.WOERTER;
  var KATEGORIEN = DATEN.KATEGORIEN;
  var REGISTER = DATEN.REGISTER;
  var REGISTER_INFO = DATEN.REGISTER_INFO;
  var AKTIV = DATEN.AKTIV;

  var HAUPT = document.getElementById('haupt');
  var TOAST = document.getElementById('toast');
  var toastZeit = null;

  var sitzung = null;
  var quiz = null;
  var aktivUebung = null;
  var offeneEintraege = {};
  var installPrompt = null;

  var suche = {
    text: '',
    kategorie: 'alle',
    niveau: 'alle',
    register: 'alle',
    sortierung: 'alphabetisch',
    nurFavoriten: false,
    sichtbar: 60
  };

  var STATUS_TEXT = {
    neu: 'Neu',
    lernen: 'Wiederholen',
    unsicher: 'Unsicher',
    gelernt: 'Gelernt'
  };

  var QUIZ_TYPEN = [
    { id: 'gemischt', name: 'Gemischt' },
    { id: 'bedeutung', name: 'Bedeutung erkennen' },
    { id: 'einsetzen', name: 'Wort einsetzen' },
    { id: 'synonym', name: 'Synonyme' },
    { id: 'erinnerung', name: 'Aktive Erinnerung' },
    { id: 'register', name: 'Sprachregister' }
  ];

  var NIVEAU_TEXT = { 1: 'Leicht', 2: 'Mittel', 3: 'Schwer' };

  /* ---------- Hilfsfunktionen ---------- */

  function esc(wert) {
    return String(wert === undefined || wert === null ? '' : wert).replace(/[&<>"']/g, function (z) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[z];
    });
  }

  function mische(liste) {
    var a = liste.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  function zufall(liste) {
    return liste[Math.floor(Math.random() * liste.length)];
  }

  function norm(wert) {
    var s = String(wert === undefined || wert === null ? '' : wert).toLowerCase();
    if (s.normalize) s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return s.replace(/ß/g, 'ss').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  }

  function alleWoerter() {
    return WOERTER.concat(STORE.eigeneWoerter());
  }

  function wortNachId(id) {
    for (var i = 0; i < WOERTER.length; i++) {
      if (WOERTER[i].id === id) return WOERTER[i];
    }
    var eigene = STORE.eigeneWoerter();
    for (var j = 0; j < eigene.length; j++) {
      if (eigene[j].id === id) return eigene[j];
    }
    return null;
  }

  function zeigeToast(text) {
    TOAST.textContent = text;
    TOAST.classList.add('toast--sichtbar');
    if (toastZeit) clearTimeout(toastZeit);
    toastZeit = setTimeout(function () {
      TOAST.classList.remove('toast--sichtbar');
    }, 2600);
  }

  function gehe(pfad) {
    if (location.hash === '#/' + pfad) {
      rendern({ scroll: true, fokus: true });
    } else {
      location.hash = '#/' + pfad;
    }
  }

  function route() {
    return (location.hash.replace(/^#\/?/, '').split('?')[0] || 'start');
  }

  function heute() {
    return STORE.heute();
  }

  /* ---------- Lernlogik ---------- */

  function gelerntAnzahl() {
    return alleWoerter().filter(function (w) {
      return STORE.fortschritt(w.id).bekannt === true;
    }).length;
  }

  function faelligeWoerter() {
    var tag = heute();
    return alleWoerter().filter(function (w) {
      var p = STORE.fortschritt(w.id);
      return p.status !== 'neu' && p.faellig <= tag;
    });
  }

  function neueWoerter() {
    return alleWoerter().filter(function (w) {
      return STORE.fortschritt(w.id).status === 'neu';
    });
  }

  function baueSitzung(anzahl) {
    var tag = heute();
    var gewichtet = alleWoerter().map(function (w) {
      var p = STORE.fortschritt(w.id);
      var gewicht;
      if (p.status === 'neu') {
        gewicht = 7 + Math.random() * 6;
      } else if (p.faellig <= tag) {
        gewicht = 14 + (p.status === 'unsicher' ? 5 : 0) + (p.status === 'lernen' ? 3 : 0) + (Number(w.niveau) || 2) + Math.random() * 4;
      } else {
        gewicht = 2 + Math.random() * 2;
      }
      return { id: w.id, gewicht: gewicht };
    });
    gewichtet.sort(function (a, b) { return b.gewicht - a.gewicht; });
    return gewichtet.slice(0, Math.min(anzahl, gewichtet.length)).map(function (x) { return x.id; });
  }

  function starteSitzung() {
    var ziel = STORE.einstellungen().ziel || 12;
    var ids = baueSitzung(ziel);
    if (!ids.length) {
      zeigeToast('Es sind keine Wörter vorhanden.');
      return;
    }
    sitzung = {
      queue: ids,
      index: 0,
      aufgedeckt: false,
      ergebnis: { gewusst: 0, unsicher: 0, nochmal: 0 }
    };
    gehe('lernen');
    rendern({ scroll: true, fokus: true });
  }

  function bewerte(wert) {
    if (!sitzung) return;
    var id = sitzung.queue[sitzung.index];
    if (!id) return;
    STORE.antwort(id, wert);
    sitzung.ergebnis[wert] = (sitzung.ergebnis[wert] || 0) + 1;
    sitzung.index += 1;
    sitzung.aufgedeckt = false;
    rendern({ scroll: true, fokus: true });
  }

  function naechsteKarte() {
    if (!sitzung) return;
    sitzung.index += 1;
    sitzung.aufgedeckt = false;
    rendern({ scroll: true, fokus: true });
  }

  /* ---------- Quiz-Erzeugung ---------- */

  function distraktoren(alle, wort, anzahl, feld) {
    var kandidaten = alle.filter(function (w) {
      if (w.id === wort.id) return false;
      if (feld === 'synonym') {
        var verboten = (wort.synonyme || []).map(norm).concat([norm(wort.wort)]);
        return (w.synonyme || []).some(function (s) { return verboten.indexOf(norm(s)) === -1; });
      }
      return norm(w[feld]) !== norm(wort[feld]);
    });
    var gleiche = kandidaten.filter(function (w) { return w.kategorie === wort.kategorie; });
    var pool = mische(gleiche).concat(mische(kandidaten.filter(function (w) { return w.kategorie !== wort.kategorie; })));
    return pool.slice(0, anzahl);
  }

  function bedeutungsKollision(ziel, kandidat) {
    var zielSynonyme = (ziel.synonyme || []).map(norm);
    var kandidatSynonyme = (kandidat.synonyme || []).map(norm);
    if (zielSynonyme.indexOf(norm(kandidat.wort)) > -1) return true;
    if (kandidatSynonyme.indexOf(norm(ziel.wort)) > -1) return true;
    return false;
  }

  function zuAehnlicheBedeutung(a, b) {
    var wa = norm(a).split(' ').filter(function (t) { return t.length > 3; });
    var wb = norm(b).split(' ').filter(function (t) { return t.length > 3; });
    if (!wa.length || !wb.length) return norm(a) === norm(b);
    var gemeinsam = wa.filter(function (t) { return wb.indexOf(t) > -1; }).length;
    return gemeinsam / Math.min(wa.length, wb.length) > 0.34;
  }

  function frageBedeutung(wort, alle) {
    var falsche = distraktoren(alle, wort, 12, 'bedeutung').filter(function (w) {
      return !bedeutungsKollision(wort, w) && !zuAehnlicheBedeutung(wort.bedeutung, w.bedeutung);
    }).slice(0, 3);
    if (falsche.length < 3) return null;
    var optionen = [{ text: wort.bedeutung, richtig: true, info: '' }];
    falsche.forEach(function (w) {
      optionen.push({ text: w.bedeutung, richtig: false, info: '„' + w.wort + '“ bedeutet: ' + w.bedeutung });
    });
    return {
      typ: 'bedeutung',
      frage: 'Was bedeutet „' + wort.wort + '“?',
      optionen: mische(optionen),
      erklaerung: '„' + wort.wort + '“ (' + wort.wortart + ') bedeutet: ' + wort.bedeutung,
      beispiel: wort.beispiele[0],
      wort: wort
    };
  }

  function frageEinsetzen(wort, alle) {
    if (!wort.luecke || wort.luecke.indexOf('____') === -1) return null;
    var verboten = (wort.synonyme || []).map(norm);
    var falsche = distraktoren(alle, wort, 10, 'wort').filter(function (w) {
      return norm(w.wort) !== norm(wort.wort) && verboten.indexOf(norm(w.wort)) === -1;
    }).slice(0, 3);
    if (falsche.length < 3) return null;
    var optionen = [{ text: wort.wort, richtig: true, info: '' }];
    falsche.forEach(function (w) {
      optionen.push({
        text: w.wort,
        richtig: false,
        info: '„' + w.wort + '“ (' + w.wortart + ') bedeutet: ' + w.bedeutung
      });
    });
    return {
      typ: 'einsetzen',
      frage: 'Welches Wort fehlt?',
      satz: wort.luecke,
      optionen: mische(optionen),
      erklaerung: 'Der Satz lautet: „' + wort.beispiele[0] + '“',
      beispiel: wort.beispiele[0],
      wort: wort
    };
  }

  function frageSynonym(wort, alle) {
    if (!wort.synonyme || !wort.synonyme.length) return null;
    var richtig = wort.synonyme[0];
    var verboten = (wort.synonyme || []).map(norm).concat([norm(wort.wort)]);
    var pool = [];
    alle.forEach(function (w) {
      if (w.id === wort.id) return;
      if (w.kategorie === wort.kategorie) return;
      (w.synonyme || []).forEach(function (s) {
        if (verboten.indexOf(norm(s)) === -1 && pool.indexOf(s) === -1) pool.push(s);
      });
    });
    var falsche = mische(pool).slice(0, 3);
    if (falsche.length < 3) return null;
    var optionen = [{ text: richtig, richtig: true, info: '' }];
    falsche.forEach(function (s) {
      optionen.push({ text: s, richtig: false, info: '„' + s + '“ ist nicht bedeutungsgleich mit „' + wort.wort + '“.' });
    });
    return {
      typ: 'synonym',
      frage: 'Welcher Ausdruck steht „' + wort.wort + '“ am nächsten?',
      optionen: mische(optionen),
      erklaerung: '„' + wort.wort + '“ bedeutet: ' + wort.bedeutung + ' Ein passendes Synonym ist „' + richtig + '“.',
      beispiel: wort.beispiele[0],
      wort: wort
    };
  }

  function frageErinnerung(wort, alle) {
    if (!wort.bedeutung) return null;
    return {
      typ: 'erinnerung',
      frage: 'Welches Wort passt zu dieser Bedeutung?',
      definition: wort.bedeutung,
      eingabe: true,
      erklaerung: 'Gesucht war „' + wort.wort + '“ (' + wort.wortart + '). ' + wort.beispiele[0],
      beispiel: wort.beispiele[0],
      wort: wort
    };
  }

  function frageRegister(wort, alle) {
    var optionen = REGISTER.map(function (r) {
      return {
        text: r,
        richtig: r === wort.register,
        info: '„' + r + '“: ' + REGISTER_INFO[r] + '.'
      };
    });
    return {
      typ: 'register',
      frage: 'Wie ist „' + wort.wort + '“ heute einzuordnen?',
      optionen: optionen,
      erklaerung: '„' + wort.wort + '“ gilt als ' + wort.register + ': ' + REGISTER_INFO[wort.register] + '.' + (wort.hinweis ? ' ' + wort.hinweis : ''),
      beispiel: wort.beispiele[0],
      wort: wort
    };
  }

  function erstelleFrage(typ, wort, alle) {
    var frage = null;
    if (typ === 'bedeutung') frage = frageBedeutung(wort, alle);
    else if (typ === 'einsetzen') frage = frageEinsetzen(wort, alle);
    else if (typ === 'synonym') frage = frageSynonym(wort, alle);
    else if (typ === 'erinnerung') frage = frageErinnerung(wort, alle);
    else if (typ === 'register') frage = frageRegister(wort, alle);
    if (!frage) {
      frage = frageBedeutung(wort, alle) || frageRegister(wort, alle);
    }
    return frage;
  }

  function quizWoerter(anzahl) {
    var gewichtet = alleWoerter().map(function (w) {
      var p = STORE.fortschritt(w.id);
      var gewicht = 1 + Math.random() * 3;
      if (p.status !== 'neu') gewicht += 2;
      if (p.status === 'unsicher') gewicht += 2;
      if (STORE.istFavorit(w.id)) gewicht += 1;
      return { w: w, gewicht: gewicht };
    });
    gewichtet.sort(function (a, b) { return b.gewicht - a.gewicht; });
    return gewichtet.slice(0, Math.min(anzahl, gewichtet.length)).map(function (x) { return x.w; });
  }

  function starteQuiz(typ) {
    var modus = typ || (quiz && quiz.typ) || 'gemischt';
    var woerter = quizWoerter(10);
    if (!woerter.length) {
      zeigeToast('Es sind keine Wörter vorhanden.');
      return;
    }
    var typen = modus === 'gemischt'
      ? mische(['bedeutung', 'einsetzen', 'synonym', 'erinnerung', 'register'])
      : [modus];
    var fragen = woerter.map(function (w, i) {
      return erstelleFrage(typen[i % typen.length], w, alleWoerter());
    }).filter(Boolean);
    quiz = {
      typ: modus,
      fragen: fragen,
      index: 0,
      auswahl: null,
      geprueft: false,
      richtig: 0,
      ergebnis: [],
      eingabe: '',
      eingabeRichtig: false,
      synonymHinweis: ''
    };
    rendern({ scroll: true, fokus: true });
  }

  function quizAntwort(index) {
    if (!quiz || quiz.geprueft) return;
    var frage = quiz.fragen[quiz.index];
    if (!frage || !frage.optionen) return;
    quiz.auswahl = index;
    quiz.geprueft = true;
    var richtig = !!frage.optionen[index].richtig;
    quiz.ergebnis[quiz.index] = richtig;
    if (richtig) quiz.richtig += 1;
    STORE.logQuiz(richtig, frage.typ);
    rendern({ scroll: false, fokus: true });
  }

  function quizEingabePruefen(wert) {
    if (!quiz || quiz.geprueft) return;
    var frage = quiz.fragen[quiz.index];
    if (!frage || !frage.eingabe) return;
    var eingabe = norm(wert);
    var ziel = norm(frage.wort.wort);
    var synonyme = (frage.wort.synonyme || []).map(norm);
    var richtig = eingabe === ziel || (eingabe.length > 2 && synonyme.indexOf(eingabe) > -1);
    quiz.eingabe = String(wert).trim();
    quiz.eingabeRichtig = richtig;
    quiz.synonymHinweis = richtig && eingabe !== ziel ? 'Ihre Eingabe ist ein passendes Synonym – gesucht war „' + frage.wort.wort + '“.' : '';
    quiz.geprueft = true;
    quiz.ergebnis[quiz.index] = richtig;
    if (richtig) quiz.richtig += 1;
    STORE.logQuiz(richtig, frage.typ);
    rendern({ scroll: false, fokus: true });
  }

  function quizWeiter() {
    if (!quiz) return;
    quiz.index += 1;
    quiz.auswahl = null;
    quiz.geprueft = false;
    quiz.eingabe = '';
    quiz.eingabeRichtig = false;
    quiz.synonymHinweis = '';
    rendern({ scroll: true, fokus: true });
  }

  /* ---------- Wort des Tages ---------- */

  function tagesWort() {
    var d = new Date();
    var tag = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
    var h = Math.abs((tag * 2654435761) % 4294967296);
    var kandidaten = WOERTER.filter(function (w) {
      return w.niveau >= 2 || w.register !== 'neutral';
    });
    if (!kandidaten.length) kandidaten = WOERTER;
    return kandidaten[h % kandidaten.length];
  }

  var tagAntwortStand = null;

  function tagesWortFrage(wort) {
    var falsche = distraktoren(WOERTER, wort, 10, 'bedeutung').filter(function (w) {
      return !bedeutungsKollision(wort, w) && !zuAehnlicheBedeutung(wort.bedeutung, w.bedeutung);
    }).slice(0, 2);
    var optionen = [{ text: wort.bedeutung, richtig: true, info: '' }];
    falsche.forEach(function (w) {
      optionen.push({ text: w.bedeutung, richtig: false, info: 'Das beschreibt „' + w.wort + '“.' });
    });
    return mische(optionen);
  }

  /* ---------- Wörterbuch ---------- */

  function gefilterteWoerter() {
    var q = norm(suche.text);
    var liste = alleWoerter().filter(function (w) {
      if (suche.nurFavoriten && !STORE.istFavorit(w.id)) return false;
      if (suche.kategorie !== 'alle' && w.kategorie !== suche.kategorie) return false;
      if (suche.niveau !== 'alle' && String(w.niveau) !== suche.niveau) return false;
      if (suche.register !== 'alle' && w.register !== suche.register) return false;
      if (!q) return true;
      var heu = norm(w.wort + ' ' + w.bedeutung + ' ' + (w.synonyme || []).join(' ') + ' ' + w.wortart + ' ' + w.kategorie);
      return heu.indexOf(q) > -1;
    });
    if (suche.sortierung === 'lernstatus') {
      var rang = { unsicher: 0, lernen: 1, neu: 2, gelernt: 3 };
      liste.sort(function (a, b) {
        var pa = STORE.fortschritt(a.id);
        var pb = STORE.fortschritt(b.id);
        var ra = pa.bekannt ? 3 : (rang[pa.status] === undefined ? 2 : rang[pa.status]);
        var rb = pb.bekannt ? 3 : (rang[pb.status] === undefined ? 2 : rang[pb.status]);
        if (ra !== rb) return ra - rb;
        return a.wort.localeCompare(b.wort, 'de');
      });
    } else {
      liste.sort(function (a, b) { return a.wort.localeCompare(b.wort, 'de'); });
    }
    return liste;
  }

  function badgeRegister(wort) {
    return '<span class="badge">' + esc(wort.register) + '</span>';
  }

  function badgeNiveau(wort) {
    return '<span class="badge">' + esc(NIVEAU_TEXT[wort.niveau] || 'Mittel') + '</span>';
  }

  function badgeStatus(wort) {
    var p = STORE.fortschritt(wort.id);
    if (p.bekannt) return '<span class="badge badge--voll">Gelernt</span>';
    if (p.status === 'unsicher') return '<span class="badge badge--leer">Unsicher</span>';
    return '';
  }

  function eigeneBeispiele(wort) {
    var p = STORE.fortschritt(wort.id);
    return Array.isArray(p.beispiele) ? p.beispiele : [];
  }

  function wortEintrag(wort) {
    var p = STORE.fortschritt(wort.id);
    var favorit = STORE.istFavorit(wort.id);
    var eigene = eigeneBeispiele(wort);
    var offen = offeneEintraege[wort.id] ? ' open' : '';
    var html = [];
    html.push('<details class="eintrag" data-id="' + esc(wort.id) + '"' + offen + '>');
    html.push('  <summary>');
    html.push('    <span class="eintrag__wort">' + esc(wort.wort) + '</span>');
    html.push('    <span class="eintrag__zeichen" aria-hidden="true">+</span>');
    html.push('    <span class="eintrag__meta">' + esc(wort.wortart) + ' · ' + esc(wort.register) + ' · ' + esc(wort.kategorie) + '</span>');
    html.push('  </summary>');
    html.push('  <div class="eintrag__inhalt">');
    html.push('    <div class="badges">' + badgeStatus(wort) + badgeRegister(wort) + badgeNiveau(wort) + (wort.eigen ? '<span class="badge">Eigenes Wort</span>' : '') + (favorit ? '<span class="badge badge--voll">Favorit</span>' : '') + '</div>');
    html.push('    <p class="bedeutung">' + esc(wort.bedeutung) + '</p>');
    if (wort.erklaerung) {
      html.push('    <div class="erklaerung"><h3 class="erklaerung__titel">Erklärung</h3><p>' + esc(wort.erklaerung) + '</p></div>');
    }
    (wort.beispiele || []).forEach(function (satz) {
      html.push('    <blockquote class="beispielsatz">' + esc(satz) + '</blockquote>');
    });
    html.push('    <dl class="daten">');
    html.push('      <div><dt>Synonyme</dt><dd>' + esc((wort.synonyme || []).join(', ')) + '</dd></div>');
    html.push('      <div><dt>Kategorie</dt><dd>' + esc(wort.kategorie) + '</dd></div>');
    html.push('      <div><dt>Verwendung</dt><dd>' + esc(wort.situation) + '</dd></div>');
    html.push('      <div><dt>Lernstand</dt><dd>' + esc(p.bekannt ? 'Gelernt' : (STATUS_TEXT[p.status] || 'Neu')) + (p.zuletzt ? ' · zuletzt am ' + esc(datumLesbar(p.zuletzt)) : '') + '</dd></div>');
    if (p.stufe) {
      html.push('      <div><dt>Wiederholung</dt><dd>Stufe ' + esc(p.stufe) + ' von 4 · fällig am ' + esc(datumLesbar(p.faellig)) + '</dd></div>');
    }
    if (wort.hinweis) {
      html.push('      <div><dt>Hinweis</dt><dd>' + esc(wort.hinweis) + '</dd></div>');
    }
    html.push('    </dl>');
    html.push('    <div class="btn-reihe">');
    html.push('      <button class="btn btn--zweit btn--klein" type="button" data-action="favorit" data-id="' + esc(wort.id) + '">' + (favorit ? 'Aus Favoriten entfernen' : 'Zu Favoriten') + '</button>');
    html.push('      <button class="btn btn--zweit btn--klein" type="button" data-action="merk" data-id="' + esc(wort.id) + '" data-wert="' + (p.bekannt ? 'unbekannt' : 'bekannt') + '">' + (p.bekannt ? 'Als unbekannt markieren' : 'Als bekannt markieren') + '</button>');
    html.push('    </div>');
    if (eigene.length) {
      html.push('    <div class="stack stack--eng">');
      html.push('      <h3>Eigene Beispielsätze</h3>');
      eigene.forEach(function (satz, i) {
        html.push('      <div class="zeile"><span class="klein">' + esc(satz) + '</span><button class="btn btn--still btn--klein" type="button" data-action="beispiel-loeschen" data-id="' + esc(wort.id) + '" data-index="' + i + '">Entfernen</button></div>');
      });
      html.push('    </div>');
    }
    html.push('    <form class="formular" data-form="beispiel" data-id="' + esc(wort.id) + '">');
    html.push('      <div class="feld"><label for="bsp-' + esc(wort.id) + '">Eigener Beispielsatz</label><input class="eingabe" id="bsp-' + esc(wort.id) + '" name="beispiel" type="text" maxlength="240" placeholder="Eigener Satz mit „' + esc(wort.wort) + '“" required></div>');
    html.push('      <button class="btn btn--zweit btn--klein" type="submit">Satz speichern</button>');
    html.push('    </form>');
    if (wort.eigen) {
      html.push('    <button class="btn btn--still btn--klein" type="button" data-action="eigenes-loeschen" data-id="' + esc(wort.id) + '">Eigenes Wort löschen</button>');
    }
    html.push('  </div>');
    html.push('</details>');
    return html.join('\n');
  }

  function istInstalliert() {
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    return window.navigator.standalone === true;
  }

  function offlineStatusText() {
    if (istInstalliert()) {
      return 'Als App installiert. Alle Wörter und dein Lernstand bleiben auch ohne Netz verfügbar.';
    }
    if (location.protocol === 'file:') {
      return 'Offline-Speicherung ist nur über HTTPS oder localhost möglich, nicht beim direkten Öffnen der Datei.';
    }
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      return 'Offline verfügbar: Die Seite wurde auf diesem Gerät gespeichert und funktioniert ohne Netz.';
    }
    return 'Beim nächsten Aufruf wird die Seite automatisch für den Offline-Betrieb gespeichert.';
  }

  function datumLesbar(iso) {
    if (!iso || typeof iso !== 'string') return '';
    var teile = iso.split('-');
    if (teile.length !== 3) return iso;
    return teile[2] + '.' + teile[1] + '.' + teile[0];
  }

  /* ---------- Ansichten ---------- */

  function ansichtStart() {
    var tagesSatz = faelligeWoerter().length
      ? faelligeWoerter().length + ' Wiederholungen sind fällig.'
      : (neueWoerter().length ? 'Keine Wiederholung fällig, ' + neueWoerter().length + ' neue Wörter warten.' : 'Alle Wörter sind wiederholt. Bereit für neue?')
    ;
    var alle = alleWoerter();
    var gelernt = gelerntAnzahl();
    var faellig = faelligeWoerter().length;
    var neu = neueWoerter().length;
    var stats = STORE.tagesStats();
    var ziel = STORE.einstellungen().ziel || 12;
    var serie = STORE.serie();
    var quote = stats.quiz ? Math.round((stats.richtig / stats.quiz) * 100) : 0;
    var stunde = new Date().getHours();
    var gruss = stunde < 11 ? 'Guten Morgen.' : (stunde < 18 ? 'Guten Tag.' : 'Guten Abend.');
    var zielProzent = Math.min(100, Math.round((stats.gesehen / ziel) * 100));

    var verlauf = [];
    var gesehenIds = {};
    STORE.verlauf().forEach(function (eintrag) {
      var w = wortNachId(eintrag.id);
      if (!w || gesehenIds[w.id]) return;
      gesehenIds[w.id] = true;
      verlauf.push({ wort: w, aktion: eintrag.aktion });
    });
    verlauf = verlauf.slice(0, 5);

    var h = [];
    h.push('<section class="hero">');
    h.push('  <p class="eyebrow">' + esc(datumLang()) + '</p>');
    h.push('  <h1>' + gruss + '</h1>');
    h.push('  <p class="lead">Heute stehen ' + ziel + ' Wörter auf dem Programm. ' + tagesSatz + '</p>');
    h.push('  <div class="zahlen">');
    h.push('    <div class="zahl"><b>' + gelernt + '</b><span>von ' + alle.length + ' gelernt</span></div>');
    h.push('    <div class="zahl"><b>' + faellig + '</b><span>fällig heute</span></div>');
    h.push('    <div class="zahl"><b>' + serie + '</b><span>Tage in Folge</span></div>');
    h.push('  </div>');
    h.push('  <div class="stack" style="margin-top:20px">');
    h.push('    <div class="zeile klein muted"><span>Gesamtfortschritt</span><span>' + (alle.length ? Math.round((gelernt / alle.length) * 100) : 0) + ' %</span></div>');
    h.push('    <div class="balken" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + (alle.length ? Math.round((gelernt / alle.length) * 100) : 0) + '" aria-label="Anteil gelernter Wörter"><i style="width:' + (alle.length ? (gelernt / alle.length) * 100 : 0) + '%"></i></div>');
    h.push('  </div>');
    h.push('  <div class="cta-reihe">');
    h.push('    <button class="btn" type="button" data-action="sitzung-starten">Jetzt lernen</button>');
    h.push('    <button class="btn btn--zweit" type="button" data-action="zum-tageswort">Wort des Tages</button>');
    h.push('  </div>');
    h.push('</section>');

    h.push('<section class="abschnitt">');
    h.push('  <div class="abschnitt-kopf"><h2>Tagesziel</h2><span class="klein muted">' + Math.min(stats.gesehen, ziel) + ' / ' + ziel + '</span></div>');
    h.push('  <div class="balken" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + zielProzent + '" aria-label="Tagesziel"><i style="width:' + zielProzent + '%"></i></div>');
    h.push('  <p class="klein muted">' + (stats.gesehen >= ziel ? 'Tagesziel erreicht. Weitere Wiederholungen sind freiwillig.' : 'Noch ' + (ziel - stats.gesehen) + ' Wiederholungen bis zum Tagesziel.') + (neu ? ' ' + neu + ' Wörter sind noch ungesehen.' : '') + '</p>');
    h.push('</section>');

    h.push('<section class="abschnitt">');
    h.push('  <div class="abschnitt-kopf"><h2>Zuletzt gesehen</h2><a href="#/woerterbuch">Alle Wörter</a></div>');
    if (verlauf.length) {
      h.push('  <ul class="verlauf-liste">');
      verlauf.forEach(function (e) {
        var p = STORE.fortschritt(e.wort.id);
        h.push('    <li><span class="wort">' + esc(e.wort.wort) + '</span><span class="badge">' + esc(p.bekannt ? 'Gelernt' : (STATUS_TEXT[p.status] || 'Neu')) + '</span></li>');
      });
      h.push('  </ul>');
    } else {
      h.push('  <div class="leer"><p>Noch keine Wörter gesehen. Die erste Sitzung dauert nur wenige Minuten.</p><button class="btn btn--zweit btn--klein" type="button" data-action="sitzung-starten">Erste Sitzung starten</button></div>');
    }
    h.push('</section>');

    h.push('<section class="abschnitt">');
    h.push('  <div class="abschnitt-kopf"><h2>Heute</h2></div>');
    h.push('  <div class="zahlen">');
    h.push('    <div class="zahl"><b>' + stats.gewusst + '</b><span>gewusst</span></div>');
    h.push('    <div class="zahl"><b>' + stats.gesehen + '</b><span>Wiederholungen</span></div>');
    h.push('    <div class="zahl"><b>' + (stats.quiz ? quote + ' %' : '–') + '</b><span>Trefferquote<br>' + stats.quiz + ' Fragen</span></div>');
    h.push('  </div>');
    h.push('  <p class="klein muted">Diese Zahlen werden aus deinem gespeicherten Lernstand berechnet und täglich zurückgesetzt.</p>');
    h.push('</section>');

    h.push('<section class="abschnitt">');
    h.push('  <div class="abschnitt-kopf"><h2>Entdecken</h2></div>');
    h.push('  <div class="entdecken">');
    h.push('    <a href="#/tag"><span>Wort des Tages</span><span>Heute ansehen →</span></a>');
    h.push('    <a href="#/aktiv"><span>Aktiver Wortschatz</span><span>Gewöhnlich → präzise →</span></a>');
    h.push('    <a href="#/woerterbuch"><span>Wörterbuch</span><span>' + alle.length + ' Einträge →</span></a>');
    h.push('  </div>');
    h.push('</section>');

    return h.join('\n');
  }

  function datumLang() {
    var d = new Date();
    var tage = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
    var monate = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
    return tage[d.getDay()] + ', ' + d.getDate() + '. ' + monate[d.getMonth()];
  }

  function ansichtLernen() {
    var h = [];
    if (!sitzung) {
      var faellig = faelligeWoerter().length;
      var neu = neueWoerter().length;
      var ziel = STORE.einstellungen().ziel || 12;
      h.push('<section class="abschnitt"><p class="eyebrow">Lernen</p><h1>Eine Sitzung,<br>' + ziel + ' Wörter.</h1>');
      h.push('  <p class="lead">Du siehst zuerst nur das Wort. Danach entscheidest du, wie sicher du bist, daraus ergibt sich der nächste Termin für die Wiederholung.</p>');
      h.push('  <div class="zahlen" style="margin-top:20px">');
      h.push('    <div class="zahl"><b>' + faellig + '</b><span>fällige Wiederholungen</span></div>');
      h.push('    <div class="zahl"><b>' + neu + '</b><span>neue Wörter</span></div>');
      h.push('    <div class="zahl"><b>' + gelerntAnzahl() + '</b><span>gelernt</span></div>');
      h.push('  </div>');
      h.push('  <div class="cta-reihe"><button class="btn" type="button" data-action="sitzung-starten">Sitzung starten</button><a class="btn btn--zweit" href="#/woerterbuch">Wörter ansehen</a></div>');
      h.push('  <p class="klein muted" style="margin-top:16px">Wiederholungen folgen den Intervallen 1, 3, 7 und 14 Tagen. Schwierige Wörter erscheinen früher erneut.</p>');
      h.push('</section>');
      return h.join('\n');
    }

    if (sitzung.index >= sitzung.queue.length) {
      var e = sitzung.ergebnis;
      h.push('<section class="abschnitt"><p class="eyebrow">Sitzung beendet</p><h1>Fertig.</h1>');
      h.push('  <p class="lead">' + sitzung.queue.length + ' Wörter angesehen. ' + e.gewusst + ' davon hast du sicher gewusst.</p>');
      h.push('  <div class="zahlen" style="margin-top:20px">');
      h.push('    <div class="zahl"><b>' + e.gewusst + '</b><span>gewusst</span></div>');
      h.push('    <div class="zahl"><b>' + e.unsicher + '</b><span>unsicher</span></div>');
      h.push('    <div class="zahl"><b>' + e.nochmal + '</b><span>noch einmal</span></div>');
      h.push('  </div>');
      h.push('  <div class="cta-reihe"><button class="btn" type="button" data-action="sitzung-starten">Neue Sitzung</button><a class="btn btn--zweit" href="#/quiz">Zum Quiz</a></div>');
      h.push('</section>');
      return h.join('\n');
    }

    var wort = wortNachId(sitzung.queue[sitzung.index]);
    if (!wort) {
      sitzung.index += 1;
      return ansichtLernen();
    }
    var p = STORE.fortschritt(wort.id);
    var favorit = STORE.istFavorit(wort.id);
    var prozent = Math.round((sitzung.index / sitzung.queue.length) * 100);

    h.push('<section class="abschnitt">');
    h.push('  <div class="lernkopf"><span>Karte ' + (sitzung.index + 1) + ' von ' + sitzung.queue.length + '</span><div class="balken"><i style="width:' + prozent + '%"></i></div><span>' + esc(STATUS_TEXT[p.status] || 'Neu') + '</span></div>');
    h.push('  <div class="wortkarte">');
    h.push('    <p class="eyebrow">' + esc(wort.wortart) + '</p>');
    h.push('    <h1 class="wortkarte__wort">' + esc(wort.wort) + '</h1>');
    if (sitzung.aufgedeckt) {
      h.push('    <p class="wortkarte__meta">' + esc(wort.register) + ' · ' + esc(wort.kategorie) + ' · ' + esc(NIVEAU_TEXT[wort.niveau] || 'Mittel') + '</p>');
    }
    h.push('  </div>');

    if (!sitzung.aufgedeckt) {
      h.push('  <div class="stack" style="margin-top:20px">');
      h.push('    <button class="btn btn-block" type="button" data-action="aufdecken">Bedeutung aufdecken</button>');
      h.push('    <button class="btn btn--still btn-block" type="button" data-action="naechstes">Überspringen</button>');
      h.push('  </div>');
    } else {
      h.push('  <div class="stack aufdecken" style="margin-top:18px">');
      h.push('    <p class="bedeutung">' + esc(wort.bedeutung) + '</p>');
      if (wort.erklaerung) {
        h.push('    <div class="erklaerung"><h3 class="erklaerung__titel">Erklärung</h3><p>' + esc(wort.erklaerung) + '</p></div>');
      }
      (wort.beispiele || []).forEach(function (satz) {
        h.push('    <blockquote class="beispielsatz">' + esc(satz) + '</blockquote>');
      });
      h.push('    <p class="klein"><strong>Synonyme:</strong> ' + esc((wort.synonyme || []).join(', ')) + '</p>');
      h.push('    <p class="klein muted"><strong>Typisch:</strong> ' + esc(wort.situation) + '</p>');
      if (wort.hinweis) {
        h.push('    <p class="hinweis-box">' + esc(wort.hinweis) + '</p>');
      }
      h.push('  </div>');
      h.push('  <div class="bewertung" style="margin-top:20px">');
      h.push('    <button class="btn btn--zweit" type="button" data-action="bewerten" data-wert="unsicher">Unsicher</button>');
      h.push('    <button class="btn btn--zweit" type="button" data-action="bewerten" data-wert="nochmal">Noch einmal</button>');
      h.push('    <button class="btn" type="button" data-action="bewerten" data-wert="gewusst">Gewusst</button>');
      h.push('  </div>');
      h.push('  <div class="btn-reihe" style="margin-top:10px">');
      h.push('    <button class="btn btn--still btn--klein" type="button" data-action="favorit" data-id="' + esc(wort.id) + '">' + (favorit ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen') + '</button>');
      h.push('    <button class="btn btn--still btn--klein" type="button" data-action="naechstes">Nächstes Wort</button>');
      h.push('  </div>');
      h.push('  <p class="klein muted" style="margin-top:14px">„Gewusst“ verschiebt die nächste Wiederholung um ' + STORE.INTERVALLE[Math.min((p.stufe || 0), 3)] + ' Tag' + (STORE.INTERVALLE[Math.min((p.stufe || 0), 3)] === 1 ? '' : 'e') + '.</p>');
    }
    h.push('</section>');
    return h.join('\n');
  }

  function ansichtQuiz() {
    var h = [];
    if (!quiz) {
      h.push('<section class="abschnitt"><p class="eyebrow">Quiz</p><h1>Prüfe, was hängen<br>geblieben ist.</h1>');
      h.push('  <p class="lead">Zehn Fragen, fünf Typen. Bei jeder falschen Antwort siehst du die Lösung und die Begründung.</p>');
      h.push('  <div class="stack" style="margin-top:22px"><h3>Fragetyp</h3><div class="chips">');
      QUIZ_TYPEN.forEach(function (typ, i) {
        h.push('    <button class="chip" type="button" data-action="quiz-starten" data-typ="' + typ.id + '">' + esc(typ.name) + '</button>');
      });
      h.push('  </div></div>');
      h.push('  <div class="cta-reihe"><button class="btn" type="button" data-action="quiz-starten" data-typ="gemischt">Gemischt starten</button></div>');
      var stand = STORE.quizStand();
      if (stand.gesamt) {
        h.push('  <p class="klein muted" style="margin-top:16px">Bisher ' + stand.richtig + ' von ' + stand.gesamt + ' Fragen richtig beantwortet.</p>');
      }
      h.push('</section>');
      return h.join('\n');
    }

    if (quiz.index >= quiz.fragen.length) {
      var gesamt = quiz.fragen.length;
      var quote = gesamt ? Math.round((quiz.richtig / gesamt) * 100) : 0;
      h.push('<section class="abschnitt"><p class="eyebrow">Ergebnis</p><h1>' + quiz.richtig + ' von ' + gesamt + '.</h1>');
      h.push('  <p class="lead">' + (quote >= 80 ? 'Sehr sicher unterwegs.' : (quote >= 50 ? 'Solide Basis – die falschen Wörter kommen bald wieder.' : 'Noch unsicher. Eine Lernrunde hilft mehr als ein zweites Quiz.')) + '</p>');
      h.push('  <div class="zahlen" style="margin-top:20px">');
      h.push('    <div class="zahl"><b>' + quiz.richtig + '</b><span>richtig</span></div>');
      h.push('    <div class="zahl"><b>' + (gesamt - quiz.richtig) + '</b><span>falsch</span></div>');
      h.push('    <div class="zahl"><b>' + quote + ' %</b><span>Trefferquote</span></div>');
      h.push('  </div>');
      h.push('  <div class="cta-reihe"><button class="btn" type="button" data-action="quiz-starten" data-typ="' + esc(quiz.typ) + '">Neue Runde</button><a class="btn btn--zweit" href="#/lernen">Zum Lernmodus</a></div>');
      h.push('  <div class="btn-reihe" style="margin-top:8px"><button class="btn btn--still btn--klein" type="button" data-action="quiz-typen">Anderen Fragetyp wählen</button></div>');
      h.push('  <p class="klein muted" style="margin-top:16px">Tipp: Wörter, die du im Quiz verwechselt hast, lassen sich im Wörterbuch als Favorit markieren.</p>');
      h.push('</section>');
      return h.join('\n');
    }

    var frage = quiz.fragen[quiz.index];
    var typName = (QUIZ_TYPEN.filter(function (t) { return t.id === frage.typ; })[0] || {}).name || '';
    h.push('<section class="abschnitt">');
    h.push('  <div class="quiz-kopf"><span>Frage ' + (quiz.index + 1) + ' von ' + quiz.fragen.length + '</span><span>' + esc(typName) + '</span></div>');

    if (frage.typ === 'erinnerung') {
      h.push('  <p class="eyebrow" style="margin-top:14px">Aktive Erinnerung</p>');
      h.push('  <p class="bedeutung" style="margin-top:8px">' + esc(frage.definition) + '</p>');
      h.push('  <p class="klein muted">Gesucht ist ein einzelnes Wort oder eine feste Wendung.</p>');
      if (!quiz.geprueft) {
        h.push('  <form class="formular" data-form="quiz-eingabe" style="margin-top:16px">');
        h.push('    <div class="feld"><label for="quiz-eingabe">Ihre Antwort</label><input class="eingabe" id="quiz-eingabe" name="antwort" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" required></div>');
        h.push('    <button class="btn" type="submit">Prüfen</button>');
        h.push('  </form>');
      }
    } else {
      h.push('  <p class="frage" style="margin-top:14px">' + esc(frage.frage) + '</p>');
      if (frage.satz) {
        h.push('  <p class="beispielsatz" style="margin-top:12px">' + esc(frage.satz) + '</p>');
      }
      h.push('  <div class="optionen">');
      frage.optionen.forEach(function (option, i) {
        var klassen = 'option';
        if (quiz.geprueft && option.richtig) klassen += ' option--richtig';
        if (quiz.geprueft && quiz.auswahl === i && !option.richtig) klassen += ' option--falsch';
        h.push('    <button class="' + klassen + '" type="button" data-action="quiz-antwort" data-index="' + i + '"' + (quiz.geprueft ? ' disabled' : '') + '>');
        h.push('      <span class="option__buchstabe" aria-hidden="true">' + String.fromCharCode(65 + i) + '</span>');
        h.push('      <span>' + esc(option.text) + '</span>');
        h.push('    </button>');
      });
      h.push('  </div>');
    }

    if (quiz.geprueft) {
      var richtig;
      var gewaehlt = null;
      if (frage.typ === 'erinnerung') {
        richtig = quiz.eingabeRichtig;
      } else {
        gewaehlt = frage.optionen[quiz.auswahl];
        richtig = !!(gewaehlt && gewaehlt.richtig);
      }
      h.push('  <div class="rueckmeldung' + (richtig ? '' : ' rueckmeldung--falsch') + '" role="status" style="margin-top:16px">');
      h.push('    <p class="rueckmeldung__titel">' + (richtig ? 'Richtig' : 'Nicht ganz') + '</p>');
      if (frage.typ === 'erinnerung') {
        h.push('    <p>Ihre Antwort: <strong>' + esc(quiz.eingabe || '–') + '</strong></p>');
        h.push('    <p>' + esc(frage.erklaerung) + '</p>');
        if (quiz.synonymHinweis) h.push('    <p class="klein">' + esc(quiz.synonymHinweis) + '</p>');
      } else {
        h.push('    <p>Richtige Antwort: <strong>' + esc((frage.optionen.filter(function (o) { return o.richtig; })[0] || {}).text) + '</strong></p>');
        h.push('    <p>' + esc(frage.erklaerung) + '</p>');
        if (!richtig && gewaehlt) {
          h.push('    <p class="klein">' + esc(gewaehlt.info) + '</p>');
        }
      }
      h.push('    <button class="btn btn--klein" type="button" data-action="quiz-weiter">Weiter</button>');
      h.push('  </div>');
    }
    h.push('</section>');
    return h.join('\n');
  }

  function ansichtWoerterbuch() {
    var h = [];
    h.push('<section class="abschnitt"><p class="eyebrow">Wörterbuch</p><h1>Alle Wörter.</h1>');
    h.push('  <p class="lead">Suche nach Wort oder Bedeutung – auch Wortteile genügen. Filter nach Kategorie, Schwierigkeit und Register.</p>');
    h.push('  <div class="stack" style="margin-top:18px">');
    h.push('    <div class="suchfeld"><label class="sr-only" for="wb-suche">Wort oder Bedeutung suchen</label><input class="eingabe" id="wb-suche" type="search" placeholder="Suchen: z. B. „obwohl“ oder „trotz“" value="' + esc(suche.text) + '" autocomplete="off"></div>');
    h.push('    <div class="filter">');
    h.push('      <label class="sr-only" for="wb-kategorie">Kategorie</label><select class="auswahl" id="wb-kategorie"><option value="alle">Alle Kategorien</option>' + KATEGORIEN.map(function (k) { return '<option value="' + esc(k) + '"' + (suche.kategorie === k ? ' selected' : '') + '>' + esc(k) + '</option>'; }).join('') + '</select>');
    h.push('      <label class="sr-only" for="wb-niveau">Schwierigkeit</label><select class="auswahl" id="wb-niveau"><option value="alle">Alle Niveaus</option><option value="1"' + (suche.niveau === '1' ? ' selected' : '') + '>Leicht</option><option value="2"' + (suche.niveau === '2' ? ' selected' : '') + '>Mittel</option><option value="3"' + (suche.niveau === '3' ? ' selected' : '') + '>Schwer</option></select>');
    h.push('      <label class="sr-only" for="wb-register">Sprachregister</label><select class="auswahl" id="wb-register"><option value="alle">Alle Register</option>' + REGISTER.map(function (r) { return '<option value="' + esc(r) + '"' + (suche.register === r ? ' selected' : '') + '>' + esc(r.charAt(0).toUpperCase() + r.slice(1)) + '</option>'; }).join('') + '</select>');
    h.push('      <label class="sr-only" for="wb-sortierung">Sortierung</label><select class="auswahl" id="wb-sortierung"><option value="alphabetisch"' + (suche.sortierung === 'alphabetisch' ? ' selected' : '') + '>Alphabetisch</option><option value="lernstatus"' + (suche.sortierung === 'lernstatus' ? ' selected' : '') + '>Nach Lernstand</option></select>');
    h.push('    </div>');
    h.push('    <div class="zeile"><button class="chip" type="button" data-action="filter-favoriten" aria-pressed="' + (suche.nurFavoriten ? 'true' : 'false') + '">Nur Favoriten</button><button class="btn btn--still btn--klein" type="button" data-action="filter-zuruecksetzen">Filter zurücksetzen</button></div>');
    h.push('  </div>');
    h.push('  <div id="wb-anzahl" class="ergebnis-kopf"></div>');
    h.push('  <div id="wb-liste"></div>');
    h.push('  <div id="wb-leer"></div>');
    h.push('</section>');
    return h.join('\n');
  }

  function ergebnisListe() {
    var liste = gefilterteWoerter();
    if (!liste.length) {
      return '<div class="leer"><p>Keine Wörter gefunden.</p><p class="klein">Prüfe die Schreibweise oder setze die Filter zurück. Auch Teile eines Wortes werden gefunden.</p><button class="btn btn--zweit btn--klein" type="button" data-action="filter-zuruecksetzen">Filter zurücksetzen</button></div>';
    }
    var html = liste.slice(0, suche.sichtbar).map(wortEintrag).join('\n');
    if (liste.length > suche.sichtbar) {
      html += '<div style="margin-top:16px"><button class="btn btn--zweit" type="button" data-action="mehr-laden">Weitere ' + Math.min(60, liste.length - suche.sichtbar) + ' Wörter anzeigen</button></div>';
    }
    return html;
  }

  function woerterbuchAktualisieren() {
    var anzahl = document.getElementById('wb-anzahl');
    var liste = document.getElementById('wb-liste');
    var leer = document.getElementById('wb-leer');
    if (!anzahl || !liste) { rendern({ scroll: false }); return; }
    anzahl.innerHTML = '<span>' + gefilterteWoerter().length + ' von ' + alleWoerter().length + ' Wörtern</span><span>' + (suche.nurFavoriten ? 'Favoriten' : '') + '</span>';
    var inhalt = ergebnisListe();
    if (inhalt.indexOf('<div class="leer">') === 0) {
      liste.innerHTML = '';
      leer.innerHTML = inhalt;
    } else {
      leer.innerHTML = '';
      liste.innerHTML = inhalt;
    }
  }

  function ansichtTag() {
    var wort = tagesWort();
    if (!tagAntwortStand || tagAntwortStand.id !== wort.id) {
      tagAntwortStand = { id: wort.id, optionen: tagesWortFrage(wort), auswahl: null, geprueft: false };
    }
    var favorit = STORE.istFavorit(wort.id);
    var h = [];
    h.push('<section class="abschnitt"><p class="eyebrow">Wort des Tages · ' + esc(datumLang()) + '</p>');
    h.push('  <div class="wortkarte"><p class="eyebrow">' + esc(wort.wortart) + '</p><h1 class="wortkarte__wort">' + esc(wort.wort) + '</h1><p class="wortkarte__meta">' + esc(wort.register) + ' · ' + esc(wort.kategorie) + '</p></div>');
    h.push('  <div class="stack" style="margin-top:18px">');
    h.push('    <p class="bedeutung">' + esc(wort.bedeutung) + '</p>');
    (wort.beispiele || []).forEach(function (satz) {
      h.push('    <blockquote class="beispielsatz">' + esc(satz) + '</blockquote>');
    });
    h.push('    <dl class="daten">');
    h.push('      <div><dt>Synonyme</dt><dd>' + esc((wort.synonyme || []).join(', ')) + '</dd></div>');
    h.push('      <div><dt>Sprachregister</dt><dd>' + esc(wort.register) + '</dd></div>');
    h.push('      <div><dt>Typische Verwendung</dt><dd>' + esc(wort.situation) + '</dd></div>');
    if (wort.hinweis) h.push('      <div><dt>Hinweis</dt><dd>' + esc(wort.hinweis) + '</dd></div>');
    h.push('    </dl>');
    h.push('  </div>');
    h.push('  <div class="btn-reihe" style="margin-top:16px">');
    h.push('    <button class="btn btn--zweit btn--klein" type="button" data-action="favorit" data-id="' + esc(wort.id) + '">' + (favorit ? 'Aus Favoriten entfernen' : 'Zu Favoriten') + '</button>');
    h.push('    <button class="btn btn--zweit btn--klein" type="button" data-action="wort-im-wb" data-id="' + esc(wort.id) + '">Im Wörterbuch ansehen</button>');
    h.push('  </div>');
    h.push('</section>');

    h.push('<section class="abschnitt">');
    h.push('  <div class="abschnitt-kopf"><h2>Kurze Übung</h2></div>');
    h.push('  <p class="frage">Was bedeutet „' + esc(wort.wort) + '“?</p>');
    h.push('  <div class="optionen">');
    tagAntwortStand.optionen.forEach(function (option, i) {
      var klassen = 'option';
      if (tagAntwortStand.geprueft && option.richtig) klassen += ' option--richtig';
      if (tagAntwortStand.geprueft && tagAntwortStand.auswahl === i && !option.richtig) klassen += ' option--falsch';
      h.push('    <button class="' + klassen + '" type="button" data-action="tag-antwort" data-index="' + i + '"' + (tagAntwortStand.geprueft ? ' disabled' : '') + '><span class="option__buchstabe" aria-hidden="true">' + String.fromCharCode(65 + i) + '</span><span>' + esc(option.text) + '</span></button>');
    });
    h.push('  </div>');
    if (tagAntwortStand.geprueft) {
      var gewaehlt = tagAntwortStand.optionen[tagAntwortStand.auswahl];
      var richtig = !!(gewaehlt && gewaehlt.richtig);
      h.push('  <div class="rueckmeldung' + (richtig ? '' : ' rueckmeldung--falsch') + '" role="status" style="margin-top:12px"><p class="rueckmeldung__titel">' + (richtig ? 'Richtig' : 'Nicht ganz') + '</p><p>' + esc(wort.bedeutung) + '</p>' + (!richtig && gewaehlt ? '<p class="klein">' + esc(gewaehlt.info) + '</p>' : '') + '</div>');
    }
    h.push('</section>');
    return h.join('\n');
  }

  function aktivUrteilText(wert) {
    return wert === 'ja' ? 'Austauschbar' : (wert === 'bedingt' ? 'Nur bedingt' : 'Nicht austauschbar');
  }

  function aktivSatzOriginal(item) {
    return item.satz.replace('_____', item.gewoehnlich);
  }

  function ansichtAktiv() {
    var h = [];
    h.push('<section class="abschnitt"><p class="eyebrow">Aktiver Wortschatz</p><h1>Gewöhnlich ist<br>nicht falsch.</h1>');
    h.push('  <p class="lead">Oft gibt es ein präziseres Wort – aber nicht immer. Diese Übung zeigt, wann ein Ersatz wirklich passt und wann er die Bedeutung verschiebt.</p>');

    if (!aktivUebung) {
      h.push('  <div class="cta-reihe" style="margin-top:20px"><button class="btn" type="button" data-action="aktiv-starten">Übung starten</button></div>');
      h.push('  <p class="klein muted" style="margin-top:12px">Acht Paare, jeweils mit vollständigem Satz und Begründung.</p>');
    } else if (aktivUebung.index >= aktivUebung.items.length) {
      h.push('  <div class="karte" style="margin-top:20px"><h2>Fertig.</h2><p class="lead" style="margin-top:8px">' + aktivUebung.richtig + ' von ' + aktivUebung.items.length + ' Einschätzungen stimmten.</p><p class="klein muted">Entscheidend ist nicht, seltene Wörter zu benutzen, sondern das passende.</p><button class="btn btn--zweit btn--klein" type="button" data-action="aktiv-starten" style="margin-top:14px">Noch einmal</button></div>');
    } else {
      var item = aktivUebung.items[aktivUebung.index];
      var original = aktivSatzOriginal(item);
      h.push('  <div class="karte" style="margin-top:20px">');
      h.push('    <div class="zeile"><span class="eyebrow">' + (aktivUebung.index + 1) + ' von ' + aktivUebung.items.length + '</span><span class="badge">' + esc(item.register) + '</span></div>');
      h.push('    <p class="paar__wechsel" style="margin-top:10px"><span>' + esc(item.gewoehnlich) + '</span><span class="paar__pfeil" aria-hidden="true">→</span><span class="paar__neu">' + esc(item.ersatz) + '</span></p>');
      h.push('    <p class="aktiv-satz">' + esc(original) + '</p>');
      h.push('    <p class="klein muted" style="margin-top:10px">Passt „' + esc(item.ersatz) + '“ in diesem Satz?</p>');
      if (!aktivUebung.geprueft) {
        h.push('    <div class="verdict-reihe">');
        h.push('      <button class="btn btn--zweit btn--klein" type="button" data-action="aktiv-antwort" data-wert="ja">Ja, austauschbar</button>');
        h.push('      <button class="btn btn--zweit btn--klein" type="button" data-action="aktiv-antwort" data-wert="bedingt">Nur bedingt</button>');
        h.push('      <button class="btn btn--zweit btn--klein" type="button" data-action="aktiv-antwort" data-wert="nein">Nein</button>');
        h.push('    </div>');
      } else {
        var richtig = aktivUebung.auswahl === item.austauschbar;
        h.push('    <div class="rueckmeldung' + (richtig ? '' : ' rueckmeldung--falsch') + '" role="status" style="margin-top:14px">');
        h.push('      <p class="rueckmeldung__titel">' + (richtig ? 'Richtig eingeschätzt' : 'Anders eingeordnet') + '</p>');
        h.push('      <p>Einordnung: <strong>' + esc(aktivUrteilText(item.austauschbar)) + '</strong></p>');
        h.push('      <p>' + esc(item.erklaerung) + '</p>');
        h.push('      <p class="klein">Mit Ersatz: „' + esc(item.satzMit) + '“</p>');
        h.push('      <button class="btn btn--klein" type="button" data-action="aktiv-weiter">Weiter</button>');
        h.push('    </div>');
      }
      h.push('  </div>');
    }

    h.push('</section>');
    if (!aktivUebung || aktivUebung.index >= aktivUebung.items.length) {
    h.push('<section class="abschnitt">');
    h.push('  <div class="abschnitt-kopf"><h2>Alle Paare</h2><span class="klein muted">' + AKTIV.length + ' Beispiele</span></div>');
    h.push('  <div class="stack">');
    AKTIV.forEach(function (item) {
      h.push('    <article class="paar">');
      h.push('      <div class="paar__wechsel"><span>' + esc(item.gewoehnlich) + '</span><span class="paar__pfeil" aria-hidden="true">→</span><span class="paar__neu">' + esc(item.ersatz) + '</span><span class="badge paar__urteil">' + esc(aktivUrteilText(item.austauschbar)) + '</span></div>');
      h.push('      <p class="aktiv-satz">' + esc(aktivSatzOriginal(item)) + '</p>');
      h.push('      <p class="klein muted" style="margin-top:10px">Mit Ersatz: „' + esc(item.satzMit) + '“</p>');
      h.push('      <p class="klein" style="margin-top:8px">' + esc(item.erklaerung) + '</p>');
      h.push('    </article>');
    });
    h.push('  </div>');
    h.push('</section>');
    }
    return h.join('\n');
  }

  function ansichtSammlung() {
    var alle = alleWoerter();
    var favoriten = STORE.favoriten().map(wortNachId).filter(Boolean);
    var eigene = STORE.eigeneWoerter();
    var beispiele = [];
    alle.forEach(function (w) {
      eigeneBeispiele(w).forEach(function (satz, i) {
        beispiele.push({ wort: w, satz: satz, index: i });
      });
    });
    var h = [];
    h.push('<section class="abschnitt"><p class="eyebrow">Sammlung</p><h1>Deine Wörter.</h1>');
    h.push('  <div class="zahlen" style="margin-top:16px">');
    h.push('    <div class="zahl"><b>' + favoriten.length + '</b><span>Favoriten</span></div>');
    h.push('    <div class="zahl"><b>' + eigene.length + '</b><span>eigene Wörter</span></div>');
    h.push('    <div class="zahl"><b>' + beispiele.length + '</b><span>eigene Sätze</span></div>');
    h.push('  </div>');
    h.push('  <p class="klein muted" style="margin-top:12px">Alle Angaben werden nur auf diesem Gerät im Browser gespeichert.</p>');
    h.push('</section>');

    h.push('<section class="abschnitt">');
    h.push('  <div class="abschnitt-kopf"><h2>Favoriten</h2><span class="klein muted">' + favoriten.length + '</span></div>');
    if (favoriten.length) {
      h.push('  <ul class="liste">');
      favoriten.forEach(function (w) {
        h.push('    <li><div class="liste__kopf"><span class="liste__titel">' + esc(w.wort) + '</span><span class="badge">' + esc(w.register) + '</span></div><p class="liste__text">' + esc(w.bedeutung) + '</p><div class="liste__aktionen"><button class="btn btn--still btn--klein" type="button" data-action="wort-im-wb" data-id="' + esc(w.id) + '">Im Wörterbuch</button><button class="btn btn--still btn--klein" type="button" data-action="favorit" data-id="' + esc(w.id) + '">Entfernen</button></div></li>');
      });
      h.push('  </ul>');
    } else {
      h.push('  <div class="leer"><p>Noch keine Favoriten. Im Lernmodus oder Wörterbuch lassen sich Wörter markieren.</p></div>');
    }
    h.push('</section>');

    h.push('<section class="abschnitt">');
    h.push('  <div class="abschnitt-kopf"><h2>Eigene Wörter</h2><span class="klein muted">' + eigene.length + '</span></div>');
    if (eigene.length) {
      h.push('  <ul class="liste">');
      eigene.forEach(function (w) {
        h.push('    <li><div class="liste__kopf"><span class="liste__titel">' + esc(w.wort) + '</span><span class="badge">' + esc(w.register) + '</span></div><p class="liste__text">' + esc(w.bedeutung) + '</p><div class="liste__aktionen"><button class="btn btn--still btn--klein" type="button" data-action="eigenes-loeschen" data-id="' + esc(w.id) + '">Löschen</button></div></li>');
      });
      h.push('  </ul>');
    }
    h.push('  <form class="formular karte" data-form="eigenes-wort" style="margin-top:14px">');
    h.push('    <h3>Neues Wort anlegen</h3>');
    h.push('    <div class="formular__reihe"><div class="feld"><label for="neu-wort">Wort</label><input class="eingabe" id="neu-wort" name="wort" type="text" maxlength="60" required></div>');
    h.push('    <div class="feld"><label for="neu-wortart">Wortart</label><select class="auswahl" id="neu-wortart" name="wortart"><option>Adjektiv</option><option>Substantiv</option><option>Verb</option><option>Adverb</option><option>Konjunktion</option><option>Präposition</option><option>Pronomen</option><option>feste Wendung</option></select></div></div>');
    h.push('    <div class="feld"><label for="neu-bedeutung">Bedeutung</label><textarea class="eingabe" id="neu-bedeutung" name="bedeutung" rows="2" maxlength="300" required></textarea></div>');
    h.push('    <div class="feld"><label for="neu-beispiel">Beispielsatz</label><input class="eingabe" id="neu-beispiel" name="beispiel" type="text" maxlength="240" required><span class="feld__hinweis">Das Wort sollte im Satz vorkommen – daraus entsteht die Lückenübung.</span></div>');
    h.push('    <div class="feld"><label for="neu-synonyme">Synonyme (durch Komma getrennt)</label><input class="eingabe" id="neu-synonyme" name="synonyme" type="text" maxlength="160" placeholder="z. B. genau, sorgfältig"></div>');
    h.push('    <div class="formular__reihe"><div class="feld"><label for="neu-register">Register</label><select class="auswahl" id="neu-register" name="register"><option value="neutral">neutral</option><option value="gehoben">gehoben</option><option value="selten">selten</option><option value="veraltet">veraltet</option></select></div>');
    h.push('    <div class="feld"><label for="neu-niveau">Schwierigkeit</label><select class="auswahl" id="neu-niveau" name="niveau"><option value="1">Leicht</option><option value="2" selected>Mittel</option><option value="3">Schwer</option></select></div></div>');
    h.push('    <div class="feld"><label for="neu-kategorie">Kategorie</label><select class="auswahl" id="neu-kategorie" name="kategorie">' + KATEGORIEN.map(function (k) { return '<option>' + esc(k) + '</option>'; }).join('') + '</select></div>');
    h.push('    <div class="feld"><label for="neu-situation">Typische Verwendung</label><input class="eingabe" id="neu-situation" name="situation" type="text" maxlength="200" placeholder="z. B. in einer Bewerbung" required></div>');
    h.push('    <button class="btn" type="submit">Wort speichern</button>');
    h.push('  </form>');
    h.push('</section>');

    h.push('<section class="abschnitt">');
    h.push('  <div class="abschnitt-kopf"><h2>Eigene Beispielsätze</h2><span class="klein muted">' + beispiele.length + '</span></div>');
    if (beispiele.length) {
      h.push('  <ul class="liste">');
      beispiele.forEach(function (b) {
        h.push('    <li><div class="liste__kopf"><span class="liste__titel">' + esc(b.wort.wort) + '</span><button class="btn btn--still btn--klein" type="button" data-action="beispiel-loeschen" data-id="' + esc(b.wort.id) + '" data-index="' + b.index + '">Entfernen</button></div><p class="liste__text">' + esc(b.satz) + '</p></li>');
      });
      h.push('  </ul>');
    } else {
      h.push('  <div class="leer"><p>Noch keine eigenen Sätze. Sie lassen sich in jedem Wörterbucheintrag ergänzen.</p><a class="btn btn--zweit btn--klein" href="#/woerterbuch">Zum Wörterbuch</a></div>');
    }
    h.push('</section>');

    h.push('<section class="abschnitt">');
    h.push('  <div class="abschnitt-kopf"><h2>Einstellungen</h2></div>');
    h.push('  <div class="karte stack">');
    h.push('    <div class="feld"><label for="einstellung-ziel">Wörter pro Sitzung</label><select class="auswahl" id="einstellung-ziel"><option value="6"' + (STORE.einstellungen().ziel === 6 ? ' selected' : '') + '>6 Wörter</option><option value="12"' + (STORE.einstellungen().ziel === 12 ? ' selected' : '') + '>12 Wörter</option><option value="18"' + (STORE.einstellungen().ziel === 18 ? ' selected' : '') + '>18 Wörter</option><option value="24"' + (STORE.einstellungen().ziel === 24 ? ' selected' : '') + '>24 Wörter</option></select></div>');
    h.push('    <p class="klein muted">Favoriten und eigene Wörter bleiben beim Zurücksetzen erhalten.</p>');
    h.push('    <button class="btn btn--zweit btn--klein" type="button" data-action="reset">Lernfortschritt zurücksetzen</button>');
    h.push('  </div>');
    h.push('</section>');

    h.push('<section class="abschnitt">');
    h.push('  <div class="abschnitt-kopf"><h2>Offline & Installation</h2></div>');
    h.push('  <div class="karte stack">');
    h.push('    <p class="klein">' + esc(offlineStatusText()) + '</p>');
    if (installPrompt) {
      h.push('    <button class="btn btn--zweit btn--klein" type="button" data-action="installieren">App installieren</button>');
    }
    h.push('    <p class="klein muted">Chrome und Edge bieten nach dem ersten Besuch ein Installationssymbol in der Adressleiste an. Voraussetzung ist HTTPS oder localhost, etwa über GitHub Pages.</p>');
    h.push('  </div>');
    h.push('</section>');
    return h.join('\n');
  }

  function fussnote() {
    return '<p class="fussnote">made by DahMaus <3</p>';
  }

  /* ---------- Rendern ---------- */

  function rendern(optionen) {
    var opts = optionen || {};
    var pfad = route();
    var inhalt;
    if (pfad === 'lernen') inhalt = ansichtLernen();
    else if (pfad === 'quiz') inhalt = ansichtQuiz();
    else if (pfad === 'woerterbuch') inhalt = ansichtWoerterbuch();
    else if (pfad === 'tag') inhalt = ansichtTag();
    else if (pfad === 'aktiv') inhalt = ansichtAktiv();
    else if (pfad === 'sammlung') inhalt = ansichtSammlung();
    else inhalt = ansichtStart();

    HAUPT.innerHTML = inhalt + fussnote();

    if (pfad === 'woerterbuch') {
      woerterbuchAktualisieren();
    }

    var navLinks = document.querySelectorAll('.tabbar a');
    for (var i = 0; i < navLinks.length; i++) {
      if (navLinks[i].getAttribute('data-route') === pfad) {
        navLinks[i].setAttribute('aria-current', 'page');
      } else {
        navLinks[i].removeAttribute('aria-current');
      }
    }

    if (opts.scroll) window.scrollTo(0, 0);
    if (opts.fokus) {
      try { HAUPT.focus({ preventScroll: true }); } catch (e) { HAUPT.focus(); }
    }
  }

  function themaAktualisieren() {
    var gespeichert = STORE.einstellungen().theme;
    if (gespeichert) document.documentElement.setAttribute('data-theme', gespeichert);
    else document.documentElement.removeAttribute('data-theme');
    var knopf = document.querySelector('.themenschalter');
    if (!knopf) return;
    var dunkelAktiv = document.documentElement.getAttribute('data-theme') === 'dunkel' ||
      (!gespeichert && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    knopf.setAttribute('aria-pressed', dunkelAktiv ? 'true' : 'false');
    knopf.querySelector('.themenschalter__text').textContent = dunkelAktiv ? 'Hell' : 'Dunkel';
    var farbe = document.querySelector('meta[name="theme-color"]');
    if (farbe) farbe.setAttribute('content', dunkelAktiv ? '#101010' : '#fbfbf9');
  }

  function themaWechseln() {
    var aktuellDunkel = document.documentElement.getAttribute('data-theme') === 'dunkel';
    if (!document.documentElement.getAttribute('data-theme') && window.matchMedia) {
      aktuellDunkel = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    STORE.setzeEinstellung('theme', aktuellDunkel ? 'hell' : 'dunkel');
    themaAktualisieren();
  }

  /* ---------- Ereignisse ---------- */

  document.addEventListener('click', function (e) {
    var knopf = e.target.closest('[data-action]');
    if (!knopf) return;
    var aktion = knopf.getAttribute('data-action');
    var id = knopf.getAttribute('data-id');

    if (aktion === 'theme') {
      themaWechseln();
      return;
    }

    switch (aktion) {
      case 'sitzung-starten':
        starteSitzung();
        break;
      case 'aufdecken':
        sitzung.aufgedeckt = true;
        rendern({ scroll: false, fokus: true });
        break;
      case 'bewerten':
        bewerte(knopf.getAttribute('data-wert'));
        break;
      case 'naechstes':
        naechsteKarte();
        break;
      case 'favorit': {
        var jetzt = STORE.toggleFavorit(id);
        zeigeToast(jetzt ? 'Zu Favoriten hinzugefügt' : 'Aus Favoriten entfernt');
        if (route() === 'woerterbuch') { woerterbuchAktualisieren(); }
        else { rendern({ scroll: false }); }
        break;
      }
      case 'merk': {
        var wert = knopf.getAttribute('data-wert') === 'bekannt';
        STORE.setzeBekannt(id, wert);
        zeigeToast(wert ? 'Als bekannt markiert' : 'Als unbekannt markiert');
        if (route() === 'woerterbuch') { woerterbuchAktualisieren(); }
        else { rendern({ scroll: false }); }
        break;
      }
      case 'quiz-starten':
        starteQuiz(knopf.getAttribute('data-typ'));
        break;
      case 'quiz-antwort':
        quizAntwort(Number(knopf.getAttribute('data-index')));
        break;
      case 'quiz-weiter':
        quizWeiter();
        break;
      case 'quiz-typen':
        quiz = null;
        rendern({ scroll: true, fokus: true });
        break;
      case 'tag-antwort':
        if (tagAntwortStand && !tagAntwortStand.geprueft) {
          tagAntwortStand.auswahl = Number(knopf.getAttribute('data-index'));
          tagAntwortStand.geprueft = true;
          rendern({ scroll: false });
        }
        break;
      case 'aktiv-starten':
        aktivUebung = {
          items: mische(AKTIV).slice(0, 8),
          index: 0,
          auswahl: null,
          geprueft: false,
          richtig: 0
        };
        rendern({ scroll: true, fokus: true });
        break;
      case 'aktiv-antwort':
        if (aktivUebung && !aktivUebung.geprueft) {
          aktivUebung.auswahl = knopf.getAttribute('data-wert');
          aktivUebung.geprueft = true;
          var item = aktivUebung.items[aktivUebung.index];
          var korrekt = aktivUebung.auswahl === item.austauschbar;
          if (korrekt) aktivUebung.richtig += 1;
          STORE.logAktiv(korrekt);
          rendern({ scroll: false });
        }
        break;
      case 'aktiv-weiter':
        if (aktivUebung) {
          aktivUebung.index += 1;
          aktivUebung.geprueft = false;
          aktivUebung.auswahl = null;
          rendern({ scroll: true, fokus: true });
        }
        break;
      case 'mehr-laden':
        suche.sichtbar += 60;
        woerterbuchAktualisieren();
        break;
      case 'wort-im-wb':
        suche.text = (wortNachId(id) || {}).wort || '';
        suche.sichtbar = 60;
        suche.nurFavoriten = false;
        suche.kategorie = 'alle';
        suche.niveau = 'alle';
        suche.register = 'alle';
        offeneEintraege[id] = true;
        gehe('woerterbuch');
        break;
      case 'filter-favoriten':
        suche.nurFavoriten = !suche.nurFavoriten;
        suche.sichtbar = 60;
        woerterbuchAktualisieren();
        knopf.setAttribute('aria-pressed', suche.nurFavoriten ? 'true' : 'false');
        break;
      case 'filter-zuruecksetzen':
        suche = { text: '', kategorie: 'alle', niveau: 'alle', register: 'alle', sortierung: 'alphabetisch', nurFavoriten: false, sichtbar: 60 };
        rendern({ scroll: false });
        break;
      case 'eigenes-loeschen':
        if (window.confirm('Dieses eigene Wort endgültig löschen?')) {
          STORE.eigenesWortLoeschen(id);
          delete offeneEintraege[id];
          zeigeToast('Wort gelöscht');
          rendern({ scroll: false });
        }
        break;
      case 'beispiel-loeschen':
        STORE.loescheEigenesBeispiel(id, Number(knopf.getAttribute('data-index')));
        zeigeToast('Beispielsatz entfernt');
        rendern({ scroll: false });
        break;
      case 'installieren':
        if (installPrompt) {
          var prompt = installPrompt;
          installPrompt = null;
          if (prompt.prompt) prompt.prompt();
          if (prompt.userChoice && prompt.userChoice.then) {
            prompt.userChoice.then(function (wahl) {
              zeigeToast(wahl && wahl.outcome === 'accepted' ? 'App wird installiert' : 'Installation abgebrochen');
              if (route() === 'sammlung') rendern({ scroll: false });
            });
          }
        } else {
          zeigeToast('Nutzung über das Installationssymbol in der Adressleiste');
        }
        break;
      case 'reset':
        if (window.confirm('Lernfortschritt, Tagesstatistik und Quiz-Ergebnisse zurücksetzen? Favoriten und eigene Wörter bleiben erhalten.')) {
          STORE.resetFortschritt();
          sitzung = null;
          quiz = null;
          zeigeToast('Lernfortschritt zurückgesetzt');
          rendern({ scroll: false });
        }
        break;
      case 'zum-tageswort':
        gehe('tag');
        break;
      default:
        break;
    }
  });

  document.addEventListener('submit', function (e) {
    var formular = e.target.closest('form[data-form]');
    if (!formular) return;
    e.preventDefault();
    var art = formular.getAttribute('data-form');

    if (art === 'quiz-eingabe') {
      var eingabe = formular.querySelector('[name="antwort"]');
      quizEingabePruefen(eingabe ? eingabe.value : '');
      return;
    }

    if (art === 'beispiel') {
      var id = formular.getAttribute('data-id');
      var feld = formular.querySelector('[name="beispiel"]');
      var text = feld ? feld.value.trim() : '';
      if (text.length < 3) { zeigeToast('Bitte einen vollständigen Satz eingeben'); return; }
      STORE.setzeEigenesBeispiel(id, text);
      zeigeToast('Beispielsatz gespeichert');
      if (route() === 'woerterbuch') { woerterbuchAktualisieren(); }
      else { rendern({ scroll: false }); }
      return;
    }

    if (art === 'eigenes-wort') {
      var f = formular;
      var wort = (f.querySelector('[name="wort"]').value || '').trim();
      var bedeutung = (f.querySelector('[name="bedeutung"]').value || '').trim();
      var beispiel = (f.querySelector('[name="beispiel"]').value || '').trim();
      var situation = (f.querySelector('[name="situation"]').value || '').trim();
      if (!wort || !bedeutung || !beispiel || !situation) {
        zeigeToast('Bitte alle Pflichtfelder ausfüllen');
        return;
      }
      var synonyme = (f.querySelector('[name="synonyme"]').value || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      var luecke = '';
      try {
        var muster = new RegExp(wort.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        if (muster.test(beispiel)) luecke = beispiel.replace(muster, '_____');
      } catch (err) { luecke = ''; }
      STORE.eigenesWortHinzufuegen({
        wort: wort,
        wortart: f.querySelector('[name="wortart"]').value,
        bedeutung: bedeutung,
        beispiele: [beispiel],
        luecke: luecke,
        synonyme: synonyme,
        register: f.querySelector('[name="register"]').value,
        niveau: Number(f.querySelector('[name="niveau"]').value) || 2,
        kategorie: f.querySelector('[name="kategorie"]').value,
        situation: situation,
        hinweis: 'Eigenes Wort — Angaben selbst ergänzt.'
      });
      zeigeToast('Eigenes Wort gespeichert');
      rendern({ scroll: false });
      return;
    }
  });

  HAUPT.addEventListener('input', function (e) {
    if (e.target.id === 'wb-suche') {
      suche.text = e.target.value;
      suche.sichtbar = 60;
      woerterbuchAktualisieren();
    }
  });

  HAUPT.addEventListener('change', function (e) {
    var id = e.target.id;
    if (id === 'wb-kategorie') { suche.kategorie = e.target.value; suche.sichtbar = 60; woerterbuchAktualisieren(); }
    else if (id === 'wb-niveau') { suche.niveau = e.target.value; suche.sichtbar = 60; woerterbuchAktualisieren(); }
    else if (id === 'wb-register') { suche.register = e.target.value; suche.sichtbar = 60; woerterbuchAktualisieren(); }
    else if (id === 'wb-sortierung') { suche.sortierung = e.target.value; woerterbuchAktualisieren(); }
    else if (id === 'einstellung-ziel') {
      STORE.setzeEinstellung('ziel', Number(e.target.value));
      zeigeToast('Sitzungsgröße gespeichert');
    }
  });

  HAUPT.addEventListener('toggle', function (e) {
    var details = e.target;
    if (!details || details.tagName !== 'DETAILS') return;
    var id = details.getAttribute('data-id');
    if (!id) return;
    if (details.open) offeneEintraege[id] = true;
    else delete offeneEintraege[id];
  }, true);

  window.addEventListener('hashchange', function () {
    rendern({ scroll: true, fokus: true });
  });

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    installPrompt = e;
    if (route() === 'sammlung') rendern({ scroll: false });
  });

  window.addEventListener('appinstalled', function () {
    installPrompt = null;
    zeigeToast('App installiert');
    if (route() === 'sammlung') rendern({ scroll: false });
  });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* offline nicht kritisch */ });
    });
  }

  /* ---------- Start ---------- */

  themaAktualisieren();
  rendern({ scroll: false, fokus: false });
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var reaktion = function () { themaAktualisieren(); };
    if (mq.addEventListener) mq.addEventListener('change', reaktion);
  }
})();
