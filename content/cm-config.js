'use strict';

class Config {

  constructor() {
    this.lint = this.lint.bind(this);

    // add custom meta lint in fm-lint.js 184-185
    CodeMirror.registerHelper('firemonkey', 'lint', this.lint);

    // add to window global for lint & hint fm-javascript.js 132-134
    window.GM = {
      addElement: {}, addScript: {}, addStyle: {}, addValueChangeListener: {}, deleteValue: {}, download: {}, fetch: {},
      getResourceText: {}, getResourceURL: {}, getResourceUrl: {}, getValue: {}, info: {}, listValues: {}, log: {},
      notification: {}, openInTab: {}, popup: {}, registerMenuCommand: {}, removeValueChangeListener: {},
      setClipboard: {}, setValue: {}, unregisterMenuCommand: {}, xmlhttpRequest: {}
    };

    const gm = [
      'GM_addElement', 'GM_addScript', 'GM_addStyle', 'GM_addValueChangeListener', 'GM_deleteValue', 'GM_download',
      'GM_fetch', 'GM_getResourceText', 'GM_getResourceURL', 'GM_getValue', 'GM_info',
      'GM_listValues', 'GM_log', 'GM_notification', 'GM_openInTab', 'GM_popup',
      'GM_registerMenuCommand', 'GM_removeValueChangeListener', 'GM_setClipboard',
      'GM_setValue', 'GM_unregisterMenuCommand', 'GM_xmlhttpRequest', 'unsafeWindow'
    ];
    gm.forEach(item => window[item] = {});

    this.reportUL = document.querySelector('div.report ul');
    this.reportDefault = this.reportUL.firstElementChild.cloneNode(true);

    // CCS Mode
    Object.assign(CodeMirror.mimeModes['text/css'].colorKeywords, {
      'darkgrey': true,
      'darkslategrey': true,
      'dimgrey': true,
      'grey': true,
      'lightgrey': true,
      'lightslategrey': true,
      'slategrey': true,
    });
  }

