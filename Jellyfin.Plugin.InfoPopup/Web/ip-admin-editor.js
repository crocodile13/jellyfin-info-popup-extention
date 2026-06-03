/**
 * jellyfin-info-popup-extention — ip-admin-editor.js
 * --------------------------------------------------
 * Sous-module éditeur : conversion markdown ↔ HTML, mode WYSIWYG/Raw,
 * synchronisation textarea ↔ contenteditable, toolbar de formatage,
 * raccourcis clavier de formatage. v4.2.0.0 — extrait de ip-admin.js.
 *
 * Dépendances : ip-i18n.js, ip-utils.js (escHtml)
 * Exposition  : ns.markdownToHtml, ns.htmlToMarkdown, ns.applyWysiwygFormat
 *              (réutilisés par ip-user.js depuis v3.8.8.0)
 *              + ns.__admin.{setEditorMode, isRawMode, syncWysiwygToTextarea,
 *                            syncTextareaToWysiwyg, updateCharCount,
 *                            updateToolbarActiveStateWysiwyg, updateToolbarActiveState,
 *                            applyFormat, toggleListLines}
 */
(function (ns) {
    'use strict';
    var admin = ns.__admin = ns.__admin || {};

    var escHtml = function (s) { return ns.escHtml(s); };

    // ════════════════════════════════════════════════════════════════════════
    // Markdown ↔ HTML
    // ════════════════════════════════════════════════════════════════════════

    /**
     * Convertit le markdown simplifié en HTML pour l'affichage WYSIWYG.
     * Supporte : **bold**, _italic_, __underline__, ~~strike~~, - lists, [text](url)
     */
    function markdownToHtml(md) {
        if (!md) return '';
        var html = escHtml(md);

        // Liens [text](url) - doit être fait avant les autres transformations
        html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

        // Formatage inline (ordre important : __ avant _, ** avant *)
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/__([^_]+)__/g, '<u>$1</u>');
        html = html.replace(/~~([^~]+)~~/g, '<s>$1</s>');
        // Italic : _text_ — __ déjà traité ci-dessus, donc plus aucun __ restant dans html
        html = html.replace(/_([^_\n]+)_/g, '<em>$1</em>');

        // Listes à puces
        var lines = html.split('\n');
        var result = [];
        var inList = false;
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (/^- /.test(line)) {
                if (!inList) { result.push('<ul>'); inList = true; }
                result.push('<li>' + line.slice(2) + '</li>');
            } else {
                if (inList) { result.push('</ul>'); inList = false; }
                result.push(line);
            }
        }
        if (inList) result.push('</ul>');

        return result.join('\n');
    }

    /**
     * Convertit le HTML du WYSIWYG en markdown simplifié.
     */
    function htmlToMarkdown(html) {
        if (!html) return '';

        var temp = document.createElement('div');
        temp.innerHTML = html;

        function processNode(node) {
            if (node.nodeType === Node.TEXT_NODE) {
                return node.textContent;
            }
            if (node.nodeType !== Node.ELEMENT_NODE) return '';

            var tag = node.tagName.toLowerCase();
            var content = Array.from(node.childNodes).map(processNode).join('');

            switch (tag) {
                case 'strong':
                case 'b':
                    return '**' + content + '**';
                case 'em':
                case 'i':
                    return '_' + content + '_';
                case 'u':
                    return '__' + content + '__';
                case 's':
                case 'strike':
                case 'del':
                    return '~~' + content + '~~';
                case 'a':
                    var href = node.getAttribute('href') || '';
                    return '[' + content + '](' + href + ')';
                case 'li':
                    return '- ' + content;
                case 'ul':
                case 'ol':
                    return content;
                case 'br':
                    return '\n';
                case 'div':
                case 'p':
                    return content + (node.nextSibling ? '\n' : '');
                case 'span': {
                    // Chrome génère parfois des <span style="..."> au lieu de <strong>/<em>/etc.
                    var st = node.style || {};
                    var fw = st.fontWeight;
                    var fs = st.fontStyle;
                    var td = st.textDecoration;
                    if (fw === 'bold' || fw === '700') return '**' + content + '**';
                    if (fs === 'italic') return '_' + content + '_';
                    if (td === 'underline') return '__' + content + '__';
                    if (td === 'line-through') return '~~' + content + '~~';
                    return content;
                }
                default:
                    return content;
            }
        }

        var md = processNode(temp);
        md = md.replace(/\n{3,}/g, '\n\n').trim();
        return md;
    }

    // ════════════════════════════════════════════════════════════════════════
    // WYSIWYG ↔ textarea sync, mode toggle, char counter
    // ════════════════════════════════════════════════════════════════════════

    function syncWysiwygToTextarea(page) {
        var wysiwyg = page.querySelector('#ip-body-wysiwyg');
        var textarea = page.querySelector('#ip-body');
        if (!wysiwyg || !textarea) return;
        textarea.value = htmlToMarkdown(wysiwyg.innerHTML);
        updateCharCount(page);
    }

    function syncTextareaToWysiwyg(page) {
        var wysiwyg = page.querySelector('#ip-body-wysiwyg');
        var textarea = page.querySelector('#ip-body');
        if (!wysiwyg || !textarea) return;
        wysiwyg.innerHTML = markdownToHtml(textarea.value);
    }

    function updateCharCount(page) {
        var textarea = page.querySelector('#ip-body');
        var counter = page.querySelector('#ip-char-count');
        if (!textarea || !counter) return;
        var len = textarea.value.length;
        var max = parseInt(textarea.maxLength) || 10000;
        counter.textContent = len + '/' + max;
        counter.classList.remove('warning', 'danger');
        if (len > max * 0.9) counter.classList.add('danger');
        else if (len > max * 0.75) counter.classList.add('warning');
    }

    function applyWysiwygFormat(command, value) {
        document.execCommand(command, false, value || null);
    }

    /**
     * Bascule entre mode WYSIWYG et mode Raw (textarea).
     * @param {boolean} rawMode - true = textarea visible, false = WYSIWYG visible
     */
    function setEditorMode(page, rawMode) {
        var wysiwyg = page.querySelector('#ip-body-wysiwyg');
        var textarea = page.querySelector('#ip-body');
        var toggle = page.querySelector('#ip-preview-toggle');

        if (!wysiwyg || !textarea) return;

        if (rawMode) {
            syncWysiwygToTextarea(page);
            wysiwyg.style.display = 'none';
            textarea.style.display = 'block';
            textarea.focus();
            if (toggle) toggle.checked = true;
        } else {
            syncTextareaToWysiwyg(page);
            textarea.style.display = 'none';
            wysiwyg.style.display = 'block';
            if (toggle) toggle.checked = false;
            wysiwyg.focus();
        }
        updateCharCount(page);
    }

    function isRawMode(page) {
        var textarea = page.querySelector('#ip-body');
        return textarea && textarea.style.display !== 'none';
    }

    function updateToolbarActiveStateWysiwyg(page) {
        var toolbar = page.querySelector('#ip-format-toolbar');
        if (!toolbar) return;
        var cmdMap = { bold: 'bold', italic: 'italic', underline: 'underline', strike: 'strikeThrough' };
        toolbar.querySelectorAll('.ip-fmt-btn[data-action]').forEach(function (btn) {
            var action = btn.dataset.action;
            if (action && action !== 'list' && cmdMap[action]) {
                btn.classList.toggle('active', document.queryCommandState(cmdMap[action]));
            }
        });
    }

    // ════════════════════════════════════════════════════════════════════════
    // Toolbar markdown — détection + insertion/retrait des marqueurs
    // ════════════════════════════════════════════════════════════════════════

    /**
     * Retourne les indices des occurrences de `marker` dans `line`.
     * Gère la collision _ vs __ : un _ adjacent à un autre _ est ignoré.
     */
    function findMarkerPositions(line, marker) {
        var positions = [];
        var mLen = marker.length;
        var i = 0;
        while (i <= line.length - mLen) {
            var idx = line.indexOf(marker, i);
            if (idx === -1) break;
            if (marker === '_') {
                var prevUnd = idx > 0 && line[idx - 1] === '_';
                var nextUnd = idx + 1 < line.length && line[idx + 1] === '_';
                if (prevUnd || nextUnd) { i = idx + 1; continue; }
            }
            positions.push(idx);
            i = idx + mLen;
        }
        return positions;
    }

    /**
     * Retourne {from, to, innerFrom, innerTo} de la paire de marqueurs qui
     * entoure cursorPos, ou null. Opère ligne par ligne.
     */
    function getFormatBoundsAroundCursor(val, cursorPos, marker) {
        var lineStart = val.lastIndexOf('\n', cursorPos - 1) + 1;
        var lineEnd = val.indexOf('\n', cursorPos);
        if (lineEnd === -1) lineEnd = val.length;
        var line = val.slice(lineStart, lineEnd);
        var cp = cursorPos - lineStart;
        var mLen = marker.length;

        var positions = findMarkerPositions(line, marker);
        for (var i = 0; i + 1 < positions.length; i += 2) {
            var openIdx = positions[i];
            var closeIdx = positions[i + 1];
            if (cp >= openIdx && cp <= closeIdx + mLen) {
                return {
                    from: lineStart + openIdx,
                    to: lineStart + closeIdx + mLen,
                    innerFrom: lineStart + openIdx + mLen,
                    innerTo: lineStart + closeIdx
                };
            }
        }
        return null;
    }

    /**
     * Retourne {bold, italic, underline, strike} : true si le curseur/sélection
     * est à l'intérieur du formatage correspondant.
     * __ est testé avant _ pour éviter les faux positifs.
     */
    function getActiveFormats(ta) {
        var val = ta.value;
        var start = ta.selectionStart;
        var end = ta.selectionEnd;
        var checks = [
            { key: 'bold', marker: '**' },
            { key: 'underline', marker: '__' },
            { key: 'italic', marker: '_' },
            { key: 'strike', marker: '~~' }
        ];
        var active = {};
        checks.forEach(function (c) {
            if (start < end) {
                var sel = val.slice(start, end);
                var mLen = c.marker.length;
                active[c.key] = sel.length > mLen * 2 &&
                                sel.startsWith(c.marker) && sel.endsWith(c.marker);
            } else {
                active[c.key] = getFormatBoundsAroundCursor(val, start, c.marker) !== null;
            }
        });
        return active;
    }

    /** Met à jour l'apparence "enfoncée" des boutons de la toolbar en mode Raw. */
    function updateToolbarActiveState(page, ta) {
        var active = getActiveFormats(ta);
        var toolbar = page.querySelector('#ip-format-toolbar');
        if (!toolbar) return;
        toolbar.querySelectorAll('.ip-fmt-btn[data-action]').forEach(function (btn) {
            var a = btn.dataset.action;
            if (a && a !== 'list') btn.classList.toggle('active', !!active[a]);
        });
    }

    /**
     * Applique ou retire le formatage sur la sélection (ou autour du curseur).
     * Toggle intelligent : si le texte est déjà formaté, retire les marqueurs.
     */
    function applyFormat(ta, prefix, suffix) {
        var start = ta.selectionStart, end = ta.selectionEnd;
        var val = ta.value;

        if (start < end) {
            var selected = val.slice(start, end);
            if (selected.startsWith(prefix) && selected.endsWith(suffix) &&
                    selected.length > prefix.length + suffix.length) {
                var inner = selected.slice(prefix.length, selected.length - suffix.length);
                ta.value = val.slice(0, start) + inner + val.slice(end);
                ta.setSelectionRange(start, start + inner.length);
            } else {
                ta.value = val.slice(0, start) + prefix + selected + suffix + val.slice(end);
                ta.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
            }
        } else {
            var bounds = getFormatBoundsAroundCursor(val, start, prefix);
            if (bounds) {
                var inner2 = val.slice(bounds.innerFrom, bounds.innerTo);
                ta.value = val.slice(0, bounds.from) + inner2 + val.slice(bounds.to);
                var newPos = Math.max(bounds.from, start - prefix.length);
                ta.setSelectionRange(newPos, newPos);
            } else {
                ta.value = val.slice(0, start) + prefix + suffix + val.slice(start);
                ta.setSelectionRange(start + prefix.length, start + prefix.length);
            }
        }
    }

    function toggleListLines(ta) {
        var start = ta.selectionStart, end = ta.selectionEnd;
        var val = ta.value;
        var lineStart = val.lastIndexOf('\n', start - 1) + 1;
        var lineEnd = val.indexOf('\n', end);
        if (lineEnd === -1) lineEnd = val.length;
        var block = val.slice(lineStart, lineEnd);
        var lines = block.split('\n');
        var allBullet = lines.every(function (l) { return /^- /.test(l); });
        var newBlock = lines.map(function (l) {
            return allBullet ? l.slice(2) : '- ' + l;
        }).join('\n');
        ta.value = val.slice(0, lineStart) + newBlock + val.slice(lineEnd);
        ta.setSelectionRange(lineStart, lineStart + newBlock.length);
    }

    // ── Exposition ───────────────────────────────────────────────────────────

    // Public API (compat ip-user.js depuis v3.8.8.0)
    ns.markdownToHtml = markdownToHtml;
    ns.htmlToMarkdown = htmlToMarkdown;
    ns.applyWysiwygFormat = applyWysiwygFormat;

    // Helpers admin internes (cross-module via ns.__admin)
    admin.markdownToHtml = markdownToHtml;
    admin.htmlToMarkdown = htmlToMarkdown;
    admin.syncWysiwygToTextarea = syncWysiwygToTextarea;
    admin.syncTextareaToWysiwyg = syncTextareaToWysiwyg;
    admin.updateCharCount = updateCharCount;
    admin.applyWysiwygFormat = applyWysiwygFormat;
    admin.setEditorMode = setEditorMode;
    admin.isRawMode = isRawMode;
    admin.updateToolbarActiveStateWysiwyg = updateToolbarActiveStateWysiwyg;
    admin.findMarkerPositions = findMarkerPositions;
    admin.getFormatBoundsAroundCursor = getFormatBoundsAroundCursor;
    admin.getActiveFormats = getActiveFormats;
    admin.updateToolbarActiveState = updateToolbarActiveState;
    admin.applyFormat = applyFormat;
    admin.toggleListLines = toggleListLines;

}(window.__IP = window.__IP || {}));
