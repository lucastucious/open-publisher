window.handlePublisherFileLoad = (evt) => {
    try {
        let rawData = JSON.parse(evt.target.result);
        
        // Legacy support for older array-based saves
        if (Array.isArray(rawData)) {
            rawData = { title: "Untitled Publication", pages: rawData };
        }
        
        const loadDocumentData = (data) => {
            // ✨ TEMPLATE CHECK: If this file was saved as a template, open it as a fresh Untitled document
            if (data.isTemplate) {
                document.getElementById('doc-title').innerText = "Untitled Publication";
            } else {
                document.getElementById('doc-title').innerText = data.title;
            }
            
            state.pages = data.pages;
            state.hasMasterPage = data.hasMasterPage || false;
            state.rulerOriginX = data.rulerOriginX || 0;
            state.rulerOriginY = data.rulerOriginY || 0;
            state.margins = data.margins || {top: 48, right: 48, bottom: 48, left: 48};
            state.documentProperties = data.documentProperties || { author: '', company: '', subject: '', keywords: '' };
            
            // Read Spreads state (or infer for legacy saves)
            if (data.isSpreadMode !== undefined) {
                state.isSpreadMode = data.isSpreadMode;
            } else if (data.pages && data.pages.length > 0) {
                const w = parseInt(data.pages[0].width) || 0;
                state.isSpreadMode = w >= 1500; // Infer spreads if width is double standard
            } else {
                state.isSpreadMode = false;
            }
            
            const btn = document.getElementById('spread-mode-btn');
            if (btn) btn.classList.toggle('active', state.isSpreadMode);

            if (data.colorModel === 'CMYK') {
                document.getElementById('paper').classList.add('cmyk-mode');
            } else {
                document.getElementById('paper').classList.remove('cmyk-mode');
            }
            
            // Normalize and enforce orientation on loaded pages
            if (!window._orientedPagesRegistry) window._orientedPagesRegistry = new Set();
            if (state.pages && Array.isArray(state.pages)) {
                state.pages.forEach(p => {
                    if (!p.id) p.id = Date.now() + Math.random();
                    // If root document has orientation and page does not, inherit root orientation
                    if (!p.orientation && data.orientation) {
                        p.orientation = data.orientation;
                    }
                    if (p.orientation) {
                        let curW = parseFloat(p.width) || 794;
                        let curH = parseFloat(p.height) || 1123;
                        if (p.orientation === 'landscape' && curW < curH) {
                            p.width = Math.max(curW, curH) + 'px';
                            p.height = Math.min(curW, curH) + 'px';
                        } else if (p.orientation === 'portrait' && curW > curH) {
                            p.width = Math.min(curW, curH) + 'px';
                            p.height = Math.max(curW, curH) + 'px';
                        }
                    } else {
                        p.orientation = (parseFloat(p.width) >= parseFloat(p.height || '1123')) ? 'landscape' : 'portrait';
                    }
                    window._orientedPagesRegistry.add(p.id);
                });
            }
            state.history = [];
            state.historyIndex = -1;
            state.currentPageIndex = 0;
            renderPage(state.pages[0]);
            // Sync the margin guide overlay after the page renders so it is correctly
            // positioned over the paper at the current zoom level.
            setTimeout(() => {
                if (typeof window.syncMarginGuideOverlay === 'function') {
                    window.syncMarginGuideOverlay();
                }
            }, 100);

            setTimeout(() => {
                if (typeof generateAllThumbnails === 'function') generateAllThumbnails();
                if (typeof pushHistory === 'function') pushHistory(); 
            }, 500);
            
            if (typeof DashboardSystem !== 'undefined' && DashboardSystem) {
                DashboardSystem.close();
            }
        };

        if (rawData.encrypted) {
            const promptForPassword = () => {
                const html = `
                    <div style="padding: 10px; display: flex; align-items: flex-start; gap: 20px;">
                        <i class="fas fa-unlock-keyhole" style="font-size: 48px; color: var(--ui-theme-color); margin-top: 5px;"></i>
                        <div style="flex: 1;">
                            <p style="margin-bottom:15px; font-size:14px; color:#444;">This document is protected. Please enter the password to open it:</p>
                            <input type="password" id="doc-decrypt-input" style="width:100%; padding:8px; border:2px solid var(--ui-theme-color); border-radius:8px; margin-bottom:15px; outline: none; transition: border-color 0.2s;" placeholder="Password">
                        </div>
                `;
                if (typeof DialogSystem !== 'undefined') {
                    DialogSystem.show('Protected Document', html, async () => {
                        const pw = document.getElementById('doc-decrypt-input').value;
                        try {
                            DialogSystem.alert('Decrypting...', 'Decrypting document with AES-GCM...');
                            const decryptedData = await window.decryptDocumentData(rawData, pw);
                            DialogSystem.close();
                            state.documentPassword = pw;
                            window.updateProtectionIndicator();
                            loadDocumentData(decryptedData);
                        } catch(err) {
                            const errorHtml = `
                                <div style="display: flex; align-items: flex-start; gap: 20px; padding: 10px;">
                                    <i class="fas fa-times" style="font-size: 48px; color: #d9534f; margin-top: 5px;"></i>
                                    <div style="flex: 1; display: flex; align-items: center; min-height: 48px;">
                                        <p style="margin: 0; font-size: 15px; color: #333;">The password was Incorrect.</p>
                                    </div>
                                </div>
                            `;
                            DialogSystem.show('Decryption Failed', errorHtml, () => {
                                setTimeout(promptForPassword, 10);
                            });
                            const confirmBtn = document.getElementById('custom-dialog-confirm');
                            if (confirmBtn) confirmBtn.innerText = 'Retry';
                        }
                    });
                }
            };
            promptForPassword();
        } else {
            state.documentPassword = null;
            window.updateProtectionIndicator();
            loadDocumentData(rawData);
        }

    } catch(err) { 
        if (typeof DialogSystem !== 'undefined') DialogSystem.alert('Error', "Error opening file: " + err); 
    }
};