  lint(cm, annotationsNotSorted) {
    const text = cm.getValue();
    const js = cm.options.mode === 'javascript';
    const meta = text.match(/^([\s\S]+)==(UserScript|UserCSS|UserStyle)==([\s\S]+)==\/\2==/i) || ['','','',''];
    const b4 = meta[1].split(/\r?\n/).length;
    const end = b4 + meta[3].split(/\r?\n/).length;

    // ------------- Lint Filter ---------------------------
    const idx =[];                                          // delete index cache
    annotationsNotSorted.forEach((item, index) => {
      const m = item.message.match(/'(GM_getValue|GM_listValues|GM_getTabs?|GM_saveTab|exportFunction|cloneInto)' is not defined/);
      const {line, ch} = item.from;

      switch (true) {
        // suppress CSSLint Metadata Block */ error
        case !js && line > b4 && line < end:
          idx.push(index);
          break;

        // suppress CSSLint Custom Properties --* error
        case !js && item.message.startsWith('Expected RBRACE at line ') &&
                cm.getLine(line).substring(ch).startsWith('--'):
          idx.push(index);
          break;

        // suppress JSHint ES6 Unicode code point escapes \u{*****} error
        case js && item.message.startsWith("Unexpected 'u{") &&
                /^\\u\{[0-9a-f]+\}/.test(cm.getLine(line).substring(ch-1)):
          idx.push(index);
          break;

        // suppress not defined
        case m && ['GM_getValue', 'GM_listValues'].includes(m[1]):
         // item.message = m[1] + ' is partially supported. Read the Help for more information.';
          idx.push(index);
          break;

        case m && ['GM_getTab', 'GM_getTabs', 'GM_saveTab'].includes(m[1]):
          item.message = m[1] + ' is not supported.';
          item.severity = 'error';
          break;

        case item.message === '`var` declarations are forbidden. Use `let` or `const` instead.':
          item.message = 'Since ECMAScript 6 (2015), it is recommended to use `let` & `const` instead of `var`.';
          item.severity = 'info';
          break;

        case m && ['exportFunction', 'cloneInto'].includes(m[1]):
          idx.push(index);
          break;
      }
    });
    idx.reverse().forEach(i => annotationsNotSorted.splice(i, 1));
    // ------------- /Lint Filter --------------------------

    // ------------- Metadata Block lint -------------------
    if (!meta[3]) { return; }

    const supported = ['@name', '@author', '@description', '@version', '@updateURL', '@match',
          '@matches', '@include', '@exclude', '@exclude-match', '@excludeMatches', '@includeGlobs',
          '@excludeGlobs', '@matchAboutBlank', '@allFrames', '@noframes', '@require', '@resource',
          '@run-at', '@runAt', '@downloadURL', '@inject-into', '@compatible', '@container',
          '@homepage', '@homepageURL', '@website', '@source', '@grant', '@support', '@supportURL',
          '@var', '@advanced', '@preprocessor'];

    const unsupported = ['@namespace', '@icon', '@connect', '@unwrap', '@nocompat'];

    const sticky = null;

    meta[3].split(/\r?\n/).forEach((item, index) =>  {      // lines
      let [,com, prop, value] = item.match(/^\s*(\/\/)?\s*(\S+)(?:\s*)(.*)/) || [];
      if (!prop) { return; }                                // continue to next

      value = value.trim();
      let message;
      let severity = 'warning';
      const line = b4 + index -1;
      let ch = item.indexOf(prop);
      const propLC = prop.toLowerCase();

      // ----- property check
      switch (true) {
        case js && prop === '//':
        case supported.includes(prop):
        case /^@(name|description):[a-z]{2}(-[A-Z]{2})?/.test(prop): // i18n
          break;

        case !prop.startsWith('@'):
          message = com ? 'It is recommended to put comments outside the Metadata Block.' : `${prop} is not supported.`;
          severity = 'info';
          break;

        case prop === '@antifeature':
          message = 'Includes unexpected content e.g. ads, mineres etc.';
          severity = 'error';
          break;
/*
        case prop === '@resource':
          message = `${prop} is implemented differently in FireMonkey. Read the Help for more information.`;
          break;
*/
        case unsupported.includes(prop):
          message = `${prop} is not processed.`;
          severity = 'info';
          break;

        case supported.includes(propLC):
        case unsupported.includes(propLC):
          message = `${prop} is not supported, use ${propLC} instead.`;
          severity = 'error';
          break;

        case prop.startsWith('@'):
          message = `${prop} is not processed.`;
          severity = 'info';
          break;

        default:                                            // unsuported
          message = `${prop} is not supported.`;
          severity = 'error';
      }

      message && annotationsNotSorted.push({
        message,
        severity,
        from: {line, ch, sticky},
        to: {line, ch: ch + prop.length, sticky}
      });

      // ----- value check
      message = '';
      severity = 'warning';
      switch (true) {
        case prop === '@resource' && !/\.css\b/i.test(value):
          message = `${value} is not supported for GM_getResourceText.`;
          break;

        case !js || prop !== '@grant':
          break;

        // all js & grant
        case value === 'GM_getResourceText':
        case value === 'GM_getResourceUrl':
          message = `${value} is implemented differently in FireMonkey. Please read the Help for more information.`;
          break;

        case /^(GM(\.|_)(getTabs?|saveTab)$)/.test(value):
        case value.startsWith('window.'): // window.close | window.focus | window.onurlchange
        case value === 'GM_getResourceURL':
          message = `${value} is not supported.`;
          break;
      }

      ch = item.indexOf(value);
      message && annotationsNotSorted.push({
        message,
        severity,
        from: {line, ch, sticky},
        to: {line, ch: ch + value.length, sticky}
      });
    });
    // ------------- /Metadata Block lint ------------------

    // ------------- regexp check --------------------------
    const lines = text.split(/\r?\n/);
    const regex = js ? /(GM\.getTabs?|GM\.saveTab)(?=\s*\()/ : /@-moz-document\s+regexp\s*\(('|")(.+?)\1\)/;
    lines.forEach((item, index) => {

      const m = item.match(regex);
      m && annotationsNotSorted.push({
        message: js ? `${m[1]} is not supported.` : 'Regular Expression is not supported.',
        severity: 'error',
        from: {line: index, ch: m.index, sticky},
        to:   {line: index, ch: m.index + m[0].length, sticky}
      });
    });
    // ------------- /regexp check -------------------------

    this.report(cm, annotationsNotSorted);
  }

  report(cm, lint) {
    const nf = new Intl.NumberFormat();
    const docfrag = document.createDocumentFragment();
    this.reportUL.textContent = '';
    const liTemp = this.reportDefault.cloneNode();

    if (!lint[0]) {
      this.reportUL.appendChild(this.reportDefault.cloneNode(true));
      return;
    }

    lint.sort((a, b) => a.from.line - b.from.line);
    lint.forEach(item => {
      const li = liTemp.cloneNode();
      li.className = 'CodeMirror-lint-message-' + item.severity;
      li.dataset.line = nf.format(item.from.line +1);
      li.textContent = item.message;
      li.addEventListener('click', () => cm.setCursor(item.from.line, item.from.ch));
      docfrag.appendChild(li);
    });

    this.reportUL.appendChild(docfrag);
  }
}
new Config();