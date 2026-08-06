/* ============================================================
   THE RED REBELLION — Playback engine
   Drives scenes, character animation, synthesised voices,
   captions and the score from the episode script.
   ============================================================ */
(function (global) {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var synth = global.speechSynthesis || null;

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ---------------- voice casting ---------------- */
  var VoiceBank = {
    voices: [], ready: false,
    assigned: {},
    load: function () {
      if (!synth) return;
      this.voices = (synth.getVoices() || []).filter(function (v) {
        return /^en/i.test(v.lang);
      });
      if (!this.voices.length) this.voices = synth.getVoices() || [];
      this.ready = this.voices.length > 0;
      this.assign();
    },
    assign: function () {
      var ids = Object.keys(RRCast.CHARACTERS);
      var pool = this.voices.slice();
      // prefer distinct voices; wrap around when the OS is short on them
      var self = this;
      ids.forEach(function (id, i) {
        self.assigned[id] = pool.length ? pool[i % pool.length] : null;
      });
    },
    forChar: function (id) { return this.assigned[id] || null; }
  };
  if (synth) {
    VoiceBank.load();
    synth.onvoiceschanged = function () { VoiceBank.load(); };
  }

  /* ---------------- the player ---------------- */
  function Player(root, episode) {
    this.root = root;
    this.ep = episode;
    this.stage = $('.rr-stage', root);
    this.overlay = $('.rr-overlay', root);
    this.captionEl = $('.rr-caption', root);
    this.captionWho = $('.rr-caption-who', root);
    this.captionTxt = $('.rr-caption-txt', root);
    this.progress = $('.rr-progress', root);
    this.progressFill = $('.rr-progress-fill', root);
    this.timeEl = $('.rr-time', root);
    this.sceneLabel = $('.rr-scenelabel', root);

    this.captionsOn = this.pref('captions', true);
    this.voicesOn = this.pref('voices', true);
    this.musicOn = this.pref('music', true);
    this.volume = parseFloat(this.pref('volume', 0.75));

    this.beats = [];
    this.index = -1;
    this.playing = false;
    this.timer = null;
    this.safety = null;
    this.currentScene = -1;
    this.currentCue = null;
    this.actorState = {};

    this.flatten();
    this.buildStage();
  }

  Player.prototype.pref = function (key, dflt) {
    try {
      var v = localStorage.getItem('rr.' + key);
      if (v === null) return dflt;
      return v === 'true' ? true : (v === 'false' ? false : v);
    } catch (e) { return dflt; }
  };
  Player.prototype.setPref = function (key, val) {
    try { localStorage.setItem('rr.' + key, String(val)); } catch (e) {}
  };

  /* Flatten scenes -> a single list of beats, remembering their scene. */
  Player.prototype.flatten = function () {
    var self = this;
    this.ep.scenes.forEach(function (sc, si) {
      sc.beats.forEach(function (b, bi) {
        var beat = Object.create(b);
        beat.sceneIndex = si;
        beat.beatIndex = bi;
        beat.scene = sc;
        self.beats.push(beat);
      });
    });
    this.total = this.beats.length;
  };

  Player.prototype.estimate = function (text) {
    if (!text) return 1600;
    var words = text.trim().split(/\s+/).length;
    return Math.max(1500, Math.min(9000, words * 360 + 950));
  };

  /* ---------------- stage ---------------- */
  Player.prototype.buildStage = function () {
    this.stage.innerHTML =
      '<svg class="rr-svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
        '<defs>' +
          '<filter id="rr-pencil" x="-8%" y="-8%" width="116%" height="116%">' +
            '<feTurbulence type="fractalNoise" baseFrequency="0.024" numOctaves="3" seed="9" result="n"/>' +
            '<feDisplacementMap in="SourceGraphic" in2="n" scale="2.4" xChannelSelector="R" yChannelSelector="G"/>' +
          '</filter>' +
        '</defs>' +
        '<g class="rr-cam">' +
          '<g class="rr-set" filter="url(#rr-pencil)"></g>' +
          '<g class="rr-actors" filter="url(#rr-pencil)"></g>' +
          '<g class="rr-bubbles"></g>' +
        '</g>' +
      '</svg>';
    this.cam = $('.rr-cam', this.stage);
    this.setLayer = $('.rr-set', this.stage);
    this.actorLayer = $('.rr-actors', this.stage);
    this.bubbleLayer = $('.rr-bubbles', this.stage);
  };

  Player.prototype.renderScene = function (si) {
    var sc = this.ep.scenes[si];
    this.currentScene = si;
    this.actorState = {};

    this.setLayer.innerHTML = RRCast.set(sc.set);
    this.root.classList.toggle('is-dark-scene', !!sc.dark);

    var self = this;
    var html = '';
    (sc.actors || []).forEach(function (a) {
      self.actorState[a.id] = { pose: a.pose || 'idle', def: a };
      html += RRCast.figure(a.id, {
        x: a.x, y: a.y, scale: a.scale, pose: a.pose || 'idle', flip: a.flip
      });
    });
    this.actorLayer.innerHTML = html;
    this.bubbleLayer.innerHTML = '';

    this.cam.setAttribute('class', 'rr-cam cam-' + (sc.camera || 'static'));
    // restart the camera animation
    void this.cam.getBoundingClientRect();

    if (this.sceneLabel) {
      this.sceneLabel.textContent = 'Page ' + sc.page;
    }
    RRAudio.sfx('whoosh');
  };

  Player.prototype.setPose = function (id, pose) {
    var st = this.actorState[id];
    if (!st) return;
    if (st.pose === pose) return;
    st.pose = pose;
    var node = this.actorLayer.querySelector('[data-fig="' + id + '"]');
    if (!node) return;
    var a = st.def;
    var wrap = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    wrap.innerHTML = RRCast.figure(id, { x: a.x, y: a.y, scale: a.scale, pose: pose, flip: a.flip });
    var fresh = wrap.firstChild;
    if (fresh) node.parentNode.replaceChild(fresh, node);
  };

  Player.prototype.markTalking = function (id) {
    var nodes = this.actorLayer.querySelectorAll('.rr-fig');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].classList.toggle('is-talking', nodes[i].getAttribute('data-fig') === id);
    }
  };

  /* ---------------- overlays ---------------- */
  Player.prototype.clearOverlay = function () {
    this.overlay.innerHTML = '';
    this.overlay.className = 'rr-overlay';
  };

  Player.prototype.showTitle = function (beat) {
    this.overlay.className = 'rr-overlay is-title';
    this.overlay.innerHTML =
      '<div class="rr-titlecard">' +
        '<div class="rr-titlecard-main">' + esc(beat.text) + '</div>' +
        '<div class="rr-titlecard-sub">' + esc(beat.sub || '') + '</div>' +
        '<div class="rr-titlecard-rule"></div>' +
      '</div>';
  };

  Player.prototype.showCard = function (beat) {
    this.overlay.className = 'rr-overlay is-card' + (beat.big ? ' is-big' : '');
    this.overlay.innerHTML =
      '<div class="rr-card">' +
        '<div class="rr-card-main">' + esc(beat.text) + '</div>' +
        (beat.sub ? '<div class="rr-card-sub">' + esc(beat.sub) + '</div>' : '') +
      '</div>';
  };

  Player.prototype.showSfxCard = function (beat) {
    this.overlay.className = 'rr-overlay is-sfx' + (beat.small ? ' is-small' : '');
    this.overlay.innerHTML = '<div class="rr-sfxtext">' + esc(beat.text) + '</div>';
  };

  Player.prototype.showShoutCard = function (text) {
    this.overlay.className = 'rr-overlay is-shoutcard';
    this.overlay.innerHTML = '<div class="rr-shouttext">' + esc(text) + '</div>';
  };

  Player.prototype.showCredits = function () {
    var rows = Object.keys(RRCast.CHARACTERS).filter(function (id) { return id !== 'narrator'; })
      .map(function (id) {
        var ch = RRCast.CHARACTERS[id];
        var v = VoiceBank.forChar(id);
        return '<li><span class="c">' + esc(ch.name) + '</span><span class="v">' +
          esc(v ? v.name : 'silent') + '</span></li>';
      }).join('');
    this.overlay.className = 'rr-overlay is-credits';
    this.overlay.innerHTML =
      '<div class="rr-credits">' +
        '<h2>The Red Rebellion</h2>' +
        '<p class="rr-credits-ep">Season 1 · Episode 1 — "Storyline"</p>' +
        '<h3>Voices</h3><ul>' + rows + '</ul>' +
        '<h3>Adapted from</h3>' +
        '<p>"The Red Rebellion: Enter the Skyline I" — the original comic pages, panel for panel.</p>' +
        '<h3>Score &amp; Foley</h3>' +
        '<p>Synthesised live in your browser. No recordings were used.</p>' +
      '</div>';
  };

  /* ---------------- captions ---------------- */
  Player.prototype.caption = function (who, text, shout) {
    if (!this.captionsOn || !text) {
      this.captionEl.classList.remove('is-on');
      return;
    }
    var ch = RRCast.CHARACTERS[who];
    this.captionWho.textContent = ch ? ch.name : '';
    this.captionWho.style.color = ch ? ch.color : '#fff';
    this.captionWho.style.display = ch ? '' : 'none';
    this.captionTxt.textContent = text;
    this.captionEl.classList.toggle('is-shout', !!shout);
    this.captionEl.classList.add('is-on');
  };

  /* ---------------- speech ---------------- */
  Player.prototype.speak = function (who, text, shout, done) {
    var self = this;
    var fallbackMs = this.estimate(text);

    if (!this.voicesOn || !synth || !VoiceBank.ready) {
      this.timer = setTimeout(done, fallbackMs);
      return;
    }

    try { synth.cancel(); } catch (e) {}

    var ch = RRCast.CHARACTERS[who] || {};
    var vo = ch.voice || { pitch: 1, rate: 1 };
    var u = new SpeechSynthesisUtterance(text);
    var v = VoiceBank.forChar(who);
    if (v) u.voice = v;
    u.pitch = Math.max(0.1, Math.min(2, vo.pitch + (shout ? 0.12 : 0)));
    u.rate = Math.max(0.5, Math.min(2, vo.rate * (shout ? 1.06 : 1)));
    u.volume = 1;

    var finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      clearTimeout(self.safety);
      self.timer = setTimeout(done, 380);
    }
    u.onend = finish;
    u.onerror = finish;

    RRAudio.duck(true);
    synth.speak(u);

    // Chrome sometimes drops onend; never let the show stall.
    this.safety = setTimeout(finish, fallbackMs * 2.2 + 3500);
  };

  /* ---------------- transport ---------------- */
  Player.prototype.clearTimers = function () {
    clearTimeout(this.timer); this.timer = null;
    clearTimeout(this.safety); this.safety = null;
  };

  Player.prototype.runBeat = function (i) {
    var self = this;
    this.clearTimers();
    if (i >= this.total) { this.finish(); return; }

    this.index = i;
    var beat = this.beats[i];
    this.updateProgress();
    this.save();

    if (beat.sceneIndex !== this.currentScene) {
      this.renderScene(beat.sceneIndex);
    }

    var cue = beat.cue || beat.scene.cue;
    if (cue && cue !== this.currentCue) {
      this.currentCue = cue;
      RRAudio.cue(cue);
    }

    this.clearOverlay();
    if (beat.sfx) RRAudio.sfx(beat.sfx);

    var advance = function () { if (self.playing) self.runBeat(i + 1); };

    switch (beat.t) {

      case 'title':
        this.caption(null, null);
        this.showTitle(beat);
        RRAudio.duck(false);
        this.timer = setTimeout(advance, beat.hold || 4200);
        break;

      case 'card':
        this.caption(null, null);
        this.showCard(beat);
        RRAudio.duck(false);
        this.timer = setTimeout(advance, beat.hold || 2600);
        break;

      case 'sfxcard':
        this.caption(null, beat.text ? beat.text.replace(/\*/g, '') : null, true);
        this.showSfxCard(beat);
        RRAudio.duck(false);
        this.timer = setTimeout(advance, beat.hold || 2000);
        break;

      case 'beat':
        this.caption(null, null);
        this.markTalking(null);
        RRAudio.duck(false);
        this.timer = setTimeout(advance, beat.hold || 2200);
        break;

      case 'pose':
        this.setPose(beat.who, beat.pose);
        this.caption(null, null);
        RRAudio.duck(false);
        this.timer = setTimeout(advance, beat.hold || 1500);
        break;

      case 'credits':
        this.caption(null, null);
        this.markTalking(null);
        this.showCredits();
        RRAudio.duck(false);
        this.timer = setTimeout(advance, beat.hold || 9000);
        break;

      case 'narr':
        this.caption('narrator', beat.text);
        this.markTalking(null);
        this.speak('narrator', beat.text, false, function () {
          if (beat.hold) { self.timer = setTimeout(advance, 200); } else advance();
        });
        break;

      case 'line':
      default:
        if (beat.pose) this.setPose(beat.who, beat.pose);
        if (beat.bubble) {
          this.bubbleLayer.insertAdjacentHTML('beforeend', RRCast.bubble(beat.bubble));
        }
        if (beat.card) this.showShoutCard(beat.text);
        this.caption(beat.who, beat.text, beat.shout);
        this.markTalking(beat.who);
        this.speak(beat.who, beat.text, beat.shout, advance);
        break;
    }
  };

  Player.prototype.play = function () {
    RRAudio.unlock();
    RRAudio.setVolume(this.volume);
    RRAudio.setMusic(this.musicOn);
    if (!VoiceBank.ready) VoiceBank.load();
    this.playing = true;
    this.root.classList.add('is-playing');
    this.root.classList.remove('is-paused');
    if (this.index < 0) this.runBeat(0);
    else this.runBeat(this.index);
  };

  Player.prototype.pause = function () {
    this.playing = false;
    this.clearTimers();
    if (synth) { try { synth.cancel(); } catch (e) {} }
    RRAudio.duck(false);
    this.root.classList.remove('is-playing');
    this.root.classList.add('is-paused');
  };

  Player.prototype.toggle = function () {
    if (this.playing) this.pause(); else this.play();
  };

  Player.prototype.seek = function (i) {
    i = Math.max(0, Math.min(this.total - 1, i));
    this.clearTimers();
    if (synth) { try { synth.cancel(); } catch (e) {} }
    this.currentScene = -1;   // force a re-render
    this.currentCue = null;
    var wasPlaying = this.playing;
    this.index = i;
    if (wasPlaying) this.runBeat(i);
    else { this.renderScene(this.beats[i].sceneIndex); this.updateProgress(); }
    this.restoreBubbles(i);
  };

  /* Page 7 builds up as a page of speech bubbles — when you jump into the
     middle of it, put back the ones that have already been said. */
  Player.prototype.restoreBubbles = function (i) {
    var sc = this.beats[i].sceneIndex;
    for (var k = 0; k <= i; k++) {
      var b = this.beats[k];
      if (b.sceneIndex === sc && b.bubble && k !== i) {
        this.bubbleLayer.insertAdjacentHTML('beforeend', RRCast.bubble(b.bubble));
      }
    }
    if (this.beats[i].bubble && !this.playing) {
      this.bubbleLayer.insertAdjacentHTML('beforeend', RRCast.bubble(this.beats[i].bubble));
    }
  };

  Player.prototype.next = function () { this.seek(this.index + 1); };
  Player.prototype.prev = function () { this.seek(this.index - 1); };

  Player.prototype.skipIntro = function () {
    // first beat that is not part of the title scene
    for (var i = 0; i < this.total; i++) {
      if (this.beats[i].sceneIndex > 0) { this.seek(i); return; }
    }
  };

  Player.prototype.restart = function () {
    this.index = -1;
    this.currentScene = -1;
    this.currentCue = null;
    this.play();
  };

  Player.prototype.finish = function () {
    this.playing = false;
    this.clearTimers();
    RRAudio.stop();
    this.root.classList.remove('is-playing');
    this.root.classList.add('is-finished');
    this.caption(null, null);
    this.overlay.className = 'rr-overlay is-end';
    this.overlay.innerHTML =
      '<div class="rr-end">' +
        '<p class="rr-end-kicker">You finished</p>' +
        '<h2>S1:E1 &nbsp;"Storyline"</h2>' +
        '<div class="rr-end-actions">' +
          '<button class="rr-btn rr-btn-primary" data-act="restart">&#9654; Watch again</button>' +
          '<a class="rr-btn" href="index.html">Back to the Hub</a>' +
        '</div>' +
      '</div>';
    this.save(true);
  };

  Player.prototype.updateProgress = function () {
    var pct = ((this.index + 1) / this.total) * 100;
    if (this.progressFill) this.progressFill.style.width = pct.toFixed(2) + '%';
    if (this.timeEl) {
      this.timeEl.textContent = 'Beat ' + (this.index + 1) + ' / ' + this.total;
    }
  };

  Player.prototype.save = function (done) {
    try {
      localStorage.setItem('rr.progress.' + this.ep.id, JSON.stringify({
        beat: this.index, total: this.total, done: !!done, at: Date.now()
      }));
    } catch (e) {}
  };

  Player.prototype.loadSaved = function () {
    try {
      var raw = localStorage.getItem('rr.progress.' + this.ep.id);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  };

  global.RRPlayer = Player;
  global.RRVoiceBank = VoiceBank;
})(window);
