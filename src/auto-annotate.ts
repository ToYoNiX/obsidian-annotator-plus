import { Menu } from 'obsidian';

import PDFPlus from 'main';
import { PDFPlusComponent } from 'lib/component';


/**
 * Annotator Plus: when on, every link copied to a PDF selection or annotation is added to the notes
 * that link to the PDF (see `AnnotateLib`) instead of being copied to the clipboard.
 */
export class AutoAnnotateMode extends PDFPlusComponent {
    iconEl: HTMLElement | null = null;

    constructor(plugin: PDFPlus) {
        super(plugin);
        if (this.settings.autoAnnotateToggleRibbonIcon) {
            let menuShown = false;

            this.iconEl = plugin.addRibbonIcon(
                this.settings.autoAnnotateIconName,
                `${plugin.manifest.name}: Toggle auto-annotate`,
                () => {
                    if (!menuShown) this.toggle();
                }
            );

            this.registerDomEvent(this.iconEl, 'contextmenu', (evt) => {
                if (menuShown) return;

                const menu = new Menu();
                menu.addItem((item) => {
                    item.setIcon('lucide-settings')
                        .setTitle('Customize...')
                        .onClick(() => {
                            this.plugin.openSettingTab().scrollToHeading('annotate');
                        });
                });
                menu.onHide(() => { menuShown = false; });
                menu.showAtMouseEvent(evt);
                menuShown = true;
            });
        }
    }

    toggle(enable?: boolean) {
        enable = enable ?? !this.settings.autoAnnotate;
        enable ? this.enable() : this.disable();
    }

    enable() {
        this.settings.autoAnnotate = true;
        this.plugin.saveSettings();
        this.load();
    }

    disable() {
        this.settings.autoAnnotate = false;
        this.plugin.saveSettings();
        this.unload();
    }

    onload() {
        this.iconEl?.addClass('is-active');
    }

    onunload() {
        this.iconEl?.removeClass('is-active');
    }
}
